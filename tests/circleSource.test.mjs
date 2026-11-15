import test from 'node:test';
import assert from 'node:assert/strict';
import {circle} from '../src/model/drawing.js';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {circleModel,circleGeometrySnapshot,readCircleSource,circleOrigin,recordCircleAttributeEdit} from '../src/adapters/circleSource.js';

class Element {
  constructor(tagName){this.tagName=tagName;this.attrs=new Map();}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  getAttribute(name){return this.attrs.get(name)??null;}
  removeAttribute(name){this.attrs.delete(name);}
}
const read=el=>readCircleSource(el.getAttribute('data-vector-circle'),el.getAttribute('data-vector-implementation'),circleGeometrySnapshot(el));
const native=(attrs={cx:12,cy:34,r:20})=>{const el=new Element('circle');for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v);return el;};

test('circle explicit radius avoids cancellation at large centers and retains the point-distance contract',()=>{
  const center={x:1e20,y:-1e20};
  assert.deepEqual(circle({center,radius:1,point:center}),{kind:'circle',center,radius:1});
  assert.notEqual(circle({center,radius:1}).center,center);
  assert.equal(circle({center:{x:0,y:0},point:{x:3,y:4}}).radius,5);
  assert.equal(circle({center:{x:0,y:0},point:{x:3,y:4}},{distance:()=>17}).radius,17);
  for(const radius of [-1,NaN,Infinity,'2',null])assert.equal(circle({center,radius}),null);
  assert.equal(circle({center:{x:NaN,y:0},radius:1}),null);
});

test('host saves circle models for native, sampled and cubic geometry with effective per-call options',()=>{
  const previous=globalThis.document;globalThis.document={createElementNS:(_,tag)=>new Element(tag)};
  try {
    const host=createEditorHost();host.selectRenderer('circle','sampled',{sampleCount:33});
    const model=circle({center:{x:20,y:30},radius:12});
    for(const renderer of ['default','sampled','cubic']){
      const element=host.render(model,null,{toolName:'circle',renderer,sampleCount:16}),saved=read(element);
      assert.deepEqual(saved.model,model);assert.equal(saved.renderer,renderer);assert.equal(saved.options.sampleCount,16);
      assert.equal(element.tagName,renderer==='default'?'circle':'path');
      if(renderer==='sampled')assert.equal(element.getAttribute('d').match(/L/g).length,16);
      if(renderer==='cubic')assert.equal(element.getAttribute('d').match(/C/g).length,4);
      assert.equal(host.describeRendering('circle').options.sampleCount,33);
      const attr=renderer==='default'?'r':'d';element.setAttribute(attr,element.getAttribute(attr)+'1');
      assert.throws(()=>read(element),/一致しません/);
    }
  } finally {globalThis.document=previous;}
});

test('native legacy circles derive actual local coordinates while arbitrary paths and unsupported units are refused',()=>{
  assert.deepEqual(read(native()).model,{kind:'circle',center:{x:12,y:34},radius:20});
  assert.deepEqual(read(native({r:2})).model.center,{x:0,y:0});
  for(const attrs of [{r:'20%'},{r:0},{r:-1},{r:''},{r:'1e999'},{r:1,cx:'2px'}])assert.throws(()=>read(native(attrs)));
  assert.throws(()=>read(new Element('path')),/元データ/);
});

test('circle source rejects malformed versions, nonfinite or overflowing models, corrupt snapshots and settings',()=>{
  const geometry={tag:'circle',cx:'12',cy:'34',r:'20'},model={kind:'circle',center:{x:12,y:34},radius:20};
  const source={version:1,model,geometry},record={version:1,tool:'circle',rendering:{id:'default',options:{sampleCount:40}}};
  const decode=(s=source,r=record)=>readCircleSource(JSON.stringify(s),JSON.stringify(r),geometry);
  for(const invalid of [{...source,version:2},{...source,geometry:null},{...source,model:{...model,radius:null}},
    {...source,model:{...model,center:{x:'12',y:34}}}])assert.throws(()=>decode(invalid));
  assert.throws(()=>decode(source,{...record,version:2}));
  assert.throws(()=>decode(source,{...record,rendering:{options:{sampleCount:10001}}}));
  assert.throws(()=>circleModel({kind:'circle',center:{x:1.7e308,y:0},radius:1.7e308}));
  assert.throws(()=>readCircleSource('',null,geometry));
  assert.throws(()=>readCircleSource('x'.repeat(4000001),null,geometry));
});

test('fit provenance stays bounded across repeated direct edits and does not masquerade as recalculation',()=>{
  assert.equal(circleOrigin({version:1,tool:'circle',circleEdit:{origin:null}}),null);
  const el=native(),origin={version:1,tool:'fitCircle',calculation:{id:'default',algorithm:'Kasa fit'},rendering:{id:'default'}};
  el.setAttribute('data-vector-implementation',JSON.stringify(origin));
  el.setAttribute('data-vector-circle','old source');
  for(let i=0;i<4;i++){
    recordCircleAttributeEdit(el);
    const saved=read(el),record=JSON.parse(el.getAttribute('data-vector-implementation'));
    assert.equal(el.getAttribute('data-vector-circle'),null);assert.equal(saved.implementation,'default');
    assert.equal(saved.origin.tool,'fitCircle');assert.equal(record.calculation.id,'direct-attributes');
    assert.deepEqual(circleOrigin(record),circleOrigin(origin));assert.equal(record.circleEdit.origin.circleEdit,undefined);
  }
});

test('unknown circle implementation IDs and custom renderer options remain visible instead of being silently substituted',()=>{
  const geometry={tag:'path',d:'M1 0 L0 1 Z'},model={kind:'circle',center:{x:0,y:0},radius:1};
  const source=JSON.stringify({version:1,model,geometry});
  const record={version:1,tool:'circle',calculation:{id:'plugin-calc'},rendering:{id:'plugin-render',options:{detail:42}}};
  const saved=readCircleSource(source,JSON.stringify(record),geometry);
  assert.equal(saved.implementation,'plugin-calc');assert.equal(saved.renderer,'plugin-render');assert.equal(saved.options.detail,42);
  record.tool='minimumEnclosingCircle';
  const enclosing=readCircleSource(source,JSON.stringify(record),geometry);
  assert.equal(enclosing.implementation,'default');assert.equal(enclosing.origin.tool,'minimumEnclosingCircle');
});
