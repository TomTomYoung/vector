import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {pointSetInput,pointSetExecutionInput,pointSetResult,pointSetGeometry,pointSetGeometrySnapshot,readPointSetSource,meshReplacementChildren} from '../src/adapters/pointSetSource.js';
const input={points:[{x:5,y:4},{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:5,y:4},{x:5,y:0}]};
class Element {
  constructor(tagName){this.tagName=tagName;this.attrs=new Map();this.children=[];}
  setAttribute(k,v){this.attrs.set(k,String(v));}
  getAttribute(k){return this.attrs.get(k)??null;}
  removeAttribute(k){this.attrs.delete(k);}
  get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
  get childNodes(){return this.children;}
  replaceChildren(...children){this.children=children;}
  cloneNode(deep){const copy=new Element(this.tagName);copy.attrs=new Map(this.attrs);if(deep)copy.children=this.children.map(c=>c.cloneNode(true));return copy;}
}
function withDOM(run){const old=globalThis.document;globalThis.document={createElementNS:(_,tag)=>new Element(tag)};try{run();}finally{globalThis.document=old;}}
function make(host,points=input,renderer='default'){
  const computed=host.execute('delaunayTriangles',pointSetExecutionInput('delaunayTriangles',points));
  return host.render(pointSetGeometry('delaunayTriangles',points,computed),null,{toolName:'delaunayTriangles',renderer,sourceInput:points,sourceResult:computed});
}
const read=el=>readPointSetSource(el.getAttribute('data-vector-pointset'),el.getAttribute('data-vector-implementation'),pointSetGeometrySnapshot(el));

test('Delaunay source retains duplicate observations, original indices and all faces for both implementations',()=>withDOM(()=>{
  const host=createEditorHost();
  for(const id of ['default','exact']){
    host.selectImplementation('delaunayTriangles',id);const el=make(host),source=read(el),record=JSON.parse(el.getAttribute('data-vector-implementation'));
    assert.deepEqual(source.input,input);assert.equal(source.implementation,id);assert.equal(el.tagName,'g');assert.equal(el.children.length,source.result.length);assert.ok(source.result.length>0);
    assert.equal(record.parameters.pointCount,7);assert.equal(record.parameters.triangleCount,source.result.length);assert.equal(source.options.sampleCount,undefined);
    assert.ok(source.result.flat().includes(0));assert.ok(!source.result.flat().includes(5));
    source.result.forEach((tri,i)=>assert.equal(el.children[i].getAttribute('points'),tri.map(j=>input.points[j].x+','+input.points[j].y).join(' ')));
    assert.match(record.rendering.algorithm,/SVG g/);
  }
}));

test('Delaunay result validation rejects bad indices, duplicate faces, degeneracy and processing bounds',()=>{
  for(const result of [null,[],[[0,1]],[[0,1,7]],[[0,1,-1]],[[0,1,1.5]],[[0,1,1]],[[1,2,6]],[[0,1,2],[2,0,1]],Array(2001).fill([0,1,2])])assert.throws(()=>pointSetResult('delaunayTriangles',result,input));
  const result=[[0,1,2]],copy=pointSetResult('delaunayTriangles',result,input);copy[0][0]=6;assert.equal(result[0][0],0);
  for(const points of [[],input.points.slice(0,2),Array(1001).fill(input.points[0]),[...input.points,{x:Infinity,y:0}]])assert.throws(()=>pointSetInput('delaunayTriangles',{points}));
});

test('Delaunay execution inputs are independent and immutable so index-based plugins cannot reorder them',()=>{
  const value=pointSetExecutionInput('delaunayTriangles',input);assert.deepEqual(value,input);
  assert.throws(()=>value.points.reverse());assert.throws(()=>value.points[0].x=42);assert.throws(()=>value.points=[]);
  assert.equal(input.points[0].x,5);const host=createEditorHost();assert.ok(host.execute('delaunayTriangles',value).length);
  const shape=pointSetGeometry('delaunayTriangles',input,[[0,1,2]]);shape.children[0].points[0].x=99;assert.equal(input.points[0].x,5);
});

test('Delaunay snapshots detect child geometry, style, transform, order and membership changes but allow root metadata',()=>withDOM(()=>{
  const host=createEditorHost();
  for(const change of [el=>el.children[0].setAttribute('points','0,0 1,0 0,1'),el=>el.children[0].setAttribute('fill','red'),el=>el.children[0].setAttribute('transform','translate(1 0)'),el=>el.children.reverse(),el=>el.children.pop(),el=>el.children.push(el.children[0].cloneNode(true))]){
    const el=make(host);change(el);assert.throws(()=>read(el),/一致しません/);
  }
  const el=make(host);el.children.unshift(new Element('title'));el.children.push(new Element('desc'),new Element('metadata'));assert.deepEqual(read(el).input,input);
  el.children.push(new Element('g'));assert.throws(()=>read(el));
  const childTitle=make(host);childTitle.children[0].children.push(new Element('title'));assert.throws(()=>read(childTitle));
}));

test('Delaunay replacement prepares detached faces and retains the mesh root and metadata node identities',()=>withDOM(()=>{
  const host=createEditorHost(),old=make(host),title=new Element('title'),desc=new Element('desc');old.children.unshift(title);old.children.push(desc);old.setAttribute('fill','red');const first=old.children[1];
  const next=make(host,{points:[...input.points,{x:20,y:5}]}),planned=meshReplacementChildren(old,next);
  assert.equal(old.children[1],first);assert.notEqual(planned[1],next.children[0]);assert.equal(planned[0],title);assert.equal(planned.at(-1),desc);
  old.replaceChildren(...planned);for(const name of ['data-vector-pointset','data-vector-implementation'])old.setAttribute(name,next.getAttribute(name));
  assert.equal(old.getAttribute('fill'),'red');assert.equal(read(old).input.points.length,8);assert.equal(old.children.length,next.children.length+2);
}));

test('Delaunay supports one closed path per face and rejects incompatible renderer structures',()=>withDOM(()=>{
  const host=createEditorHost(),closed=s=>({kind:'path',start:s.points[0],segments:s.points.slice(1).map(end=>({kind:'segment',end})),closed:true});
  host.registerRenderer({id:'mesh-paths',label:'Paths',algorithm:'One M/L/Z per triangle',supports:n=>n==='delaunayTriangles',prepare:s=>({...s,children:s.children.map(closed)})});
  assert.ok(read(make(host,input,'mesh-paths')).result.length);
  for(const [id,prepare] of [['one',s=>s.children[0]],['nested',s=>({kind:'group',children:[s]})],['missing',s=>({...s,children:s.children.slice(1)})],['open',s=>({...s,children:s.children.map(p=>({...closed(p),closed:false}))})]]){
    host.registerRenderer({id,label:id,algorithm:id,supports:n=>n==='delaunayTriangles',prepare});assert.throws(()=>read(make(host,input,id)));
  }
}));

test('Delaunay source rejects corrupt records and preserves missing implementation identities explicitly',()=>withDOM(()=>{
  const host=createEditorHost();
  for(const change of [s=>s.version=2,s=>s.input.points[0].x=null,s=>s.result[0][0]=1000,s=>s.geometry.faces[0].attributes=[['points','NaN,0 1,0 0,1']]]){
    const el=make(host),source=JSON.parse(el.getAttribute('data-vector-pointset'));change(source);el.setAttribute('data-vector-pointset',JSON.stringify(source));assert.throws(()=>read(el));
  }
  const el=make(host),record=JSON.parse(el.getAttribute('data-vector-implementation'));record.calculation.id='missing';record.rendering.id='external';record.rendering.options.detail=42;el.setAttribute('data-vector-implementation',JSON.stringify(record));
  const source=read(el);assert.equal(source.implementation,'missing');assert.equal(source.renderer,'external');assert.equal(source.options.detail,42);
  record.tool='convexHull';el.setAttribute('data-vector-implementation',JSON.stringify(record));assert.throws(()=>read(el));
}));
