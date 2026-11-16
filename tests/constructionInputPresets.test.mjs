import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {constructionInputTools,parseConstructionInputPresets,parseConstructionInput,createConstructionInputPresets} from '../src/adapters/constructionInputPresets.js';
const points=[{x:20,y:30},{x:20,y:30},{x:90,y:10},{x:40,y:80}];
const entry=(name='convexHull')=>({version:1,input:{points:structuredClone(points),
  ...(['bSplineCurve','nurbsCurve'].includes(name)?{degree:3,periodic:false,knotsText:' 0, 0, 0, 0, 1, 1, 1, 1 '}:{}),
  ...(name==='nurbsCurve'?{weightsText:'1, -1, 0, 2'}:{}),...(name==='voronoiCells'?{box:{x:-10,y:20,width:200,height:100}}:{})}});
const documentData=entries=>({version:1,entries});

test('all nine construction inputs preserve original point order, duplicates, curve text and Voronoi bounds',()=>{
  const data=documentData(Object.fromEntries(constructionInputTools.map(name=>[name,entry(name)])));
  assert.deepEqual(parseConstructionInputPresets(JSON.stringify(data)),data);
  for(const name of constructionInputTools)assert.deepEqual(parseConstructionInput(name,data.entries[name]),data.entries[name]);
  const partial=entry('nurbsCurve');partial.input.points=[];partial.input.weightsText='1, -';partial.input.knotsText='unfinished knot';
  assert.deepEqual(parseConstructionInput('nurbsCurve',partial),partial);
});

test('record and removal affect one slot and snapshots never alias controllers, loaded data or each other',()=>{
  const store=createConstructionInputPresets(),a=entry(),b=entry('nurbsCurve');
  assert.equal(store.record('convexHull',{exportInputPreset:()=>a}),true);store.record('nurbsCurve',{exportInputPreset:()=>b});
  a.input.points[0].x=999;const snap=store.snapshot();snap.entries.nurbsCurve.input.weightsText='changed';
  assert.equal(store.entry('convexHull').input.points[0].x,20);assert.equal(store.entry('nurbsCurve').input.weightsText,'1, -1, 0, 2');
  const second=createConstructionInputPresets();second.open(store.snapshot());store.remove('convexHull');assert.ok(second.entry('convexHull'));
  assert.equal(store.remove('missing'),false);store.remove('nurbsCurve');assert.equal(store.snapshot(),undefined);assert.equal(store.entry('__proto__'),undefined);
});

test('malformed input rejects the entire document before replacing any previously stored entry',()=>{
  const store=createConstructionInputPresets();store.open(documentData({convexHull:entry()}));const before=store.snapshot();
  const bad=[null,'{',[],{version:2,entries:{}},{version:1,entries:{},extra:1},documentData({convexHull:{version:0,input:{}}}),
    documentData({convexHull:{version:1,input:{points:[{x:1,y:NaN}]}}}),documentData({convexHull:{version:1,input:{points:[{x:1,y:2,z:3}]}}}),
    documentData({convexHull:{version:1,input:{points:Array.from({length:1001},()=>({x:0,y:0}))}}}),
    documentData({nurbsCurve:{...entry('nurbsCurve'),input:{...entry('nurbsCurve').input,degree:1.5}}}),
    documentData({bSplineCurve:{...entry('bSplineCurve'),input:{...entry('bSplineCurve').input,periodic:'true'}}}),
    documentData({nurbsCurve:{...entry('nurbsCurve'),input:{...entry('nurbsCurve').input,weightsText:'x'.repeat(20001)}}}),
    documentData({future:{version:1,input:{run:()=>1}}}),documentData({future:{version:1,input:{value:Infinity}}}),
    documentData(Object.fromEntries(Array.from({length:257},(_,i)=>['tool'+i,{version:1,input:{}}]))),
    '{"version":1,"entries":{"__proto__":{"version":1,"input":{}}}}'];
  let deep={};for(let i=0;i<14;i++)deep={next:deep};bad.push(documentData({future:{version:1,input:deep}}));
  bad.push(documentData({future:{version:1,input:{huge:'x'.repeat(2000001)}}}));
  for(const value of bad){assert.throws(()=>store.open(value));assert.deepEqual(store.snapshot(),before);}
});

test('unknown tool or entry versions survive inert loading and can only restore through a matching explicit controller',()=>{
  const data=documentData({future:{version:8,input:{custom:[1,'draft',null]}},convexHull:{version:2,input:{nextSchema:true}}}),store=createConstructionInputPresets();
  let calls=0;store.open(data);assert.equal(calls,0);const before=store.snapshot();
  assert.equal(store.restore('future',{inputPresetVersion:1,restoreInputPreset:()=>calls++}),false);assert.equal(calls,0);assert.deepEqual(store.snapshot(),before);assert.match(store.state.message,/保持/);
  assert.throws(()=>parseConstructionInput('convexHull',data.entries.convexHull));
  assert.equal(store.restore('future',{inputPresetVersion:8,restoreInputPreset:value=>{calls++;value.input.custom.push('mutated');}}),true);
  assert.equal(calls,1);assert.deepEqual(store.snapshot(),before);assert.equal(store.restore('missing',{}),false);
});

test('failed recording and restoration preserve saved entries and expose actionable status',()=>{
  const store=createConstructionInputPresets();store.open(documentData({convexHull:entry()}));const before=store.snapshot();
  assert.equal(store.record('convexHull',{exportInputPreset:()=>{throw Error('invalid live draft');}}),false);assert.match(store.state.message,/invalid live draft/);
  assert.equal(store.record('convexHull',{exportInputPreset:()=>({version:1,input:{points:[{x:Infinity,y:0}]}})}),false);assert.deepEqual(store.snapshot(),before);
  assert.equal(store.restore('convexHull',{inputPresetVersion:1,restoreInputPreset:()=>{throw Error('inactive tool');}}),false);assert.match(store.state.message,/inactive tool/);
  assert.equal(store.restore('convexHull',{inputPresetVersion:1,implementationError:'入力点が不足しています',restoreInputPreset:()=>{}}),true);assert.equal(store.state.warning,true);assert.deepEqual(store.snapshot(),before);
});

test('Voronoi saved rectangles reject invalid bounds while empty and incomplete geometric drafts remain reusable',()=>{
  for(const box of [{x:0,y:0,width:0,height:10},{x:0,y:0,width:10,height:-1},{x:Infinity,y:0,width:10,height:10},{x:1e308,y:0,width:1e308,height:10}])
    assert.throws(()=>parseConstructionInput('voronoiCells',{version:1,input:{points:[],box}}));
  for(const name of constructionInputTools){const data=entry(name);data.input.points=[];assert.deepEqual(parseConstructionInput(name,data),data);}
  const boundary=entry('triangulatePolygon');boundary.input.points.push({...points[0]});assert.equal(parseConstructionInput('triangulatePolygon',boundary).input.points.length,5);
});

test('real point controller restores an isolated editable draft, validates before reset and clears restored Voronoi bounds on cancel',()=>{
  const context={window:{VectorUtils:{parseConstructionInput}},BaseTool:class {constructor(canvas){this.canvas=canvas;this.isActive=true;}},structuredClone};
  vm.createContext(context);vm.runInContext(readFileSync(new URL('../src/tools/PointConstructionTool.js',import.meta.url),'utf8'),context);
  const Tool=context.window.pointConstructionController('nurbsCurve','NURBS'),tool=new Tool({},{});let redraws=0,removed=0;
  tool.redraw=()=>redraws++;tool.refreshPanel=()=>{};tool.previewElement={remove:()=>removed++};tool.points=[{x:1,y:1}];
  assert.throws(()=>tool.restoreInputPreset({version:1,input:{points:[]}}));assert.equal(removed,0);assert.deepEqual(tool.points,[{x:1,y:1}]);
  const data=entry('nurbsCurve');tool.restoreInputPreset(data);assert.equal(removed,1);assert.equal(redraws,1);assert.equal(tool.weightsText,data.input.weightsText);data.input.points[0].x=500;assert.equal(tool.points[0].x,20);
  tool.isActive=false;assert.throws(()=>tool.restoreInputPreset(entry('nurbsCurve')));assert.equal(redraws,1);
  const Voronoi=context.window.pointConstructionController('voronoiCells','Voronoi'),v=new Voronoi({viewBox:{baseVal:{x:0,y:0,width:800,height:600}}},{});v.redraw=()=>{};v.refreshPanel=()=>{};
  v.restoreInputPreset(entry('voronoiCells'));assert.equal(v.input().box.x,-10);v.cancel();assert.equal(v.voronoiBox,null);assert.equal(v.input().box.width,800);
});
