import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSelectionRegion,regionContains,segmentDistance,pointBoxDistance} from '../src/model/selectionRegion.js';
import {createSelectionPreferences,parseSelectionPreferences} from '../src/adapters/selectionPreferences.js';
const p=(x,y)=>({x,y});
test('rectangle regions work in both drag directions with inclusive edges',()=>{
  for(const [a,b] of [[p(10,20),p(40,50)],[p(40,50),p(10,20)]]){
    const region=makeSelectionRegion('rectangle',a,b);assert.equal(regionContains(region,p(10,30)),true);assert.equal(regionContains(region,p(20,30)),true);assert.equal(regionContains(region,p(9,30)),false);
  }
});
test('circles use start as center and fence distance is measured to the finite segment',()=>{
  const circle=makeSelectionRegion('circle',p(10,10),p(13,14));assert.equal(circle.radius,5);assert(regionContains(circle,p(5,10)));assert(!regionContains(circle,p(4,10)));
  const line=makeSelectionRegion('line',p(0,0),p(10,0));assert(regionContains(line,p(5,0)));assert(!regionContains(line,p(11,0)));assert.equal(segmentDistance(p(5,3),p(0,0),p(10,0)),3);
  assert.equal(segmentDistance(p(3,4),p(0,0),p(0,0)),5);
});
test('lasso even-odd crossings include edges and exclude concave notches and twice wound interiors',()=>{
  const points=[p(0,0),p(10,0),p(10,4),p(4,4),p(4,10),p(0,10)];
  const region=makeSelectionRegion('lasso',points[0],points.at(-1),points);assert(regionContains(region,p(2,8)));assert(!regionContains(region,p(8,8)));assert(regionContains(region,p(4,8)));
  assert(!regionContains(makeSelectionRegion('lasso',points[0],points.at(-1),[...points,...points]),p(2,8)));
});
test('pixel-box distance respects radius corners and boundaries',()=>{
  const b={x:10,y:10,width:2,height:2};assert.equal(pointBoxDistance(p(11,11),b),0);assert.equal(pointBoxDistance(p(7,6),b),5);assert.equal(pointBoxDistance(p(12,12),b),0);
});
test('selection preferences persist separately, validate input and return copies',()=>{
  const values=new Map(),storage=()=>({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)});
  const first=createSelectionPreferences({key:'test',storage});assert.deepEqual(first.value,{radius:6,shape:'rectangle',match:'contain'});first.set({radius:0,shape:'line',match:'touch'});
  assert.deepEqual(createSelectionPreferences({key:'test',storage}).value,first.value);const copy=first.value;copy.radius=9;assert.equal(first.value.radius,0);
  for(const radius of [NaN,Infinity,-1,101,'6'])assert.throws(()=>first.set({radius}));assert.equal(first.value.radius,0);
  assert.throws(()=>parseSelectionPreferences({version:2,radius:6,shape:'circle',match:'touch'}));assert.throws(()=>first.set({shape:'triangle'}));assert.throws(()=>first.set({match:'center'}));
});
test('blocked, corrupt and disabled selection storage preserve usable in-memory settings',()=>{
  const blocked=createSelectionPreferences({storage:()=>{throw Error('blocked');}});assert(blocked.state.warning);blocked.set({radius:8});assert.equal(blocked.value.radius,8);assert(blocked.state.warning);
  const corrupt=createSelectionPreferences({storage:()=>({getItem:()=>'{bad'})});assert(corrupt.state.warning);assert.equal(corrupt.value.radius,6);
  const disabled=createSelectionPreferences({enabled:false,storage:()=>{throw Error('must not access');}});disabled.set({shape:'lasso'});assert(!disabled.state.warning);assert.equal(disabled.value.shape,'lasso');
});
