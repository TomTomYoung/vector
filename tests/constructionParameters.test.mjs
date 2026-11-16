import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {constructionParameterFields,exportConstructionParameters,restoreConstructionParameters,parseConstructionInputPresets,createConstructionInputPresets} from '../src/adapters/constructionInputPresets.js';
const values={spline:{tension:2},fillet:{radius:25.5},chamfer:{distance1:0,distance2:35.25},offset:{offsetDistance:17.5,miterLimit:2.5}};
const entry=name=>({version:1,input:{...values[name]}});
function controllers(){
  const context={window:{VectorUtils:{exportConstructionParameters,restoreConstructionParameters}},BaseTool:class {constructor(canvas,manager){this.canvas=canvas;this.toolManager=manager;this.isActive=true;}}};
  vm.createContext(context);
  for(const name of ['Spline','Fillet','Chamfer','Offset'])vm.runInContext(readFileSync(new URL('../src/tools/'+name+'Tool.js',import.meta.url),'utf8'),context);
  return Object.fromEntries(Object.keys(values).map(name=>[name,new context.window[name[0].toUpperCase()+name.slice(1)+'Tool']({}, {})]));
}

test('four parameter presets capture only finite declared settings and coexist with point-input records',()=>{
  const store=createConstructionInputPresets();store.open({version:1,entries:{convexHull:{version:1,input:{points:[{x:2,y:3}]}}}});
  for(const name of Object.keys(values)){
    const tool={...values[name],selectedLines:[{id:'line'}],points:[{x:3,y:4}],extra:()=>1};
    const data=exportConstructionParameters(name,tool);assert.deepEqual(data,entry(name));store.record(name,{exportInputPreset:()=>data});data.input[Object.keys(values[name])[0]]=999;
    assert.deepEqual(store.entry(name),entry(name));
  }
  assert.equal(Object.keys(store.snapshot().entries).length,5);assert.deepEqual(store.entry('convexHull').input.points,[{x:2,y:3}]);
  assert.deepEqual(parseConstructionInputPresets(JSON.stringify(store.snapshot())),store.snapshot());
});

test('parameter boundaries are inclusive and any malformed field rejects the whole restore before changing live settings',()=>{
  for(const [name,fields] of Object.entries(constructionParameterFields)){
    for(const [key,label,min,max] of fields){
      for(const value of [min,max])assert.equal(exportConstructionParameters(name,{...values[name],[key]:value}).input[key],value);
      for(const value of [min-0.001,max+0.001,NaN,Infinity,'1',null]){
        const tool={isActive:true,...values[name]},before={...tool};assert.throws(()=>restoreConstructionParameters(name,{version:1,input:{...values[name],[key]:value}},tool));assert.deepEqual(tool,before);
      }
    }
    for(const input of [{},{...values[name],points:[]},{...values[name],extra:1}])assert.throws(()=>restoreConstructionParameters(name,{version:1,input},{isActive:true,...values[name]}));
  }
  assert.throws(()=>exportConstructionParameters('__proto__',{}));
});

test('real controllers preserve active input and selected target identities while changing only their parameters',()=>{
  const tools=controllers();
  for(const [name,tool] of Object.entries(tools)){
    const points=[{x:4,y:5}],selected=[{id:'first-line'}],target={id:'offset-target'};
    tool.points=points;tool.selectedLines=selected;tool.selectedElement=target;tool.isDrawing=true;
    let previews=0;tool.updateSpline=()=>previews++;tool.implementationError='old error';
    tool.restoreInputPreset(entry(name));assert.deepEqual(tool.exportInputPreset(),entry(name));
    assert.equal(tool.points,points);assert.equal(tool.selectedLines,selected);assert.equal(tool.selectedElement,target);assert.equal(tool.isDrawing,true);
    assert.equal(previews,name==='spline'?1:0);assert.equal(tool.implementationError,'');
    tool.isActive=false;const before=tool.exportInputPreset();assert.throws(()=>tool.restoreInputPreset(entry(name)));assert.deepEqual(tool.exportInputPreset(),before);
  }
});

test('future parameter versions and invalid SVG metadata retain existing records and never invoke a mismatched controller',()=>{
  const store=createConstructionInputPresets();store.open({version:1,entries:{offset:entry('offset'),spline:{version:3,input:{future:'value'}}}});const before=store.snapshot();
  let calls=0;assert.equal(store.restore('spline',{inputPresetVersion:1,restoreInputPreset:()=>calls++}),false);assert.equal(calls,0);assert.deepEqual(store.snapshot(),before);
  assert.throws(()=>store.open({version:1,entries:{offset:{version:1,input:{offsetDistance:25,miterLimit:0}}}}));assert.deepEqual(store.snapshot(),before);
  const tool=controllers().offset;tool.offsetDistance=NaN;assert.equal(store.record('offset',tool),false);assert.deepEqual(store.snapshot(),before);
  tool.offsetDistance=20;assert.equal(store.record('offset',tool),true);assert.deepEqual(store.entry('spline'),before.entries.spline);
});

test('spline preview failure keeps restored parameters and live points editable while the saved preset remains independent',()=>{
  const tool=controllers().spline,store=createConstructionInputPresets();tool.tension=2;store.record('spline',tool);const saved=store.snapshot();tool.tension=0.5;
  const points=[{x:1,y:2},{x:5,y:9}];tool.points=points;tool.currentSpline={};tool.updateSpline=()=>{throw Error('preview failed');};
  assert.equal(store.restore('spline',tool),true);assert.equal(tool.tension,2);assert.equal(tool.points,points);assert.equal(tool.currentSpline,null);assert.equal(store.state.warning,true);assert.match(store.state.message,/preview failed/);
  assert.deepEqual(store.snapshot(),saved);let count=0;tool.updateSpline=()=>count++;assert.equal(store.restore('spline',tool),true);assert.equal(count,1);assert.equal(store.state.warning,false);
  store.remove('spline');assert.equal(tool.tension,2);assert.equal(tool.points,points);
});
