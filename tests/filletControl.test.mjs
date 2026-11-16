import test from 'node:test';
import assert from 'node:assert/strict';
import {fillet} from '../src/model/construction.js';
import {applyToPoint,composeAffine} from '../src/model/affine.js';
import {filletRadiusControl,filletControlFrame,moveFilletRadius} from '../src/adapters/filletControlGeometry.js';
const input={first:[{x:0,y:0},{x:100,y:0}],second:[{x:0,y:0},{x:0,y:100}],radius:10};
const identity={a:1,b:0,c:0,d:1,e:0,f:0};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('fillet radius control matches first tangency for acute, obtuse, reversed and swapped sides',()=>{
  for(const angle of [0.2,0.7,Math.PI/2,2.4,3.0])for(const reverse of [false,true])for(const swap of [false,true]){
    let first=[{x:30,y:-20},{x:130,y:-20}],second=[{x:30,y:-20},{x:30+100*Math.cos(angle),y:-20+100*Math.sin(angle)}];
    if(reverse){first.reverse();second.reverse();}if(swap)[first,second]=[second,first];
    const i={first,second,radius:7},result=fillet(i),control=filletRadiusControl(i,result.bridge.start);
    near(control.handle.x,result.bridge.start.x);near(control.handle.y,result.bridge.start.y);
    const moved=filletRadiusControl({...i,radius:19}).handle;
    near(moveFilletRadius(filletControlFrame(identity,identity),i,moved,{x:0,y:0}),19);
  }
});

test('fillet radius comes from the corner and half-angle instead of distance to the previous moving center',()=>{
  const frame=filletControlFrame(identity,identity);
  near(moveFilletRadius(frame,input,{x:25,y:30},{x:0,y:0}),25);
  near(moveFilletRadius(frame,input,{x:28,y:29},{x:-3,y:1}),25);
  const oldCenter=fillet(input).bridge.center,newContact=fillet({...input,radius:25}).bridge.start;
  assert.ok(Math.abs(Math.hypot(newContact.x-oldCenter.x,newContact.y-oldCenter.y)-25)>1);
});

test('fillet radius inversion preserves local values through skew, reflection, unequal scaling and viewport transforms',()=>{
  const viewport={a:2,b:0,c:0,d:2,e:40,f:25},local={a:-0.8,b:0.3,c:0.2,d:1.4,e:300,f:50};
  const screen=composeAffine({first:local,then:viewport}),frame=filletControlFrame(viewport,screen),target={x:32,y:12};
  const pointer=applyToPoint({matrix:screen,point:target});near(moveFilletRadius(frame,input,pointer,{x:-2,y:0}),30);
  const point=frame.toCanvas(filletRadiusControl(input).handle),marker=composeAffine({first:frame.handleMatrix(point),then:viewport});
  near(marker.a,1);near(marker.b,0);near(marker.c,0);near(marker.d,1);
});

test('fillet grid and orthogonal snapping happen in drawing coordinates before first-side projection',()=>{
  const local={a:1,b:1,c:-1,d:1,e:0,f:0},frame=filletControlFrame(identity,local);
  const snap=p=>({x:Math.round(p.x/20)*20,y:Math.round(p.y/20)*20}),anchor=frame.toCanvas({x:0,y:0});
  near(moveFilletRadius(frame,input,{x:34,y:17},{x:0,y:0},{snap,anchor}),30);
  near(moveFilletRadius(frame,input,{x:34,y:17},{x:0,y:0},{snap,anchor,ortho:true}),20);
});

test('fillet radius controls reject degenerate, unrepresentable, nonpositive and incompatible input',()=>{
  for(const i of [{...input,radius:0},{...input,second:[{x:0,y:1},{x:100,y:1}]},{...input,radius:Infinity},
    {first:[{x:1e15,y:1e15},{x:1e15+100,y:1e15}],second:[{x:1e15,y:1e15},{x:1e15,y:1e15+100}],radius:1e-20}])assert.throws(()=>filletRadiusControl(i));
  assert.throws(()=>filletRadiusControl(input,{x:20,y:20}),/一致しません/);
  const frame=filletControlFrame(identity,identity);
  for(const p of [{x:0,y:5},{x:-10,y:5},{x:Infinity,y:0}])assert.throws(()=>moveFilletRadius(frame,input,p,{x:0,y:0}));
  assert.throws(()=>filletControlFrame(identity,{...identity,a:0}));
});
