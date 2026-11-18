import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {createImplementationPreferences} from '../src/adapters/implementationPreferences.js';
import {createDocumentImplementationPreset} from '../src/adapters/documentImplementationPreset.js';
import {createNamedImplementationPresets,parseNamedImplementationPresets} from '../src/adapters/namedImplementationPresets.js';
const empty=()=>({version:1,calculation:{},rendering:{}});
const collection=(preset=empty())=>({version:1,entries:[{id:'a',name:'標準',preset}]});
function store(host=createEditorHost()){let id=0;return createNamedImplementationPresets(host,{createId:()=> 'id-'+ ++id});}

test('named method snapshots carry all 124 selections independently of callers, hosts and other editors',()=>{
  const host=createEditorHost(),presets=store(host);host.selectImplementation('spline','centripetal');host.selectRenderer('nurbsCurve','default',{sampleCount:130,maxNodes:32000});
  assert.equal(presets.record('  精密  '),true);const saved=presets.entry();assert.equal(saved.name,'精密');assert.equal(Object.keys(saved.preset.calculation).length,124);assert.equal(Object.keys(saved.preset.rendering).length,124);
  saved.preset.rendering.nurbsCurve.options.sampleCount=2;host.selectImplementation('spline','chordal');assert.equal(presets.entry().preset.calculation.spline,'centripetal');assert.equal(presets.entry().preset.rendering.nurbsCurve.options.sampleCount,130);
  const other=store();other.open(presets.snapshot());presets.remove(saved.id);assert.equal(presets.snapshot(),undefined);assert.equal(other.entry().preset.calculation.spline,'centripetal');
  const original=collection();other.open(original);original.entries[0].name='changed';assert.equal(other.entry().name,'標準');other.list()[0].name='changed';assert.equal(other.entry().name,'標準');
});

test('named method edits keep stable IDs and order with independent duplicates and explicit full updates',()=>{
  const host=createEditorHost(),presets=store(host);presets.record('A');const a=presets.selectedId();host.selectImplementation('spline','uniform');presets.record('B');const b=presets.selectedId();
  assert.equal(presets.rename(b,' 日本語 '),true);assert.equal(presets.selectedId(),b);assert.equal(presets.nameDraft(),'日本語');
  assert.equal(presets.duplicate(b,'複製'),true);const c=presets.selectedId();assert.notEqual(b,c);assert.deepEqual(presets.list().map(e=>e.id),[a,b,c]);
  host.selectImplementation('spline','chordal');assert.equal(presets.update(c),true);assert.equal(presets.entry(c).name,'複製');assert.equal(presets.entry(b).preset.calculation.spline,'uniform');assert.equal(presets.entry(c).preset.calculation.spline,'chordal');
  presets.choose(a);assert.equal(host.describe('spline').id,'chordal');assert.equal(presets.remove(b),true);assert.deepEqual(presets.list().map(e=>e.id),[a,c]);presets.remove(a);assert.equal(presets.selectedId(),c);presets.remove(c);assert.equal(presets.snapshot(),undefined);
});

test('failed named method mutations preserve all data, selected ID, and active methods',()=>{
  const host=createEditorHost(),presets=store(host);presets.record('A');presets.record('B');const id=presets.selectedId(),before=presets.snapshot(),selected=host.exportPreferences();
  for(const name of ['', ' ', 'A', 'x'.repeat(101),'bad\nname','bad\u0000name',3]){
    assert.equal(presets.rename(id,name),false);assert.equal(presets.record(name),false);assert.deepEqual(presets.snapshot(),before);assert.equal(presets.selectedId(),id);
  }
  for(const action of [()=>presets.update('missing'),()=>presets.remove('missing'),()=>presets.duplicate('missing','C'),()=>presets.choose('missing')])assert.equal(action(),false);
  assert.equal(presets.apply('missing'),null);assert.deepEqual(host.exportPreferences(),selected);
  host.exportPreferences=()=>({...empty(),calculation:{spline:3}});assert.equal(presets.update(id),false);assert.equal(presets.record('invalid'),false);assert.deepEqual(presets.snapshot(),before);assert.equal(presets.selectedId(),id);
  const collision=createNamedImplementationPresets(host,{createId:()=>id});collision.open(before);assert.equal(collision.add('collision',empty()),false);assert.deepEqual(collision.snapshot(),before);
  host.exportPreferences=()=>{throw Error('failed exporter');};assert.equal(presets.update(id),false);assert.equal(presets.record('failed'),false);assert.deepEqual(presets.snapshot(),before);
});

test('named method parsing rejects malformed collections and entries before replacing any state',()=>{
  const presets=store();presets.record('A');presets.record('B');presets.setNameDraft('typing');const before=presets.snapshot(),chosen=presets.selectedId();
  const bad=[null,'{',{version:2,entries:[]},{version:1,entries:{}},{...collection(),extra:true},
    {version:1,entries:[{...collection().entries[0],id:'__proto__'}]},
    {version:1,entries:[{...collection().entries[0],name:' bad '}]},
    {version:1,entries:[{...collection().entries[0],name:'bad\tname'}]},
    {version:1,entries:[{...collection().entries[0],extra:1}]},
    {version:1,entries:[collection().entries[0],{...collection().entries[0],name:'B'}]},
    {version:1,entries:[collection().entries[0],{...collection().entries[0],id:'b'}]},
    collection({...empty(),version:2}),collection({...empty(),calculation:{spline:42}}),
    collection({...empty(),rendering:{circle:{id:'cubic',options:[]}}}),
    collection({...empty(),rendering:{circle:{id:'cubic',options:{bad:Infinity}}}}),
    collection({...empty(),rendering:{circle:{id:'cubic',options:{bad:()=>1}}}}),
    collection({...empty(),rendering:{circle:{id:'cubic',options:{bad:new Date()}}}}),
    collection(JSON.parse('{"version":1,"calculation":{"__proto__":"bad"},"rendering":{}}'))];
  let deep=1;for(let i=0;i<15;i++)deep={deep};bad.push(collection({...empty(),rendering:{circle:{id:'cubic',options:deep}}}));
  bad.push(collection({...empty(),rendering:{circle:{id:'cubic',options:{large:Array(20000).fill(0)}}}}));
  const circular=empty();circular.rendering.circle={id:'cubic',options:circular};bad.push(collection(circular));
  for(const value of bad){assert.throws(()=>presets.open(value));assert.deepEqual(presets.snapshot(),before);assert.equal(presets.selectedId(),chosen);assert.equal(presets.nameDraft(),'typing');}
});

test('named method collections enforce global record and size limits plus individual preference limits',()=>{
  const items=Array.from({length:256},(_,i)=>({id:'p'+i,name:'N'+i,preset:empty()}));assert.equal(parseNamedImplementationPresets({version:1,entries:items}).entries.length,256);
  assert.throws(()=>parseNamedImplementationPresets({version:1,entries:[...items,{id:'last',name:'last',preset:empty()}]}));
  const big={...empty(),rendering:{circle:{id:'future',options:{text:'x'.repeat(250000)}}}};
  assert.throws(()=>parseNamedImplementationPresets({version:1,entries:items.slice(0,8).map(e=>({...e,preset:big}))}));
  assert.throws(()=>parseNamedImplementationPresets(' '.repeat(2000001)));assert.throws(()=>parseNamedImplementationPresets(collection({...empty(),rendering:{circle:{id:'future',options:{text:'x'.repeat(256001)}}}})));
  const presets=store();presets.open({version:1,entries:items});assert.equal(presets.add('overflow',empty()),false);assert.equal(presets.list().length,256);
});

test('explicit named method application preserves unavailable IDs and applies compatible entries for later retry',()=>{
  let saves=0,executions=0;const host=createEditorHost({save:()=>saves++}),presets=store(host);host.selectImplementation('convexHull','exact');
  const saved=collection({version:1,calculation:{spline:'later',convexHull:'missing',futureTool:'custom'},rendering:{circle:{id:'cubic',options:{}},line:{id:'adaptive',options:{}},nurbsCurve:{id:'default',options:{maxDepth:25}}}});
  presets.open(saved);presets.choose('a');assert.equal(host.describe('spline').id,'default');assert.equal(presets.apply().applied.length,1);assert.equal(presets.apply().skipped.length,5);assert.equal(host.describe('convexHull').id,'exact');assert.equal(host.describeRendering('circle').id,'cubic');assert.match(presets.state.message,/futureTool\/custom/);assert.equal(presets.state.warning,true);assert.deepEqual(presets.snapshot(),saved);
  host.registerImplementation('spline',{id:'later',label:'Later',algorithm:'Explicit delegation',run:(input,ops,execute)=>{executions++;return execute('spline',input,{implementation:'centripetal'});}});
  assert.equal(presets.apply().applied.length,2);assert.equal(executions,0);assert.equal(saves,0);const points=[{x:0,y:0},{x:10,y:20},{x:90,y:5},{x:130,y:25}];
  assert.deepEqual(host.execute('spline',{points}),createEditorHost({selection:{spline:'centripetal'}}).execute('spline',{points}));assert.equal(executions,1);assert.deepEqual(presets.snapshot(),saved);
  presets.update('a');assert.equal(presets.entry().preset.calculation.futureTool,undefined);assert.equal(presets.entry().preset.calculation.spline,'later');
});

test('named method snapshots, legacy presets and browser defaults remain separate across apply and removal',()=>{
  const host=createEditorHost(),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const browser=createImplementationPreferences(host,{key:'browser',storage:()=>storage}),legacy=createDocumentImplementationPreset(host),presets=store(host);
  host.selectImplementation('spline','centripetal');legacy.record();presets.add('旧記録',legacy.snapshot());host.selectImplementation('spline','chordal');browser.save();const original=values.get('browser');legacy.record();presets.apply();assert.equal(host.describe('spline').id,'centripetal');assert.equal(values.get('browser'),original);assert.equal(legacy.snapshot().calculation.spline,'chordal');
  legacy.clear();assert.equal(presets.entry().preset.calculation.spline,'centripetal');presets.remove(presets.selectedId());assert.equal(host.describe('spline').id,'centripetal');browser.load();assert.equal(host.describe('spline').id,'chordal');assert.equal(presets.snapshot(),undefined);
});

test('unsupported hosts can edit inert names while opening documents resets only transient selection',()=>{
  const presets=store({});presets.open(collection());assert.equal(presets.canRecord,false);assert.equal(presets.canApply,false);assert.equal(presets.record('new'),false);assert.equal(presets.update('a'),false);assert.equal(presets.apply(),null);
  assert.equal(presets.rename('a','<b>文字列</b>'),true);assert.equal(presets.duplicate('a','コピー'),true);const chosen=presets.selectedId(),before=presets.snapshot();presets.setNameDraft('draft');presets.open(before);assert.equal(presets.selectedId(),'a');assert.notEqual(presets.selectedId(),chosen);assert.equal(presets.nameDraft(),'<b>文字列</b>');
  presets.open(undefined);assert.equal(presets.snapshot(),undefined);assert.equal(presets.selectedId(),undefined);assert.equal(presets.nameDraft(),'');assert.equal(parseNamedImplementationPresets(undefined),undefined);
});
