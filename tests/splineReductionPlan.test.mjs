import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceSplineToDegree as adaptive,reduceSplineToDegreeBezier as bezier,reduceSplineToDegreeContinuity as continuity,validateSplineReductionPlan as validate,addReductionErrorBounds as sum} from '../src/model/splineReductionPlan.js';
import {reduceSplineDegree as single} from '../src/model/splineDegreeReduction.js';
import {elevateSplineDegreeContinuity as raise} from '../src/model/compactSplineElevation.js';
import {insertEditableSplineKnot as insert} from '../src/adapters/splineRefinement.js';
import {reduceEditableSplineToDegree as edit} from '../src/adapters/splineReductionPlan.js';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {createToolset,toolNames} from '../src/model/tools.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:2*Math.sin(i),y:3*Math.cos(i)}));
const base={degree:3,points:[{x:0,y:0},{x:1,y:2},{x:2,y:-1},{x:3,y:0}],targetDegree:1,tolerance:.01};
function compare(input,out){
  assert.ok(out);const rational=input.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,at=rational?nurbsPoint:bSplinePoint;
  const a=create(input),b=create(out),lo=a.knots[a.degree],hi=a.knots[a.points.length],start=b.knots[b.degree],end=b.knots[b.points.length],period=hi-lo;
  assert.equal(out.degree,input.targetDegree);assert.equal(end-start,period);
  const scale=rational?Math.max(...a.weights.map(Math.abs)):1,origin=a.points[0];for(const m of [a,b]){m.points=m.points.map(p=>({x:p.x-origin.x,y:p.y-origin.y}));if(rational)m.weights=m.weights.map(w=>w/scale);}
  let error=0;for(let i=0;i<=500;i++){const t=start+(end-start)*i/500,u=t>hi?t-period:t<lo?t+period:t,p=at({...a,t:u}),q=at({...b,t});assert.ok(p&&q);error=Math.max(error,Math.hypot(p.x-q.x,p.y-q.y));}
  assert.ok(error<=out.reductionPlan.errorBound+1e-9,`${error} <= ${out.reductionPlan.errorBound}`);assert.ok(out.reductionPlan.errorBound<=input.tolerance);assert.ok(validate(input,out));return out;
}
test('multi-degree adaptive reduction bounds the whole chain and reuses unspent tolerance',()=>{
  const out=compare(base,adaptive(base)),plan=out.reductionPlan;assert.equal(out.stages.length,2);assert.equal(plan.stepCount,2);assert.equal(plan.steps[0].tolerance,.005);assert.ok(plan.steps[1].tolerance>.005);
  assert.equal(plan.steps[1].tolerance,base.tolerance-plan.steps[0].errorBound);assert.equal(plan.errorBound,sum(plan.steps[0].errorBound,plan.steps[1].errorBound));assert.equal(plan.remainingBudget,base.tolerance-plan.errorBound);
  assert.equal(bezier(base),null);assert.equal(continuity(base),null);
});
test('sum of error bounds rounds upward even when a positive increment would disappear',()=>{
  assert.equal(sum(1,2**-54),1+Number.EPSILON);assert.equal(sum(0,0),0);assert.equal(sum(0,.1),.1);assert.equal(sum(.1,0),.1);
  assert.ok(sum(Number.MIN_VALUE,Number.MIN_VALUE)>=2*Number.MIN_VALUE);for(const args of [[Infinity,1],[-1,1],[NaN,1],[Number.MAX_VALUE,Number.MAX_VALUE]])assert.equal(sum(...args),null);
});
test('all degrees through twelve support polynomial and rational open and periodic multistage plans',()=>{
  for(const periodic of [false,true])for(const rational of [false,true]){
    let input={degree:1,periodic,points:points(4),...(rational?{weights:[1,2,1,3]}:{})};
    for(let degree=2;degree<=12;degree++){
      input=raise(input);assert.ok(input);const request={...input,targetDegree:1,tolerance:1e-5},before=structuredClone(request);
      for(const run of [adaptive,bezier,continuity]){const out=compare(request,run(request));assert.equal(out.reductionPlan.stepCount,degree-1);assert.ok(out.stages.every(v=>v.points.length<=1000));}assert.deepEqual(request,before);
    }
  }
});
test('periodic seam relocation composes across stages in one shared parameter period',()=>{
  for(const rational of [false,true]){
    const original={degree:2,periodic:true,points:points(4),...(rational?{weights:[1,0,1,2]}:{})};let added=insert(rational?'nurbsCurve':'bSplineCurve',raise(raise(original)),.5);
    const u=added.periodicKnots,n=added.points.length,k=u.indexOf(.5),period=u[n]-u[0],rotate=v=>[...v.slice(k),...v.slice(0,k)];
    const input={degree:4,periodic:true,points:rotate(added.points),periodicKnots:[...u.slice(k,n),...u.slice(0,k+1).map(t=>t+period)],...(rational?{weights:rotate(added.weights)}:{}),targetDegree:2,tolerance:1e-4};
    const out=compare(input,continuity(input));assert.deepEqual(out.reductionPlan.steps[0].periodic.domainShift,{from:[.5,4.5],to:[1,5],period:4});assert.equal(out.reductionPlan.steps[1].fromDegree,3);assert.equal(out.periodicKnots[0],1);
  }
});
test('nonuniform full breaks, unclamped inputs and signed scaled weights retain valid staged comparisons',()=>{
  for(const source of [
    {degree:2,points:points(6),knots:[0,0,0,.3,.3,.3,1,1,1]},
    {degree:2,points:points(5),knots:[-2,-1,.1,.3,1,1.7,2,3]},
    ...[0,-.125].flatMap(w=>[1,1e-250,-1e250].map(scale=>({degree:2,points:points(5),weights:[1,w,1,1,1].map(x=>x*scale)})))
  ]){const input={...raise(raise(source)),targetDegree:2,tolerance:1e-5};for(const run of [adaptive,bezier,continuity])compare(input,run(input));}
});
test('a failure after a valid first stage returns no partial result and leaves its source unchanged',()=>{
  const original={degree:2,points:[{x:0,y:0},{x:.5,y:1},{x:1,y:0}]},input={...raise(original),targetDegree:1,tolerance:.1},before=structuredClone(input);
  assert.ok(single({...input,tolerance:.05}));assert.equal(bezier(input),null);assert.deepEqual(input,before);
  for(const invalid of [{...base,targetDegree:0},{...base,targetDegree:3},{...base,targetDegree:1.5},{...base,tolerance:-1},{...base,tolerance:Infinity},{...base,tolerance:0},{...base,points:Array(4)},
    {degree:2,points:points(3),weights:[1,-2,1],targetDegree:1,tolerance:1e6}])assert.equal(adaptive(invalid),null);
});
test('zero budget exact constants and the final thousand-control limit are enforced over the chain',()=>{
  const constant={degree:2,points:[{x:2,y:3},{x:2,y:3},{x:2,y:3}],weights:[1,0,1],targetDegree:1,tolerance:0};assert.equal(compare(constant,adaptive(constant)).reductionPlan.errorBound,0);
  const make=n=>({degree:2,points:[{x:0,y:0},{x:.5,y:1},{x:1,y:0},...Array.from({length:2*(n-1)},()=>({x:1,y:0}))],knots:[0,0,0,...Array.from({length:n-1},(_,i)=>[i+1,i+1]).flat(),n,n,n],targetDegree:1,tolerance:1/512**2});
  assert.equal(compare(make(488),adaptive(make(488))).points.length,1000);assert.equal(adaptive(make(489)),null);assert.equal(adaptive({...base,points:Array.from({length:1001},()=>({x:0,y:0}))}),null);
});
test('replacement plans cannot forge the budget, omit intermediate curves or substitute an unverified final curve',()=>{
  const out=adaptive(base);
  for(const change of [r=>r.stages.pop(),r=>r.stages.push(r.stages[0]),r=>r.stages.reverse(),r=>r.stages[0].points[1].x+=100,r=>r.points[1].y+=1,r=>r.stages[0].knots[3]+=.001,r=>r.stages[1].degree=2,r=>r.weights=r.points.map(()=>1),r=>r.stages=Array(2)]){
    const bad=structuredClone(out);change(bad);bad.reductionPlan={errorBound:0,tolerance:1e6,stepCount:1};assert.equal(validate(base,bad),null);
  }
  const forged=structuredClone(out);forged.reductionPlan={errorBound:0,steps:[]};for(const stage of forged.stages)stage.reduction={errorBound:0,tolerance:1e6};assert.deepEqual(validate(base,forged),validate(base,out));
  assert.equal(validate({...base,tolerance:out.reductionPlan.errorBound/2},out),null);assert.equal(validate({...base,targetDegree:2},out),null);
});
test('the adapter isolates callback mutation, verifies every stage and stores only compact plan provenance in SVG',()=>{
  const before=structuredClone(base);assert.throws(()=>edit('bSplineCurve',base,1,.01,input=>{input.points[0].x=999;throw Error('plan failure');}),/plan failure/);assert.deepEqual(base,before);
  const out=edit('bSplineCurve',base,1,.01,input=>{const v=adaptive(input);v.reductionPlan={errorBound:0};return v;});assert.equal(out.stages,undefined);assert.ok(out.reductionPlan.errorBound>0);
  const model=bSplineCurve(out),path=pathData(prepareGeometry(model)),refinement={tool:'reduceSplineToDegree',id:'default',...out.reductionPlan};
  const restored=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'bSplineCurve',refinement}),path);assert.deepEqual(restored.refinement,refinement);assert.deepEqual(bSplineCurve(restored.input),model);
  assert.throws(()=>edit('bSplineCurve',base,3,.01),/目標次数/);assert.throws(()=>edit('circle',base,1,.01),/標準/);
});
test('the new operation exposes three scoped implementations and 124 catalog entries',()=>{
  const host=createToolset();assert.equal(toolNames.length,124);assert.match(host.describe('reduceSplineToDegree').algorithm,/三角不等式/);assert.deepEqual(host.list('reduceSplineToDegree').map(x=>x.id),['default','bezier','continuity']);
  compare(base,host('reduceSplineToDegree',base));const input={...raise(raise({degree:1,points:points(3)})),targetDegree:1,tolerance:1e-4};compare(input,host('reduceSplineToDegree',input,{implementation:'continuity'}));assert.equal(host.describe('reduceSplineToDegree').id,'default');
});
