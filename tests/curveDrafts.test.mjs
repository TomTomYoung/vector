import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseCurveDraft,parseConstructionInputPresets,createConstructionInputPresets,supportsConstructionInput,constructionInputMode,exportConstructionParameters,restoreConstructionParameters} from '../src/adapters/constructionInputPresets.js';
const points=[{x:10,y:20},{x:10,y:20},{x:80,y:90}];
const path=(pathMode='bezier')=>({version:1,input:{points:structuredClone(points),pathMode}});
const spline=()=>({version:2,input:{points:structuredClone(points),tension:2}});
const legacy=()=>({version:1,input:{tension:1.5}});
const data=entries=>({version:1,entries});

test('path modes and spline drafts preserve repeated ordered points, boundary values and empty input',()=>{
  for(const [name,entry] of [['path',path()],['path',path('line')],['spline',spline()]]){
    assert.deepEqual(parseCurveDraft(name,entry),entry);const copy=parseCurveDraft(name,entry);copy.input.points[0].x=999;assert.equal(entry.input.points[0].x,10);
    for(const length of [0,1,1000]){entry.input.points=Array.from({length},()=>({x:1,y:2}));assert.equal(parseCurveDraft(name,entry).input.points.length,length);}
  }
  for(const tension of [0,4]){const entry=spline();entry.input.tension=tension;assert.equal(parseCurveDraft('spline',entry).input.tension,tension);}
  assert.deepEqual(parseConstructionInputPresets(data({spline:legacy()})),data({spline:legacy()}));
});

test('invalid curve drafts reject whole metadata atomically including known version 2 and unsupported fields',()=>{
  const store=createConstructionInputPresets();store.open(data({path:path(),spline:legacy()}));const before=store.snapshot();
  for(const [name,make] of [['path',path],['spline',spline]]){
    const variants=[];let e=make();e.input.points=[{x:Infinity,y:1}];variants.push(e);
    e=make();e.input.points=[{x:1,y:2,z:3}];variants.push(e);
    e=make();e.input.points=Array.from({length:1001},()=>({x:0,y:0}));variants.push(e);
    e=make();delete e.input.points;variants.push(e);
    e=make();e.input.sampleCount=80;variants.push(e);
    for(const value of name==='path'?['curve',null,0]:[-1,5,'1',NaN]){e=make();e.input[name==='path'?'pathMode':'tension']=value;variants.push(e);}
    for(const entry of variants){assert.throws(()=>store.open(data({[name]:entry})));assert.deepEqual(store.snapshot(),before);}
  }
  assert.throws(()=>parseConstructionInputPresets(data({spline:{version:1,input:{tension:1,points:[]}}})));
});

test('explicit draft recording and version negotiation retain inert future data and independent snapshots',()=>{
  const store=createConstructionInputPresets(),controller={inputPresetVersion:1,inputPresetVersions:[1,2],exportInputPreset:legacy,exportInputDraftPreset:spline,restoreInputPreset(){},inputPresetModeForEntry:e=>e?.version===2?'draft':'parameters'};
  assert.equal(store.record('spline',controller),true);assert.equal(store.entry('spline').version,1);
  assert.equal(store.record('spline',controller,{draft:true}),true);assert.equal(store.entry('spline').version,2);
  const copy=store.entry('spline');copy.input.points.length=0;assert.equal(store.entry('spline').input.points.length,3);
  assert.equal(supportsConstructionInput(controller,spline()),true);assert.equal(constructionInputMode(controller,legacy()),'parameters');assert.equal(constructionInputMode(controller,spline()),'draft');
  const future=data({path:{version:2,input:{later:true}},spline:{version:3,input:{later:true}}});store.open(future);
  assert.equal(store.restore('spline',controller),false);assert.deepEqual(store.snapshot(),future);assert.throws(()=>parseCurveDraft('spline',future.entries.spline));
  assert.equal(store.record('spline',{exportInputPreset:legacy},{draft:true}),false);assert.deepEqual(store.snapshot(),future);
});

function controllers(){
  const context={window:{VectorUtils:{parseCurveDraft,exportConstructionParameters,restoreConstructionParameters}},BaseTool:class {constructor(canvas){this.canvas=canvas;this.isActive=true;}}};vm.createContext(context);
  for(const file of ['PathTool','SplineTool'])vm.runInContext(readFileSync(new URL('../src/tools/'+file+'.js',import.meta.url),'utf8'),context);
  return {path:new context.window.PathTool({},{}),spline:new context.window.SplineTool({},{})};
}

test('real controllers validate before reset and spline numeric-only restoration preserves point identity while draft restoration replaces it',()=>{
  const tools=controllers();
  for(const [name,t] of Object.entries(tools)){
    let resets=0,updates=0;t.cancelPath=t.cancelSpline=()=>resets++;t.createPath=()=>{};t.updatePathData=t.updateSpline=()=>updates++;
    t.points=t.pathPoints=points;t.isDrawing=true;
    assert.throws(()=>t.restoreInputPreset({version:name==='path'?1:2,input:{}}));assert.equal(resets,0);
    t.isActive=false;assert.throws(()=>t.restoreInputPreset(name==='path'?path():spline()));assert.equal(resets,0);t.isActive=true;
    if(name==='spline'){t.restoreInputPreset(legacy());assert.equal(t.points,points);assert.equal(t.tension,1.5);assert.equal(resets,0);assert.equal(updates,1);}
    const entry=name==='path'?path():spline();t.restoreInputPreset(entry);assert.equal(resets,1);entry.input.points[0].x=999;
    assert.equal((name==='path'?t.pathPoints:t.points)[0].x,10);assert.notEqual(name==='path'?t.pathPoints:t.points,points);
    if(name==='spline')assert.equal(t.restoredDraft,true);else assert.equal(t.pathMode,'bezier');
  }
});

test('incomplete confirmation preserves editable inputs and curve controllers enforce point limits before accepting another click',()=>{
  const tools=controllers();for(const [name,t] of Object.entries(tools)){
    t.requestToolPanelRefresh=t.updatePanel=()=>{};
    const one=[{x:1,y:2}];t.points=t.pathPoints=one;t.isDrawing=true;
    if(name==='path'){t.currentPath={};t.finishPath();}else t.finishSpline();
    assert.equal(name==='path'?t.pathPoints:t.points,one);assert.match(t.implementationError,/2点/);
    const many=Array.from({length:1000},()=>({x:1,y:2}));t.points=t.pathPoints=many;
    if(name==='path')t.handlePathClick({x:4,y:5});else t.handleMouseDown({button:0});
    assert.equal(many.length,1000);assert.match(t.implementationError,/1000/);
  }
});
