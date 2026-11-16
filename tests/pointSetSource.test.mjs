import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {pointSetMethods,pointSetInput,pointSetResult,pointSetGeometry,pointSetGeometrySnapshot,pointSetOrigin,readPointSetSource} from '../src/adapters/pointSetSource.js';
const input={points:[{x:0,y:0},{x:10,y:0},{x:3,y:8},{x:4,y:2}]};
class Element {
  constructor(tagName){this.tagName=tagName;this.attrs=new Map();}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  getAttribute(name){return this.attrs.get(name)??null;}
  removeAttribute(name){this.attrs.delete(name);}
}
function withDOM(run){const old=globalThis.document;globalThis.document={createElementNS:(_,tag)=>new Element(tag)};try{run();}finally{globalThis.document=old;}}
function make(host,method,renderer='default',points=input){const result=host.execute(method,points);return host.render(pointSetGeometry(method,points,result),null,{toolName:method,renderer,sampleCount:16,sourceInput:points,sourceResult:result});}
const read=el=>readPointSetSource(el.getAttribute('data-vector-pointset'),el.getAttribute('data-vector-implementation'),pointSetGeometrySnapshot(el));

test('point-set input preserves observations, order and duplicates, and bounds finite input',()=>{
  const copy=pointSetInput('fitCircle',input);assert.deepEqual(copy,input);copy.points[0].x=99;assert.equal(input.points[0].x,0);
  for(const method of pointSetMethods){assert.throws(()=>pointSetInput(method,{points:[]}));assert.throws(()=>pointSetInput(method,{points:Array(1001).fill({x:0,y:0})}));assert.throws(()=>pointSetInput(method,{points:[...input.points,{x:Infinity,y:0}]}));}
  assert.equal(pointSetInput('minimumEnclosingCircle',{points:[{x:0,y:0}]}).points.length,1);
  assert.throws(()=>pointSetInput('convexHull',input));
});

test('line projection handles vertical and nonunit plugin directions independently of their magnitude',()=>{
  const result={kind:'line',point:{x:3,y:5},direction:{x:0,y:10},rms:2};
  const shape=pointSetGeometry('fitLine',input,result);assert.deepEqual(shape,{kind:'segment',start:{x:3,y:0},end:{x:3,y:8}});
  assert.deepEqual(pointSetGeometry('fitLine',input,{...result,direction:{x:0,y:1}}),shape);
  for(const r of [{...result,direction:{x:0,y:0}},{...result,rms:NaN},{...result,point:{x:Infinity,y:0}}])assert.throws(()=>pointSetResult('fitLine',r));
  assert.throws(()=>pointSetGeometry('fitLine',{points:[{x:1e308,y:0},{x:-1e308,y:0}]},{kind:'line',point:{x:-1e308,y:0},direction:{x:1,y:0}}));
});

test('host saves observations, result and renderer snapshot and keeps source metadata out of rendering options',()=>withDOM(()=>{
  const host=createEditorHost();host.selectRenderer('fitCircle','sampled',{sampleCount:33});
  for(const method of pointSetMethods)for(const renderer of method==='fitLine'?['default']:['default','sampled','cubic']){
    const element=make(host,method,renderer),source=read(element),record=JSON.parse(element.getAttribute('data-vector-implementation'));
    assert.deepEqual(source.input,input);assert.equal(source.method,method);assert.equal(source.renderer,renderer);assert.equal(source.options.sampleCount,16);
    assert.equal(record.rendering.options.sourceInput,undefined);assert.equal(record.rendering.options.sourceResult,undefined);assert.equal(record.parameters.pointCount,4);
    assert.equal(record.parameters.rms,source.result.rms);
  }
  assert.equal(host.describeRendering('fitCircle').options.sampleCount,33);
  assert.equal(host.render(host.execute('fitCircle',input),null,{toolName:'fitCircle'}).getAttribute('data-vector-pointset'),null);
}));

test('minimum enclosing circle retains singleton, duplicate and collinear observations including zero radius',()=>withDOM(()=>{
  const host=createEditorHost();
  for(const points of [[{x:5,y:7}],[{x:5,y:7},{x:5,y:7}],[{x:0,y:0},{x:10,y:0},{x:3,y:0}]]){
    const source=read(make(host,'minimumEnclosingCircle','default',{points}));assert.deepEqual(source.input.points,points);
    assert.equal(source.result.radius,points.length===3?5:0);
  }
}));

test('point-set source refuses stale native and path geometry and corrupt calculation records',()=>withDOM(()=>{
  const host=createEditorHost();
  for(const [method,renderer,key] of [['fitLine','default','x1'],['fitCircle','default','r'],['minimumEnclosingCircle','cubic','d']]){
    const element=make(host,method,renderer);element.setAttribute(key,element.getAttribute(key)+'1');assert.throws(()=>read(element),/一致しません/);
  }
  const changes=[s=>s.version=2,s=>s.method='arc',s=>s.input.points[0].x=null,s=>s.result.radius=-1,s=>s.result.rms=-1];
  for(const change of changes){const el=make(host,'fitCircle'),s=JSON.parse(el.getAttribute('data-vector-pointset'));change(s);el.setAttribute('data-vector-pointset',JSON.stringify(s));assert.throws(()=>read(el));}
  const el=make(host,'fitLine');el.setAttribute('data-vector-implementation',JSON.stringify({version:1,tool:'fitCircle'}));assert.throws(()=>read(el));
  assert.throws(()=>readPointSetSource(null,null,{tag:'line'}));assert.throws(()=>readPointSetSource('x'.repeat(4000001),null,{}));
}));

test('point-set rereading keeps plugin ids and options explicit and origin bounded',()=>withDOM(()=>{
  const el=make(createEditorHost(),'fitCircle');let record=JSON.parse(el.getAttribute('data-vector-implementation'));record.calculation.id='missing';record.rendering.id='external';record.rendering.options.detail=42;
  const origin=pointSetOrigin(record);
  for(let i=0;i<4;i++)record={...record,pointSetEdit:{mode:'points',origin:pointSetOrigin(record)}};
  assert.deepEqual(record.pointSetEdit.origin,origin);assert.equal(record.pointSetEdit.origin.pointSetEdit,undefined);
  el.setAttribute('data-vector-implementation',JSON.stringify(record));const source=read(el);assert.equal(source.implementation,'missing');assert.equal(source.renderer,'external');assert.equal(source.options.detail,42);
  record.rendering.options.sampleCount=10001;el.setAttribute('data-vector-implementation',JSON.stringify(record));assert.throws(()=>read(el));
}));
