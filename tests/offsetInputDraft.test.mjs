import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import * as presets from '../src/adapters/constructionInputPresets.js';
import * as references from '../src/adapters/draftReference.js';
import {createNamedConstructionInputs} from '../src/adapters/namedConstructionInputs.js';

const attribute='data-vector-offset-draft-id', svgNS='http://www.w3.org/2000/svg';
const id='5013fe5a-cea4-4cf4-8607-46f4a5e407c1';
const parse=input=>presets.parseConstructionInputPresets({version:1,entries:{offset:{version:3,input}}}).entries.offset;
const sourceText=readFileSync(new URL('../src/tools/OffsetTool.js',import.meta.url),'utf8');
function element(tag){
  const attrs=new Map();
  return {localName:tag,namespaceURI:svgNS,getAttribute:key=>attrs.get(key)??null,
    setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)};
}
function fixture(){
  const elements=[element('polyline'),element('circle')];
  const canvas={contains:e=>elements.includes(e),querySelectorAll:()=>elements.filter(e=>e.getAttribute(attribute)!==null)};
  const context={window:{VectorUtils:{...presets,...references}},BaseTool:class{
    constructor(canvas){this.canvas=canvas;this.svgNS=svgNS;this.isActive=true;this.selectTool={canSelect:e=>!e.locked};}
  }};
  vm.runInNewContext(sourceText,context);
  return {tool:new context.window.OffsetTool(canvas,{}),elements};
}

test('typed offset drafts accept four SVG shapes or an empty target and validate both dimensions',()=>{
  const base={offsetDistance:0.5,miterLimit:1000};
  for(const tag of ['line','polyline','rect','circle'])assert.equal(parse({...base,target:{id,tag}}).input.target.tag,tag);
  assert.equal(parse({...base,target:null}).input.target,null);
  for(const target of [{id,tag:'path'},{id,tag:'constructor'},{id:3,tag:'line'},{id:id+'\n',tag:'line'},{id,tag:'line',x:0},undefined])assert.throws(()=>parse({...base,target}));
  for(const input of [{...base,target:null,offsetDistance:0},{...base,target:null,miterLimit:1001}])assert.throws(()=>parse(input));
  const old={version:1,entries:{offset:{version:2,input:{future:'opaque'}}}};
  assert.deepEqual(presets.parseConstructionInputPresets(old),old);
});
test('failed named saves leave the shape unmarked, and successful records reuse their ID',()=>{
  const {tool,elements:[source]}=fixture(),named=createNamedConstructionInputs(),legacy=presets.createConstructionInputPresets();
  tool.setTarget(source);
  assert.equal(named.record('offset','',tool,{draft:true}),false);
  assert.equal(source.getAttribute(attribute),null);
  assert.equal(named.record('offset','平行線',tool,{draft:true}),true);
  assert.equal(legacy.record('offset',tool,{draft:true}),true);
  const stored=named.entry('offset').entry.input.target;
  assert.equal(source.getAttribute(attribute),stored.id);
  assert.deepEqual(legacy.entry('offset').input.target,stored);
});
test('failed resolution leaves the prior target and both settings intact even for another supported shape type',()=>{
  const {tool,elements}=fixture(),[source,other]=elements;
  tool.setTarget(source);const prepared=tool.prepareInputDraftPreset();prepared.commit();
  tool.setTarget(other);tool.offsetDistance=19;tool.miterLimit=7;
  const record=prepared.entry;
  for(const change of [
    ()=>{source.locked=true;return ()=>source.locked=false;},
    ()=>{elements.shift();return ()=>elements.unshift(source);},
    ()=>{source.localName='rect';return ()=>source.localName='polyline';},
    ()=>{other.setAttribute(attribute,record.input.target.id);return ()=>other.removeAttribute(attribute);},
    ()=>{tool.isActive=false;return ()=>tool.isActive=true;},
  ]){
    const undo=change();assert.throws(()=>tool.restoreInputPreset(record));undo();
    assert.equal(tool.selectedElement,other);assert.equal(other.getAttribute('data-vector-highlight'),'offset');
    assert.equal(tool.offsetDistance,19);assert.equal(tool.miterLimit,7);
  }
  tool.restoreInputPreset(record);assert.equal(tool.selectedElement,source);assert.equal(tool.offsetDistance,10);
});
test('empty drafts clear the selection, v1 restores settings alone and set rollback retains an unsaved target',()=>{
  const {tool,elements:[source,other]}=fixture(),empty=tool.prepareInputDraftPreset().entry;
  tool.setTarget(source);tool.offsetDistance=15;const saved=tool.prepareInputDraftPreset();saved.commit();
  tool.setTarget(other);tool.offsetDistance=7;tool.miterLimit=2;tool.implementationError='previous';
  const rollback=tool.captureInputRollback();tool.restoreInputPreset(saved.entry);rollback();
  assert.equal(tool.selectedElement,other);assert.equal(tool.offsetDistance,7);assert.equal(tool.miterLimit,2);assert.equal(tool.implementationError,'previous');
  assert.equal(other.getAttribute(attribute),null);assert.equal(source.getAttribute('data-vector-highlight'),null);
  tool.restoreInputPreset({version:1,input:{offsetDistance:10,miterLimit:5}});assert.equal(tool.selectedElement,other);
  tool.restoreInputPreset(empty);assert.equal(tool.selectedElement,null);assert.equal(other.getAttribute('data-vector-highlight'),null);
});
