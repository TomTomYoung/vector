import test from 'node:test';
import assert from 'node:assert/strict';
import {elevateSplineDegree as elevate,validateSplineDegreeElevation as validate} from '../src/model/splineDegreeElevation.js';
import {elevateEditableSplineDegree as edit} from '../src/adapters/splineElevation.js';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:20*Math.sin(i),y:30*Math.cos(i)}));
const base={degree:2,points:points(5)};
function compare(input,result,tolerance=1e-9) {
  assert.ok(result,'elevation accepted');const rational=input.weights!==undefined,model=rational?nurbsCurve:bSplineCurve,evaluate=rational?nurbsPoint:bSplinePoint;
  const a=model(input),b=model(result);assert.ok(a&&b);assert.equal(b.degree,a.degree+1);
  assert.equal(b.knots[b.degree],a.knots[a.degree]);assert.equal(b.knots[b.points.length],a.knots[a.points.length]);
  const lo=a.knots[a.degree],hi=a.knots[a.points.length],scale=rational?Math.max(...a.weights.map(Math.abs)):1;
  const left={...a,...(rational?{weights:a.weights.map(w=>w/scale)}:{})},right={...b,...(rational?{weights:b.weights.map(w=>w/scale)}:{})};
  let max=0;for(let i=0;i<=240;i++){const t=i===240?hi:lo+(hi-lo)*i/240,p=evaluate({...left,t}),q=evaluate({...right,t});assert.ok(p&&q);max=Math.max(max,Math.hypot(p.x-q.x,p.y-q.y));}
  assert.ok(max<=tolerance,`sample deviation ${max}`);assert.ok(result.elevation.errorBound<=result.elevation.tolerance);return max;
}
test('degree elevation preserves independently evaluated polynomial and rational curves for degrees one through eleven',()=>{
  for(const periodic of [false,true])for(let degree=1;degree<=11;degree++)for(const rational of [false,true]) {
    const input={degree,periodic,points:points(degree+4),...(rational?{weights:Array.from({length:degree+4},(_,i)=>1+i%3)}:{})},saved=structuredClone(input),result=elevate(input);
    compare(input,result);assert.deepEqual(input,saved);assert.equal(result.periodic,periodic);assert.equal(result.elevation.fromDegree,degree);
  }
});
test('unclamped active domains clamp their endpoints while full-multiplicity internal breaks remain separate',()=>{
  const unclamped={...base,knots:[-2,-1,0,1,2,3,4,5]},raised=elevate(unclamped);compare(unclamped,raised);assert.deepEqual(raised.knots.slice(0,4),[0,0,0,0]);assert.deepEqual(raised.knots.slice(-4),[3,3,3,3]);
  const broken={degree:2,points:points(6),knots:[0,0,0,0.5,0.5,0.5,1,1,1]},out=elevate(broken);compare(broken,out);assert.equal(out.knots.filter(k=>k===0.5).length,4);assert.equal(out.points.length,8);
});
test('nonuniform periodic intervals and repeated seam presentations preserve the complete parameter domain',()=>{
  for(const periodicKnots of [[0,0,1,3,5,7],[0,1,3,5,7,7],[0,1,1,3,5,7],[0.1,0.3,1,1.4,1.7,2]]) {
    const input={degree:3,points:points(5),periodic:true,periodicKnots,weights:[1,2,1,3,2]},out=elevate(input);compare(input,out);assert.equal(out.periodicKnots[0],periodicKnots[0]);assert.equal(out.periodicKnots.at(-1),periodicKnots.at(-1));assert.equal(out.periodicKnots.length,out.points.length+1);
  }
});
test('zero and mixed weights elevate when finite controls and a separated denominator can be certified',()=>{
  for(const periodic of [false,true])for(const w of [0,-0.125]) {
    const input={...base,periodic,weights:[1,w,1,1,1]},out=elevate(input);compare(input,out);assert.ok(out.elevation.verification.algorithm.includes('Bernstein'));
  }
  const input={degree:3,points:[{x:0,y:0},{x:1,y:1},{x:1,y:1},{x:2,y:0}],weights:[1,1,-1,1]},out=elevate(input);compare(input,out);assert.ok(out.weights.some(w=>w===0));assert.ok(out.elevation.verification.denominatorNodes>0);
  input.points[2].x=2;assert.equal(elevate(input),null,'zero homogeneous weight with nonzero numerator is unrepresentable');
});
test('common positive or negative weight scales and translated coordinates keep geometric elevation stable',()=>{
  for(const scale of [1e-250,-1e-250,1e250,-1e250,1e300])for(const periodic of [false,true]) {
    const input={...base,periodic,weights:[1,-0.125,1,1,1].map(w=>w*scale)},out=elevate(input);compare(input,out);assert.ok(out.weights.every(Number.isFinite));
  }
  const input={...base,points:base.points.map(p=>({x:p.x+1e8,y:p.y-1e8}))};compare(input,elevate(input),1e-7);
});
test('poles, denominator endpoint zeros, unsafe normalization and invalid source structures fail without partial results',()=>{
  for(const weights of [[1,-1,1],[1,-2,1],[0,1,1]])assert.equal(elevate({degree:2,points:points(3),weights}),null);
  for(const input of [{...base,weights:[1,Number.MIN_VALUE,1e308,1,1]},{...base,tolerance:-1},{...base,tolerance:Infinity},{...base,tolerance:1e7},{...base,points:Array(5)},{...base,degree:0},{...base,knots:[0,0,0,0,0,1,1,1]}])assert.equal(elevate(input),null);
  assert.equal(elevate({degree:2,points:points(3),weights:[1,Number.MIN_VALUE,1e308]}),null);
});
test('degree and output-capacity limits are checked before invoking a replacement implementation',()=>{
  let calls=0;const callback=()=>{calls++;return null;};
  for(const input of [{degree:12,points:points(13)},{degree:1,points:points(502)},{degree:1,periodic:true,points:points(501)}])assert.throws(()=>edit('bSplineCurve',input,1e-7,callback));assert.equal(calls,0);
  const input={degree:1,periodic:true,points:points(500)},out=elevate(input);assert.equal(out.points.length,1000);compare(input,out);
});
test('replacement results are independently validated and input mutations or exceptions leave the caller untouched',()=>{
  const saved=structuredClone(base),out=elevate(base);
  for(const mutate of [r=>r.degree++,r=>r.periodic=true,r=>r.knots[3]=0.1,r=>r.points.pop(),r=>r.points[1].x+=1,r=>r.weights=r.points.map(()=>1),r=>r.points[1].x=NaN]) {
    const bad=structuredClone(out);mutate(bad);bad.elevation={errorBound:0};assert.equal(validate(base,bad),null);
  }
  assert.throws(()=>edit('bSplineCurve',base,1e-7,input=>{input.points[0].x=999;throw Error('replacement failure');}),/replacement failure/);assert.deepEqual(base,saved);
  const result=edit('bSplineCurve',base,1e-7,input=>{const result=elevate(input);result.elevation={errorBound:-999,verification:{source:'forged'}};return result;});assert.notEqual(result.elevation.errorBound,-999);assert.equal(result.elevation.verification.source,'src/model/splineDegreeElevation.js');
  assert.ok(edit('nurbsCurve',base).weights.every(w=>w===1));assert.equal(edit('bSplineCurve',{...base,weights:[0,0,0,0,0]}).weights,undefined);
});
test('independent deviation checks accept bounded approximations and reject excess errors despite forged claims',()=>{
  const candidate=elevate(base);candidate.points=candidate.points.map(p=>({...p,x:p.x+0.0001}));candidate.elevation.errorBound=0;
  assert.equal(validate({...base,tolerance:0.00001},candidate),null);const checked=validate({...base,tolerance:0.001},candidate);assert.ok(checked.elevation.errorBound>0.00009);assert.ok(compare(base,checked,0.001)<=checked.elevation.errorBound+1e-12);
});
test('elevated source and provenance survive repeated SVG reconstruction and further degree elevation',()=>{
  for(const periodic of [false,true]) {
    let input={...base,periodic,weights:[1,2,1,3,1]};const original=structuredClone(input);
    for(let step=0;step<3;step++){
      const result=elevate(input);compare(input,result);const model=nurbsCurve(result),path=pathData(prepareGeometry(model)),refinement={tool:'elevateSplineDegree',id:'default',...result.elevation};
      const source=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'nurbsCurve',refinement}),path);assert.deepEqual(source.refinement,refinement);assert.deepEqual(nurbsCurve(source.input),model);input=source.input;
    }
    assert.equal(input.degree,original.degree+3);
  }
});
