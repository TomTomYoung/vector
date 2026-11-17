import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceSplineDegreeAdaptive as adaptive} from '../src/model/adaptiveSplineReduction.js';
import {reduceSplineDegree as standard,validateSplineDegreeReduction as validate} from '../src/model/splineDegreeReduction.js';
import {reduceEditableSplineDegree as edit} from '../src/adapters/splineReduction.js';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {createToolset} from '../src/model/tools.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:20*Math.sin(i),y:30*Math.cos(i)}));
const bowl={degree:2,points:[{x:0,y:0},{x:.5,y:1},{x:1,y:0}],tolerance:.01};
function compare(input,out){
  assert.ok(out);const rational=input.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,at=rational?nurbsPoint:bSplinePoint;
  const a=create(input),b=create(out),lo=a.knots[a.degree],hi=a.knots[a.points.length];assert.equal(b.knots[b.degree],lo);assert.equal(b.knots[b.points.length],hi);
  if(rational){const scale=Math.max(...a.weights.map(Math.abs));a.weights=a.weights.map(w=>w/scale);b.weights=b.weights.map(w=>w/scale);}
  let max=0;const cuts=[...new Set(b.knots)].filter(t=>t>=lo&&t<=hi);
  for(let i=1;i<cuts.length;i++)for(let j=0;j<=8;j++){const t=cuts[i-1]+(cuts[i]-cuts[i-1])*j/8,p=at({...a,t}),q=at({...b,t});assert.ok(p&&q);max=Math.max(max,Math.hypot(p.x-q.x,p.y-q.y));}
  assert.ok(max<=out.reduction.errorBound+1e-9,`observed ${max}, bound ${out.reduction.errorBound}`);assert.ok(out.reduction.errorBound<=input.tolerance);assert.ok(validate(input,out));return out;
}
test('adaptive subdivision succeeds where fixed intervals fail and refines only curved intervals',()=>{
  assert.equal(standard(bowl),null);const out=compare(bowl,adaptive(bowl));assert.equal(out.points.length,17);assert.equal(out.reduction.subdivision.depth,4);assert.equal(out.reduction.subdivision.splits,15);
  const input={...bowl,points:[...bowl.points,{x:1.5,y:0},{x:2,y:0}],knots:[0,0,0,1,1,2,2,2]},result=compare(input,adaptive(input));
  assert.equal(result.reduction.subdivision.resultSpans,17);assert.deepEqual(result.knots.filter(t=>t>1),[2,2]);assert.deepEqual(result.points[0],input.points[0]);assert.deepEqual(result.points.at(-1),input.points.at(-1));
});
test('degrees two to twelve support polynomial and rational open and periodic curves with independent evaluation',()=>{
  for(let degree=2;degree<=12;degree++)for(const periodic of [false,true])for(const rational of [false,true]){
    const input={degree,periodic,points:points(degree+3),tolerance:.01,...(rational?{weights:Array.from({length:degree+3},(_,i)=>1+i%3)}:{})},saved=structuredClone(input);
    const out=compare(input,adaptive(input));assert.deepEqual(input,saved);assert.equal(out.degree,degree-1);assert.equal(out.periodic,periodic);assert.ok(out.points.length<=1000);
    if(periodic)assert.ok(pathData(prepareGeometry((rational?nurbsCurve:bSplineCurve)(out))).endsWith('Z'));
  }
});
test('nonuniform decimal domains, repeated periodic seams, unclamped ends and full breaks keep original boundaries',()=>{
  const inputs=[
    {...bowl,points:[...bowl.points,{x:10,y:10},{x:11,y:10},{x:12,y:10}],knots:[0,0,0,1,1,1,2,2,2]},
    {degree:3,points:points(5),knots:[-3,-2,-1,.1,.3,1.7,2,3,4],tolerance:.05},
    ...[[.1,.3,.6,1,1.7,2],[.1,.1,.6,1,1.7,2],[.1,.3,.6,1,2,2]].map(periodicKnots=>({degree:3,points:points(5),periodic:true,periodicKnots,tolerance:.05}))
  ];
  for(const input of inputs){const out=compare(input,adaptive(input));if(input.degree===2){assert.equal(out.knots.filter(t=>t===1).length,2);assert.ok(out.points.some(p=>p.x===10&&p.y===10));}}
});
test('zero and signed weights with extreme common scales retain finite verified full curves',()=>{
  for(const weight of [0,-.125])for(const scale of [1,-1,1e-250,-1e250]){
    const input={degree:2,points:points(3),weights:[1,weight,1].map(w=>w*scale),tolerance:.01};const out=compare(input,adaptive(input));assert.ok(out.weights.every(Number.isFinite));assert.ok(out.reduction.subdivision);
  }
  for(const periodic of [false,true]){const input={degree:3,points:points(5),periodic,weights:[1,-.125,1,1,1],tolerance:.01};compare(input,adaptive(input));}
});
test('poles, zero denominators, insufficient tolerance, midpoint stagnation and invalid inputs never return partial results',()=>{
  for(const weights of [[1,-1,1],[1,-2,1],[0,1,1]])assert.equal(adaptive({...bowl,weights,tolerance:1e6}),null);
  for(const input of [{...bowl,tolerance:0},{...bowl,tolerance:-1},{...bowl,tolerance:NaN},{...bowl,degree:1},{...bowl,points:Array(3)},
    {...bowl,knots:[1,1,1,1+Number.EPSILON,1+Number.EPSILON,1+Number.EPSILON]},
    {...bowl,weights:[1,Number.MIN_VALUE,1e308]}]){const before=structuredClone(input);assert.equal(adaptive(input),null);assert.deepEqual(input,before);}
});
test('unnecessary subdivision is skipped, including exact zero-tolerance constants',()=>{
  const input={...bowl,points:Array.from({length:3},()=>({x:2,y:3})),weights:[1,0,1],tolerance:0};const out=compare(input,adaptive(input));assert.equal(out.reduction.subdivision,undefined);assert.equal(out.points.length,2);assert.equal(out.reduction.errorBound,0);
  const loose={...bowl,tolerance:1};assert.deepEqual(adaptive(loose),standard(loose));
});
test('final thousand-control capacity includes new cuts and is atomic one control beyond the limit',()=>{
  const make=n=>({degree:2,points:[...bowl.points,...Array.from({length:2*(n-1)},()=>({x:1,y:0}))],knots:[0,0,0,...Array.from({length:n-1},(_,i)=>[i+1,i+1]).flat(),n,n,n],tolerance:1/512**2});
  const input=make(488),out=compare(input,adaptive(input));assert.equal(out.points.length,1000);assert.equal(out.reduction.subdivision.resultSpans,999);assert.equal(out.reduction.subdivision.depth,9);
  assert.equal(adaptive(make(489)),null);assert.equal(adaptive({...bowl,points:Array.from({length:1001},()=>({x:1,y:0}))}),null);
});
test('replacement validation derives cuts from geometry and rejects forged errors, endpoints, missing cuts and arbitrary partitions',()=>{
  const good=adaptive(bowl);for(const change of [r=>r.points[0].x+=1e-8,r=>r.points[3].y+=10,r=>r.knots[4]+=.001,r=>r.knots[5]=r.knots[4],r=>r.degree++,r=>r.periodic=true,r=>r.points.pop(),r=>r.weights=r.points.map(()=>1)]){
    const bad=structuredClone(good);change(bad);bad.reduction={errorBound:0,tolerance:1e6,subdivision:{depth:0,splits:0}};assert.equal(validate(bowl,bad),null);
  }
  const forged=structuredClone(good);forged.reduction={errorBound:0,subdivision:{algorithm:'fake',resultSpans:1}};assert.deepEqual(validate(bowl,forged),validate(bowl,good));
  const mixed={...bowl,points:[...bowl.points,{x:1.5,y:0},{x:2,y:0}],knots:[0,0,0,1,1,2,2,2]},missing=adaptive(mixed);missing.knots=missing.knots.map(k=>k===1?1.5:k);assert.equal(validate(mixed,missing),null);
  const rational={...bowl,weights:[1,1,1]},pole=adaptive(rational);pole.weights[3]=-100;assert.equal(validate({...rational,tolerance:1e6},pole),null);
});
test('scoped registry execution, copy isolation and SVG provenance retain the independently verified subdivision',()=>{
  const host=createToolset(),before=structuredClone(bowl);assert.match(host.list('reduceSplineDegree').find(v=>v.id==='adaptive').algorithm,/適応二分割/);
  const out=edit('bSplineCurve',bowl,bowl.tolerance,input=>host('reduceSplineDegree',input,{implementation:'adaptive'}));compare(bowl,out);assert.equal(host.describe('reduceSplineDegree').id,'default');
  assert.throws(()=>edit('bSplineCurve',bowl,bowl.tolerance,input=>{input.points[0].x=999;throw Error('failure');}),/failure/);assert.deepEqual(bowl,before);
  const model=bSplineCurve(out),path=pathData(prepareGeometry(model)),refinement={tool:'reduceSplineDegree',id:'adaptive',...out.reduction},saved=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'bSplineCurve',refinement}),path);
  assert.deepEqual(saved.refinement,refinement);assert.deepEqual(bSplineCurve(saved.input),model);assert.equal(saved.refinement.subdivision.resultSpans,16);
});
