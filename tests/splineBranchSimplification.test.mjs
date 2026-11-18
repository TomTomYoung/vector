import test from 'node:test';
import assert from 'node:assert/strict';
import {insertEditableSplineKnot as insert} from '../src/adapters/splineRefinement.js';
import {simplifySplineKnots as forward,simplifySplineKnotsReverse as reverse,simplifySplineKnotsLeastError as ranked,
  validateSplineSimplification as validate,simplifyEditableSplineKnots as edit} from '../src/adapters/splineSimplification.js';
import {listSimplificationBranches as list,branchContains} from '../src/adapters/splineSimplificationBranches.js';
import {nurbsCurve,sampleSplineBranches} from '../src/model/splineCurves.js';
import {nurbsPoint} from '../src/model/splines.js';
import {addReductionErrorBounds} from '../src/model/splineReductionPlan.js';

function fixture(periodic=false,insertions=[.5,1.5,9.5,10.5]){
  const points=Array.from({length:14},(_,i)=>({x:10*i,y:7*(i%3)}));
  let input={degree:2,points,weights:points.map((_,i)=>i===7?-4:1),periodic,
    ...(periodic?{}:{knots:[0,0,0,1,2,3,4,5,6,7,8,9,10,11,12,12,12]})};
  for(const t of insertions)input=insert('nurbsCurve',input,t);
  return input;
}
const strategies=[forward,reverse,ranked];

test('each search edits only its selected finite branch and retains the poles and other removable knots',()=>{
  const input=fixture(),branches=list(input),before=nurbsCurve(input);
  assert.equal(branches.length,3);assert.equal(forward(input),null);
  for(const [index,removed] of [[1,[.5,1.5]],[2,[]],[3,[9.5,10.5]]]){
    for(const run of strategies){
      const req={...input,branchIndex:index},out=run(req);
      assert.deepEqual(out.simplification.branch,branches[index-1]);
      assert.deepEqual(out.stages.map(stage=>stage.t).sort((a,b)=>a-b),removed);
      assert.deepEqual(validate(req,out),out);
      const after=nurbsCurve(out);
      assert.deepEqual(sampleSplineBranches(before).omitted,sampleSplineBranches(after).omitted);
      for(let i=0;i<=600;i++){
        const t=i/50,p=nurbsPoint({...before,t}),q=nurbsPoint({...after,t});
        if(!branchContains(branches[index-1],t,t))assert.deepEqual(q,p);
        else assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<=out.simplification.errorBound+1e-10);
      }
    }
  }
});

test('a periodic seam belongs to one branch through multiple relocations in a single run',()=>{
  const a=fixture(true,[.25,.5,.75,2.5,10.5]),u=a.periodicKnots,k=u.indexOf(.25);
  const rotate=v=>[...v.slice(k),...v.slice(0,k)];
  const input={...a,points:rotate(a.points),weights:rotate(a.weights),
    periodicKnots:[...u.slice(k),...u.slice(1,k+1).map(t=>t+14)],branchIndex:1};
  const selected=list(input)[0];assert.equal(selected.ranges.length,2);
  for(const run of strategies){
    const out=run(input);assert.deepEqual(validate(input,out),out);
    assert.equal(out.simplification.removedKnots,5);assert.deepEqual(out.simplification.branch,selected);
    for(const step of out.simplification.steps){
      assert.ok(step.branch.ranges.every(([lo,hi])=>branchContains(selected,lo,hi)));
    }
    assert.equal(out.periodicKnots[0],1);
  }
  assert.equal(forward(input).simplification.steps.filter(s=>s.periodic.domainShift).length,3);
  assert.deepEqual(forward({...input,branchIndex:2}).stages,[]);
});

test('discontinuities split adjacent finite ranges and each accepted approximation spends the shared budget',()=>{
  const input={degree:1,knots:[0,0,1,2,3,3,4,5,6,6],points:[0,.02,0,.02,0,.02,0,.02].map((y,x)=>({x,y})),weights:Array(8).fill(1)};
  assert.deepEqual(list(input).map(b=>b.ranges),[[[0,3]],[[3,6]]]);
  for(const branchIndex of [1,2])for(const run of strategies)for(const tolerance of [.02,.06]){
    const req={...input,tolerance,branchIndex},out=run(req);
    assert.equal(out.stages.length,tolerance===.02?1:2);
    let total=0;for(const step of out.simplification.steps){assert.equal(step.tolerance,tolerance-total);total=addReductionErrorBounds(total,step.errorBound);assert.equal(step.cumulativeErrorBound,total);}
    assert.ok(total>0&&total<=tolerance);assert.equal(out.simplification.remainingBudget,tolerance-total);
    assert.ok(out.knots.filter(t=>t===3).length===2);
  }
});

test('replay rejects an independently good edit to a different branch and recomputes forged branch evidence',()=>{
  const input=fixture(),left={...input,branchIndex:1},right={...input,branchIndex:3};
  const good=forward(left),bad=forward(right);
  bad.simplification=structuredClone(good.simplification);
  assert.equal(validate(left,bad),null);
  good.simplification={branch:{index:999},errorBound:99};
  assert.deepEqual(validate(left,good).simplification.branch,list(input)[0]);
  assert.throws(()=>edit('nurbsCurve',left,1e-7,()=>bad));
  const damaged=forward(left);damaged.stages[0].curve.points.at(-1).y++;
  assert.equal(validate(left,damaged),null);
});

test('invalid and stale branch indices and interrupted scans cannot modify the input',()=>{
  const input=fixture(),before=structuredClone(input);
  for(const branchIndex of [0,-1,4,1.2,'1',null])assert.equal(forward({...input,branchIndex}),null);
  for(const run of strategies)assert.equal(run({...input,branchIndex:1,maxAttempts:1}),null);
  assert.deepEqual(input,before);
  assert.equal(forward({...input,weights:undefined,branchIndex:1}),null);
  assert.deepEqual(list({...input,points:Array(input.points.length)}),[]);
  assert.deepEqual(list({...input,weights:input.weights.map((_,i)=>i===7?1e300:Number.MIN_VALUE)}),[]);
});

test('periodic range membership never bridges a pole gap and accepts a connected wrap over multiple turns',()=>{
  const b={periodic:true,domain:[0,8],ranges:[[0,2],[6,8]]};
  for(const [lo,hi] of [[6,8],[7,9],[15,17],[-1,1],[24,26]])assert.ok(branchContains(b,lo,hi));
  for(const [lo,hi] of [[1,7],[9,15],[3,3],[7,16],[NaN,8]])assert.equal(branchContains(b,lo,hi),false);
  assert.equal(branchContains({...b,periodic:false},7,9),false);
});

test('degree twelve at the 1000-control limit locates the branch across extreme common scales',()=>{
  const points=Array.from({length:999},(_,i)=>({x:i/8,y:Math.sin(i)}));
  for(const scale of [1e-200,-1e200]){
    const base={points,degree:12,periodic:true,weights:points.map((_,i)=>(i<20?-1:1)*scale)};
    const input=insert('nurbsCurve',base,800.5),choices=list(input);
    assert.equal(input.points.length,1000);
    const selected=choices.find(b=>branchContains(b,800,801));
    assert.ok(selected);const excluded=choices.find(b=>b.index!==selected.index);
    assert.ok(excluded);
    const req={...input,branchIndex:excluded.index,tolerance:0,maxAttempts:100};
    const out=forward(req);assert.ok(out);assert.ok(out.periodicKnots.includes(800.5));assert.ok(validate(req,out));
  }
});
