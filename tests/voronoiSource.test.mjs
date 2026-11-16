import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {pointSetInput,pointSetExecutionInput,pointSetResult,pointSetGeometry,pointSetGeometrySnapshot,readPointSetSource,meshReplacementChildren} from '../src/adapters/pointSetSource.js';
const input={sites:[{x:2,y:5},{x:8,y:5},{x:2,y:5},{x:100,y:5}],box:{x:0,y:0,width:10,height:10}};
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
  const computed=host.execute('voronoiCells',pointSetExecutionInput('voronoiCells',value));
  return host.render(pointSetGeometry('voronoiCells',value,computed),null,{toolName:'voronoiCells',renderer,sourceInput:value,sourceResult:computed});
}
const read=el=>readPointSetSource(el.getAttribute('data-vector-pointset'),el.getAttribute('data-vector-implementation'),pointSetGeometrySnapshot(el));

test('Voronoi stores original sites, duplicate order, clipping box and empty cells separately from visible faces',()=>withDOM(()=>{
  const el=make(createEditorHost()),source=read(el),record=JSON.parse(el.getAttribute('data-vector-implementation'));
  assert.deepEqual(source.input,input);assert.deepEqual(source.result.map(c=>c.index),[0,1,3]);assert.equal(source.result[2].points.length,0);assert.equal(el.children.length,2);
  assert.deepEqual(record.parameters,{pointCount:4,cellCount:3,visibleCellCount:2,box:input.box});assert.equal(source.options.sampleCount,undefined);assert.match(record.rendering.algorithm,/SVG g/);
  assert.equal(record.rendering.options.sourceInput,undefined);assert.equal(record.rendering.options.sourceResult,undefined);
  assert.deepEqual(source.result[0].points,[{x:0,y:0},{x:5,y:0},{x:5,y:10},{x:0,y:10}]);
}));

test('Voronoi supports one site, repeated sites, two sites and collinear sites within a saved box',()=>withDOM(()=>{
  const host=createEditorHost();
  for(const sites of [[{x:3,y:4}],[{x:3,y:4},{x:3,y:4}],[{x:2,y:5},{x:8,y:5}],[{x:2,y:5},{x:5,y:5},{x:8,y:5}]]){
    const source=read(make(host,{sites,box:input.box}));assert.deepEqual(source.input.sites,sites);
    const area=source.result.reduce((total,c)=>total+Math.abs(c.points.reduce((sum,p,i)=>{const q=c.points[(i+1)%c.points.length];return sum+p.x*q.y-p.y*q.x;},0))/2,0);
    assert.ok(Math.abs(area-100)<1e-10);
  }
}));

test('Voronoi validates finite non-collapsed boxes and isolates immutable input copies',()=>{
  for(const box of [null,{...input.box,width:0},{...input.box,height:-1},{...input.box,x:Infinity},{...input.box,x:1e308,width:1e308},{...input.box,x:1e20,width:1}])assert.throws(()=>pointSetInput('voronoiCells',{...input,box}));
  for(const sites of [[],Array(1001).fill({x:0,y:0}),[{x:NaN,y:0}]])assert.throws(()=>pointSetInput('voronoiCells',{...input,sites}));
  const copy=pointSetInput('voronoiCells',input);copy.sites[0].x=42;copy.box.width=42;assert.equal(input.sites[0].x,2);assert.equal(input.box.width,10);
  const frozen=pointSetExecutionInput('voronoiCells',input);assert.throws(()=>frozen.sites.reverse());assert.throws(()=>frozen.sites[0].x=42);assert.throws(()=>frozen.box.x=42);assert.ok(createEditorHost().execute('voronoiCells',frozen).length);
});

test('Voronoi rejects missing or reordered sites, invalid cell indices, invalid polygons and unbounded output',()=>{
  const original=createEditorHost().execute('voronoiCells',input);
  const changes=[r=>r.pop(),r=>r.reverse(),r=>r[0].index=2,r=>r[0].site.x=4,r=>r[0].points=[{x:1,y:1}],r=>r[0].points[0].x=NaN,r=>r[0].points[0].x=100,r=>r[0].points=[{x:0,y:0},{x:1,y:1},{x:2,y:2}],r=>r[0].points=Array(2001).fill({x:0,y:0}),r=>r.forEach(c=>c.points=[])];
  for(const change of changes){const result=structuredClone(original);change(result);assert.throws(()=>pointSetResult('voronoiCells',result,input));}
  const copied=pointSetResult('voronoiCells',original,input);copied[0].points[0].x=42;copied[0].site.x=42;assert.equal(original[0].points[0].x,0);assert.equal(input.sites[0].x,2);
  const shape=pointSetGeometry('voronoiCells',input,original);shape.children[0].points[0].x=99;assert.equal(original[0].points[0].x,0);
});

test('Voronoi regenerates faces when an empty cell enters the box while retaining root metadata',()=>withDOM(()=>{
  const host=createEditorHost(),el=make(host),title=new Element('title');el.children.unshift(title);el.setAttribute('fill','red');const old=el.children[1];
  const next=make(host,{...input,sites:[...input.sites.slice(0,3),{x:5,y:8}]}),children=meshReplacementChildren(el,next);assert.equal(el.children[1],old);el.replaceChildren(...children);
  for(const key of ['data-vector-pointset','data-vector-implementation'])el.setAttribute(key,next.getAttribute(key));
  assert.equal(el.children[0],title);assert.equal(el.getAttribute('fill'),'red');assert.equal(el.children.length,4);assert.ok(read(el).result.every(c=>c.points.length>=3));
}));

test('Voronoi accepts grouped closed paths and rejects missing faces, open paths and malformed polygons',()=>withDOM(()=>{
  const host=createEditorHost(),closed=p=>({kind:'path',start:p.points[0],segments:p.points.slice(1).map(end=>({kind:'segment',end})),closed:true});
  host.registerRenderer({id:'cells-paths',label:'Paths',algorithm:'Closed cell paths',supports:n=>n==='voronoiCells',prepare:s=>({...s,children:s.children.map(closed)})});assert.equal(read(make(host,input,'cells-paths')).result.length,3);
  for(const [id,prepare] of [['one',s=>s.children[0]],['missing',s=>({...s,children:s.children.slice(1)})],['open',s=>({...s,children:s.children.map(p=>({...closed(p),closed:false}))})],['line',s=>({...s,children:s.children.map(p=>({...p,points:p.points.slice(0,2)}))})]]){
    host.registerRenderer({id,label:id,algorithm:id,supports:n=>n==='voronoiCells',prepare});assert.throws(()=>read(make(host,input,id)));
  }
}));

test('Voronoi source rejects corrupt clipping ranges, cell correspondence and stale faces and keeps missing implementation ids',()=>withDOM(()=>{
  const host=createEditorHost();
  for(const change of [s=>s.version=2,s=>s.input.box.width=-1,s=>s.result[0].index=8,s=>s.result[0].site.y=20]){const el=make(host),s=JSON.parse(el.getAttribute('data-vector-pointset'));change(s);el.setAttribute('data-vector-pointset',JSON.stringify(s));assert.throws(()=>read(el));}
  const el=make(host),record=JSON.parse(el.getAttribute('data-vector-implementation'));record.calculation.id='missing';record.rendering.id='external';el.setAttribute('data-vector-implementation',JSON.stringify(record));assert.equal(read(el).implementation,'missing');assert.equal(read(el).renderer,'external');
  el.children[0].setAttribute('fill','red');assert.throws(()=>read(el),/一致しません/);
}));
