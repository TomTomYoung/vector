import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceSplineDegree as reduce,validateSplineDegreeReduction as validate} from '../src/model/splineDegreeReduction.js';
import {reduceEditableSplineDegree as edit} from '../src/adapters/splineReduction.js';
import {elevateSplineDegreeContinuity as raise} from '../src/model/compactSplineElevation.js';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {createToolset} from '../src/model/tools.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:20*Math.sin(i),y:30*Math.cos(i)}));
const base={degree:3,points:[{x:0,y:0},{x:1,y:2},{x:2,y:2},{x:3,y:0}]};
function compare(input,result){
  assert.ok(result);const rational=input.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,at=rational?nurbsPoint:bSplinePoint;
  const a=create(input),b=create(result);assert.ok(a&&b);assert.equal(b.degree,a.degree-1);
  const lo=a.knots[a.degree],hi=a.knots[a.points.length];assert.equal(b.knots[b.degree],lo);assert.equal(b.knots[b.points.length],hi);
  const scale=rational?Math.max(...a.weights.map(Math.abs)):1;if(rational){a.weights=a.weights.map(w=>w/scale);b.weights=b.weights.map(w=>w/scale);}
  const origin=a.points[0];for(const model of [a,b])model.points=model.points.map(p=>({x:p.x-origin.x,y:p.y-origin.y}));
  let maximum=0;for(let i=0;i<=300;i++){const t=i===300?hi:lo+(hi-lo)*i/300,p=at({...a,t}),q=at({...b,t});assert.ok(p&&q);maximum=Math.max(maximum,Math.hypot(p.x-q.x,p.y-q.y));}
  assert.ok(maximum<=result.reduction.errorBound+1e-9,`sample ${maximum}, bound ${result.reduction.errorBound}`);assert.ok(result.reduction.errorBound<=result.reduction.tolerance);return maximum;
}
test('raised polynomial and rational curves reduce through degrees two to twelve with independent point evaluation',()=>{
  for(const periodic of [false,true])for(let degree=1;degree<=11;degree++)for(const rational of [false,true]){
    const original={degree,periodic,points:points(degree+4),...(rational?{weights:Array.from({length:degree+4},(_,i)=>1+i%3)}:{})},input=raise(original),saved=structuredClone(input),out=reduce(input);
    compare(input,out);assert.deepEqual(input,saved);assert.equal(out.periodic,periodic);assert.equal(out.reduction.fromDegree,degree+1);assert.equal(out.reduction.representation.controlCount,out.points.length);
  }
});
test('quadratic to line reduction uses a conservative whole-interval tolerance and fixes endpoints',()=>{
  const input={degree:2,points:[{x:0,y:0},{x:1,y:1},{x:2,y:0}]};assert.equal(reduce({...input,tolerance:0}),null);assert.equal(reduce({...input,tolerance:0.99}),null);
  const out=reduce({...input,tolerance:1});assert.equal(out.reduction.errorBound,1);assert.equal(compare(input,out),0.5);assert.deepEqual(out.points,[input.points[0],input.points[2]]);assert.equal(out.degree,1);
});
test('nonuniform repeated knots and full discontinuities keep separate endpoint constraints',()=>{
  for(const knots of [[0,0,0,0.2,0.2,0.7,1,1,1],[0,0,0,0.5,0.5,0.5,1,1,1]]){
    const original={degree:2,points:points(knots.length-3),knots},input=raise(original),out=reduce(input);compare(input,out);
    if(knots.filter(k=>k===0.5).length===3){assert.equal(out.knots.filter(k=>k===0.5).length,3);assert.equal(out.points.length,6);}
    else assert.equal(out.knots.filter(k=>k===0.7).length,2);
  }
});
test('unclamped source domains clamp at the same active endpoints and preserve an affine curve',()=>{
  const degree=3,knots=[-3,-2,-1,0,0.3,1.5,2,3,4,5],input={degree,knots,points:Array.from({length:6},(_,i)=>{const x=knots.slice(i+1,i+4).reduce((a,b)=>a+b,0)/3;return {x,y:2*x+1};})},out=reduce(input);
  compare(input,out);assert.deepEqual(out.knots.slice(0,3),[0,0,0]);assert.deepEqual(out.knots.slice(-3),[2,2,2]);assert.equal(out.degree,2);
});
test('periodic nonuniform repeated seams remain closed in the same parameter interval',()=>{
  for(const periodicKnots of [[0,0,1,3,5,7],[0,1,3,5,7,7],[0,0,1,3,7,7],[0.1,0.3,1,1.4,1.7,2]]){
    const input={degree:3,points:points(5),weights:[1,2,1,3,2],periodic:true,periodicKnots,tolerance:100},out=reduce(input);compare(input,out);assert.equal(out.periodicKnots[0],periodicKnots[0]);assert.equal(out.periodicKnots.at(-1),periodicKnots.at(-1));assert.ok(pathData(prepareGeometry(nurbsCurve(out))).endsWith('Z'));
  }
});
test('zero and signed weights plus common extreme scales reduce when denominator and deviation checks pass',()=>{
  for(const periodic of [false,true])for(const weight of [0,-0.125])for(const scale of [1,1e-250,-1e-250,1e250,-1e250]){
    const input=raise({degree:2,points:points(5),weights:[1,weight,1,1,1].map(w=>w*scale),periodic}),out=reduce(input);compare(input,out);assert.ok(out.weights.every(Number.isFinite));
  }
  const translated={...base,points:base.points.map(p=>({x:p.x+1e8,y:p.y-1e8}))};compare(translated,reduce(translated));
});
test('poles and unrepresentable or invalid source inputs fail even with a very large tolerance',()=>{
  for(const weights of [[1,-1,1],[1,-2,1],[0,1,1]])assert.equal(reduce({degree:2,points:points(3),weights,tolerance:1e6}),null);
  for(const input of [{...base,degree:1},{...base,tolerance:-1},{...base,tolerance:Infinity},{...base,points:Array(4)},{...base,weights:[1,Number.MIN_VALUE,1e308,1]},{...base,knots:[0,0,0,0,0,1,1,1]}])assert.equal(reduce(input),null);
});
test('replacement geometry and endpoint changes are rejected independently of claimed tolerance and verification',()=>{
  const out=reduce(base);
  for(const change of [r=>r.points[0].x+=1e-9,r=>r.points[1].x+=1,r=>r.knots[0]=-1,r=>r.degree++,r=>r.points.pop(),r=>r.weights=r.points.map(()=>1),r=>r.points[1].x=NaN]){
    const bad=structuredClone(out);change(bad);bad.reduction={errorBound:0,tolerance:1e6,verification:{source:'forged'}};assert.equal(validate(base,bad),null);
  }
  const moved=structuredClone(out);moved.points[0].x+=1e-9;assert.equal(validate({...base,tolerance:1e6},moved),null,'endpoint cannot move even within tolerance');
  const rational={...base,weights:[1,1,1,1]},bad=reduce(rational);bad.weights[1]=-100;assert.equal(validate({...rational,tolerance:1e6},bad),null,'candidate pole refused');
});
test('adapters copy callback inputs and recompute proof metadata while allowing legitimate bounded approximations',()=>{
  const saved=structuredClone(base);assert.throws(()=>edit('bSplineCurve',base,1e-7,input=>{input.points[0].x=999;throw Error('reduction failure');}),/reduction failure/);assert.deepEqual(base,saved);
  const out=edit('bSplineCurve',base,0.001,input=>{const candidate=reduce(input);candidate.points[1].x+=0.0001;candidate.reduction={errorBound:0,verification:{source:'forged'}};return candidate;});assert.ok(out.reduction.errorBound>0.00006);assert.equal(out.reduction.verification.source,'src/model/splineDegreeReduction.js');compare(base,out);
  assert.ok(edit('nurbsCurve',base).weights.every(w=>Number.isFinite(w)));assert.equal(edit('bSplineCurve',{...base,weights:[0,0,0,0]}).weights,undefined);
});
test('zero tolerance accepts exact constant and straight curves including zero homogeneous weights',()=>{
  const constant={degree:2,points:Array.from({length:3},()=>({x:2,y:3})),weights:[1,0,1],tolerance:0},out=reduce(constant);assert.equal(out.reduction.errorBound,0);compare(constant,out);
  const line={degree:2,points:[{x:0,y:0},{x:1,y:1},{x:2,y:2}],tolerance:0};assert.equal(reduce(line).reduction.errorBound,0);
});
test('periodic and nonperiodic output capacity is enforced before replacement calls',()=>{
  for(const periodic of [false,true]){
    const input={degree:3,periodic,points:Array.from({length:periodic?500:502},()=>({x:2,y:3}))},out=reduce(input);assert.equal(out.points.length,periodic?1000:999);compare(input,out);
    let calls=0;assert.throws(()=>edit('bSplineCurve',{...input,points:[...input.points,{x:2,y:3}]},1e-7,v=>{calls++;return reduce(v);}));assert.equal(calls,0);
  }
});
test('catalog operation and saved SVG provenance support multiple successive reductions',()=>{
  const host=createToolset();assert.match(host.describe('reduceSplineDegree').algorithm,/Givens/);assert.ok(host('reduceSplineDegree',base));
  for(const periodic of [false,true]){
    let input={degree:2,periodic,points:points(5),weights:[1,2,1,3,1]};for(let i=0;i<3;i++)input=raise(input);
    for(let i=0;i<3;i++){const out=reduce(input);compare(input,out);const model=nurbsCurve(out),path=pathData(prepareGeometry(model)),refinement={tool:'reduceSplineDegree',id:'default',...out.reduction};
      const source=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'nurbsCurve',refinement}),path);assert.deepEqual(source.refinement,refinement);assert.deepEqual(nurbsCurve(source.input),model);input=source.input;
    }
  }
});
