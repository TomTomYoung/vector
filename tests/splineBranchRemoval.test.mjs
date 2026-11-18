import test from 'node:test';
import assert from 'node:assert/strict';
import {removeSplineKnot,validateSplineKnotRemoval} from '../src/model/splineKnotRemoval.js';
import {insertEditableSplineKnot} from '../src/adapters/splineRefinement.js';
import {removeEditableSplineKnot,validateEditableSplineKnotRemoval} from '../src/adapters/splineRemoval.js';
import {nurbsCurve,sampleSplineBranches} from '../src/model/splineCurves.js';
import {nurbsPoint} from '../src/model/splines.js';

function base(periodic=false){
  const points=Array.from({length:12},(_,i)=>({x:10*i,y:7*(i%3)}));
  return {degree:2,points,weights:points.map((_,i)=>i===(periodic?6:3)?-4:1),periodic,
    ...(periodic?{}:{knots:[0,0,0,1,2,3,4,5,6,7,8,9,10,10,10]})};
}
const insert=(input,t)=>insertEditableSplineKnot('nurbsCurve',input,t);
const remove=(input,t,tolerance=1e-7,solver)=>removeEditableSplineKnot('nurbsCurve',input,t,tolerance,solver,'branch');

test('a finite branch can be simplified within tolerance while both poles and all exterior points stay fixed',()=>{
  const a=insert(base(),7.5);a.points[8].y+=0.1;
  const original=structuredClone(a),result=remove(a,7.5,1);
  assert.deepEqual(result.removal.branch,{ranges:[[6,9]],checkedSpans:4,protectedSpans:7});
  assert.throws(()=>removeEditableSplineKnot('nurbsCurve',a,7.5,1e6),/分母/);
  assert.throws(()=>remove(a,7.5,0.001));
  const before=nurbsCurve(a),after=nurbsCurve(result);
  const gaps=shape=>sampleSplineBranches(shape).omitted;
  assert.equal(gaps(before).length,2);assert.deepEqual(gaps(before),gaps(after));
  let worst=0;
  for(let i=0;i<=2000;i++){
    const t=i/200,p=nurbsPoint({...before,t}),q=nurbsPoint({...after,t});
    if(t<6||t>9)assert.deepEqual(p,q);
    else worst=Math.max(worst,Math.hypot(p.x-q.x,p.y-q.y));
  }
  assert.ok(worst>0.001&&worst<=result.removal.errorBound+1e-12);
  assert.deepEqual(a,original);
});

test('a double pole, near-zero denominator, zero span and a discontinuous target are rejected inside the affected branch',()=>{
  const points=[0,1,2].map(x=>({x,y:x*x}));
  for(const weights of [[1,-1,1],[1,-1-1e-9,1],[1,-1+1e-14,1],[0,1,1]]){
    const a=insert({degree:2,points,weights},0.25);let calls=0;
    assert.throws(()=>remove(a,0.25,1e6,request=>{calls++;return removeSplineKnot(request);}),/枝/);
    assert.equal(calls,0);
  }
  const zeros=base();zeros.weights=[1,1,0,0,0,0,1,1,1,1,1,1];
  assert.throws(()=>remove(zeros,3,1e6));
  const discontinuous={degree:1,points:[{x:0,y:0},{x:1,y:0},{x:1,y:0},{x:3,y:0}],weights:[1,1,1,1],knots:[0,0,1,1,2,2]};
  assert.throws(()=>remove(discontinuous,1,1e6),/枝/);
});

test('solver output cannot change a protected control or weight, move poles or insert a pole into the edited range',()=>{
  const input=insert(base(),7.5),request={...input,t:7.5,tolerance:1e6,scope:'branch'},valid=removeSplineKnot(request);
  assert.ok(valid);
  for(const change of [r=>r.points[3].x+=1e-11,r=>r.weights[3]=-3.999999,r=>r.weights[8]=-100]){
    const candidate=structuredClone(valid);change(candidate);candidate.removal={branch:{ranges:[[0,1]]},errorBound:0};
    assert.equal(validateSplineKnotRemoval(request,candidate),null);
    assert.throws(()=>remove(input,7.5,1e6,()=>candidate));
  }
  const zero=base();zero.weights[0]=0;const z=insert(zero,7.5),rz=remove(z,7.5);
  rz.points[0].x++;assert.equal(validateEditableSplineKnotRemoval('nurbsCurve',z,7.5,1e6,rz,'branch'),null);
});

test('raw control data stays identical beyond the support for degrees 1–12 and both extreme common weight scales',()=>{
  for(let degree=1;degree<=12;degree++)for(const scale of [1e-200,-1e200]){
    const count=degree*4+10,points=Array.from({length:count},(_,i)=>({x:i*0.3+1e3,y:Math.cos(i)*0.25}));
    const weights=points.map((_,i)=>i<=degree?-scale:scale);
    const input=insert({degree,points,weights},0.875),result=remove(input,0.875);
    assert.ok(result.removal.branch.protectedSpans>0);
    assert.deepEqual(result.points[0],input.points[0]);assert.equal(result.weights[0],input.weights[0]);
    assert.ok(result.removal.denominator.minimumOriginal>result.removal.denominator.originalFloor);
  }
});

test('periodic branch removal verifies wrapped support at a repeated seam and at an internal knot',()=>{
  for(const t of [0,12,0.5,11.5]){
    const input=insert(base(true),t),result=remove(input,t);
    const before=nurbsCurve(input),after=nurbsCurve(result);
    assert.equal(result.removal.branch.ranges.length,2);assert.ok(result.removal.branch.protectedSpans>0);
    assert.deepEqual(sampleSplineBranches(before).omitted,sampleSplineBranches(after).omitted);
    assert.ok(validateEditableSplineKnotRemoval('nurbsCurve',input,t,1e-7,result,'branch'));
    const bad=structuredClone(result);bad.points[6].y+=0.001;
    assert.equal(validateEditableSplineKnotRemoval('nurbsCurve',input,t,1e6,bad,'branch'),null);
  }
});

test('a periodic simple seam can move with intact remote poles and rejects a partial sequence of solver results',()=>{
  const a=insert(base(true),0.5),rotate=values=>[...values.slice(1),values[0]];
  const input={...a,points:rotate(a.points),weights:rotate(a.weights),periodicKnots:[...a.periodicKnots.slice(1),12.5]};
  const result=remove(input,12.5),b=nurbsCurve(result);
  assert.deepEqual(result.removal.periodic.domainShift.to,[1,13]);assert.deepEqual(result.removal.branch.ranges,[[1,2],[11,13]]);
  const old=nurbsCurve(input);
  for(let i=0;i<180;i++){
    const t=1+i/15,p=nurbsPoint({...old,t:t>12.5?t-12:t}),q=nurbsPoint({...b,t});
    assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<1e-7);
  }
  const snapshot=structuredClone(input);let calls=0;
  assert.throws(()=>remove(input,12.5,1e-7,req=>{if(++calls===2){req.points[0].x=999;throw Error('stop');}return removeSplineKnot(req);}),/stop/);
  assert.equal(calls,2);assert.deepEqual(input,snapshot);
});

test('invalid scopes are rejected and branch records never weaken the default whole-curve verifier',()=>{
  const input=insert(base(),7.5),candidate=remove(input,7.5);
  const request={...input,t:7.5};
  assert.equal(validateSplineKnotRemoval(request,candidate),null);
  for(const scope of [null,'typo',true])assert.equal(removeSplineKnot({...request,scope}),null);
  assert.equal(removeSplineKnot({...request,scope:'branch',weights:undefined}),null);
});

test('a degree-twelve periodic model at the editable control limit preserves nonuniform knots beyond the branch',()=>{
  const count=999,degree=12,points=Array.from({length:count},(_,i)=>({x:i/8,y:Math.sin(i/12)}));
  const knots=[0];for(let i=0;i<count;i++)knots.push(knots.at(-1)+(i%3===0?2:1));
  const weights=points.map((_,i)=>i>=400&&i<=425?-1:1),t=knots[900]+0.5;
  const input=insert({points,weights,degree,periodic:true,periodicKnots:knots},t);
  assert.equal(input.points.length,1000);
  const result=remove(input,t);
  assert.equal(result.points.length,count);assert.deepEqual(result.periodicKnots,knots);
  assert.ok(result.removal.branch.protectedSpans>950);assert.deepEqual(result.points[414],input.points[414]);
});
