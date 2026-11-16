import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {constructionDraftTools,parseConstructionDraft,parseConstructionInputPresets,createConstructionInputPresets} from '../src/adapters/constructionInputPresets.js';

const points=[{x:10,y:20},{x:10,y:20},{x:50,y:90},{x:80,y:10}];
const entry=(name, count=name==='line'?2:name==='quadraticBezier'?3:4)=>({version:1,input:{points:structuredClone(points.slice(0,count)),...(name==='nthBezier'?{degree:4}:{})}});
const documentData=entries=>({version:1,entries});

test('five line and Bezier drafts retain ordered repeated points, empty drafts and nth degree independently',()=>{
  const data=documentData(Object.fromEntries(constructionDraftTools.map(n=>[n,entry(n)])));
  assert.deepEqual(parseConstructionInputPresets(JSON.stringify(data)),data);
  for(const name of constructionDraftTools){
    const value=entry(name);assert.deepEqual(parseConstructionDraft(name,value),value);
    const copy=parseConstructionDraft(name,value);copy.input.points[0].x=99;assert.equal(value.input.points[0].x,10);
    assert.deepEqual(parseConstructionDraft(name,entry(name,0)),entry(name,0));
  }
  const n=entry('nthBezier');n.input.degree=12;n.input.points=Array.from({length:13},()=>({x:0,y:0}));assert.equal(parseConstructionDraft('nthBezier',n).input.points.length,13);
});

test('known drafts reject extra fields, nonfinite coordinates, wrong degrees and point counts before changing stored data',()=>{
  const store=createConstructionInputPresets();store.open(documentData({line:entry('line')}));const before=store.snapshot();
  for(const name of constructionDraftTools){
    const variants=[];
    let v=entry(name);v.input.points[0].x=Infinity;variants.push(v);
    v=entry(name);v.input.points[0].z=1;variants.push(v);
    v=entry(name);v.input.sampleCount=80;variants.push(v);
    v=entry(name);delete v.input.points;variants.push(v);
    v=entry(name);v.input.points=Array.from({length:1001},()=>({x:0,y:0}));variants.push(v);
    for(const bad of variants){assert.throws(()=>store.open(documentData({[name]:bad})));assert.deepEqual(store.snapshot(),before);}
  }
  for(const degree of [1,13,2.5,'3',NaN]){const n=entry('nthBezier');n.input.degree=degree;assert.throws(()=>parseConstructionDraft('nthBezier',n));}
  assert.throws(()=>parseConstructionDraft('line',entry('line',1)));
  assert.throws(()=>parseConstructionDraft('quadraticBezier',entry('quadraticBezier',4)));
  const n=entry('nthBezier');n.input.degree=2;assert.throws(()=>parseConstructionDraft('nthBezier',n));
});

test('future draft versions remain inert and failed recordings preserve existing parameter and point records',()=>{
  const store=createConstructionInputPresets(),future={version:2,input:{newFormat:true}};
  store.open(documentData({line:future,fillet:{version:1,input:{radius:30}},convexHull:{version:1,input:{points}}}));
  const before=store.snapshot();assert.throws(()=>parseConstructionDraft('line',future));
  assert.equal(store.restore('line',{inputPresetVersion:1,restoreInputPreset:()=>assert.fail()}),false);
  assert.equal(store.record('line',{exportInputPreset:()=>entry('line',1)}),false);assert.deepEqual(store.snapshot(),before);
  assert.equal(store.record('line',{exportInputPreset:()=>entry('line')}),true);assert.equal(store.entry('fillet').input.radius,30);
});

function controllers(){
  const context={window:{VectorUtils:{parseConstructionDraft}},BaseTool:class {constructor(canvas){this.canvas=canvas;this.isActive=true;}}};vm.createContext(context);
  for(const file of ['BezierToolBase','QuadraticBezierTool','CubicBezierTool','NthBezierTool','LineTool','PolylineTool'])vm.runInContext(readFileSync(new URL('../src/tools/'+file+'.js',import.meta.url),'utf8'),context);
  return context.window;
}

test('real controllers validate the complete draft and activity before clearing any current input',()=>{
  const w=controllers(),classes={line:w.LineTool,polyline:w.PolylineTool,quadraticBezier:w.QuadraticBezierTool,cubicBezier:w.CubicBezierTool,nthBezier:w.NthBezierTool};
  for(const [name,Tool] of Object.entries(classes)){
    const t=new Tool({},{});let reset=0,preview=0;
    t.resetDrawing=t.resetDrawingState=()=>reset++;
    t.updatePreview=t.updatePolyline=t.updateCurrentLineEnd=()=>preview++;
    t.createPolyline=()=>{};t.beginLine=p=>{t.startPoint=p;};t.points=points;t.operationMode='drag';
    assert.throws(()=>t.restoreInputPreset({version:1,input:{}}));assert.equal(reset,0);assert.equal(t.points,points);
    t.isActive=false;assert.throws(()=>t.restoreInputPreset(entry(name)));assert.equal(reset,0);
    t.isActive=true;const value=entry(name);t.restoreInputPreset(value);assert.equal(reset,1);assert.equal(preview,1);
    value.input.points[0].x=999;assert.equal(name==='line'?t.startPoint.x:t.points[0].x,10);
    if(name==='line')assert.equal(t.operationMode,'drag');
    if(name==='nthBezier')assert.equal(t.degree,4);
  }
});

test('Bezier failed or incomplete confirmation preserves editable points for correction and retry',()=>{
  const w=controllers(),tool=new w.QuadraticBezierTool({},{});tool.requestToolPanelRefresh=()=>{};tool.points=structuredClone(points.slice(0,2));
  tool.drawCurve=()=>null;tool.commitCurve();assert.equal(tool.points.length,2);assert.match(tool.implementationError,/不足/);
  tool.drawCurve=()=>{throw Error('calculation failure');};tool.commitCurve();assert.equal(tool.points.length,2);assert.equal(tool.implementationError,'calculation failure');
  tool.updatePreview=()=>{};tool.handleKeyDown({key:'Backspace',preventDefault(){}});assert.equal(tool.points.length,1);
  const before=tool.points;tool.handleMouseDown({button:2});assert.equal(tool.points,before);
});
