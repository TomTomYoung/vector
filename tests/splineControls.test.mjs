import test from 'node:test';
import assert from 'node:assert/strict';
import {splineControlFrame,moveSplineControl,splineMatrixText} from '../src/adapters/splineControlGeometry.js';
import {composeAffine,applyToPoint,rotationMatrix,scaleMatrix,translationMatrix} from '../src/model/affine.js';
import {snapToGrid} from '../src/utils/coordinates.js';
const compose=(a,b)=>composeAffine({first:a,then:b});
const apply=(matrix,point)=>applyToPoint({matrix,point});
const identity={a:1,b:0,c:0,d:1,e:0,f:0};
function near(a,b){assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);}
function pointNear(a,b){near(a.x,b.x);near(a.y,b.y);}

test('control coordinates invert nested rotation, reflection, nonuniform scaling and viewport transforms',()=>{
  const object=compose(compose(scaleMatrix({sx:-2,sy:0.4}),rotationMatrix({angle:0.7})),translationMatrix({dx:50,dy:-35}));
  for(const zoom of [0.1,1,7]) {
    const canvas=compose(scaleMatrix({sx:zoom,sy:zoom*1.2}),translationMatrix({dx:340,dy:120}));
    const element=compose(object,canvas),frame=splineControlFrame(canvas,element);
    for(const p of [{x:0,y:0},{x:100,y:-40},{x:-70,y:200}]){
      pointNear(frame.toCanvas(p),apply(object,p));
      pointNear(frame.fromScreen(apply(element,p)),p);
      pointNear(frame.toLocal(frame.toCanvas(p)),p);
      const handleScreen=compose(frame.handleMatrix(frame.toCanvas(p)),canvas);
      near(handleScreen.a,1);near(handleScreen.b,0);near(handleScreen.c,0);near(handleScreen.d,1);
      pointNear(apply(handleScreen,{x:0,y:0}),apply(element,p));
    }
  }
});

test('drag preserves the grab offset instead of jumping to the pointer center',()=>{
  const matrix=compose(rotationMatrix({angle:0.4}),scaleMatrix({sx:2,sy:3}));
  const frame=splineControlFrame(identity,matrix),point={x:12,y:30},pointerLocal={x:10,y:31},offset={x:2,y:-1};
  pointNear(moveSplineControl(frame,apply(matrix,pointerLocal),offset),point);
  pointNear(moveSplineControl(frame,apply(matrix,{x:20,y:11}),offset),{x:22,y:10});
});

test('grid and orthogonal constraints use drawing coordinates before converting back to the spline',()=>{
  const object=compose(rotationMatrix({angle:0.9}),translationMatrix({dx:50,dy:60}));
  const canvas=compose(scaleMatrix({sx:2}),translationMatrix({dx:200,dy:40}));
  const frame=splineControlFrame(canvas,compose(object,canvas));
  const options={snap:p=>snapToGrid(p,20),anchor:{x:23,y:19},ortho:true};
  const moved=moveSplineControl(frame,apply(canvas,{x:85,y:30}),{x:0,y:0},options);
  pointNear(frame.toCanvas(moved),{x:80,y:19});
  const vertical=moveSplineControl(frame,apply(canvas,{x:25,y:91}),{x:0,y:0},options);
  pointNear(frame.toCanvas(vertical),{x:23,y:100});
});

test('singular transforms and nonfinite pointer or snapping output are rejected',()=>{
  for(const bad of [null,{...identity,a:0},{...identity,f:Infinity}]) {
    assert.throws(()=>splineControlFrame(bad,identity));assert.throws(()=>splineControlFrame(identity,bad));
  }
  const frame=splineControlFrame(identity,identity);
  assert.throws(()=>moveSplineControl(frame,{x:NaN,y:1},{x:0,y:0}));
  assert.throws(()=>moveSplineControl(frame,{x:1,y:1},{x:0,y:0},{snap:()=>({x:Infinity,y:0})}));
  assert.equal(splineMatrixText({...identity,e:1.2345678901234567}),'matrix(1 0 0 1 1.2345678901234567 0)');
});
