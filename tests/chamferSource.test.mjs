import test from 'node:test';
import assert from 'node:assert/strict';
import {chamfer,infiniteIntersection} from '../src/model/construction.js';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {applyToPoint} from '../src/model/affine.js';
import {chamferInput,chamferResult,chamferGeometry,chamferLocalSegments,chamferOrigin,readChamferSource,prepareChamferOutput,applyChamferLines,resolveChamferLines} from '../src/adapters/chamferSource.js';
const input={first:[{x:0,y:0},{x:100,y:0}],second:[{x:0,y:0},{x:0,y:100}],distance1:10,distance2:20};
const identity={a:1,b:0,c:0,d:1,e:0,f:0};
class Element{
  constructor(tagName){this.tagName=tagName;this.attrs=new Map();this.screen=identity;}
  setAttribute(k,v){this.attrs.set(k,String(v));}getAttribute(k){return this.attrs.get(k)??null;}removeAttribute(k){this.attrs.delete(k);}
  cloneNode(){const e=new Element(this.tagName);e.attrs=new Map(this.attrs);e.screen=this.screen;return e;}getScreenCTM(){return this.screen;}
}
function lines(){return [input.first,input.second].map(s=>{const el=new Element('line');s.forEach((p,i)=>{el.setAttribute('x'+(i+1),p.x);el.setAttribute('y'+(i+1),p.y);});return el;});}
function withDOM(run){const old=globalThis.document;globalThis.document={createElementNS:(_,tag)=>new Element(tag)};try{run();}finally{globalThis.document=old;}}
const prepared=(host=createEditorHost(),i=input,renderer='default')=>prepareChamferOutput(host,i,host.execute('chamfer',i),lines(),[identity,identity],['a','b'],{renderer});
const read=el=>readChamferSource(el.getAttribute('data-vector-chamfer'),el.getAttribute('data-vector-implementation'),chamferGeometry(el));

test('chamfer source keeps independent distances, original endpoint order and supports a single zero setback',()=>{
  const copied=chamferInput(input);assert.deepEqual(copied,input);copied.first[0].x=40;assert.equal(input.first[0].x,0);
  for(const angle of [0.5,Math.PI/2,2.5])for(const reverse of [false,true])for(const swap of [false,true]){
    let first=[{x:0,y:0},{x:100,y:0}],second=[{x:0,y:0},{x:100*Math.cos(angle),y:100*Math.sin(angle)}];
    if(reverse){first.reverse();second.reverse();}if(swap)[first,second]=[second,first];
    const i={first,second,distance1:7,distance2:19},result=chamferResult(chamfer(i)),vertex=infiniteIntersection(...first,...second);
    assert.ok(Math.abs(Math.hypot(result.bridge.start.x-vertex.x,result.bridge.start.y-vertex.y)-7)<1e-10);
    assert.ok(Math.abs(Math.hypot(result.bridge.end.x-vertex.x,result.bridge.end.y-vertex.y)-19)<1e-10);
  }
  assert.equal(chamferInput({...input,distance1:0}).distance1,0);assert.deepEqual(chamferResult(chamfer({...input,distance1:0})).bridge.start,{x:0,y:0});
});

test('chamfer rejects malformed source, negative or zero distances and disconnected or nonfinite results',()=>{
  for(const i of [{...input,distance1:-1},{...input,distance1:Infinity},{...input,distance1:0,distance2:0},{...input,first:[input.first[0],input.first[0]]},{...input,second:[]}])assert.throws(()=>chamferInput(i));
  for(const change of [r=>r.bridge.kind='arc',r=>r.bridge.end=r.bridge.start,r=>r.segments[1].pop(),r=>r.segments[0]=[{x:5,y:5},{x:6,y:6}],r=>r.bridge.start.x=NaN]){const r=chamfer(structuredClone(input));change(r);assert.throws(()=>chamferResult(r));}
});

test('chamfer local endpoint preparation preserves reflection, shear and unequal scale and refuses singular matrices',()=>{
  const result=chamfer(input),matrices=[{a:-2,b:0.5,c:0.3,d:1,e:10,f:20},{a:0,b:2,c:3,d:0,e:40,f:30}],local=chamferLocalSegments(result,matrices);
  local.forEach((s,i)=>s.forEach((p,j)=>{const q=applyToPoint({point:p,matrix:matrices[i]}),target=result.segments[i][j];assert.ok(Math.hypot(q.x-target.x,q.y-target.y)<1e-9);}));
  assert.throws(()=>chamferLocalSegments(result,[identity,{...identity,a:0}]));
});

test('chamfer prepares all three geometries before applying and removes obsolete source models from the incident lines',()=>withDOM(()=>{
  const host=createEditorHost(),original=lines();original[0].setAttribute('data-vector-fillet','old');original[1].setAttribute('data-vector-pointset','old');const before=original.map(el=>JSON.stringify([...el.attrs]));
  const p=prepareChamferOutput(host,input,host.execute('chamfer',input),original,[identity,identity],['a','b']);
  assert.deepEqual(original.map(el=>JSON.stringify([...el.attrs])),before);assert.deepEqual(read(p.bridge).input,input);
  assert.equal(JSON.parse(p.lines[0].getAttribute('data-vector-implementation')).rendering.id,'native-segment');applyChamferLines(original,p.lines);
  assert.equal(original[0].getAttribute('data-vector-fillet'),null);assert.equal(original[1].getAttribute('data-vector-pointset'),null);assert.equal(original[0].getAttribute('x1'),'10');assert.equal(original[1].getAttribute('y1'),'20');
}));

test('chamfer source rejects changed bridge geometry, corrupt associations and method records',()=>withDOM(()=>{
  const changes=[s=>s.version=2,s=>s.input.distance1=null,s=>s.geometry.x1='999',s=>s.bindings[1].id=s.bindings[0].id,s=>s.bindings[0].matrix.a=0,s=>s.bindings[0].geometry.y1=null];
  for(const change of changes){const p=prepared(),s=JSON.parse(p.bridge.getAttribute('data-vector-chamfer'));change(s);p.bridge.setAttribute('data-vector-chamfer',JSON.stringify(s));assert.throws(()=>read(p.bridge));}
  const p=prepared();p.bridge.setAttribute('data-vector-implementation',JSON.stringify({version:1,tool:'fillet'}));assert.throws(()=>read(p.bridge));
  assert.throws(()=>readChamferSource(null,null,{}));assert.throws(()=>readChamferSource('x'.repeat(4000001),null,{}));
}));

test('chamfer binding checks permit a common transform and refuse missing, duplicate, locked, self and changed line references',()=>withDOM(()=>{
  const p=prepared(),source=read(p.bridge),canvas={querySelectorAll:()=>p.lines};assert.equal(resolveChamferLines(canvas,p.bridge,source,()=>true).length,2);
  const common={a:-1,b:0.2,c:0.4,d:2,e:20,f:30};p.bridge.screen=common;p.lines.forEach(el=>el.screen=common);assert.equal(resolveChamferLines(canvas,p.bridge,source,()=>true).length,2);
  assert.throws(()=>resolveChamferLines(canvas,p.bridge,source,()=>false));assert.throws(()=>resolveChamferLines({querySelectorAll:()=>[p.lines[0]]},p.bridge,source,()=>true));
  assert.throws(()=>resolveChamferLines({querySelectorAll:()=>[...p.lines,p.lines[0].cloneNode()]},p.bridge,source,()=>true));
  p.bridge.setAttribute('data-vector-chamfer-line-id','a');assert.throws(()=>resolveChamferLines({querySelectorAll:()=>[p.bridge,p.lines[1]]},p.bridge,source,()=>true));
  p.lines[0].screen={...common,e:21};assert.throws(()=>resolveChamferLines(canvas,p.bridge,source,()=>true));p.lines[0].screen=common;
  p.lines[1].setAttribute('data-vector-implementation','changed');assert.throws(()=>resolveChamferLines(canvas,p.bridge,source,()=>true));
}));

test('chamfer custom line renderers and unknown IDs remain explicit while incompatible output is rejected',()=>withDOM(()=>{
  const host=createEditorHost();host.registerRenderer({id:'reverse',label:'Reverse',algorithm:'Reverse endpoint order',supports:n=>n==='chamfer',prepare:s=>({...s,start:s.end,end:s.start})});
  host.registerRenderer({id:'bad-path',label:'Path',algorithm:'Path output',supports:n=>n==='chamfer',prepare:s=>({kind:'path',start:s.start,segments:[{kind:'segment',end:s.end}]})});
  const before=host.exportPreferences(),p=prepared(host,input,'reverse');assert.equal(read(p.bridge).renderer,'reverse');assert.deepEqual(host.exportPreferences(),before);assert.throws(()=>prepared(host,input,'bad-path'),/SVG線分/);
  const record=JSON.parse(p.bridge.getAttribute('data-vector-implementation'));record.calculation.id='missing';record.rendering.options.detail=42;const origin=chamferOrigin(record);
  for(let i=0;i<4;i++)record.chamferEdit={mode:'distances',origin:chamferOrigin(record)};assert.deepEqual(record.chamferEdit.origin,origin);assert.equal(record.chamferEdit.origin.chamferEdit,undefined);
  p.bridge.setAttribute('data-vector-implementation',JSON.stringify(record));const source=read(p.bridge);assert.equal(source.implementation,'missing');assert.equal(source.options.detail,42);
}));
