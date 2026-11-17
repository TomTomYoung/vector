import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {constructionShapeTools,parseShapeDraft,parseConstructionInputPresets,createConstructionInputPresets} from '../src/adapters/constructionInputPresets.js';
const points=[{x:10,y:20},{x:60,y:90},{x:130,y:20}];
const entry=(name,count=['rectangle','circle'].includes(name)?2:3)=>({version:1,input:{points:structuredClone(points.slice(0,count))}});
const data=entries=>({version:1,entries});

test('four primitive shape drafts preserve input order and duplicates, including empty and partial geometry',()=>{
  for(const name of constructionShapeTools){
    const value=entry(name),copy=parseShapeDraft(name,value);assert.deepEqual(copy,value);copy.input.points[0].x=99;assert.equal(value.input.points[0].x,10);
    assert.deepEqual(parseShapeDraft(name,entry(name,0)),entry(name,0));
    value.input.points.fill({x:5,y:5});assert.deepEqual(parseShapeDraft(name,value),value);
  }
  for(const count of [1,2,3])assert.equal(parseShapeDraft('arc',entry('arc',count)).input.points.length,count);
  const many={version:1,input:{points:Array.from({length:1000},()=>({x:0,y:0}))}};assert.equal(parseShapeDraft('polygon',many).input.points.length,1000);
});

test('malformed shape inputs are rejected atomically without changing records for other tools',()=>{
  const store=createConstructionInputPresets();store.open(data({rectangle:entry('rectangle'),spline:{version:2,input:{points,tension:1}}}));const before=store.snapshot();
  for(const name of constructionShapeTools){
    const bad=[{version:1,input:{}},{version:1,input:{points:[],extra:1}},{version:1,input:{points:[{x:'1',y:2}]}},{version:1,input:{points:[{x:1,y:Infinity}]}},{version:1,input:{points:[{x:1,y:2,z:3}]}},{version:1,input:{points:Array.from({length:1001},()=>({x:1,y:2}))}}];
    if(['rectangle','circle'].includes(name))bad.push(entry(name,1),entry(name,3));
    if(name==='arc')bad.push({version:1,input:{points:[...points,points[0]]}});
    for(const value of bad){assert.throws(()=>store.open(data({[name]:value})));assert.deepEqual(store.snapshot(),before);}
  }
});

test('future shape formats remain inert and failed recording never replaces a valid existing entry',()=>{
  const store=createConstructionInputPresets(),future=data({circle:{version:2,input:{future:true}},arc:entry('arc')});store.open(future);
  assert.equal(store.restore('circle',{inputPresetVersion:1,restoreInputPreset:()=>assert.fail()}),false);assert.deepEqual(store.snapshot(),future);
  assert.equal(store.record('arc',{exportInputPreset:()=>({version:1,input:{points:[{x:NaN,y:0}]}})}),false);assert.deepEqual(store.snapshot(),future);
  assert.throws(()=>parseShapeDraft('circle',future.entries.circle));assert.throws(()=>parseShapeDraft('unknown',entry('arc')));
  assert.deepEqual(parseConstructionInputPresets(JSON.stringify(future)),future);
});

function controllers(){
  const context={window:{VectorUtils:{parseShapeDraft}},BaseTool:class {constructor(){this.isActive=true;}cancel(){}}};vm.createContext(context);
  for(const title of ['Rectangle','Circle','Arc','Polygon'])vm.runInContext(readFileSync(new URL('../src/tools/'+title+'Tool.js',import.meta.url),'utf8'),context);
  return Object.fromEntries(constructionShapeTools.map(name=>[name,new context.window[name[0].toUpperCase()+name.slice(1)+'Tool']({}, {})]));
}

test('real shape controllers validate version, complete input and activity before clearing the current draft',()=>{
  for(const [name,t] of Object.entries(controllers())){
    let clears=0,redraws=0;t.cancel=t.cancelArc=t.cancelPolygon=()=>clears++;t.redrawDraft=t.updatePolygonPath=t.updateDrawingRectangle=t.updateDrawingCircle=()=>redraws++;
    t.beginRectangle=t.beginCircle=p=>{t.startPoint=p;};t.createPolygon=()=>{};t.points=t.polygonPoints=points;
    assert.throws(()=>t.restoreInputPreset({version:1,input:{}}));assert.equal(clears,0);
    t.isActive=false;assert.throws(()=>t.restoreInputPreset(entry(name)));assert.equal(clears,0);t.isActive=true;
    const value=entry(name);t.restoreInputPreset(value);assert.equal(clears,1);assert.equal(redraws,1);value.input.points[0].x=999;
    assert.equal((['rectangle','circle'].includes(name)?t.startPoint:(name==='arc'?t.points:t.polygonPoints)[0]).x,10);
    if(['rectangle','circle'].includes(name))assert.equal(t.restoredDraft,true);
  }
});

test('arc calculation failure and insufficient arc or polygon input stay editable and polygon clicks stop at the input limit',()=>{
  const tools=controllers(),arc=tools.arc;arc.updatePanel=()=>{};arc.points=structuredClone(points);arc.draw=()=>{throw Error('arc calculation failed');};arc.finishArc();assert.equal(arc.points.length,3);assert.equal(arc.implementationError,'arc calculation failed');
  arc.draw=()=>null;arc.finishArc();assert.equal(arc.points.length,3);assert.match(arc.implementationError,/3点/);arc.points.pop();arc.finishArc();assert.equal(arc.points.length,2);
  const polygon=tools.polygon;polygon.updatePanel=()=>{};polygon.polygonPoints=points.slice(0,2);polygon.finishPolygon();assert.equal(polygon.polygonPoints.length,2);assert.match(polygon.implementationError,/3点/);
  polygon.polygonPoints=Array.from({length:1000},()=>({x:1,y:2}));polygon.handlePolygonClick({x:1,y:2});assert.equal(polygon.polygonPoints.length,1000);assert.match(polygon.implementationError,/1000/);
});
