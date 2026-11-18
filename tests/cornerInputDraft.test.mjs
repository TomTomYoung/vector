import test from 'node:test';
import assert from 'node:assert/strict';
import {prepare,restore,captureRollback} from '../src/adapters/cornerInputDraft.js';
import {createConstructionInputPresets,parseConstructionInputPresets} from '../src/adapters/constructionInputPresets.js';
import {createNamedConstructionInputs} from '../src/adapters/namedConstructionInputs.js';
import {createConstructionSets} from '../src/adapters/constructionSets.js';

const attribute='data-vector-corner-draft-id';
function line(){
  const attrs=new Map();
  return {localName:'line',namespaceURI:'http://www.w3.org/2000/svg',getAttribute:key=>attrs.get(key)??null,
    setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)};
}
function fixture(name='fillet'){
  const a=line(),b=line(),elements=[a,b];
  const tool={radius:12,distance1:0,distance2:23,isActive:true,selectedLines:[a],inputPresetVersions:[1,2],
    canvas:{contains:el=>elements.includes(el),querySelectorAll:()=>elements.filter(el=>el.getAttribute(attribute)!==null)},
    selectTool:{canSelect:el=>!el.locked},prepareInputDraftPreset:()=>prepare(name,tool),
    restoreInputPreset:entry=>restore(name,tool,entry),captureInputRollback:()=>captureRollback(name,tool)};
  return {a,b,tool,elements};
}
test('first-line references are written only when the receiving record succeeds',()=>{
  const {a,tool}=fixture(),named=createNamedConstructionInputs(),sets=createConstructionSets({exportPreferences:()=>({invalid:true})});
  assert.equal(named.record('fillet','',tool,{draft:true}),false);
  assert.equal(sets.record('fillet','set',tool,{draft:true}),false);
  assert.equal(named.update('fillet','missing',tool,{draft:true}),false);
  assert.equal(a.getAttribute(attribute),null);
  assert.equal(named.record('fillet','round',tool,{draft:true}),true);
  const id=a.getAttribute(attribute);
  assert.ok(id);assert.equal(named.entry('fillet').entry.input.firstLine,id);
  const legacy=createConstructionInputPresets();assert.equal(legacy.record('fillet',tool,{draft:true}),true);
  assert.equal(legacy.entry('fillet').input.firstLine,id);
});
test('restoration validates the entire reference and every parameter before replacing the current draft',()=>{
  for(const name of ['fillet','chamfer']){
    const {a,b,elements,tool}=fixture(name),saved=prepare(name,tool);saved.commit();
    tool.selectedLines=[b];tool.radius=30;tool.distance1=4;b.setAttribute('data-vector-highlight',name);
    for(const problem of ['duplicate','removed','locked','foreign','wrong type','inactive']){
      if(problem==='duplicate')b.setAttribute(attribute,saved.entry.input.firstLine);
      if(problem==='removed')elements.shift();
      if(problem==='locked')a.locked=true;
      if(problem==='foreign')a.namespaceURI='';
      if(problem==='wrong type')a.localName='path';
      if(problem==='inactive')tool.isActive=false;
      assert.throws(()=>restore(name,tool,saved.entry));
      assert.equal(tool.selectedLines[0],b);assert.equal(b.getAttribute('data-vector-highlight'),name);
      assert.equal(tool.radius,30);assert.equal(tool.distance1,4);
      b.removeAttribute(attribute);if(!elements.includes(a))elements.unshift(a);
      a.locked=false;a.namespaceURI='http://www.w3.org/2000/svg';a.localName='line';tool.isActive=true;
    }
    restore(name,tool,saved.entry);assert.equal(tool.selectedLines[0],a);
    assert.equal(b.getAttribute('data-vector-highlight'),null);assert.equal(a.getAttribute('data-vector-highlight'),name);
    if(name==='fillet')assert.equal(tool.radius,12);else assert.equal(tool.distance1,0);
    restore(name,tool,{...saved.entry,input:{...saved.entry.input,firstLine:null}});
    assert.deepEqual(tool.selectedLines,[]);assert.equal(a.getAttribute('data-vector-highlight'),null);
  }
});
test('set rollback recovers a previous unsaved first line without assigning it an ID',()=>{
  const {a,b,tool}=fixture(),saved=prepare('fillet',tool);saved.commit();
  tool.selectedLines=[b];tool.radius=9;tool.implementationError='previous';
  const rollback=tool.captureInputRollback();restore('fillet',tool,saved.entry);rollback();
  assert.equal(tool.selectedLines[0],b);assert.equal(tool.radius,9);assert.equal(tool.implementationError,'previous');
  assert.equal(a.getAttribute('data-vector-highlight'),null);assert.equal(b.getAttribute(attribute),null);
});
test('corner draft schema accepts an empty selection and rejects invalid IDs, fields and dimensions',()=>{
  const parse=input=>parseConstructionInputPresets({version:1,entries:{chamfer:{version:2,input}}});
  const empty={distance1:0,distance2:1,firstLine:null};assert.deepEqual(parse(empty).entries.chamfer.input,empty);
  for(const input of [{distance1:0,distance2:2},{...empty,firstLine:'line-1'},{...empty,firstLine:{}},{...empty,distance2:Infinity},{...empty,points:[]}])assert.throws(()=>parse(input));
});
