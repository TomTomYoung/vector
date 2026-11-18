import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import * as presets from '../src/adapters/constructionInputPresets.js';
import * as references from '../src/adapters/draftReference.js';
import {createNamedConstructionInputs} from '../src/adapters/namedConstructionInputs.js';

const attr='data-vector-boundary-draft-id';
const svg='http://www.w3.org/2000/svg';
const first={id:randomUUID(),tag:'line'}, second={id:randomUUID(),tag:'path'};
const record=(name,mode,edges,version=2)=>({version:1,entries:{[name]:{version,input:{mode,edges}}}});
const parse=presets.parseConstructionInputPresets;

test('boundary drafts validate ordered typed IDs, empty selection and the tool-specific confirmed phase',()=>{
  for(const name of ['trim','extend']){
    for(const value of [record(name,'select',[]),record(name,'select',[second,first]),record(name,name,[first])])assert.deepEqual(parse(value),value);
    for(const [mode,edges] of [[name,[]],['ready',[first]],['select',[first,first]],['select',[{...first,tag:'rect'}]],['select',[{...first,id:'bad'}]],['select',[{...first,extra:1}]],['select',null]])assert.throws(()=>parse(record(name,mode,edges)));
    for(const version of [1,3]){
      const opaque=record(name,'unknown',{},version);
      assert.deepEqual(parse(opaque),opaque);
    }
  }
});

function fixture(name){
  const shapes=['line','path','polyline'].map(localName=>{
    const attrs=new Map();
    return {localName,namespaceURI:svg,getAttribute:k=>attrs.get(k)??null,setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
  });
  let scans=0;
  const canvas={contains:el=>shapes.includes(el),querySelectorAll(){scans++;return shapes.filter(el=>el.getAttribute(attr)!==null);}};
  const VectorUtils={...references,...presets,linearEditing:{outline:el=>el.invalid?null:{points:[{x:0,y:0},{x:30,y:40}]}}};
  const context=vm.createContext({window:{VectorUtils},BaseTool:class{
    constructor(){this.canvas=canvas;this.svgNS=svg;this.isActive=true;this.selectTool={canSelect:el=>!el.locked};}
  }});
  const className=name==='trim'?'TrimTool':'ExtendTool';
  for(const file of ['BoundaryEditTool',className])vm.runInContext(readFileSync(new URL('../src/tools/'+file+'.js',import.meta.url),'utf8'),context);
  return {tool:new context.window[className](canvas,{}),shapes,scans:()=>scans};
}

test('multiple boundaries acquire IDs only on successful save and reuse the IDs in both stores',()=>{
  const {tool,shapes:[a,b],scans}=fixture('trim');
  const named=createNamedConstructionInputs(),single=presets.createConstructionInputPresets();
  tool.addBoundaryEdge(b);tool.addBoundaryEdge(a);
  assert.equal(named.record('trim','',tool),false);
  assert.equal(a.getAttribute(attr),null);assert.equal(b.getAttribute(attr),null);
  assert.equal(single.record('trim',tool),true);assert.equal(scans(),2);
  assert.deepEqual(single.entry('trim').input.edges,[{id:b.getAttribute(attr),tag:'path'},{id:a.getAttribute(attr),tag:'line'}]);
  assert.equal(named.record('trim','境界',tool),true);
  assert.deepEqual(named.entry('trim').entry,single.entry('trim'));
});

test('one invalid boundary aborts the entire selection and preserves live unrecorded highlights for retry',()=>{
  const {tool,shapes}=fixture('extend'),[a,b,live]=shapes;
  tool.replaceBoundaries([a,b],'extend');
  const saved=tool.prepareInputPreset();saved.commit();tool.replaceBoundaries([live],'select');
  for(const change of [
    ()=>{shapes.splice(1,1);return ()=>shapes.splice(1,0,b);},
    ()=>{b.locked=true;return ()=>b.locked=false;},
    ()=>{b.invalid=true;return ()=>b.invalid=false;},
    ()=>{b.localName='line';return ()=>b.localName='path';},
    ()=>{live.setAttribute(attr,b.getAttribute(attr));return ()=>live.removeAttribute(attr);},
  ]){
    const undo=change();assert.throws(()=>tool.restoreInputPreset(saved.entry));undo();
    assert.equal(tool.mode,'select');assert.equal(tool.boundaryEdges[0],live);
    assert.equal(live.getAttribute('data-vector-highlight'),'extend');assert.equal(a.getAttribute('data-vector-highlight'),null);
  }
  const rollback=tool.captureInputRollback();tool.restoreInputPreset(saved.entry);
  assert.equal(tool.mode,'extend');assert.equal(tool.boundaryEdges[1],b);
  rollback();assert.equal(tool.boundaryEdges[0],live);assert.equal(live.getAttribute(attr),null);
});

test('boundary references use the same original for both tools and reject ID collisions before recording',()=>{
  const {tool,shapes:[a,b]}=fixture('trim');
  const single=presets.createConstructionInputPresets();
  a.setAttribute(attr,first.id);b.setAttribute(attr,first.id);tool.addBoundaryEdge(a);
  assert.equal(single.record('trim',tool),false);assert.equal(single.entry('trim'),undefined);
  b.removeAttribute(attr);assert.equal(single.record('trim',tool),true);
  const other=fixture('extend').tool;
  other.canvas=tool.canvas;other.addBoundaryEdge(a);assert.equal(single.record('extend',other),true);
  assert.deepEqual(single.entry('trim').input.edges,single.entry('extend').input.edges);
});
