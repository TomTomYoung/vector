import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditorHost} from '../src/adapters/editorHost.js';
import {createConstructionSets,parseConstructionSets} from '../src/adapters/constructionSets.js';
import {createImplementationPreferences} from '../src/adapters/implementationPreferences.js';
import {createNamedConstructionInputs} from '../src/adapters/namedConstructionInputs.js';
import {createNamedImplementationPresets} from '../src/adapters/namedImplementationPresets.js';
const methods=()=>({version:1,calculation:{spline:'centripetal'},rendering:{circle:{id:'cubic',options:{}}}});
const input=()=>({version:1,input:{points:[{x:20,y:30},{x:50,y:60}]}});
const collection=()=>({version:1,entries:[{id:'a',tool:'circle',name:'円',input:input(),methods:methods()}]});
function store(host=createEditorHost()){let id=0;return createConstructionSets(host,{createId:()=> 's'+ ++id});}
function controller(value=input()){
  return {isActive:true,inputPresetVersion:1,value:structuredClone(value),exports:0,restores:0,
    exportInputPreset(){this.exports++;return structuredClone(this.value);},
    restoreInputPreset(next){this.restores++;this.value=structuredClone(next);},
  };
}

test('atomic preference restoration checks every method before invoking input, while ordinary restoration remains partial',()=>{
  let calls=0;const host=createEditorHost(),before=host.exportPreferences(),saved=methods();saved.calculation.spline='missing';
  const result=host.restorePreferencesAtomically(saved,()=>calls++);assert.equal(result.skipped.length,1);assert.equal(result.applied.length,0);assert.equal(calls,0);assert.deepEqual(host.exportPreferences(),before);
  assert.equal(host.restorePreferences(saved).applied.length,1);assert.equal(host.describeRendering('circle').id,'cubic');
  assert.equal(host.restorePreferencesAtomically(methods(),()=>{calls++;assert.equal(host.describe('spline').id,'centripetal');}).applied.length,2);assert.equal(calls,1);
  assert.throws(()=>host.restorePreferencesAtomically(methods(),null));
  const external=createEditorHost({render:()=>{throw Error('must not render');}});assert.equal(external.restorePreferencesAtomically(methods(),()=>calls++).skipped.length,1);assert.equal(calls,1);
});

test('atomic preference restoration rolls back all selections and renderer options when the input callback throws',()=>{
  let saves=0;const host=createEditorHost({save:()=>saves++});host.selectImplementation('spline','chordal');host.selectRenderer('circle','sampled',{sampleCount:123});const before=host.exportPreferences();
  assert.throws(()=>host.restorePreferencesAtomically(methods(),()=>{assert.equal(host.describeRendering('circle').id,'cubic');throw Error('controller failed');}),/controller failed/);assert.deepEqual(host.exportPreferences(),before);assert.equal(saves,0);
});

test('construction sets snapshot current input and all 122 methods with independent copies across editors',()=>{
  const host=createEditorHost(),sets=store(host),tool=controller();host.selectImplementation('spline','centripetal');assert.equal(sets.record('circle','  円セット  ',tool),true);const id=sets.selectedId('circle'),saved=sets.entry('circle');assert.equal(saved.name,'円セット');assert.equal(Object.keys(saved.methods.calculation).length,122);assert.equal(Object.keys(saved.methods.rendering).length,122);
  tool.value.input.points[0].x=999;saved.input.input.points[0].x=111;saved.methods.calculation.spline='uniform';host.selectImplementation('spline','chordal');assert.equal(sets.entry('circle').input.input.points[0].x,20);assert.equal(sets.entry('circle').methods.calculation.spline,'centripetal');
  const other=store();other.open(sets.snapshot());sets.remove('circle',id);assert.equal(other.entry('circle').id,id);assert.equal(sets.snapshot(),undefined);
});

test('construction set edits keep IDs, pair copies, per-tool names and order independent',()=>{
  const host=createEditorHost(),sets=store(host),tool=controller();sets.record('circle','A',tool);const a=sets.selectedId('circle');sets.add('line','A',input(),methods());assert.equal(sets.duplicate('circle',a,'B'),true);const b=sets.selectedId('circle');assert.notEqual(a,b);assert.equal(sets.rename('circle',b,'改名B'),true);
  tool.value.input.points[0].x=81;host.selectImplementation('spline','uniform');assert.equal(sets.update('circle',b,tool),true);assert.equal(sets.entry('circle',b).input.input.points[0].x,81);assert.equal(sets.entry('circle',b).methods.calculation.spline,'uniform');assert.equal(sets.entry('circle',a).input.input.points[0].x,20);assert.equal(sets.entry('circle',a).methods.calculation.spline,'default');assert.equal(sets.entry('circle',b).name,'改名B');
  sets.choose('circle',a);assert.equal(tool.restores,0);assert.equal(host.describe('spline').id,'uniform');sets.remove('circle',a);assert.equal(sets.selectedId('circle'),b);assert.equal(sets.list('line').length,1);sets.setNameDraft('circle','typing');const data=sets.snapshot();sets.open(data);assert.equal(sets.nameDraft('circle'),'改名B');
});

test('invalid construction set schemas, names, inputs and bounded payloads reject before replacing any state',()=>{
  const sets=store();sets.open(collection());const before=sets.snapshot();sets.setNameDraft('circle','typing');const item=collection().entries[0];
  const invalid=[null,'{',{version:2,entries:[]},{version:1,entries:[] ,extra:true},{version:1,entries:[item,item]},
    {version:1,entries:[item,{...item,id:'b'}]},...['',' bad ','x'.repeat(101),'bad\nname'].map(name=>({version:1,entries:[{...item,name}]})),
    {version:1,entries:[{...item,id:'__proto__'}]},{version:1,entries:[{...item,tool:'constructor'}]},
    {version:1,entries:[{...item,input:{version:1,input:{points:[{x:Infinity,y:1}]}}}]},
    {version:1,entries:[{...item,methods:{...methods(),version:2}}]},
    {version:1,entries:[{...item,methods:{...methods(),rendering:{circle:{id:'cubic',options:{bad:()=>1}}}}}]},
    {version:1,entries:[{...item,methods:{...methods(),rendering:{circle:{id:'cubic',options:{bad:'x'.repeat(256001)}}}}}]},
    {version:1,entries:Array.from({length:257},(_,i)=>({...item,id:'p'+i,name:'N'+i}))},' '.repeat(2000001)];
  const large={version:1,calculation:{},rendering:{circle:{id:'future',options:{text:'x'.repeat(250000)}}}};invalid.push({version:1,entries:Array.from({length:8},(_,i)=>({...item,id:'p'+i,name:'N'+i,methods:large}))});
  for(const value of invalid){assert.throws(()=>sets.open(value));assert.deepEqual(sets.snapshot(),before);assert.equal(sets.selectedId('circle'),'a');assert.equal(sets.nameDraft('circle'),'typing');}
  const future={...item,input:{version:88,input:{future:1}},methods:{...methods(),calculation:{futureTool:'future'}}};const parsed=parseConstructionSets({version:1,entries:[future]});assert.deepEqual(parsed.entries[0],future);assert.equal(parseConstructionSets(undefined),undefined);
});

test('failed construction set mutations preserve the pair, current selection and active settings',()=>{
  const host=createEditorHost(),sets=store(host),tool=controller();sets.record('circle','A',tool);sets.record('circle','B',tool);const id=sets.selectedId('circle'),before=sets.snapshot(),active=host.exportPreferences();
  for(const name of ['A',' ','x'.repeat(101),'bad\tname']){assert.equal(sets.rename('circle',id,name),false);assert.equal(sets.record('circle',name,tool),false);assert.deepEqual(sets.snapshot(),before);assert.equal(sets.selectedId('circle'),id);}
  for(const op of [()=>sets.update('circle','missing',tool),()=>sets.remove('circle','missing'),()=>sets.duplicate('circle','missing','new'),()=>sets.choose('circle','missing')])assert.equal(op(),false);
  host.exportPreferences=()=>{throw Error('export failed');};tool.value.input.points[0].x=88;assert.equal(sets.update('circle',id,tool),false);assert.deepEqual(sets.snapshot(),before);assert.deepEqual(createEditorHost().exportPreferences(),active);
  const collision=createConstructionSets(host,{createId:()=>id});collision.open(before);assert.equal(collision.add('circle','new',input(),methods()),false);assert.deepEqual(collision.snapshot(),before);
});

test('set restoration applies methods before input, preserves numeric-only spline points and restores full drafts when requested',()=>{
  const host=createEditorHost(),sets=store(host);const tool={isActive:true,inputPresetVersions:[1,2],inputPresetModeForEntry:e=>e.version===1?'parameters':'draft',points:[{x:1,y:2},{x:3,y:4}],tension:1,
    exportInputPreset(){return {version:1,input:{tension:this.tension}};},exportInputDraftPreset(){return {version:2,input:{points:structuredClone(this.points),tension:this.tension}};},
    restoreInputPreset(entry){assert.equal(host.describe('spline').id,'centripetal');this.tension=entry.input.tension;if(entry.version===2)this.points=entry.input.points;},
  };
  host.selectImplementation('spline','centripetal');sets.record('spline','数値',tool);const numeric=sets.selectedId('spline');sets.record('spline','下書き',tool,{draft:true});const draft=sets.selectedId('spline');tool.points=[{x:9,y:9}];tool.tension=4;host.selectImplementation('spline','chordal');
  assert.equal(sets.restore('spline',numeric,tool),true);assert.equal(tool.tension,1);assert.deepEqual(tool.points,[{x:9,y:9}]);assert.equal(sets.restore('spline',draft,tool),true);assert.deepEqual(tool.points,[{x:1,y:2},{x:3,y:4}]);
});

test('unavailable set methods leave all methods and input unchanged and become usable after registration',()=>{
  const host=createEditorHost(),sets=store(host),tool=controller();const saved=collection();saved.entries[0].methods.calculation.spline='later';sets.open(saved);const before=host.exportPreferences();assert.equal(sets.restore('circle','a',tool),false);assert.equal(tool.restores,0);assert.deepEqual(host.exportPreferences(),before);assert.deepEqual(sets.snapshot(),saved);assert.match(sets.state.message,/spline\/later/);
  let calls=0;host.registerImplementation('spline',{id:'later',label:'Later',algorithm:'Test delegation',run:(input,ops,execute)=>{calls++;return execute('spline',input,{implementation:'uniform'});}});assert.equal(sets.restore('circle','a',tool),true);assert.equal(tool.restores,1);assert.equal(calls,0);assert.equal(host.describeRendering('circle').id,'cubic');host.execute('spline',{points:[{x:0,y:0},{x:20,y:60},{x:90,y:10}]});assert.equal(calls,1);assert.deepEqual(sets.snapshot(),saved);
});

test('throwing set input restoration rolls back input under the old methods; preview errors retain restored inputs for retry',()=>{
  const host=createEditorHost(),sets=store(host),tool=controller();sets.open(collection());tool.value.input.points[0].x=99;const before=structuredClone(tool.value),active=host.exportPreferences();let fail=true;
  tool.restoreInputPreset=function(entry){this.value=structuredClone(entry);if(fail){fail=false;assert.equal(host.describe('spline').id,'centripetal');throw Error('restore failure');}assert.deepEqual(host.exportPreferences(),active);};
  assert.equal(sets.restore('circle','a',tool),false);assert.deepEqual(tool.value,before);assert.deepEqual(host.exportPreferences(),active);assert.match(sets.state.message,/restore failure/);
  tool.restoreInputPreset=function(entry){this.value=structuredClone(entry);this.implementationError='preview failed';};assert.equal(sets.restore('circle','a',tool),true);assert.equal(host.describe('spline').id,'centripetal');assert.equal(tool.value.input.points[0].x,20);assert.equal(sets.state.warning,true);assert.match(sets.state.message,/preview failed/);
  tool.isActive=false;assert.equal(sets.restore('circle','a',tool),false);tool.isActive=true;tool.inputPresetVersion=2;assert.equal(sets.restore('circle','a',tool),false);
  const unsupported=store({});unsupported.open(collection());assert.equal(unsupported.canRestore,false);assert.equal(unsupported.canRecord,false);assert.equal(unsupported.restore('circle','a',tool),false);assert.equal(unsupported.rename('circle','a','記録保持'),true);
});

test('combining named records makes independent value copies and set restoration never writes browser defaults or source presets',()=>{
  const host=createEditorHost(),values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const browser=createImplementationPreferences(host,{key:'sets',storage:()=>storage}),inputs=createNamedConstructionInputs({createId:()=> 'input'}),preferences=createNamedImplementationPresets(host,{createId:()=> 'methods'}),sets=store(host),tool=controller();
  inputs.add('circle','元入力',input());host.selectImplementation('spline','centripetal');preferences.record('元方式');sets.add('circle','組',inputs.entry('circle').entry,preferences.entry().preset);inputs.remove('circle','input');preferences.remove('methods');host.selectImplementation('spline','chordal');browser.save();const saved=values.get('sets');sets.restore('circle',sets.selectedId('circle'),tool);assert.equal(host.describe('spline').id,'centripetal');assert.equal(values.get('sets'),saved);assert.equal(inputs.snapshot(),undefined);assert.equal(preferences.snapshot(),undefined);assert.equal(sets.list('circle').length,1);
});
