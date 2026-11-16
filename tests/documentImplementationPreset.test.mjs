import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {createImplementationPreferences} from '../src/adapters/implementationPreferences.js';
import {createDocumentImplementationPreset,parseDocumentImplementationPreset} from '../src/adapters/documentImplementationPreset.js';
const empty=()=>({version:1,calculation:{},rendering:{}});

test('document presets snapshot all registered methods and rendering options without aliasing host or callers',()=>{
  const host=createEditorHost(),preset=createDocumentImplementationPreset(host);
  host.selectImplementation('spline','centripetal');host.selectRenderer('cubicBezier','adaptive',{tolerance:0.125,maxDepth:7});
  host.selectRenderer('nurbsCurve','default',{sampleCount:130,poleTolerance:1e-6,maxNodes:32000});
  assert.equal(preset.record(),true);const saved=preset.snapshot();
  assert.equal(Object.keys(saved.calculation).length,119);assert.equal(Object.keys(saved.rendering).length,119);
  host.selectImplementation('spline','chordal');saved.rendering.nurbsCurve.options.sampleCount=2;
  assert.equal(preset.snapshot().calculation.spline,'centripetal');assert.equal(preset.snapshot().rendering.nurbsCurve.options.sampleCount,130);
  const other=createDocumentImplementationPreset(createEditorHost());other.open(preset.snapshot());preset.clear();
  assert.equal(other.snapshot().calculation.spline,'centripetal');assert.equal(preset.snapshot(),undefined);
});

test('opening a preset is inert and explicit application uses the selected calculation without storage or history writes',()=>{
  let calls=0,saves=0;const host=createEditorHost({save:()=>saves++});
  host.registerImplementation('spline',{id:'document-test',label:'Test',algorithm:'Explicit delegation',run:(input,ops,execute)=>{calls++;return execute('spline',input,{implementation:'centripetal'});}});
  const preset=createDocumentImplementationPreset(host),data={...empty(),calculation:{spline:'document-test'},rendering:{circle:{id:'cubic',options:{}}}};
  preset.open(data);data.calculation.spline='default';assert.equal(host.describe('spline').id,'default');assert.equal(calls,0);
  const result=preset.apply();assert.equal(result.applied.length,2);assert.equal(result.skipped.length,0);assert.equal(calls,0);assert.equal(saves,0);
  const input={points:[{x:0,y:0},{x:5,y:30},{x:90,y:5},{x:130,y:25}]};
  assert.deepEqual(host.execute('spline',input),createEditorHost({selection:{spline:'centripetal'}}).execute('spline',input));assert.equal(calls,1);
  assert.equal(host.describeRendering('circle').id,'cubic');
});

test('unavailable tools and methods stay in the original preset for retry while compatible entries apply',()=>{
  const host=createEditorHost(),preset=createDocumentImplementationPreset(host);
  host.selectImplementation('convexHull','exact');
  preset.open({version:1,calculation:{spline:'later',convexHull:'missing',future:'unknown'},rendering:{circle:{id:'cubic',options:{}},line:{id:'adaptive',options:{}},nurbsCurve:{id:'default',options:{maxDepth:25}}}});
  const before=preset.snapshot(),result=preset.apply();assert.equal(result.applied.length,1);assert.equal(result.skipped.length,5);
  assert.equal(host.describe('convexHull').id,'exact');assert.deepEqual(preset.snapshot(),before);assert.ok(preset.state.warning);assert.match(preset.state.message,/future\/unknown/);
  host.registerImplementation('spline',{id:'later',label:'Later',algorithm:'Registered later',run:()=>42});
  assert.equal(preset.apply().applied.length,2);assert.equal(host.execute('spline',{}),42);assert.deepEqual(preset.snapshot(),before);
});

test('malformed presets reject before replacing saved data or active selections',()=>{
  const host=createEditorHost(),preset=createDocumentImplementationPreset(host);preset.record();const before=preset.snapshot(),selected=host.exportPreferences();
  for(const value of [null,'{',{...empty(),version:2},{...empty(),calculation:{spline:3}},
    {...empty(),rendering:{circle:{id:'cubic',options:[]}}}, {...empty(),rendering:{circle:{id:'cubic',options:{x:Infinity}}}},
    {...empty(),rendering:{circle:{id:'cubic',options:{x:()=>1}}}},
    '{"version":1,"calculation":{"__proto__":"bad"},"rendering":{}}',
    {...empty(),rendering:{circle:{id:'cubic',options:{x:'x'.repeat(256001)}}}}]){
    assert.throws(()=>preset.open(value));assert.deepEqual(preset.snapshot(),before);assert.deepEqual(host.exportPreferences(),selected);
  }
  assert.equal(parseDocumentImplementationPreset(undefined),undefined);
});

test('record failure retains loaded metadata and unsupported hosts can carry it without executing code',()=>{
  const host={},preset=createDocumentImplementationPreset(host);preset.open({...empty(),calculation:{spline:'centripetal'}});const before=preset.snapshot();
  assert.equal(preset.canRecord,false);assert.equal(preset.canApply,false);assert.equal(preset.record(),false);assert.equal(preset.apply(),null);assert.deepEqual(preset.snapshot(),before);
  host.exportPreferences=()=>({...empty(),rendering:{circle:{id:'cubic',options:{bad:NaN}}}});
  assert.equal(preset.record(),false);assert.deepEqual(preset.snapshot(),before);assert.ok(preset.state.warning);
});

test('document application, replacement and removal remain separate from browser defaults and current drawing methods',()=>{
  const host=createEditorHost(),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const browser=createImplementationPreferences(host,{key:'browser',storage:()=>storage}),preset=createDocumentImplementationPreset(host);
  host.selectImplementation('spline','chordal');browser.save();const saved=values.get('browser');
  preset.open({...empty(),calculation:{spline:'uniform'}});preset.apply();assert.equal(values.get('browser'),saved);
  preset.open({...empty(),calculation:{spline:'centripetal'}});assert.equal(host.describe('spline').id,'uniform');
  preset.clear();assert.equal(host.describe('spline').id,'uniform');assert.equal(preset.apply(),null);
  preset.open(undefined);assert.equal(host.describe('spline').id,'uniform');browser.load();assert.equal(host.describe('spline').id,'chordal');
  assert.equal(preset.snapshot(),undefined);assert.equal(values.get('browser'),saved);
});
