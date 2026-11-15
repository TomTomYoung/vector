import test from 'node:test';
import assert from 'node:assert/strict';
import {arc} from '../src/model/drawing.js';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {arcInput,arcModel,arcOrigin,readArcSource} from '../src/adapters/arcSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const input={start:{x:10,y:0},through:{x:6,y:8},end:{x:0,y:10}};
const saved=(i=input)=>{const model=arc(i);return {source:{version:1,input:arcInput(i),model:arcModel(model),path:pathData(model)},record:{version:1,tool:'arc',calculation:{id:'default'},rendering:{id:'default',options:{sampleCount:16}}}};};
const read=s=>readArcSource(JSON.stringify(s.source),JSON.stringify(s.record),s.source.path);
class Element {
  constructor(tagName){this.tagName=tagName;this.attrs=new Map();}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  getAttribute(name){return this.attrs.get(name)??null;}
  removeAttribute(name){this.attrs.delete(name);}
}

test('arc preserves the actual through point and recalculates major, minor and reversed signed turns',()=>{
  const minor=arc(input);assert.ok(Math.abs(minor.turn-Math.PI/2)<1e-12);assert.deepEqual(minor.through,input.through);assert.notEqual(minor.through,input.through);
  const major=arc({...input,through:{x:-10,y:0}});assert.ok(Math.abs(major.turn+1.5*Math.PI)<1e-12);
  const reversed=arc({start:input.end,through:{x:-10,y:0},end:input.start});assert.ok(Math.abs(reversed.turn-1.5*Math.PI)<1e-12);
  for(const renderer of ['default','sampled','cubic']){
    const geometry=prepareGeometry(major,renderer,{sampleCount:20}),path=pathData(geometry);
    assert.ok(!/NaN|Infinity/.test(path));
    if(renderer==='default')assert.match(path,/A 10 10 0 1 0/);
    if(renderer==='sampled')assert.equal(geometry.segments.length,20);
    if(renderer==='cubic')assert.equal(geometry.segments.length,3);
  }
});

test('arc rejects nonfinite input, degenerate triples and invalid operation output',()=>{
  for(const i of [{...input,start:null},{...input,through:{x:Infinity,y:8}},{...input,end:input.start},
    {start:{x:0,y:0},through:{x:1,y:1},end:{x:2,y:2}},
    {start:{x:1e300,y:0},through:{x:0,y:1e300},end:{x:-1e300,y:0}}])assert.equal(arc(i),null);
  assert.equal(arc(input,{circleCenter:()=>({x:NaN,y:0})}),null);
  assert.equal(arc(input,{distance:()=>Infinity}),null);
  assert.equal(arc(input,{distance:()=>0}),null);
  assert.throws(()=>arcInput({...input,start:{x:'10',y:0}}));
});

test('host saves original arc input with all renderers and keeps rendering preferences and metadata separate',()=>{
  const previous=globalThis.document;globalThis.document={createElementNS:(_,tag)=>new Element(tag)};
  try {
    const host=createEditorHost();host.selectRenderer('arc','sampled',{sampleCount:33});
    for(const renderer of ['default','sampled','cubic']){
      const element=host.render(host.execute('arc',input),null,{toolName:'arc',renderer,sampleCount:12}),record=JSON.parse(element.getAttribute('data-vector-implementation'));
      const result=readArcSource(element.getAttribute('data-vector-arc'),element.getAttribute('data-vector-implementation'),element.getAttribute('d'));
      assert.deepEqual(result.input,input);assert.equal(result.renderer,renderer);assert.equal(result.options.sampleCount,12);
      assert.equal(record.rendering.options.sourceInput,undefined);assert.equal(host.describeRendering('arc').options.sampleCount,33);
    }
    const shape=arc(input);delete shape.through;
    const external=host.render(shape,null,{toolName:'arc',renderer:'cubic',sourceInput:input});
    assert.deepEqual(JSON.parse(external.getAttribute('data-vector-arc')).input,input);
    assert.equal(JSON.parse(external.getAttribute('data-vector-implementation')).rendering.options.sourceInput,undefined);
    assert.equal(host.render(shape,null,{toolName:'fillet'}).getAttribute('data-vector-arc'),null,'fillet is not a three-point input');
    assert.equal(host.render(shape,null,{toolName:'arc'}).getAttribute('data-vector-arc'),null,'missing original points are not invented');
  } finally {globalThis.document=previous;}
});

test('arc input survives repeated reconstruction without replacing the through point by an angular midpoint',()=>{
  let s=saved();
  for(let i=0;i<5;i++){
    const result=read(s);assert.deepEqual(result.input,input);assert.deepEqual(arcModel(arc(result.input)),s.source.model);
    s=saved(result.input);
  }
  const copy=arcInput(input);copy.through.x=99;assert.equal(input.through.x,6);
});

test('arc source refuses changed outlines, corrupt models, method records and excessive sampling',()=>{
  const edits=[s=>s.source.version=2,s=>s.source.input.start.x=null,s=>s.source.model.radius=0,s=>s.source.model.turn=2*Math.PI,
    s=>s.source.model.center.y='0',s=>s.source.model.end.x=99,s=>s.source.model.turn=0,s=>s.record.tool='fillet',s=>s.record.version=2,
    s=>s.record.rendering.options.sampleCount=10001,s=>s.source.path=''];
  for(const change of edits){const s=saved();change(s);assert.throws(()=>read(s));}
  const s=saved();assert.throws(()=>readArcSource(JSON.stringify(s.source),JSON.stringify(s.record),s.source.path+' L90 90'),/一致しません/);
  assert.throws(()=>readArcSource(null,null,'M0 0 A1 1 0 0 0 1 1'));
  assert.throws(()=>readArcSource('x'.repeat(4000001),null,''));
});

test('unknown arc implementations and custom renderer settings stay explicit and origin records remain bounded',()=>{
  const s=saved();s.record.calculation.id='external';s.record.rendering.id='plugin';s.record.rendering.options.detail=42;
  const result=read(s);assert.equal(result.implementation,'external');assert.equal(result.renderer,'plugin');assert.equal(result.options.detail,42);
  const origin=arcOrigin(s.record);
  for(let i=0;i<4;i++){s.record={...s.record,arcEdit:{mode:'three-points',origin:arcOrigin(s.record)}};assert.deepEqual(arcOrigin(s.record),origin);assert.equal(s.record.arcEdit.origin.arcEdit,undefined);}
});
