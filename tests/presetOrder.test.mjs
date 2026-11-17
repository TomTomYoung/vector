import test from 'node:test';
import assert from 'node:assert/strict';
import {movePreset,sortPresets,filterPresets} from '../src/adapters/presetOrder.js';
import {createNamedConstructionInputs} from '../src/adapters/namedConstructionInputs.js';
import {createNamedImplementationPresets} from '../src/adapters/namedImplementationPresets.js';
import {createConstructionSets} from '../src/adapters/constructionSets.js';
const entries=()=>[{id:'a',tool:'circle',name:'円10'},{id:'x',tool:'line',name:'線'},{id:'b',tool:'circle',name:'円2'},{id:'c',tool:'circle',name:'円1'}];

test('moving scoped records preserves other tool positions, IDs and values and refuses invalid moves',()=>{
 const data=entries(),values=structuredClone(data);assert.equal(movePreset(data,'c',-1,'circle'),true);assert.deepEqual(data.map(e=>e.id),['a','x','c','b']);assert.deepEqual(data[1],values[1]);assert.equal(movePreset(data,'a',-1,'circle'),false);assert.throws(()=>movePreset(data,'missing',1,'circle'));assert.throws(()=>movePreset(data,'a',0,'circle'));assert.deepEqual(data.map(e=>e.id),['a','x','c','b']);
});

test('Japanese numeric name sorting stays stable, scopes to one tool and preserves equal-name order',()=>{
 const data=entries();assert.equal(sortPresets(data,'circle'),true);assert.deepEqual(data.map(e=>e.id),['c','x','b','a']);assert.equal(sortPresets(data,'circle'),false);const same=[{id:'a',name:'A'},{id:'b',name:'A'},{id:'c',name:'A2'}];sortPresets(same);assert.deepEqual(same.map(e=>e.id),['a','b','c']);
});

test('record search matches normalized names and IDs with multiple terms without changing order or values',()=>{
 const data=[{id:'id-ALPHA',name:'ＡＢＣ 円１０'},{id:'id-beta',name:'ABC 円2'},{id:'id-gamma',name:'かな'}],before=structuredClone(data);assert.deepEqual(filterPresets(data,'abc 円10').map(e=>e.id),['id-ALPHA']);assert.deepEqual(filterPresets(data,'ID-beta').map(e=>e.id),['id-beta']);assert.deepEqual(filterPresets(data,'かな'),[data[2]]);assert.deepEqual(filterPresets(data,'absent'),[]);assert.deepEqual(filterPresets(data,' '),data);assert.deepEqual(data,before);
});

test('all three stores persist order changes without changing selected IDs, payloads or typed names',()=>{
 const input={version:1,input:{points:[]}},methods={version:1,calculation:{},rendering:{}};
 for(const kind of ['inputs','methods','sets']){
  let id=0;const options={createId:()=> 'r'+ ++id},store=kind==='inputs'?createNamedConstructionInputs(options):kind==='methods'?createNamedImplementationPresets({},options):createConstructionSets({},options);
  for(const name of ['円10','円2','円1']){if(kind==='methods')store.add(name,methods);else if(kind==='inputs')store.add('circle',name,input);else store.add('circle',name,input,methods);}
  const scope=kind==='methods'?[]:['circle'],selected=store.selectedId(...scope),payload=store.entry(...scope);store.setNameDraft(...scope,'編集中');assert.equal(store.move(...scope,selected,-1),true);assert.equal(store.selectedId(...scope),selected);assert.equal(store.nameDraft(...scope),'編集中');assert.deepEqual(store.entry(...scope),payload);assert.equal(store.sort(...scope),true);assert.deepEqual(store.list(...scope).map(e=>e.name),['円1','円2','円10']);assert.equal(store.move(...scope,'missing',1),false);
  const saved=store.snapshot();store.open(saved);assert.deepEqual(store.snapshot(),saved);assert.equal(store.selectedId(...scope),selected);store.move(...scope,selected,1);assert.equal(store.selectedId(...scope),selected);
 }
});
