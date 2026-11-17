import test from 'node:test';
import assert from 'node:assert/strict';
import {presetImportRecords,planPresetImport,commitPresetImport} from '../src/adapters/presetImport.js';
import {createNamedConstructionInputs} from '../src/adapters/namedConstructionInputs.js';
import {createNamedImplementationPresets} from '../src/adapters/namedImplementationPresets.js';
import {createConstructionSets} from '../src/adapters/constructionSets.js';
const input=()=>({version:1,input:{points:[{x:0,y:0},{x:20,y:20}]}});
const methods=()=>({version:1,calculation:{circle:'default'},rendering:{circle:{id:'cubic',options:{}}}});
const source=()=>({implementationPreset:methods(),constructionInputs:{version:1,entries:{circle:input()}},namedConstructionInputs:{version:1,entries:[{id:'i',tool:'circle',name:'円',entry:input()}]},namedImplementationPresets:{version:1,entries:[{id:'m',name:'方式',preset:methods()}]},constructionSets:{version:1,entries:[{id:'s',tool:'circle',name:'円セット',input:input(),methods:methods()}]}});
const stores=()=>({inputs:createNamedConstructionInputs(),methods:createNamedImplementationPresets({}),sets:createConstructionSets({})});
const current=s=>Object.fromEntries(Object.entries(s).map(([k,v])=>[k,v.snapshot()]));
const all=rows=>rows.map(r=>({key:r.key,name:r.name}));
function ids(){let i=0;return {createId:()=> 'new-'+ ++i};}

test('import enumerates five existing formats with deep copies and converts legacy records into named candidates',()=>{
 const data=source(),rows=presetImportRecords(data);assert.equal(rows.length,5);assert.deepEqual(rows.map(r=>r.kind),['methods','inputs','methods','inputs','sets']);assert.equal(new Set(rows.map(r=>r.key)).size,5);
 data.constructionInputs.entries.circle.input.points[0].x=100;assert.equal(rows[1].payload.entry.input.points[0].x,0);assert.equal(presetImportRecords({}).length,0);
 for(const data of [null,[],{constructionSets:{version:2,entries:[]}},{namedConstructionInputs:{version:1,entries:[{id:'a',tool:'circle',name:'x',entry:{version:1,input:{points:42}}}]}}])assert.throws(()=>presetImportRecords(data));
});

test('selective import creates fresh IDs and collision suffixes without modifying sources or existing records',()=>{
 const rows=presetImportRecords(source()),destination=stores();destination.inputs.add('circle','円',input());destination.methods.add('方式',methods());const before=current(destination),original=structuredClone(rows);
 const plan=planPresetImport(rows,[{key:rows[3].key,name:' 円 '},{key:rows[2].key,name:'方式'},{key:rows[4].key,name:'円セット'}],before,ids());assert.deepEqual(plan.added.map(e=>e.name),['円 (2)','方式 (2)','円セット']);assert.deepEqual(current(destination),before);assert.deepEqual(rows,original);assert.ok(plan.added.every(e=>e.id.startsWith('new-')));
 commitPresetImport(plan,destination);assert.equal(destination.inputs.list('circle').length,2);assert.deepEqual(destination.inputs.entry('circle',before.inputs.entries[0].id),before.inputs.entries[0]);assert.equal(destination.methods.list().length,2);assert.equal(destination.sets.list('circle').length,1);
});

test('import commit preserves live selection and name drafts in all stores and rolls back a failed destination',()=>{
 const destination=stores();destination.inputs.add('circle','現入力',input());destination.methods.add('現方式',methods());destination.sets.add('circle','現セット',input(),methods());destination.inputs.setNameDraft('circle','入力中');destination.methods.setNameDraft('方式入力中');destination.sets.setNameDraft('circle','セット入力中');const before=current(destination),selected=[destination.inputs.selectedId('circle'),destination.methods.selectedId(),destination.sets.selectedId('circle')],rows=presetImportRecords(source());
 const plan=planPresetImport(rows,all(rows),before,ids());commitPresetImport(plan,destination);assert.deepEqual([destination.inputs.selectedId('circle'),destination.methods.selectedId(),destination.sets.selectedId('circle')],selected);assert.equal(destination.inputs.nameDraft('circle'),'入力中');assert.equal(destination.methods.nameDraft(),'方式入力中');assert.equal(destination.sets.nameDraft('circle'),'セット入力中');
 const after=current(destination),failurePlan=planPresetImport(rows,all(rows),current(destination),ids()),replace=destination.sets.replaceRecords;let fail=true;destination.sets.replaceRecords=value=>{if(fail){fail=false;throw Error('failed store');}replace(value);};assert.throws(()=>commitPresetImport(failurePlan,destination),/failed store/);assert.deepEqual(current(destination),after);
});

test('invalid selections and resulting bounds reject the entire plan without mutating current data',()=>{
 const destination=stores(),rows=presetImportRecords(source());destination.inputs.add('circle','keep',input());const before=current(destination);
 for(const selected of [[],[{key:'missing',name:'x'}],[{key:rows[0].key,name:' ' }],[{key:rows[0].key,name:'x'.repeat(101)}],[{key:rows[0].key,name:'x'},{key:rows[0].key,name:'y'}]]){assert.throws(()=>planPresetImport(rows,selected,before,ids()));assert.deepEqual(current(destination),before);}
 const full={version:1,entries:Array.from({length:256},(_,i)=>({id:'p'+i,tool:'circle',name:'N'+i,entry:input()}))};assert.throws(()=>planPresetImport(rows,all(rows),{...before,inputs:full},ids()));assert.equal(full.entries.length,256);
 const collision=()=>before.inputs.entries[0].id;assert.throws(()=>planPresetImport(rows,[{key:rows[3].key,name:'new'}],before,{createId:collision}),/ID/);
});

test('unknown tools, input versions and implementation IDs remain inert and preserve values through import',()=>{
 const data=source();data.namedConstructionInputs.entries[0]={id:'future',tool:'plugin',name:'未知',entry:{version:73,input:{future:'kept'}}};data.namedImplementationPresets.entries[0].preset.calculation.plugin='later';const rows=presetImportRecords(data),plan=planPresetImport(rows,all(rows),{},ids()),destination=stores();commitPresetImport(plan,destination);
 assert.deepEqual(destination.inputs.list('plugin')[0].entry,{version:73,input:{future:'kept'}});assert.equal(destination.methods.list().find(e=>e.name==='方式').preset.calculation.plugin,'later');assert.deepEqual(plan.next.inputs.entries.find(e=>e.tool==='plugin').entry,data.namedConstructionInputs.entries[0].entry);
});

test('long names remain within limits when repeated imports allocate suffixes and new independent data',()=>{
 const rows=presetImportRecords(source()),name='あ'.repeat(100),destination=stores();destination.inputs.add('circle',name,input());const options=ids();const choice=[{key:rows[3].key,name}];const first=planPresetImport(rows,choice,current(destination),options);commitPresetImport(first,destination);const second=planPresetImport(rows,choice,current(destination),options);commitPresetImport(second,destination);const entries=destination.inputs.list('circle');assert.deepEqual(entries.map(e=>e.name.length),[100,100,100]);assert.ok(entries[1].name.endsWith(' (2)')&&entries[2].name.endsWith(' (3)'));entries[2].entry.input.points[0].x=99;assert.equal(destination.inputs.list('circle')[2].entry.input.points[0].x,0);
});
