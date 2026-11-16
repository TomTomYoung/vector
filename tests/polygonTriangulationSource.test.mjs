import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {pointSetInput,pointSetExecutionInput,pointSetResult,pointSetGeometry,pointSetGeometrySnapshot,readPointSetSource,meshReplacementChildren} from '../src/adapters/pointSetSource.js';
import {signedArea} from '../src/model/measurements.js';
import {classifyPointInPolygon} from '../src/model/polygons.js';
const ring=[{x:0,y:0},{x:0,y:0},{x:5,y:0},{x:10,y:0},{x:10,y:10},{x:6,y:10},{x:6,y:4},{x:0,y:4},{x:0,y:0}],input={points:ring};
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
function make(host,value=input,renderer='default'){
  const computed=host.execute('triangulatePolygon',pointSetExecutionInput('triangulatePolygon',value));
  return host.render(pointSetGeometry('triangulatePolygon',value,computed),null,{toolName:'triangulatePolygon',renderer,sourceInput:value,sourceResult:computed});
}
const read=el=>readPointSetSource(el.getAttribute('data-vector-pointset'),el.getAttribute('data-vector-implementation'),pointSetGeometrySnapshot(el));

test('Polygon triangulation saves boundary order, consecutive duplicates, closing and collinear vertices',()=>withDOM(()=>{
  const el=make(createEditorHost()),source=read(el),record=JSON.parse(el.getAttribute('data-vector-implementation'));
  assert.deepEqual(source.input,input);assert.equal(source.result.length,el.children.length);assert.equal(record.parameters.pointCount,9);assert.equal(record.parameters.triangleCount,source.result.length);assert.equal(source.options.sampleCount,undefined);assert.match(record.rendering.algorithm,/SVG g/);
  source.result.forEach((triangle,i)=>assert.equal(el.children[i].getAttribute('points'),triangle.map(p=>p.x+','+p.y).join(' ')));
  assert.equal(record.rendering.options.sourceInput,undefined);assert.equal(record.rendering.options.sourceResult,undefined);
}));

test('Polygon triangulation preserves clockwise and counterclockwise concave domains rather than their convex hull',()=>withDOM(()=>{
  const host=createEditorHost();
  for(const points of [ring,[...ring].reverse(),[{x:0,y:0},{x:10,y:0},{x:0,y:10}]]){
    const source=read(make(host,{points})),area=signedArea({points});assert.deepEqual(source.input.points,points);
    assert.equal(source.result.reduce((sum,t)=>sum+Math.abs(signedArea({points:t})),0),Math.abs(area));
    for(const triangle of source.result){const point={x:triangle.reduce((s,p)=>s+p.x,0)/3,y:triangle.reduce((s,p)=>s+p.y,0)/3};assert.equal(classifyPointInPolygon({point,points}),'inside');assert.equal(Math.sign(signedArea({points:triangle})),Math.sign(area));}
    if(points.length>3)assert.equal(Math.abs(area),64);
  }
}));

test('Polygon calculation input is immutable and source copies are independent of renderer geometry',()=>{
  const copy=pointSetInput('triangulatePolygon',input);copy.points.reverse();copy.points[0].x=99;assert.equal(ring[0].x,0);
  const frozen=pointSetExecutionInput('triangulatePolygon',input);assert.throws(()=>frozen.points.reverse());assert.throws(()=>frozen.points[0].x=99);
  const result=createEditorHost().execute('triangulatePolygon',frozen),shape=pointSetGeometry('triangulatePolygon',input,result);shape.children[0].points[0].x=88;assert.ok(!result.flat().some(p=>p.x===88));
  for(const points of [[],ring.slice(0,2),Array(1001).fill(ring[0]),[...ring,{x:Infinity,y:0}]])assert.throws(()=>pointSetInput('triangulatePolygon',{points}));
});

test('Polygon source validation refuses crossing, overlapping, repeated nonadjacent and degenerate boundaries',()=>{
  const result=[[ring[0],ring[3],ring[4]]];
  for(const points of [ [{x:0,y:0},{x:4,y:4},{x:0,y:4},{x:4,y:0}], [{x:0,y:0},{x:4,y:0},{x:2,y:0},{x:2,y:4},{x:0,y:4}], [{x:0,y:0},{x:4,y:0},{x:0,y:0},{x:0,y:4}], [{x:0,y:0},{x:1,y:1},{x:2,y:2}], [{x:1e308,y:1e308},{x:-1e308,y:1e308},{x:0,y:-1e308}] ])assert.throws(()=>pointSetResult('triangulatePolygon',result,{points}));
});

test('Polygon triangles reject foreign, duplicate, nonfinite, zero-area or incorrectly sized output',()=>{
  const host=createEditorHost(),valid=host.execute('triangulatePolygon',input),triangle=valid[0];
  for(const result of [null,[],[triangle.slice(0,2)],[[...triangle,triangle[0]]],[[ring[0],ring[2],ring[3]]],[triangle,[...triangle].reverse()],[[{x:1,y:1},ring[3],ring[4]]],[[{x:NaN,y:0},ring[3],ring[4]]],Array(2001).fill(triangle)])assert.throws(()=>pointSetResult('triangulatePolygon',result,input));
  const copy=pointSetResult('triangulatePolygon',valid,input);copy[0][0].x=77;assert.ok(!valid.flat().some(p=>p.x===77));
});

test('Polygon face regeneration retains root metadata and permits a different triangle count',()=>withDOM(()=>{
  const host=createEditorHost(),el=make(host),title=new Element('title'),desc=new Element('desc');el.children.unshift(title);el.children.push(desc);el.setAttribute('fill','red');const old=el.children[1];
  const next=make(host,{points:[{x:0,y:0},{x:10,y:0},{x:0,y:10}]}),children=meshReplacementChildren(el,next);assert.equal(el.children[1],old);el.replaceChildren(...children);
  for(const key of ['data-vector-pointset','data-vector-implementation'])el.setAttribute(key,next.getAttribute(key));assert.equal(el.children[0],title);assert.equal(el.children.at(-1),desc);assert.equal(el.getAttribute('fill'),'red');assert.equal(read(el).result.length,1);
}));

test('Polygon source accepts grouped closed paths and rejects stale faces, invalid rendering and corrupted metadata',()=>withDOM(()=>{
  const host=createEditorHost(),closed=p=>({kind:'path',start:p.points[0],segments:p.points.slice(1).map(end=>({kind:'segment',end})),closed:true});
  host.registerRenderer({id:'polygon-paths',label:'Paths',algorithm:'Triangle paths',supports:n=>n==='triangulatePolygon',prepare:s=>({...s,children:s.children.map(closed)})});assert.ok(read(make(host,input,'polygon-paths')).result.length);
  for(const [id,prepare] of [['one',s=>s.children[0]],['missing',s=>({...s,children:s.children.slice(1)})],['open',s=>({...s,children:s.children.map(p=>({...closed(p),closed:false}))})],['nested',s=>({kind:'group',children:[s]})]]){host.registerRenderer({id,label:id,algorithm:id,supports:n=>n==='triangulatePolygon',prepare});assert.throws(()=>read(make(host,input,id)));}
  for(const edit of [el=>el.children[0].setAttribute('fill','red'),el=>el.children.reverse(),el=>el.children.pop()]){const el=make(host);edit(el);assert.throws(()=>read(el),/一致しません/);}
  for(const change of [s=>s.version=2,s=>s.input.points[0].x=null,s=>s.result[0][0].x=999]){const el=make(host),s=JSON.parse(el.getAttribute('data-vector-pointset'));change(s);el.setAttribute('data-vector-pointset',JSON.stringify(s));assert.throws(()=>read(el));}
  const el=make(host),record=JSON.parse(el.getAttribute('data-vector-implementation'));record.calculation.id='missing';record.rendering.id='external';el.setAttribute('data-vector-implementation',JSON.stringify(record));assert.equal(read(el).implementation,'missing');assert.equal(read(el).renderer,'external');
}));
