import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseAnnotationDraft,parseConstructionInputPresets,createConstructionInputPresets} from '../src/adapters/constructionInputPresets.js';
import {dimension} from '../src/model/drawing.js';
import {renderDimension} from '../src/adapters/dimensionSvg.js';
import {createEditorHost} from '../src/adapters/editorHost.js';
const points=[{x:3,y:0},{x:0,y:0},{x:0,y:4}];
const dim=(dimensionType='angular',count=3)=>({version:1,input:{dimensionType,points:structuredClone(points.slice(0,count))}});
const text=(content=' 日本語 <>&"\n次行 ',point={x:12,y:34})=>({version:1,input:{point,content}});
const data=entries=>({version:1,entries});

test('annotation drafts preserve ordered dimension points, null text positions, raw strings and empty or boundary input',()=>{
  for(const type of ['linear','angular'])for(let n=0;n<=(type==='linear'?2:3);n++)assert.deepEqual(parseAnnotationDraft('dimension',dim(type,n)),dim(type,n));
  for(const value of ['', ' \n\t ', 'a'.repeat(20000),'日本語 <>&\n\u{1F680}'])for(const point of [null,points[0]])assert.deepEqual(parseAnnotationDraft('text',text(value,point)),text(value,point));
  const entry=dim(),copy=parseAnnotationDraft('dimension',entry);copy.input.points[0].x=100;assert.equal(entry.input.points[0].x,3);
  const original=text(),cloned=parseAnnotationDraft('text',original);cloned.input.point.x=99;assert.equal(original.input.point.x,12);
});

test('malformed annotation formats and failed records never replace existing metadata while future versions stay inert',()=>{
  const store=createConstructionInputPresets();store.open(data({dimension:dim(),text:text()}));const before=store.snapshot();
  const invalid=[['dimension',{points:[],dimensionType:'radial'}],['dimension',{points,dimensionType:'linear'}],['dimension',{points:[...points,points[0]],dimensionType:'angular'}],['dimension',{points:[{x:NaN,y:0}],dimensionType:'linear'}],['dimension',{points:[],dimensionType:'linear',extra:true}],['text',{content:'x'}],['text',{point:[],content:'x'}],['text',{point:{x:1,y:2,z:3},content:'x'}],['text',{point:{x:'1',y:2},content:'x'}],['text',{point:null,content:1}],['text',{point:null,content:'x'.repeat(20001)}],['text',{point:null,content:'x',extra:true}]];
  for(const [name,input] of invalid){const entry={version:1,input};assert.throws(()=>store.open(data({[name]:entry})));assert.deepEqual(store.snapshot(),before);assert.equal(store.record(name,{exportInputPreset:()=>entry}),false);assert.deepEqual(store.snapshot(),before);}
  const future=data({dimension:{version:2,input:{later:true}},text:{version:2,input:{later:true}}});store.open(future);
  for(const name of ['text','dimension']){assert.equal(store.restore(name,{inputPresetVersion:1,restoreInputPreset:()=>assert.fail()}),false);assert.throws(()=>parseAnnotationDraft(name,future.entries[name]));}
  assert.deepEqual(parseConstructionInputPresets(JSON.stringify(future)),future);assert.throws(()=>parseAnnotationDraft('unknown',text()));
});

function controllers(){
  const context={document:{getElementById:()=>null},window:{VectorUtils:{parseAnnotationDraft}},BaseTool:class{constructor(canvas,manager){this.canvas=canvas;this.toolManager=manager;this.isActive=true;}}};vm.createContext(context);
  for(const name of ['Text','Dimension'])vm.runInContext(readFileSync(new URL('../src/tools/'+name+'Tool.js',import.meta.url),'utf8'),context);
  return {text:new context.window.TextTool({},{}),dimension:new context.window.DimensionTool({},{})};
}

test('annotation controllers validate the whole input and active state before replacing a live draft',()=>{
  for(const [name,t] of Object.entries(controllers())){
    let clears=0,redraws=0;t.cancel=()=>clears++;t.redrawDraft=()=>redraws++;
    assert.throws(()=>t.restoreInputPreset({version:1,input:{}}));assert.equal(clears,0);
    const entry=name==='text'?text():dim();t.isActive=false;assert.throws(()=>t.restoreInputPreset(entry));assert.equal(clears,0);t.isActive=true;
    t.restoreInputPreset(entry);assert.equal(clears,1);assert.equal(redraws,1);
    if(name==='text'){entry.input.point.x=100;assert.equal(t.draftPoint.x,12);assert.equal(t.draftMode,true);}else{entry.input.points[0].x=100;assert.equal(t.points[0].x,3);assert.equal(t.dimensionType,'angular');}
  }
});

test('incomplete, degenerate and failing annotation commits retain their inputs and do not save',()=>{
  const tools=controllers();for(const t of Object.values(tools)){t.updatePanel=()=>{};t.saveState=()=>assert.fail('failed draft saved');}
  const d=tools.dimension;d.points=points.slice(0,1);d.dimensionType='linear';assert.equal(d.finishDimension(),null);assert.equal(d.points.length,1);
  d.dimensionType='angular';d.points=[points[1],points[1],points[2]];assert.equal(d.finishDimension(),null);assert.match(d.implementationError,/異なる位置/);assert.equal(d.points.length,3);
  d.points=structuredClone(points);d.run=()=>{throw Error('calculation failed');};d.finishDimension();assert.equal(d.implementationError,'calculation failed');assert.equal(d.points.length,3);
  const t=tools.text;t.draftContent='draft';t.finishText();assert.match(t.implementationError,/配置位置/);assert.equal(t.draftContent,'draft');
  t.draftPoint=points[0];t.draftContent=' \n ';t.finishText();assert.match(t.implementationError,/空白/);assert.equal(t.draftContent,' \n ');
  t.draftContent='draft';t.createTextElement=()=>{throw Error('render failed');};t.finishText();assert.equal(t.implementationError,'render failed');assert.equal(t.draftContent,'draft');assert.equal(t.draftPoint,points[0]);
});

class Element {
  constructor(tagName){this.tagName=tagName;this.attrs=new Map();this.children=[];}
  setAttribute(k,v){this.attrs.set(k,String(v));}getAttribute(k){return this.attrs.get(k)??null;}
  replaceChildren(...children){this.children=children;}
}
function withDOM(run){const old=globalThis.document;globalThis.document={createElementNS:(_,tag)=>new Element(tag)};try{run();}finally{globalThis.document=old;}}

test('standard dimension SVG retains linear labels, arrows and angular major arc layout and rejects invalid results before target mutation',()=>withDOM(()=>{
  const linear=renderDimension({mode:'linear',result:dimension({points:[{x:0,y:0},{x:30,y:40}]})});
  assert.equal(linear.children[0].getAttribute('x2'),'30');assert.equal(linear.children.filter(c=>c.tagName==='polygon').length,2);assert.equal(linear.children.at(-1).textContent,'50.0');assert.equal(linear.children.at(-1).getAttribute('y'),'15');
  const angular=renderDimension({mode:'angular',result:dimension({mode:'angular',points:[{x:1,y:0},{x:0,y:0},{x:0,y:-1}]})});assert.equal(angular.children.at(-1).textContent,'270.0°');assert.match(angular.children[0].getAttribute('d'),/A 30 30 0 1 1/);
  const before=linear.children;for(const descriptor of [{mode:'bad',result:{}},{mode:'linear',result:{start:points[0],end:points[1],middle:points[2],angle:NaN,length:4}},{mode:'angular',result:{vertex:points[1],startAngle:0,endAngle:1,turn:Infinity}},{mode:'angular',result:null}]){assert.throws(()=>renderDimension(descriptor,linear));assert.equal(linear.children,before);}
}));

test('dimension output uses the selected renderer and records the actual calculation and rendering implementations',()=>withDOM(()=>{
  const host=createEditorHost();host.registerImplementation('dimension',{id:'scaled-label',label:'Scaled label',algorithm:'Test doubled distance',run:input=>({...dimension(input),length:100})});host.selectImplementation('dimension','scaled-label');
  const result=host.execute('dimension',{points:points.slice(0,2)}),shape={kind:'dimension',mode:'linear',result};
  assert.equal(host.render(shape,null,{toolName:'dimension'}).children.at(-1).textContent,'100.0');
  let seen;host.registerRenderer({id:'label-only',label:'Label',algorithm:'Test label only',supports:n=>n==='dimension',prepare:value=>{seen=value;return{kind:'text',point:value.result.middle,content:'custom '+value.result.length};}});host.selectRenderer('dimension','label-only');
  const output=host.render(shape,null,{toolName:'dimension'}),record=JSON.parse(output.getAttribute('data-vector-implementation'));
  assert.equal(seen,shape);assert.equal(output.tagName,'text');assert.equal(output.textContent,'custom 100');assert.equal(record.calculation.id,'scaled-label');assert.equal(record.rendering.id,'label-only');
}));
