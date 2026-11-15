import test from 'node:test';
import assert from 'node:assert/strict';
import {circleControlFrame,circleControlPoints,moveCircleControl} from '../src/adapters/circleControlGeometry.js';
import {composeAffine,applyToPoint,rotationMatrix,scaleMatrix,translationMatrix} from '../src/model/affine.js';
import {snapToGrid} from '../src/utils/coordinates.js';
const identity={a:1,b:0,c:0,d:1,e:0,f:0};
const compose=(a,b)=>composeAffine({first:a,then:b});
const apply=(matrix,point)=>applyToPoint({matrix,point});
const model={kind:'circle',center:{x:23,y:19},radius:30};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const nearPoint=(a,b)=>{near(a.x,b.x);near(a.y,b.y);};

test('circle center movement preserves radius and grab offset through reflection, unequal scale, rotation and zoom',()=>{
  const object=compose(compose(scaleMatrix({sx:-2,sy:0.3}),rotationMatrix({angle:0.7})),translationMatrix({dx:50,dy:-35}));
  for(const zoom of [0.1,1,7]){
    const canvas=compose(scaleMatrix({sx:zoom}),translationMatrix({dx:340,dy:120})),element=compose(object,canvas);
    const frame=circleControlFrame(canvas,element),moved=moveCircleControl(frame,model,'center',apply(element,{x:31,y:43}),{x:2,y:-1});
    nearPoint(moved.model.center,{x:33,y:42});assert.equal(moved.model.radius,30);
    const screenHandle=compose(frame.handleMatrix(frame.toCanvas(moved.model.center)),canvas);
    near(screenHandle.a,1);near(screenHandle.b,0);near(screenHandle.c,0);near(screenHandle.d,1);
  }
  assert.deepEqual(model,{kind:'circle',center:{x:23,y:19},radius:30});
});

test('circle radius is local distance, follows the dragged direction and keeps the center fixed',()=>{
  const matrix=compose(rotationMatrix({angle:0.4}),scaleMatrix({sx:-2,sy:4})),frame=circleControlFrame(identity,matrix);
  for(const [dx,dy] of [[30,40],[-30,40],[-30,-40],[30,-40]]){
    const point={x:model.center.x+dx,y:model.center.y+dy};
    const result=moveCircleControl(frame,model,'radius',apply(matrix,{x:point.x+2,y:point.y-1}),{x:-2,y:1});
    near(result.model.radius,50);assert.deepEqual(result.model.center,model.center);
    nearPoint(circleControlPoints(result.model,result.direction).radius,point);
  }
  nearPoint(circleControlPoints(model,{x:0,y:9}).radius,{x:23,y:49});
});

test('circle grid and orthogonal snapping use drawing coordinates and center as the radius anchor',()=>{
  const object=compose(rotationMatrix({angle:0.9}),translationMatrix({dx:50,dy:60}));
  const canvas=compose(scaleMatrix({sx:2}),translationMatrix({dx:200,dy:40})),frame=circleControlFrame(canvas,compose(object,canvas));
  const anchor=frame.toCanvas(model.center),options={snap:p=>snapToGrid(p,20),anchor,ortho:true};
  const moved=moveCircleControl(frame,model,'center',apply(canvas,{x:anchor.x+93,y:anchor.y+5}),{x:0,y:0},options);
  nearPoint(frame.toCanvas(moved.model.center),{x:Math.round((anchor.x+93)/20)*20,y:anchor.y});
  const radius=moveCircleControl(frame,model,'radius',apply(canvas,{x:anchor.x+2,y:anchor.y+84}),{x:0,y:0},options);
  const endpoint=frame.toLocal({x:anchor.x,y:Math.round((anchor.y+84)/20)*20});
  near(radius.model.radius,Math.hypot(endpoint.x-model.center.x,endpoint.y-model.center.y));
  nearPoint(circleControlPoints(radius.model,radius.direction).radius,endpoint);
});

test('circle handle computation rejects zero radius, precision collapse, singular transforms and invalid snapping',()=>{
  const frame=circleControlFrame(identity,identity);
  assert.throws(()=>moveCircleControl(frame,model,'radius',model.center,{x:0,y:0}),/半径/);
  assert.throws(()=>circleControlPoints({...model,radius:0}));
  assert.throws(()=>circleControlPoints({...model,center:{x:1e20,y:1e20},radius:1}),/精度/);
  assert.throws(()=>circleControlPoints(model,{x:0,y:0}));
  assert.throws(()=>circleControlFrame(identity,{...identity,a:0}));
  assert.throws(()=>moveCircleControl(frame,model,'center',{x:1,y:2},{x:0,y:0},{snap:()=>({x:Infinity,y:0})}));
  assert.throws(()=>moveCircleControl(frame,model,'center',{x:NaN,y:2},{x:0,y:0}));
  assert.throws(()=>moveCircleControl(frame,model,'unknown',{x:1,y:2},{x:0,y:0}));
});
