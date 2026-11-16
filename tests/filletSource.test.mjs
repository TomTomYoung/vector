import test from 'node:test';
import assert from 'node:assert/strict';
import {fillet} from '../src/model/construction.js';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {applyToPoint,composeAffine} from '../src/model/affine.js';
import {filletInput,filletResult,filletLocalSegments,filletOrigin,readFilletSource,prepareFilletOutput,applyFilletLines,resolveFilletLines} from '../src/adapters/filletSource.js';
const input={first:[{x:0,y:0},{x:100,y:0}],second:[{x:0,y:0},{x:0,y:100}],radius:10};
const identity={a:1,b:0,c:0,d:1,e:0,f:0};
class Element {
  constructor(tagName){this.tagName=tagName;this.attrs=new Map();this.screen=identity;}
  setAttribute(k,v){this.attrs.set(k,String(v));}
  getAttribute(k){return this.attrs.get(k)??null;}
  removeAttribute(k){this.attrs.delete(k);}
  cloneNode(){const e=new Element(this.tagName);e.attrs=new Map(this.attrs);e.screen=this.screen;return e;}
  getScreenCTM(){return this.screen;}
}
function lines(){return [input.first,input.second].map(s=>{const e=new Element('line');s.forEach((p,i)=>{e.setAttribute('x'+(i+1),p.x);e.setAttribute('y'+(i+1),p.y);});return e;});}
function withDOM(run){const old=globalThis.document;globalThis.document={createElementNS:(_,tag)=>new Element(tag)};try{run();}finally{globalThis.document=old;}}
const read=bridge=>readFilletSource(bridge.getAttribute('data-vector-fillet'),bridge.getAttribute('data-vector-implementation'),bridge.getAttribute('d'));
const prepared=(host=createEditorHost(),renderer='default')=>prepareFilletOutput(host,input,host.execute('fillet',input),lines(),[identity,identity],['first','second'],{renderer,sampleCount:16});

test('fillet source copies original untrimmed lines and rejects invalid input',()=>{
  const copy=filletInput(input);assert.deepEqual(copy,input);copy.first[0].x=7;assert.equal(input.first[0].x,0);
  for(const bad of [{...input,radius:0},{...input,radius:Infinity},{...input,first:[input.first[0]]},{...input,first:[input.first[0],input.first[0]]},{...input,second:[{x:NaN,y:0},{x:0,y:1}]}])assert.throws(()=>filletInput(bad));
});

test('fillet result requires a finite arc and two segments ending at its contact points',()=>{
  assert.deepEqual(filletResult(fillet(input)),fillet(input));
  for(const mutate of [r=>r.bridge.radius=0,r=>r.bridge.turn=0,r=>r.segments.pop(),r=>r.segments[0]=[{x:9,y:9},{x:8,y:8}],r=>r.segments[1][1].x=Infinity]){const r=fillet(structuredClone(input));mutate(r);assert.throws(()=>filletResult(r));}
  assert.throws(()=>filletResult(null));
});

test('fillet endpoints convert back to each line local frame under reflection, shear and nonuniform scaling',()=>{
  const result=fillet(input),matrices=[{a:-2,b:0.3,c:0.2,d:3,e:20,f:-10},{a:0,b:2,c:3,d:0,e:15,f:30}],local=filletLocalSegments(result,matrices);
  local.forEach((s,i)=>s.forEach((p,j)=>{const q=applyToPoint({point:p,matrix:matrices[i]}),r=result.segments[i][j];assert.ok(Math.hypot(q.x-r.x,q.y-r.y)<1e-10);}));
  assert.throws(()=>filletLocalSegments(result,[identity,{...identity,a:0}]));
});

test('fillet prepares native, sampled and cubic curves and two lines without mutating originals',()=>withDOM(()=>{
  const host=createEditorHost();host.selectRenderer('fillet','sampled',{sampleCount:33});
  for(const renderer of ['default','sampled','cubic']){
    const original=lines(),before=original.map(e=>JSON.stringify([...e.attrs]));
    const p=prepareFilletOutput(host,input,host.execute('fillet',input),original,[identity,identity],['first','second'],{renderer,sampleCount:16}),source=read(p.bridge);
    assert.deepEqual(source.input,input);assert.equal(source.renderer,renderer);assert.equal(source.options.sampleCount,16);
    assert.deepEqual(original.map(e=>JSON.stringify([...e.attrs])),before);
    assert.equal(JSON.parse(p.lines[0].getAttribute('data-vector-implementation')).rendering.id,'native-segment');
    applyFilletLines(original,p.lines);assert.equal(original[0].getAttribute('x1'),p.lines[0].getAttribute('x1'));
  }
  assert.equal(host.describeRendering('fillet').options.sampleCount,33);
}));

test('fillet saved source rejects malformed bindings, mismatched radius, path and method',()=>withDOM(()=>{
  const changes=[s=>s.version=2,s=>s.bindings[1].id=s.bindings[0].id,s=>s.bindings[0].geometry.x1=null,s=>s.bindings[0].matrix.a=0,s=>s.result.bridge.radius=99,s=>s.input.radius=12];
  for(const change of changes){const p=prepared(),s=JSON.parse(p.bridge.getAttribute('data-vector-fillet'));change(s);p.bridge.setAttribute('data-vector-fillet',JSON.stringify(s));assert.throws(()=>read(p.bridge));}
  const p=prepared();p.bridge.setAttribute('d',p.bridge.getAttribute('d')+' L0 0');assert.throws(()=>read(p.bridge));
  assert.throws(()=>readFilletSource(null,null,''));assert.throws(()=>readFilletSource('x'.repeat(4000001),null,''));
}));

test('fillet associations permit common affine changes and reject missing, duplicate, locked or independently changed lines',()=>withDOM(()=>{
  const p=prepared(),source=read(p.bridge),canvas={querySelectorAll:()=>p.lines},valid=()=>true;
  assert.deepEqual(resolveFilletLines(canvas,p.bridge,source,valid),p.lines);
  const common={a:-2,b:0.4,c:0.2,d:1,e:100,f:50};p.bridge.screen=common;p.lines.forEach(l=>l.screen=composeAffine({first:identity,then:common}));
  assert.equal(resolveFilletLines(canvas,p.bridge,source,valid).length,2);
  assert.throws(()=>resolveFilletLines(canvas,p.bridge,source,()=>false));
  assert.throws(()=>resolveFilletLines({querySelectorAll:()=>[p.lines[0]]},p.bridge,source,valid));
  assert.throws(()=>resolveFilletLines({querySelectorAll:()=>[...p.lines,p.lines[0].cloneNode()]},p.bridge,source,valid));
  p.lines[0].screen={...common,e:101};assert.throws(()=>resolveFilletLines(canvas,p.bridge,source,valid));p.lines[0].screen=common;
  p.lines[0].setAttribute('x1',99);assert.throws(()=>resolveFilletLines(canvas,p.bridge,source,valid));
}));

test('fillet plugin identifiers and settings remain explicit and original provenance does not nest',()=>withDOM(()=>{
  const p=prepared(),record=JSON.parse(p.bridge.getAttribute('data-vector-implementation'));record.calculation.id='external';record.rendering.id='missing';record.rendering.options.detail=4;
  const origin=filletOrigin(record);for(let i=0;i<4;i++)record.filletEdit={mode:'radius',origin:filletOrigin(record)};
  assert.deepEqual(record.filletEdit.origin,origin);assert.equal(record.filletEdit.origin.filletEdit,undefined);
  p.bridge.setAttribute('data-vector-implementation',JSON.stringify(record));const source=read(p.bridge);assert.equal(source.implementation,'external');assert.equal(source.renderer,'missing');assert.equal(source.options.detail,4);
}));
