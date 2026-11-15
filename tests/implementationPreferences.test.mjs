import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {parseImplementationPreferences,createImplementationPreferences} from '../src/adapters/implementationPreferences.js';
const empty=()=>({version:1,calculation:{},rendering:{}});
function memory(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
const preferences=(host,storage,key='test',options={})=>createImplementationPreferences(host,{storage:()=>storage,key,...options});

test('host settings round trip actual selections and rendering limits into an independent host',()=>{
  const a=createEditorHost(),b=createEditorHost();
  a.selectImplementation('spline','centripetal');a.selectImplementation('convexHull','exact');
  a.selectRenderer('cubicBezier','adaptive',{tolerance:0.125,maxDepth:7});
  a.selectRenderer('nurbsCurve','default',{sampleCount:160,poleTolerance:1e-6,maxDepth:20,maxNodes:65536});
  const data=a.exportPreferences(),result=b.restorePreferences(JSON.stringify(data));
  assert.deepEqual(result.skipped,[]);assert.deepEqual(b.exportPreferences(),data);
  data.rendering.nurbsCurve.options.maxDepth=2;
  assert.equal(a.describeRendering('nurbsCurve').options.maxDepth,20);
  assert.equal(b.describeRendering('nurbsCurve').options.maxDepth,20);
  b.selectImplementation('spline','chordal');assert.equal(a.describe('spline').id,'centripetal');
});

test('render restoration replaces options so absent values cannot leak from the previous selection',()=>{
  const host=createEditorHost();host.selectRenderer('cubicBezier','adaptive',{maxDepth:0,tolerance:1e-4});
  host.restorePreferences({...empty(),rendering:{cubicBezier:{id:'sampled',options:{sampleCount:33}}}});
  assert.deepEqual(host.describeRendering('cubicBezier').options,{sampleCount:33});
  host.restorePreferences({...empty(),rendering:{cubicBezier:{id:'default',options:{}}}});
  assert.deepEqual(host.describeRendering('cubicBezier').options,{});
});

test('unavailable or invalid entries are reported while compatible entries restore without executing algorithms',()=>{
  let calls=0;
  const host=createEditorHost({implementations:{spline:[{id:'registered',label:'Test',algorithm:'Test',run:()=>{calls++;}}]}});
  const result=host.restorePreferences({version:1,calculation:{spline:'registered',convexHull:'missing',futureTool:'default'},
    rendering:{circle:{id:'cubic',options:{}},line:{id:'adaptive',options:{}},nurbsCurve:{id:'default',options:{maxDepth:25}}}});
  assert.equal(calls,0);assert.equal(result.applied.length,2);assert.equal(result.skipped.length,4);
  assert.equal(host.describe('spline').id,'registered');assert.equal(host.describe('convexHull').id,'default');
  assert.equal(host.describeRendering('circle').id,'cubic');assert.equal(host.describeRendering('line').id,'default');
});

test('malformed versions and unsafe or nonserializable data reject the entire restore before mutation',()=>{
  const host=createEditorHost(),before=host.exportPreferences();
  const bad=[{...empty(),version:2},{...empty(),calculation:{spline:'chordal'},rendering:{circle:{id:'cubic',options:[]}}},
    {...empty(),rendering:{circle:{id:'cubic',options:{bad:Infinity}}}},
    {...empty(),rendering:{circle:{id:'cubic',options:{bad:()=>1}}}},
    '{',JSON.stringify(empty()).replace('"calculation":{}','"calculation":{"__proto__":"default"}'),
    {...empty(),rendering:{circle:{id:'cubic',options:{bad:new Date()}}}},' '.repeat(256001)];
  for(const data of bad){assert.throws(()=>host.restorePreferences(data));assert.deepEqual(host.exportPreferences(),before);}
  let nested={};for(let i=0;i<14;i++)nested={child:nested};
  assert.throws(()=>parseImplementationPreferences({...empty(),rendering:{circle:{id:'cubic',options:nested}}}));
});

test('storage survives a new instance, respects startup configuration and isolates namespaces',()=>{
  const storage=memory(),a=createEditorHost();const first=preferences(a,storage);
  a.selectImplementation('spline','centripetal');a.selectRenderer('circle','cubic');assert.equal(first.save(),true);
  const b=createEditorHost({selection:{spline:'chordal'}}),second=preferences(b,storage,'test',{preserve:{calculation:['spline']}});
  second.load(true);assert.equal(b.describe('spline').id,'chordal');assert.equal(b.describeRendering('circle').id,'cubic');
  second.load();assert.equal(b.describe('spline').id,'centripetal');
  const c=createEditorHost();preferences(c,storage,'other').load();assert.equal(c.describeRendering('circle').id,'default');
  second.reset();assert.equal(b.describe('spline').id,'chordal');assert.equal(b.describeRendering('circle').id,'default');
  assert.equal(storage.getItem('test'),null);
});

test('blocked storage and corrupt saved JSON preserve a usable editor and report failures',()=>{
  const host=createEditorHost({selection:{spline:'chordal'}}),broken=()=>{throw Error('Storage blocked');};
  const p=createImplementationPreferences(host,{key:'blocked',storage:broken});
  assert.equal(p.load(true),null);assert.equal(host.describe('spline').id,'chordal');assert.ok(p.state.warning);
  host.selectImplementation('spline','uniform');assert.equal(p.save(),false);assert.equal(host.describe('spline').id,'uniform');
  assert.match(p.state.message,/再読込後には復元されません/);
  p.reset();assert.equal(host.describe('spline').id,'chordal');assert.match(p.state.message,/画面は初期設定へ戻しましたが/);
  host.selectImplementation('spline','uniform');
  const storage=memory(),q=preferences(host,storage);storage.setItem('test','{');
  assert.equal(q.load(),null);assert.equal(storage.getItem('test'),'{');assert.equal(host.describe('spline').id,'uniform');
});

test('JSON import saves only valid data, reports skipped entries, and reset clears exact initial rendering settings',()=>{
  const storage=memory(),host=createEditorHost(),p=preferences(host,storage);
  const data={...empty(),calculation:{spline:'centripetal',future:'new'},rendering:{nurbsCurve:{id:'default',options:{sampleCount:22,maxDepth:4}}}};
  const result=p.importText(JSON.stringify(data));assert.equal(result.skipped.length,1);assert.ok(p.state.warning);
  assert.equal(JSON.parse(storage.getItem('test')).calculation.spline,'centripetal');
  const text=p.exportText();assert.equal(p.importText('{'),null);assert.equal(p.exportText(),text);
  p.reset();assert.equal(host.describe('spline').id,'default');assert.deepEqual(host.describeRendering('nurbsCurve').options,{});
  assert.equal(storage.getItem('test'),null);
});

test('external render and execute functions are not serialized or invoked by preference restore',()=>{
  let calls=0;const host=createEditorHost({execute:()=>{calls++;},render:()=>{calls++;}});
  assert.deepEqual(host.exportPreferences(),empty());
  assert.equal(host.restorePreferences({...empty(),calculation:{circle:'default'}}).skipped.length,1);assert.equal(calls,0);
  const custom=createEditorHost({render:()=>{calls++;}});
  assert.deepEqual(custom.exportPreferences().rendering,{});
  assert.equal(custom.restorePreferences({...empty(),rendering:{circle:{id:'cubic',options:{}}}}).skipped.length,1);assert.equal(calls,0);
});
