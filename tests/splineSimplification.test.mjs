import test from 'node:test';
import assert from 'node:assert/strict';
import {simplifySplineKnots as simplify,simplifySplineKnotsReverse as reverse,simplifySplineKnotsLeastError as leastError,validateSplineSimplification as validate,simplifyEditableSplineKnots as edit} from '../src/adapters/splineSimplification.js';
import {insertEditableSplineKnot as insert} from '../src/adapters/splineRefinement.js';
import {removeEditableSplineKnot as remove,validateEditableSplineKnotRemoval as verifyRemoval} from '../src/adapters/splineRemoval.js';
import {addReductionErrorBounds as sum} from '../src/model/splineReductionPlan.js';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {createToolset,toolNames} from '../src/model/tools.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:2*Math.sin(i),y:3*Math.cos(i)}));
function added(base,values){let input=base;for(const t of values)input=insert(base.weights?'nurbsCurve':'bSplineCurve',input,t);return input;}
function compare(input,out){
  assert.ok(out);const rational=input.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,at=rational?nurbsPoint:bSplinePoint,a=create(input),b=create(out);
  assert.equal(a.degree,b.degree);const lo=a.knots[a.degree],hi=a.knots[a.points.length],start=b.knots[b.degree],end=b.knots[b.points.length],period=hi-lo;
  assert.equal(end-start,period);const origin=a.points[0],scale=rational?Math.max(...a.weights.map(Math.abs)):1;
  for(const m of [a,b]){m.points=m.points.map(p=>({x:p.x-origin.x,y:p.y-origin.y}));if(rational)m.weights=m.weights.map(w=>w/scale);}
  let error=0;for(let i=0;i<=300;i++){const t=start+(end-start)*i/300,u=t>hi?t-period:t<lo?t+period:t,p=at({...a,t:u}),q=at({...b,t});assert.ok(p&&q);error=Math.max(error,Math.hypot(p.x-q.x,p.y-q.y));}
  assert.ok(error<=out.simplification.errorBound+1e-9,`${error} <= ${out.simplification.errorBound}`);assert.ok(out.simplification.errorBound<=(input.tolerance??1e-7));assert.ok(validate(input,out));return out;
}
test('all simplification strategies remove repeated and distinct inserted knots through degree twelve',()=>{
  for(let degree=1;degree<=12;degree++)for(const periodic of [false,true])for(const rational of [false,true]){
    const count=degree+3,base={degree,periodic,points:points(count),...(rational?{weights:Array.from({length:count},(_,i)=>1+i%3)}:{})};
    const values=periodic?[.25,.75,1.5,...(degree>1?[.25,0]:[])]:[.25,.75,...(degree>1?[.25]:[])],input=added(base,values),before=structuredClone(input);
    for(const fn of [simplify,reverse,leastError]){const out=compare(input,fn(input));assert.equal(out.points.length,count);assert.equal(out.simplification.removedKnots,values.length);assert.equal(out.stages.length,values.length);}
    assert.deepEqual(input,before);
  }
});
test('approximate removals consume one shared error budget and sweep order can change the result',()=>{
  const base={degree:1,points:[0,.02,0,.02,0,0].map((y,x)=>({x,y}))};
  for(const tolerance of [.02,.04,.06,.1])for(const fn of [simplify,reverse]){
    const input={...base,tolerance},out=compare(input,fn(input));let total=0;
    for(const step of out.simplification.steps){assert.equal(step.tolerance,tolerance-total);total=sum(total,step.errorBound);assert.equal(step.cumulativeErrorBound,total);}
    assert.equal(total,out.simplification.errorBound);assert.equal(out.simplification.remainingBudget,tolerance-total);
  }
  assert.equal(simplify({...base,tolerance:.06}).points.length,2);assert.equal(reverse({...base,tolerance:.06}).points.length,3);
  assert.equal(simplify({...base,tolerance:.02}).simplification.removedKnots,1);
});
test('nonuniform unclamped and discontinuous splines retain valid domains and whole-curve bounds',()=>{
  for(const base of [{degree:2,points:points(5),knots:[-2,-1,.1,.3,1,1.7,2,3]},
    {degree:2,points:points(6),knots:[0,0,0,.5,.5,.5,1,1,1]},
    {degree:3,periodic:true,points:points(6),periodicKnots:[.1,.3,.3,1,1.7,2,3]}]){
    const input=added(base,[.2,.7]);for(const fn of [simplify,reverse])assert.ok(compare(input,fn(input)).simplification.removedKnots>=2);
  }
});
test('periodic simplification verifies every shifted seam and keeps the original periodic parameterization',()=>{
  for(const rational of [false,true]){
    const base={degree:3,periodic:true,points:points(5),periodicKnots:[0,1,3,4,6,8],...(rational?{weights:[1,0,1,1,1]}:{})},a=added(base,[.25,.5,.75,2]);
    const u=a.periodicKnots,k=u.indexOf(.25),period=u.at(-1)-u[0],rotate=v=>[...v.slice(k),...v.slice(0,k)];
    const input={...a,points:rotate(a.points),periodicKnots:[...u.slice(k),...u.slice(1,k+1).map(t=>t+period)],...(rational?{weights:rotate(a.weights)}:{})};
    const out=compare(input,simplify(input));assert.equal(out.points.length,5);assert.equal(out.periodicKnots[0],1);
    assert.equal(out.simplification.steps.filter(v=>v.periodic?.domainShift).length,3);
    assert.deepEqual(out.simplification.steps[0].periodic.domainShift,{from:[.25,8.25],to:[.5,8.5],period:8});
  }
});
test('zero and signed weights and extreme common scales use verified denominator bounds',()=>{
  let signedChecks=0;
  for(const periodic of [false,true])for(const weight of [0,-.125])for(const scale of [1,1e-250,-1e250]){
    const base={degree:3,periodic,points:points(6),weights:[1,weight,1,1,1,1].map(v=>v*scale)},input=added(base,periodic?[.5,2.5]:[.3,.7]);
    for(const fn of [simplify,reverse,leastError]){const out=compare(input,fn(input));assert.ok(out.simplification.removedKnots>=2);signedChecks+=out.simplification.steps.filter(s=>s.denominator).length;}
  }
  assert.ok(signedChecks>0);
});
test('minimal or irreducible inputs return an unchanged validated curve and exact constants allow a zero budget',()=>{
  for(const periodic of [false,true]){
    const input={degree:2,periodic,points:points(3),tolerance:0},out=compare(input,simplify(input));assert.equal(out.simplification.removedKnots,0);assert.equal(out.simplification.errorBound,0);assert.deepEqual(out.stages,[]);
    const constant={degree:2,periodic,points:Array.from({length:8},()=>({x:2,y:3})),tolerance:0},reduced=compare(constant,simplify(constant));assert.equal(reduced.points.length,3);assert.equal(reduced.simplification.errorBound,0);
  }
});
test('input and search limits and unverified poles reject atomically even after a removable first knot',()=>{
  const base={degree:2,points:points(4)},input=added(base,[.25,.75]),before=structuredClone(input);
  assert.equal(simplify({...input,maxAttempts:1}),null);assert.deepEqual(input,before);
  for(const bad of [{...input,tolerance:-1},{...input,tolerance:Infinity},{...input,maxAttempts:0},{...input,maxAttempts:4097},{...input,maxAttempts:1.5},{...input,points:Array(6)},
    {degree:2,points:points(3),weights:[1,-2,1]},{degree:2,points:points(3),weights:[1,0,Number.MIN_VALUE]},{degree:2,points:points(1001)}])assert.equal(simplify(bad),null);
});
test('thousand-control inputs remain supported and preserve caller data',()=>{
  const input={degree:2,points:Array.from({length:1000},()=>({x:1,y:2})),tolerance:0},before=structuredClone(input),out=simplify(input);
  assert.equal(out.points.length,3);assert.equal(out.simplification.removedKnots,997);assert.equal(out.simplification.errorBound,0);assert.ok(validate(input,out));assert.deepEqual(input,before);
  const periodic=added({degree:12,periodic:true,points:points(999)},[.4]),result=compare(periodic,reverse(periodic));assert.equal(result.points.length,999);
});
test('standalone periodic candidate verification rejects wrong knots weights and wrapped deviations',()=>{
  const input=added({degree:3,periodic:true,points:points(5)},[.5]),out=remove('bSplineCurve',input,.5,1e-7);
  assert.deepEqual(verifyRemoval('bSplineCurve',input,.5,1e-7,out),out);
  for(const change of [v=>v.periodicKnots[1]+=.1,v=>v.points[2].y+=1,v=>v.points=Array(5),v=>v.weights=Array(5).fill(1),v=>v.periodic=false,v=>v.knots=[]]){
    const bad=structuredClone(out);change(bad);assert.equal(verifyRemoval('bSplineCurve',input,.5,1e-7,bad),null);
  }
});
test('replacement plans cannot omit stages forge intermediate geometry or substitute the final model',()=>{
  for(const periodic of [false,true]){
    const input=added({degree:2,periodic,points:points(4)},periodic?[.5,1.5]:[.25,.75]),out=simplify(input);
    for(const change of [v=>v.stages.pop(),v=>v.stages.reverse(),v=>v.stages[0].t=NaN,v=>v.stages[0].curve.points[1].x+=10,v=>v.points[0].x+=10,v=>v.stages=Array(2),v=>v.weights=v.points.map(()=>1)]){
      const bad=JSON.parse(JSON.stringify(out));change(bad);bad.simplification={errorBound:0,removedKnots:0};assert.equal(validate(input,bad),null);
    }
    const fake=structuredClone(out);fake.simplification={errorBound:999,removedKnots:999};assert.deepEqual(validate(input,fake),validate(input,out));
  }
});
test('the adapter isolates solver mutations and SVG records retain independently recomputed compact provenance',()=>{
  const input=added({degree:2,points:points(4)},[.25,.75]),before=structuredClone(input);
  assert.throws(()=>edit('bSplineCurve',input,1e-7,v=>{v.points[0].x=999;throw Error('simplify failure');}),/simplify failure/);assert.deepEqual(input,before);
  const out=edit('bSplineCurve',input),model=bSplineCurve(out),path=pathData(prepareGeometry(model)),refinement={tool:'simplifySplineKnots',id:'default',...out.simplification};assert.equal(out.stages,undefined);
  const restored=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'bSplineCurve',refinement}),path);assert.deepEqual(restored.refinement,refinement);assert.deepEqual(bSplineCurve(restored.input),model);
  assert.throws(()=>edit('circle',input),/標準/);assert.throws(()=>edit('bSplineCurve',input,-1),/全体許容差/);
});
test('the catalog exposes 124 operations and three independently scoped simplification strategies',()=>{
  const host=createToolset(),input=added({degree:2,points:points(4)},[.25,.75]);assert.equal(toolNames.length,124);assert.match(host.describe('simplifySplineKnots').algorithm,/三角不等式/);
  assert.deepEqual(host.list('simplifySplineKnots').map(v=>v.id),['default','reverse','least-error']);assert.equal(compare(input,host('simplifySplineKnots',input)).stages[0].t,.25);
  assert.equal(compare(input,host('simplifySplineKnots',input,{implementation:'reverse'})).stages[0].t,.75);assert.equal(host.describe('simplifySplineKnots').id,'default');
});

const rankedInput={
  degree:1,points:[-1,-5,0,-3,-5,-4,0].map((y,x)=>({x:x*10,y})),
  knots:[0,0,1,2,3,4,5,6,6],tolerance:7
};
test('least-error ranks the current curve again after each accepted deletion',()=>{
  const out=compare(rankedInput,leastError(rankedInput));
  assert.deepEqual(out.stages.map(stage=>stage.t),[3,5,1]);
  assert.deepEqual(out.simplification.steps.map(step=>step.errorBound),[.5,1.5,4.5]);
  assert.equal(out.simplification.errorBound,sum(sum(.5,1.5),4.5));
  assert.equal(simplify(rankedInput).simplification.removedKnots,2);
  assert.equal(reverse(rankedInput).simplification.removedKnots,2);
});
test('equal positive bounds favor the smaller knot and zero can end a search immediately',()=>{
  const tied={degree:1,points:[0,1,1,0].map((y,x)=>({x,y})),knots:[0,0,1,2,3,3],tolerance:.5};
  assert.deepEqual(compare(tied,leastError(tied)).stages.map(stage=>stage.t),[1]);
  const exact={degree:1,points:Array.from({length:5},()=>({x:2,y:3})),knots:[0,0,1,2,3,4,4],tolerance:0,maxAttempts:3};
  assert.deepEqual(compare(exact,leastError(exact)).stages.map(stage=>stage.t),[1,2,3]);
});
test('an incomplete ranking or final scan discards every staged change',()=>{
  const before=structuredClone(rankedInput);
  for(const maxAttempts of [1,4,5,12,13])assert.equal(leastError({...rankedInput,maxAttempts}),null);
  assert.equal(leastError({...rankedInput,maxAttempts:14}).simplification.removedKnots,3);
  assert.deepEqual(rankedInput,before);
});
test('a repeated right endpoint costs only one attempt for its periodic seam',()=>{
  const input={periodic:true,degree:2,periodicKnots:[0,1,2,3,4,4],
    points:[{x:0,y:0},{x:1,y:2},{x:3,y:1},{x:0,y:-3},{x:-4,y:5}],tolerance:0};
  assert.equal(leastError({...input,maxAttempts:3}),null);
  assert.deepEqual(compare(input,leastError({...input,maxAttempts:4})).stages,[]);
});
