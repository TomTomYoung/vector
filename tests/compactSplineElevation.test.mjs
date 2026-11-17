import test from 'node:test';
import assert from 'node:assert/strict';
import {elevateSplineDegreeContinuity as elevate} from '../src/model/compactSplineElevation.js';
import {elevateSplineDegree as bezier,validateSplineDegreeElevation as validate} from '../src/model/splineDegreeElevation.js';
import {elevateEditableSplineDegree as edit} from '../src/adapters/splineElevation.js';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {createToolset} from '../src/model/tools.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:20*Math.sin(i),y:30*Math.cos(i)}));
const base={degree:3,points:points(7)};
function compare(input,result,tolerance=1e-9){
  assert.ok(result);const rational=input.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,at=rational?nurbsPoint:bSplinePoint;
  const a=create(input),b=create(result);assert.ok(a&&b);assert.equal(b.degree,a.degree+1);
  const lo=a.knots[a.degree],hi=a.knots[a.points.length];assert.equal(b.knots[b.degree],lo);assert.equal(b.knots[b.points.length],hi);
  const scale=rational?Math.max(...a.weights.map(Math.abs)):1;
  if(rational){a.weights=a.weights.map(w=>w/scale);b.weights=b.weights.map(w=>w/scale);}
  let maximum=0;for(let i=0;i<=300;i++){const t=i===300?hi:lo+(hi-lo)*i/300,p=at({...a,t}),q=at({...b,t});assert.ok(p&&q);maximum=Math.max(maximum,Math.hypot(p.x-q.x,p.y-q.y));}
  assert.ok(maximum<=tolerance,`deviation ${maximum}`);assert.ok(result.elevation.errorBound<=result.elevation.tolerance);return maximum;
}
function expectedKnots(input){
  const m=(input.weights?nurbsCurve:bSplineCurve)(input),p=m.degree,q=p+1,lo=m.knots[p],hi=m.knots[m.points.length],multiplicities=new Map();
  const source=m.periodic?m.knots.slice(p,p+m.controlCount):m.knots.filter(k=>k>lo&&k<hi);
  for(let k of source){if(m.periodic&&k===hi)k=lo;multiplicities.set(k,(multiplicities.get(k)??0)+1);}
  return [...(m.periodic?[]:Array(q+1).fill(lo)),...[...multiplicities].sort((a,b)=>a[0]-b[0]).flatMap(([k,n])=>Array(n+1).fill(k)),...Array(m.periodic?1:q+1).fill(hi)];
}
test('continuity degree elevation preserves independently evaluated polynomial and rational curves through degree twelve',()=>{
  for(const periodic of [false,true])for(let degree=1;degree<=11;degree++)for(const rational of [false,true]){
    const input={degree,periodic,points:points(degree+5),...(rational?{weights:Array.from({length:degree+5},(_,i)=>1+i%3)}:{})},saved=structuredClone(input),out=elevate(input);
    compare(input,out);assert.deepEqual(out[periodic?'periodicKnots':'knots'],expectedKnots(input));assert.deepEqual(input,saved);
    assert.equal(out.elevation.representation.id,'continuity');assert.equal(out.elevation.representation.removedKnots,bezier(input).points.length-out.points.length);
  }
});
test('nonuniform repeated interior knots and full discontinuities retain exactly the original continuity multiplicities',()=>{
  for(const knots of [[0,0,0,0,0.2,0.2,0.7,1,1,1,1],[0,0,0,0,0.2,0.2,0.2,0.7,1,1,1,1],[0,0,0,0,0.5,0.5,0.5,0.5,1,1,1,1]]){
    const input={degree:3,points:points(knots.length-4),knots},out=elevate(input);compare(input,out);assert.deepEqual(out.knots,expectedKnots(input));
  }
});
test('nonuniform periodic knots, both seam presentations and internal repetitions reconstruct one unchanged period',()=>{
  for(const periodicKnots of [[0,0,1,3,5,7],[0,1,3,5,7,7],[0,0,1,3,7,7],[0,1,1,3,5,7],[0.1,0.3,1,1.4,1.7,2]]){
    const input={degree:3,points:points(5),periodic:true,periodicKnots,weights:[1,2,1,3,2]},out=elevate(input);compare(input,out);assert.deepEqual(out.periodicKnots,expectedKnots(input));
  }
});
test('unclamped source endpoints retain their active interval and are clamped only at the boundary',()=>{
  const input={degree:3,points:points(6),knots:[-3,-2,-1,0,0.3,1.5,2,3,4,5],weights:[1,2,3,1,2,1]},out=elevate(input);compare(input,out);assert.deepEqual(out.knots,expectedKnots(input));assert.equal(out.knots[0],0);assert.equal(out.knots.at(-1),2);
});
test('zero and mixed weights with a separated denominator and extreme common scales preserve geometry',()=>{
  for(const periodic of [false,true])for(const weight of [0,-0.125])for(const scale of [1,1e-250,-1e-250,1e250,-1e250]){
    const input={...base,periodic,weights:[1,weight,1,1,1,1,1].map(w=>w*scale)},out=elevate(input);compare(input,out);assert.ok(out.weights.every(Number.isFinite));
  }
  const translated={...base,points:base.points.map(p=>({x:p.x+1e8,y:p.y-1e8}))};compare(translated,elevate(translated),1e-7);
});
test('the final control limit admits temporary Bezier arrays above one thousand but rejects oversized final models',()=>{
  for(const periodic of [false,true]){
    const input={degree:11,periodic,points:points(periodic?500:505)};assert.equal(bezier(input),null);const out=edit('bSplineCurve',input,1e-7,elevate);assert.equal(out.points.length,periodic?1000:999);assert.ok(out.elevation.representation.bezierControlCount>1000);compare(input,out);
    let calls=0;assert.throws(()=>edit('bSplineCurve',{...input,points:points(periodic?501:506)},1e-7,v=>{calls++;return elevate(v);}));assert.equal(calls,0);
  }
});
test('independent final verification rejects incorrect continuity vectors, cumulative errors and forged representation claims',()=>{
  const good=elevate(base);
  for(const change of [r=>r.points.pop(),r=>r.knots[5]+=0.01,r=>r.points[2].x+=1,r=>r.degree++,r=>r.weights=r.points.map(()=>1)]){const bad=structuredClone(good);change(bad);bad.elevation={errorBound:0,representation:{id:'continuity'}};assert.equal(validate(base,bad),null);}
  const shifted=structuredClone(good);shifted.points=shifted.points.map(p=>({...p,x:p.x+0.0001}));shifted.elevation={errorBound:0,representation:{removedKnots:999}};
  assert.equal(validate({...base,tolerance:0.00001},shifted),null);const accepted=validate({...base,tolerance:0.001},shifted);assert.ok(accepted.elevation.errorBound>0.00009);assert.notEqual(accepted.elevation.representation.removedKnots,999);assert.ok(compare(base,accepted,0.001)<=accepted.elevation.errorBound+1e-12);
  const saved=structuredClone(base);assert.throws(()=>edit('bSplineCurve',base,1e-7,v=>{v.points[0].x=999;throw Error('compact failure');}),/compact failure/);assert.deepEqual(base,saved);
});
test('compact reconstruction rejects poles, invalid inputs, overflow and underflow without returning partial candidates',()=>{
  for(const weights of [[1,-1,1],[0,1,1],[1,-2,1]])assert.equal(elevate({degree:2,points:points(3),weights}),null);
  for(const input of [{...base,tolerance:-1},{...base,tolerance:Infinity},{...base,degree:12,points:points(13)},{...base,points:Array(7)},{...base,weights:[1,Number.MIN_VALUE,1e308,1,1,1,1]},{...base,points:base.points.map((p,i)=>({x:i%2?1e308:-1e308,y:0}))}])assert.equal(elevate(input),null);
});
test('registered continuity implementation is selectable, isolated and exposes its actual algorithm and source',()=>{
  const a=createToolset(),b=createToolset();assert.ok(a.list('elevateSplineDegree').some(v=>v.id==='continuity'&&v.algorithm.includes('Givens')&&v.source==='src/model/compactSplineElevation.js'));
  a.select('elevateSplineDegree','continuity');const out=a('elevateSplineDegree',base);assert.equal(a.describe('elevateSplineDegree').id,'continuity');assert.equal(b.describe('elevateSplineDegree').id,'default');assert.ok(out.points.length<b('elevateSplineDegree',base).points.length);assert.equal(a.trace()[0].id,'continuity');
});
test('compact results survive SVG reconstruction and repeated degree elevation without losing the representation record',()=>{
  for(const periodic of [false,true]){
    let input={...base,periodic,weights:[1,2,1,3,1,2,1]};
    for(let i=0;i<4;i++){const out=elevate(input);compare(input,out);const model=nurbsCurve(out),path=pathData(prepareGeometry(model)),refinement={tool:'elevateSplineDegree',id:'continuity',...out.elevation};
      const source=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'nurbsCurve',refinement}),path);assert.deepEqual(source.refinement,refinement);assert.deepEqual(nurbsCurve(source.input),model);input=source.input;
    }
  }
});
