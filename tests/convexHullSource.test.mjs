import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {pointSetInput,pointSetResult,pointSetGeometry,pointSetGeometrySnapshot,pointSetOrigin,readPointSetSource} from '../src/adapters/pointSetSource.js';
const points=[{x:5,y:4},{x:10,y:0},{x:0,y:10},{x:0,y:0},{x:10,y:10},{x:5,y:4},{x:5,y:0}];
class Element {
  constructor(tagName){this.tagName=tagName;this.attrs=new Map();}
  setAttribute(k,v){this.attrs.set(k,String(v));}
  getAttribute(k){return this.attrs.get(k)??null;}
  removeAttribute(k){this.attrs.delete(k);}
}
function withDOM(run){const old=globalThis.document;globalThis.document={createElementNS:(_,tag)=>new Element(tag)};try{run();}finally{globalThis.document=old;}}
const read=el=>readPointSetSource(el.getAttribute('data-vector-pointset'),el.getAttribute('data-vector-implementation'),pointSetGeometrySnapshot(el));
function make(host,input={points},renderer='default'){
  const result=host.execute('convexHull',input);
  return host.render(pointSetGeometry('convexHull',input,result),null,{toolName:'convexHull',renderer,sourceInput:input,sourceResult:result});
}

test('convex hull sources keep interior, duplicate and boundary observations independently of output vertices',()=>{
  const input=pointSetInput('convexHull',{points}),host=createEditorHost(),result=host.execute('convexHull',input),shape=pointSetGeometry('convexHull',input,result);
  assert.deepEqual(input.points,points);assert.equal(result.length,4);assert.equal(shape.kind,'polygon');
  shape.points[0].x=900;assert.notEqual(result[0].x,900);input.points[0].x=600;assert.equal(points[0].x,5);
  for(const bad of [[],points.slice(0,2),[...points,{x:NaN,y:0}],Array(1001).fill(points[0])])assert.throws(()=>pointSetInput('convexHull',{points:bad}));
  for(const bad of [null,[],[{x:0,y:0},{x:1,y:1}],Array(1001).fill(points[0]),[...points,{x:0,y:Infinity}]])assert.throws(()=>pointSetResult('convexHull',bad));
});

test('all three convex hull implementations save exact input order, vertex counts and actual method metadata',()=>withDOM(()=>{
  const host=createEditorHost(),expected=['0,0','0,10','10,0','10,10'];
  for(const id of ['default','jarvis','exact']){
    host.selectImplementation('convexHull',id);const el=make(host),source=read(el),record=JSON.parse(el.getAttribute('data-vector-implementation'));
    assert.deepEqual(source.input.points,points);assert.equal(source.implementation,id);assert.equal(el.tagName,'polygon');
    assert.deepEqual(source.result.map(p=>p.x+','+p.y).sort(),expected);assert.equal(record.parameters.pointCount,7);assert.equal(record.parameters.hullVertexCount,4);
    assert.equal(record.parameters.rms,undefined);assert.equal(record.rendering.options.sourceInput,undefined);assert.equal(source.options.sampleCount,undefined);
    assert.match(record.rendering.algorithm,/SVG polygon/);
  }
}));

test('convex hull refuses point and segment degeneracy without changing the original input',()=>{
  const host=createEditorHost();
  for(const ps of [[{x:5,y:5},{x:5,y:5},{x:5,y:5}],[{x:0,y:0},{x:10,y:10},{x:20,y:20}]])for(const id of ['default','jarvis','exact']){
    const input={points:ps},before=JSON.stringify(input);host.selectImplementation('convexHull',id);
    assert.throws(()=>pointSetGeometry('convexHull',input,host.execute('convexHull',input)),/3点以上/);assert.equal(JSON.stringify(input),before);
  }
});

test('convex hull snapshots detect edited polygons, corrupted results and unsupported saved representations',()=>withDOM(()=>{
  const host=createEditorHost();
  const changed=make(host);changed.setAttribute('points',changed.getAttribute('points')+' 20,20');assert.throws(()=>read(changed),/一致しません/);
  for(const update of [s=>s.version=2,s=>s.result=[],s=>s.result[0].x=null,s=>s.input.points[0].y=null]){
    const el=make(host),source=JSON.parse(el.getAttribute('data-vector-pointset'));update(source);el.setAttribute('data-vector-pointset',JSON.stringify(source));assert.throws(()=>read(el));
  }
  for(const text of ['0,0 10,0 NaN,10','0,0 10,0','0,0 10,0 0,10 1','']){
    const el=make(host),source=JSON.parse(el.getAttribute('data-vector-pointset'));el.setAttribute('points',text);source.geometry.points=text;el.setAttribute('data-vector-pointset',JSON.stringify(source));assert.throws(()=>read(el));
  }
  const el=make(host),source=JSON.parse(el.getAttribute('data-vector-pointset'));source.geometry={tag:'line',x1:'0',y1:'0',x2:'1',y2:'1'};
  assert.throws(()=>readPointSetSource(JSON.stringify(source),el.getAttribute('data-vector-implementation'),source.geometry));
}));

test('convex hull rendering can use a closed SVG path while rejecting circles and open paths for reediting',()=>withDOM(()=>{
  const host=createEditorHost();
  host.registerRenderer({id:'hull-path',label:'Closed path',algorithm:'M/L/Z',supports:n=>n==='convexHull',prepare:s=>({kind:'path',start:s.points[0],segments:s.points.slice(1).map(end=>({kind:'segment',end})),closed:true})});
  host.registerRenderer({id:'hull-open',label:'Open path',algorithm:'M/L',supports:n=>n==='convexHull',prepare:s=>({kind:'path',start:s.points[0],segments:s.points.slice(1).map(end=>({kind:'segment',end}))})});
  host.registerRenderer({id:'hull-circle',label:'Circle',algorithm:'Incompatible circle',supports:n=>n==='convexHull',prepare:()=>({kind:'circle',center:{x:0,y:0},radius:1})});
  const path=make(host,{points},'hull-path');assert.equal(path.tagName,'path');assert.equal(read(path).renderer,'hull-path');assert.deepEqual(read(path).input.points,points);
  for(const id of ['hull-open','hull-circle'])assert.throws(()=>read(make(host,{points},id)),/一致しません/);
  path.setAttribute('d',path.getAttribute('d').replace('10','11'));assert.throws(()=>read(path),/一致しません/);
}));

test('convex hull rereading keeps missing implementations explicit, arbitrary options and bounded provenance',()=>withDOM(()=>{
  const host=createEditorHost(),prefs=JSON.stringify(host.exportPreferences()),el=make(host);let record=JSON.parse(el.getAttribute('data-vector-implementation'));
  record.calculation.id='missing-hull';record.rendering.id='missing-renderer';record.rendering.options.detail=42;const origin=pointSetOrigin(record);
  for(let i=0;i<4;i++)record={...record,pointSetEdit:{mode:'points',origin:pointSetOrigin(record)}};
  el.setAttribute('data-vector-implementation',JSON.stringify(record));const source=read(el);
  assert.equal(source.implementation,'missing-hull');assert.equal(source.renderer,'missing-renderer');assert.equal(source.options.detail,42);assert.deepEqual(source.origin,origin);assert.equal(source.origin.pointSetEdit,undefined);
  assert.equal(JSON.stringify(host.exportPreferences()),prefs);
  const old=host.render({kind:'polygon',points:points.slice(1,4)},null,{toolName:'convexHull'});assert.equal(old.getAttribute('data-vector-pointset'),null);
}));
