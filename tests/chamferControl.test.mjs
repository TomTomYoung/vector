import test from 'node:test';
import assert from 'node:assert/strict';
import {chamfer} from '../src/model/construction.js';
import {applyToPoint,composeAffine} from '../src/model/affine.js';
import {chamferDistanceControls,chamferControlFrame,moveChamferDistance} from '../src/adapters/chamferControlGeometry.js';
const input={first:[{x:0,y:0},{x:100,y:0}],second:[{x:0,y:0},{x:0,y:100}],distance1:10,distance2:20};
const identity={a:1,b:0,c:0,d:1,e:0,f:0},zero={x:0,y:0};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('chamfer controls match both contacts for acute, obtuse, reversed, swapped and extended sides',()=>{
  for(const angle of [0.2,0.7,Math.PI/2,2.4,3.0])for(const reverse of [false,true])for(const swap of [false,true]){
    let first=[{x:30,y:-20},{x:130,y:-20}],second=[{x:30,y:-20},{x:30+100*Math.cos(angle),y:-20+100*Math.sin(angle)}];
    if(reverse){first.reverse();second.reverse();}if(swap)[first,second]=[second,first];
    const i={first,second,distance1:7,distance2:140},result=chamfer(i),control=chamferDistanceControls(i,[result.bridge.start,result.bridge.end]);
    [result.bridge.start,result.bridge.end].forEach((p,j)=>{near(control.handles[j].x,p.x);near(control.handles[j].y,p.y);});
    for(const index of [0,1]){
      const target=chamferDistanceControls({...i,['distance'+(index+1)]:19}).handles[index];
      near(moveChamferDistance(chamferControlFrame(identity,identity),i,index,target,zero),19);
    }
  }
});

test('chamfer projection ignores normal displacement, preserves grab offset and changes only the requested distance',()=>{
  const frame=chamferControlFrame(identity,identity),before=JSON.stringify(input);
  near(moveChamferDistance(frame,input,0,{x:28,y:29},{x:-3,y:1}),25);
  near(moveChamferDistance(frame,input,1,{x:28,y:29},{x:-3,y:1}),30);
  assert.equal(JSON.stringify(input),before);
});

test('chamfer permits a zero setback, recovers from it and rejects two zero setbacks or a negative ray',()=>{
  const frame=chamferControlFrame(identity,identity);
  for(const index of [0,1]){
    near(moveChamferDistance(frame,input,index,zero,zero),0);
    const atZero={...input,['distance'+(index+1)]:0},control=chamferDistanceControls(atZero);
    assert.deepEqual(control.handles[index],zero);
    near(moveChamferDistance(frame,atZero,index,{x:15,y:15},zero),15);
    assert.throws(()=>moveChamferDistance(frame,atZero,1-index,zero,zero));
    assert.throws(()=>moveChamferDistance(frame,input,index,{x:-1,y:-1},zero));
  }
  near(moveChamferDistance(frame,input,0,{x:-Number.EPSILON,y:0},zero),0);
});

test('chamfer controls invert reflection, skew, unequal scaling and viewport transforms with fixed screen handles',()=>{
  const viewport={a:2,b:0,c:0,d:2,e:40,f:25},local={a:-0.8,b:0.3,c:0.2,d:1.4,e:300,f:50};
  const screen=composeAffine({first:local,then:viewport}),frame=chamferControlFrame(viewport,screen),pointer=applyToPoint({matrix:screen,point:{x:32,y:42}});
  near(moveChamferDistance(frame,input,0,pointer,{x:-2,y:0}),30);
  near(moveChamferDistance(frame,input,1,pointer,{x:0,y:-2}),40);
  for(const handle of chamferDistanceControls(input).handles){
    const marker=composeAffine({first:frame.handleMatrix(frame.toCanvas(handle)),then:viewport});
    near(marker.a,1);near(marker.b,0);near(marker.c,0);near(marker.d,1);
  }
});

test('chamfer grid and orthogonal snapping precede projection onto the selected local side',()=>{
  const frame=chamferControlFrame(identity,{a:1,b:1,c:-1,d:1,e:0,f:0}),anchor=frame.toCanvas(zero);
  const snap=p=>({x:Math.round(p.x/20)*20,y:Math.round(p.y/20)*20});
  near(moveChamferDistance(frame,input,0,{x:34,y:17},zero,{snap,anchor}),30);
  near(moveChamferDistance(frame,input,0,{x:34,y:17},zero,{snap,anchor,ortho:true}),20);
  near(moveChamferDistance(frame,input,1,{x:-34,y:17},zero,{snap,anchor}),30);
  near(moveChamferDistance(frame,input,1,{x:-34,y:17},zero,{snap,anchor,ortho:true}),20);
});

test('chamfer controls reject bad geometry, incompatible contacts, invalid indices and nonfinite coordinates',()=>{
  for(const i of [{...input,second:[{x:0,y:1},{x:100,y:1}]},{...input,distance1:Infinity},
    {first:[{x:1e15,y:1e15},{x:1e15+100,y:1e15}],second:[{x:1e15,y:1e15},{x:1e15,y:1e15+100}],distance1:1e-20,distance2:10}])assert.throws(()=>chamferDistanceControls(i));
  for(const contacts of [[],[{x:10,y:1},{x:0,y:20}],[{x:10,y:0},{x:1,y:20}]])assert.throws(()=>chamferDistanceControls(input,contacts),/一致しません/);
  const frame=chamferControlFrame(identity,identity);
  assert.throws(()=>moveChamferDistance(frame,input,2,zero,zero));
  assert.throws(()=>moveChamferDistance(frame,input,0,{x:Infinity,y:0},zero));
  assert.throws(()=>moveChamferDistance(frame,input,0,zero,zero,{snap:()=>({x:NaN,y:0})}));
  assert.throws(()=>chamferControlFrame(identity,{...identity,a:0}));
});
