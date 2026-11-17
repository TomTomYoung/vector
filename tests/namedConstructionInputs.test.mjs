import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNamedConstructionInputs,createNamedConstructionInputs} from '../src/adapters/namedConstructionInputs.js';
import {createConstructionInputPresets} from '../src/adapters/constructionInputPresets.js';
const entry=(content='文字')=>({version:1,input:{point:{x:10,y:20},content}});
const item=(id='a',name='記録A',tool='text',value=entry())=>({id,tool,name,entry:value});
const data=(...entries)=>({version:1,entries});
const store=()=>{let id=0;return createNamedConstructionInputs({createId:()=> 'test-'+(++id)});};
const controller=content=>({exportInputPreset:()=>entry(content)});

test('named input records retain order, Unicode names, versions and independent copies across stores',()=>{
  const source=data(item('a','日本語 <>&'),item('b','もう一件'),item('c','日本語 <>&','future',{version:8,input:{next:[1,true,null]}}));
  assert.deepEqual(parseNamedConstructionInputs(JSON.stringify(source)),source);const copy=parseNamedConstructionInputs(source);copy.entries[0].entry.input.point.x=99;assert.equal(source.entries[0].entry.input.point.x,10);
  const a=store(),b=store();a.open(source);b.open(a.snapshot());a.remove('text','a');assert.equal(b.list('text').length,2);const external=b.entry('text','a');external.entry.input.content='mutated';assert.equal(b.entry('text','a').entry.input.content,'文字');assert.equal(b.selectedId('text'),'a');
});

test('known input validation and named schema rejection are atomic, including duplicate identities and invalid keys',()=>{
  const s=store();s.open(data(item()));s.choose('text','a');s.setNameDraft('text','編集中');const before=s.snapshot();
  const bad=[null,[],{},'{',{version:2,entries:[]},{version:1,entries:[],extra:1},data({...item(),extra:1}),data({...item(),id:'__proto__'}),data({...item(),tool:'constructor'}),data(item(),item('a','別名')),data(item(),item('b')),data(item('a','')),data(item('a',' a')),data(item('a','a\nb')),data(item('a','a'.repeat(101))),data(item('a','a','circle',{version:1,input:{points:[{x:0,y:0}]}})),data(item('a','a','text',{version:1,input:{point:{x:Infinity,y:0},content:'x'}})),data(item('a','a','future',{version:1,input:{function:()=>1}})),JSON.parse('{"version":1,"entries":[{"id":"a","tool":"future","name":"x","entry":{"version":2,"input":{"__proto__":{}}}}]}')];
  for(const value of bad){assert.throws(()=>s.open(value));assert.deepEqual(s.snapshot(),before);assert.equal(s.selectedId('text'),'a');assert.equal(s.nameDraft('text'),'編集中');}
});

test('named input collections enforce total record, depth, element and serialized size bounds',()=>{
  const max=data(...Array.from({length:256},(_,i)=>item('id'+i,'名前'+i)));assert.equal(parseNamedConstructionInputs(max).entries.length,256);assert.throws(()=>parseNamedConstructionInputs(data(...max.entries,item('last','last'))));
  let deep={};for(let i=0;i<14;i++)deep={next:deep};assert.throws(()=>parseNamedConstructionInputs(data(item('a','deep','future',{version:2,input:deep}))));
  const many=data(...Array.from({length:3},(_,i)=>item('id'+i,'n'+i,'future',{version:2,input:{values:Array(17000).fill(0)}})));assert.throws(()=>parseNamedConstructionInputs(many));
  const huge=data(item('a','huge','future',{version:2,input:{value:'x'.repeat(2000000)}}));assert.throws(()=>parseNamedConstructionInputs(huge));assert.throws(()=>parseNamedConstructionInputs(JSON.stringify(huge)));
  assert.equal(parseNamedConstructionInputs(data(item('a','x'.repeat(100)))).entries[0].name.length,100);
});

test('add, rename, duplicate, update and removal target stable IDs while tool namespaces and current drafts remain separate',()=>{
  const s=store();assert.equal(s.record('text','  A  ',controller('first')),true);const a=s.selectedId('text');assert.equal(s.entry('text',a).name,'A');
  s.record('text','B',controller('second'));const b=s.selectedId('text');s.add('circle','A',{version:1,input:{points:[]}});const circle=s.selectedId('circle');
  assert.equal(s.rename('text',a,'renamed'),true);assert.equal(s.entry('text',a).entry.input.content,'first');assert.equal(s.duplicate('text',a,'copy'),true);const copy=s.selectedId('text');assert.notEqual(copy,a);
  s.update('text',a,controller('updated'));assert.equal(s.entry('text',a).entry.input.content,'updated');assert.equal(s.entry('text',copy).entry.input.content,'first');assert.equal(s.entry('text',b).entry.input.content,'second');
  const before=s.snapshot();assert.equal(s.remove('circle',a),false);assert.deepEqual(s.snapshot(),before);assert.equal(s.choose('text',circle),false);
  s.choose('text',a);s.remove('text',a);assert.equal(s.selectedId('text'),b);s.remove('text',b);s.remove('text',copy);s.remove('circle',circle);assert.equal(s.snapshot(),undefined);
});

test('invalid creation, collisions, failed exporters and stale operations retain every record and the current selection',()=>{
  const s=store();s.record('text','A',controller('first'));const a=s.selectedId('text'),before=s.snapshot();
  for(const run of [()=>s.record('text','A',controller('other')),()=>s.rename('text',a,' '),()=>s.record('text','x'.repeat(101),controller('other')),()=>s.update('text','stale',controller('other')),()=>s.update('text',a,{exportInputPreset:()=>{throw Error('failed exporter');}}),()=>s.record('text','B',{exportInputPreset:()=>({version:1,input:{point:null,content:42}})}),()=>s.duplicate('text','stale','B')]){assert.equal(run(),false);assert.deepEqual(s.snapshot(),before);assert.equal(s.selectedId('text'),a);assert.equal(s.state.warning,true);}
  const sameId=createNamedConstructionInputs({createId:()=> 'fixed'});sameId.record('text','A',controller('one'));const first=sameId.snapshot();assert.equal(sameId.record('text','B',controller('two')),false);assert.deepEqual(sameId.snapshot(),first);
});

test('spline numeric-only and full-draft exports coexist and restore through their explicit input versions',()=>{
  const s=store(),numeric={version:1,input:{tension:2}},draft={version:2,input:{points:[{x:1,y:2}],tension:3}};let points=[{x:8,y:9}],tension=0;
  const c={inputPresetVersions:[1,2],exportInputPreset:()=>numeric,exportInputDraftPreset:()=>draft,inputPresetModeForEntry:e=>e.version===1?'parameters':'draft',restoreInputPreset:e=>{tension=e.input.tension;if(e.version===2)points=e.input.points;}};
  s.record('spline','数値',c);const a=s.selectedId('spline');s.record('spline','下書き',c,{draft:true});const b=s.selectedId('spline');
  const identity=points;assert.equal(s.restore('spline',a,c),true);assert.equal(points,identity);assert.equal(tension,2);assert.match(s.state.message,/数値設定/);
  assert.equal(s.restore('spline',b,c),true);assert.deepEqual(points,draft.input.points);points[0].x=99;assert.equal(s.entry('spline',b).entry.input.points[0].x,1);assert.equal(tension,3);
  s.update('spline',a,c,{draft:true});assert.equal(s.entry('spline',a).entry.version,2);assert.equal(s.entry('spline',b).name,'下書き');
});

test('unknown tools and future versions stay inert through selection, rename, copy and failed restoration',()=>{
  const s=store(),source=data(item('a','future','text',{version:4,input:{later:true}}),item('b','plugin','pluginTool',{version:7,input:{raw:'value'}}));s.open(source);let calls=0;
  const c={inputPresetVersion:1,restoreInputPreset:()=>calls++};s.choose('text','a');assert.equal(calls,0);assert.equal(s.restore('text','a',c),false);assert.equal(calls,0);s.rename('text','a','renamed');s.duplicate('text','a','copy');assert.equal(s.list('text')[1].entry.version,4);
  assert.equal(s.restore('pluginTool','b',{inputPresetVersion:7,restoreInputPreset:e=>{calls++;e.input.raw='changed';}}),true);assert.equal(calls,1);assert.equal(s.entry('pluginTool','b').entry.input.raw,'value');
  const before=s.snapshot();assert.equal(s.restore('pluginTool','b',{inputPresetVersion:7,restoreInputPreset:()=>{throw Error('inactive');}}),false);assert.deepEqual(s.snapshot(),before);
  assert.equal(s.restore('pluginTool','b',{inputPresetVersion:7,implementationError:'preview failed',restoreInputPreset(){}}),true);assert.equal(s.state.warning,true);assert.deepEqual(s.snapshot(),before);
});

test('copying legacy records leaves the original store intact and opening a new document resets only transient choices',()=>{
  const legacy=createConstructionInputPresets(),s=store();legacy.record('text',controller('original'));const original=legacy.snapshot();s.add('text','copied',legacy.entry('text'));const id=s.selectedId('text');
  s.update('text',id,controller('new'));assert.deepEqual(legacy.snapshot(),original);legacy.remove('text');assert.equal(s.entry('text',id).entry.input.content,'new');
  s.record('text','second',controller('second'));s.setNameDraft('text','未保存名');const saved=s.snapshot();s.open(saved);assert.equal(s.selectedId('text'),id);assert.equal(s.nameDraft('text'),'copied');
  s.open(undefined);assert.equal(s.snapshot(),undefined);assert.equal(s.selectedId('text'),undefined);assert.equal(s.nameDraft('text'),'');
});
