import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolset} from '../src/model/tools.js';
import {geometryExamples} from '../src/ui/geometryExamples.js';
import {createWorkbenchSession,parseWorkbenchSession,WORKBENCH_STORAGE_KEY,WORKBENCH_TEXT_LIMIT} from '../src/adapters/workbenchSession.js';
function memory(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};}
const session=(storage=memory(),options={})=>createWorkbenchSession({examples:geometryExamples,catalog:createToolset(),storage:()=>storage,...options});
const data=(entries={},activeTool='spline')=>({version:1,activeTool,entries});
const entry=(inputText='{',implementation='uniform')=>({inputText,implementation});

test('Workbench initializes all 120 operations and remembers per-operation drafts and choices without changing the catalog',()=>{
  const catalog=createToolset(),s=session(undefined,{catalog});assert.equal(Object.keys(JSON.parse(s.exportText()).entries).length,120);assert.equal(s.activeTool,'segmentContact');
  s.selectTool('spline');s.setInput('{ unfinished');s.setImplementation('chordal');s.selectTool('convexHull');s.setInput('');s.setImplementation('exact');s.selectTool('spline');
  assert.deepEqual(s.entry(),entry('{ unfinished','chordal'));assert.equal(catalog.describe('spline').id,'default');s.selectTool('convexHull');assert.deepEqual(s.entry(),entry('','exact'));
  const copy=s.entry();copy.inputText='changed';assert.equal(s.entry().inputText,'');assert.throws(()=>s.selectTool('missing'));assert.throws(()=>s.setImplementation('missing'));assert.equal(s.activeTool,'convexHull');
});

test('Workbench storage restores a fresh instance and isolates keys and editor preferences',()=>{
  const storage=memory();storage.setItem('vector-editor-preferences','untouched');const first=session(storage);first.selectTool('spline');first.setInput(' {\n"points": [');first.setImplementation('centripetal');assert.equal(first.save(),true);
  const second=session(storage);assert.ok(second.load());assert.equal(second.activeTool,'spline');assert.deepEqual(second.entry(),first.entry());assert.equal(second.exportText(),first.exportText());
  const other=session(storage,{key:'independent'});assert.equal(other.load(),null);assert.equal(other.activeTool,'segmentContact');assert.equal(storage.getItem('vector-editor-preferences'),'untouched');assert.ok(storage.getItem(WORKBENCH_STORAGE_KEY));
});

test('Workbench schema rejects invalid versions, fields, prototypes, names and size limits before any restore',()=>{
  const invalid=['{',' '.repeat(WORKBENCH_TEXT_LIMIT+1),{...data(),version:2},{...data(),entries:[]},{...data(),activeTool:'__proto__'},data({spline:{...entry(),inputText:{}}}),data({spline:{...entry(),run:()=>1}}),data({spline:new Date()}),{...data(),output:'stale'},data({spline:entry('x'.repeat(200001))})];
  for(const value of invalid)assert.throws(()=>parseWorkbenchSession(value));
  assert.throws(()=>parseWorkbenchSession('{"version":1,"activeTool":"spline","entries":{"__proto__":{"implementation":"default","inputText":"{}"}}}'));
  assert.throws(()=>parseWorkbenchSession(data(Object.fromEntries(Array.from({length:257},(_,i)=>['t'+i,entry()])))));
  assert.throws(()=>parseWorkbenchSession(data(Object.fromEntries(Array.from({length:11},(_,i)=>['t'+i,entry('x'.repeat(200000))])))));
  const valid=data({spline:entry('<script>never execute</script>')});const copy=parseWorkbenchSession(valid);copy.entries.spline.inputText='changed';assert.notEqual(copy.entries.spline.inputText,valid.entries.spline.inputText);
});

test('Workbench import merges supported operations and reports missing operations or implementations without discarding their current drafts',()=>{
  const s=session();s.selectTool('convexHull');s.setInput('hull draft');s.setImplementation('exact');const old=s.entry();
  const result=s.importText(JSON.stringify(data({spline:entry('spline draft'),convexHull:entry('discarded','missing'),future:entry('{}','new')},'future')));
  assert.deepEqual(result.applied,['spline']);assert.equal(result.skipped.length,3);assert.equal(s.activeTool,'convexHull');assert.deepEqual(s.entry(),old);assert.deepEqual(s.entry('spline'),entry('spline draft'));assert.ok(s.state.warning);assert.match(s.state.message,/未登録/);
});

test('Workbench malformed import and corrupt saved JSON preserve the entire in-memory session and stored text',()=>{
  const storage=memory(),s=session(storage);s.selectTool('spline');s.setInput('unfinished');s.setImplementation('chordal');s.save();const before=s.exportText(),saved=storage.getItem(s.key);
  const mixed=data({spline:entry('valid'),convexHull:{implementation:'exact',inputText:42}});assert.equal(s.importText(JSON.stringify(mixed)),null);assert.equal(s.exportText(),before);assert.equal(storage.getItem(s.key),saved);
  storage.setItem(s.key,'{');assert.equal(s.load(),null);assert.equal(s.exportText(),before);assert.equal(storage.getItem(s.key),'{');assert.ok(s.state.warning);
});

test('Workbench storage failures and disabled storage retain usable in-memory state and explicit status',()=>{
  const s=session(undefined,{storage:()=>{throw Error('blocked');}});assert.equal(s.load(),null);s.selectTool('spline');s.setInput('draft');assert.equal(s.save(),false);assert.equal(s.entry().inputText,'draft');assert.match(s.state.message,/再読込後/);assert.ok(s.importText(JSON.stringify(data({spline:entry('new draft')}))));assert.equal(s.entry().inputText,'new draft');assert.ok(s.state.warning);s.reset();assert.equal(s.activeTool,'segmentContact');assert.match(s.state.message,/削除できません/);
  let calls=0;const disabled=session(undefined,{enabled:false,storage:()=>{calls++;throw Error('must not read');}});disabled.load();disabled.setInput('draft');disabled.save();disabled.importText(JSON.stringify(data({spline:entry()})));disabled.reset();assert.equal(calls,0);assert.ok(disabled.exportText());
});

test('Workbench resets just the selected input independently of its method, then resets all operations and removes saved state',()=>{
  const storage=memory(),s=session(storage);s.selectTool('spline');s.setImplementation('uniform');s.setInput('draft');s.selectTool('convexHull');s.setImplementation('exact');s.setInput('another draft');s.selectTool('spline');s.resetInput();
  assert.equal(s.entry().inputText,JSON.stringify(geometryExamples.spline.input,null,2));assert.equal(s.entry().implementation,'uniform');assert.equal(s.entry('convexHull').inputText,'another draft');s.save();s.reset();assert.equal(storage.getItem(s.key),null);assert.equal(s.activeTool,'segmentContact');assert.equal(s.entry('spline').implementation,'default');assert.equal(s.entry('convexHull').inputText,JSON.stringify(geometryExamples.convexHull.input,null,2));
});

test('Workbench preserves oversized live drafts when saving fails and restores data without invoking calculations',()=>{
  const storage=memory(),s=session(storage);s.save();const saved=storage.getItem(s.key);s.setInput('x'.repeat(200001));assert.equal(s.save(),false);assert.equal(s.entry().inputText.length,200001);assert.equal(storage.getItem(s.key),saved);assert.throws(()=>s.exportText());s.resetInput();assert.equal(s.save(),true);
  let calls=0;const catalog={describe:()=>({id:'default'}),list:()=>[{id:'default'},{id:'external'}],select:()=>{calls++;throw Error('must not select');},execute:()=>{calls++;throw Error('must not run');}};
  const custom=createWorkbenchSession({examples:{test:{input:{}}},catalog,storage:()=>storage,key:'custom'});assert.ok(custom.importText(JSON.stringify(data({test:entry('import("remote")','external')},'test'))));assert.equal(calls,0);assert.equal(custom.entry().inputText,'import("remote")');
});
