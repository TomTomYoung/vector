import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceSplineDegreeContinuity as reduce} from '../src/model/compactSplineReduction.js';
import {reduceSplineDegree as bezier,validateSplineDegreeReduction as validate} from '../src/model/splineDegreeReduction.js';
import {elevateSplineDegreeContinuity as raise} from '../src/model/compactSplineElevation.js';
import {reduceEditableSplineDegree as edit} from '../src/adapters/splineReduction.js';
import {bSplineCurve,nurbsCurve,splineBezierSpans} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {createToolset} from '../src/model/tools.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:20*Math.sin(i),y:30*Math.cos(i)}));
function compare(input,result){
  assert.ok(result);const rational=input.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,at=rational?nurbsPoint:bSplinePoint;
  const a=create(input),b=create(result);assert.ok(a&&b);assert.equal(b.degree,a.degree-1);
  const lo=a.knots[a.degree],hi=a.knots[a.points.length];assert.equal(b.knots[b.degree],lo);assert.equal(b.knots[b.points.length],hi);
  const scale=rational?Math.max(...a.weights.map(Math.abs)):1,origin=a.points[0];
  for(const model of [a,b]){model.points=model.points.map(p=>({x:p.x-origin.x,y:p.y-origin.y}));if(rational)model.weights=model.weights.map(w=>w/scale);}
  let maximum=0;for(let i=0;i<=400;i++){const t=i===400?hi:lo+(hi-lo)*i/400,p=at({...a,t}),q=at({...b,t});assert.ok(p&&q);maximum=Math.max(maximum,Math.hypot(p.x-q.x,p.y-q.y));}
  assert.ok(maximum<=result.reduction.errorBound+1e-9,`sample ${maximum}, bound ${result.reduction.errorBound}`);assert.ok(result.reduction.errorBound<=result.reduction.tolerance);return maximum;
}
function expectedKnots(input){
  const m=(input.weights?nurbsCurve:bSplineCurve)(input),p=m.degree,q=p-1,lo=m.knots[p],hi=m.knots[m.points.length],multiplicities=new Map();
  for(let k of m.periodic?m.knots.slice(p,p+m.controlCount):m.knots.filter(k=>k>lo&&k<hi)){if(m.periodic&&k===hi)k=lo;multiplicities.set(k,(multiplicities.get(k)??0)+1);}
  return [...(m.periodic?[]:Array(q+1).fill(lo)),...[...multiplicities].sort((a,b)=>a[0]-b[0]).flatMap(([k,n])=>Array(n-1).fill(k)),...Array(m.periodic?1:q+1).fill(hi)];
}
function jet(span,end,order){
  const p=span.controls.length-1,width=span.to-span.from,hs=[];let row=span.controls;
  for(let k=0;k<=order;k++){hs.push(row[end?row.length-1:0]);row=row.slice(1).map((h,i)=>({x:(p-k)*(h.x-row[i].x)/width,y:(p-k)*(h.y-row[i].y)/width,w:(p-k)*(h.w-row[i].w)/width}));}
  const [a,b,c]=hs,value={x:a.x/a.w,y:a.y/a.w};if(order===0)return value;
  const first={x:(b.x-b.w*value.x)/a.w,y:(b.y-b.w*value.y)/a.w};if(order===1)return first;
  return {x:(c.x-2*b.w*first.x-c.w*value.x)/a.w,y:(c.y-2*b.w*first.y-c.w*value.y)/a.w};
}
test('continuity reduction reverses elevation for polynomial and rational degrees two through twelve',()=>{
  for(const periodic of [false,true])for(let degree=1;degree<=11;degree++)for(const rational of [false,true]){
    const original={degree,periodic,points:points(degree+4),...(rational?{weights:Array.from({length:degree+4},(_,i)=>1+i%3)}:{})},input=raise(original),saved=structuredClone(input),out=reduce(input);
    compare(input,out);assert.deepEqual(input,saved);assert.deepEqual(out[periodic?'periodicKnots':'knots'],expectedKnots(input));assert.equal(out.points.length,original.points.length);assert.equal(out.reduction.representation.id,'continuity');
  }
});
test('simple knots disappear but all original intervals still receive independent tolerance checks',()=>{
  const input={degree:3,points:points(7),tolerance:100},out=reduce(input);assert.deepEqual(out.knots,[0,0,0,1,1,1]);assert.equal(out.points.length,3);assert.equal(out.reduction.spans,4);compare(input,out);
  assert.equal(reduce({...input,tolerance:out.reduction.errorBound/2}),null);assert.deepEqual(out.points[0],input.points[0]);assert.deepEqual(out.points.at(-1),input.points.at(-1));
  const affine={degree:3,knots:[-3,-2,-1,0,0.3,1.5,2,3,4,5],points:Array.from({length:6},(_,i)=>{const x=[-3,-2,-1,0,.3,1.5,2,3,4,5].slice(i+1,i+4).reduce((a,b)=>a+b,0)/3;return {x,y:2*x+1};})};compare(affine,reduce(affine));assert.deepEqual(reduce(affine).knots,[0,0,0,2,2,2]);
});
test('nonuniform repeated knots and full breaks keep multiplicity minus one and separate one-sided endpoints',()=>{
  for(const knots of [[0,0,0,0,0.2,0.2,0.7,1,1,1,1],[0,0,0,0,0.2,0.2,0.2,0.7,1,1,1,1],[0,0,0,0,0.5,0.5,0.5,0.5,1,1,1,1]]){
    const input={degree:3,points:points(knots.length-4),knots,tolerance:100},out=reduce(input);compare(input,out);assert.deepEqual(out.knots,expectedKnots(input));
    if(knots.filter(k=>k===0.5).length===4){const projected=p=>({x:input.points[0].x+(p.x-input.points[0].x),y:input.points[0].y+(p.y-input.points[0].y)});assert.deepEqual(out.points[2],projected(input.points[3]));assert.deepEqual(out.points[3],projected(input.points[4]));const moved=structuredClone(out);moved.points[2].x+=1e-7;assert.equal(validate(input,moved),null);}
  }
});
test('C1 and C2 joins remain continuous in independent rational derivatives after control editing',()=>{
  for(const degree of [2,3])for(const rational of [false,true]){
    const original={degree,points:points(degree+3),...(rational?{weights:Array.from({length:degree+3},(_,i)=>1+i%3)}:{})},input=raise(original),out=reduce(input);out.points[1].y+=7;
    const spans=splineBezierSpans((rational?nurbsCurve:bSplineCurve)(out));for(let i=1;i<spans.length;i++)for(let order=0;order<degree;order++){
      const a=jet(spans[i-1],true,order),b=jet(spans[i],false,order);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8,`C${order}`);
    }
  }
});
test('periodic repeated seams retain the original interval and cyclic continuity without pinning the seam point',()=>{
  for(const periodicKnots of [[0,0,1,1,3,3,5,7],[0,1,1,3,3,5,7,7],[0,0,1,1,3,5,7,7],[0.1,0.1,0.3,0.3,1,1,1.7,2]]){
    const input={degree:3,points:points(7),weights:[1,2,1,3,1,2,1],periodic:true,periodicKnots,tolerance:1e6},out=reduce(input);compare(input,out);assert.deepEqual(out.periodicKnots,expectedKnots(input));assert.ok(pathData(prepareGeometry(nurbsCurve(out))).endsWith('Z'));
    const spans=splineBezierSpans(nurbsCurve(out));for(let order=0;order<=Math.max(0,3-(periodicKnots.filter(t=>t===periodicKnots[0]||t===periodicKnots.at(-1)).length-1));order++){
      const a=jet(spans[0],false,order),b=jet(spans.at(-1),true,order);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<1e-8,'cyclic derivative');}
  }
  assert.equal(reduce({degree:3,points:points(6),periodic:true,tolerance:1e6}),null,'no surviving periodic knots cannot define a lower-degree basis');
  assert.equal(reduce({degree:3,points:points(4),periodic:true,periodicKnots:[0,0,1,2,3],tolerance:1e6}),null,'insufficient remaining periodic basis');
});
test('zero and mixed rational weights, common extreme scales and translated coordinates survive the global fit',()=>{
  for(const periodic of [false,true])for(const w of [0,-.125])for(const scale of [1,1e-250,-1e-250,1e250,-1e250]){
    const input=raise({degree:3,periodic,points:points(7),weights:[1,w,1,1,1,1,1].map(v=>v*scale)}),out=reduce(input);compare(input,out);assert.ok(out.weights.every(Number.isFinite));
  }
  const seamPoints=[{x:80,y:100},{x:150,y:220},{x:240,y:110},{x:300,y:190},{x:350,y:150}];
  for(const periodicKnots of [[0,0,1,3,5,7],[0,1,3,5,7,7],[.1,.3,1,1.4,1.7,2]])for(const weight of [0,-.125,2]){
    const input=raise({degree:3,points:seamPoints,weights:[1,weight,1,1,1],periodic:true,periodicKnots}),out=reduce(input);compare(input,out);assert.ok(out.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  }
  const input=raise({degree:3,points:points(7).map(p=>({x:p.x+1e8,y:p.y-1e8}))});compare(input,reduce(input));
});
test('a thousand-control input reduces beyond the temporary Bezier limit without expanding the editable cap',()=>{
  for(const periodic of [false,true]){
    const original={degree:periodic?11:10,periodic,points:points(periodic?500:505)},input=raise(original);assert.equal(input.points.length,1000);assert.equal(bezier(input),null);
    const out=edit('bSplineCurve',input,1e-7,reduce);assert.equal(out.points.length,original.points.length);compare(input,out);
    let calls=0;assert.throws(()=>edit('bSplineCurve',{...input,points:points(1001)},1e-7,v=>{calls++;return reduce(v);}));assert.equal(calls,0);
  }
});
test('validation recomputes global proof and representation and rejects knots, fixed endpoints, poles and corrupted inputs',()=>{
  const input=raise({degree:3,points:points(7)}),good=reduce(input);
  for(const change of [r=>r.points.pop(),r=>r.knots[4]+=.01,r=>r.points[0].x+=1e-9,r=>r.points[2].x+=1,r=>r.degree++,r=>r.weights=r.points.map(()=>1)]){
    const bad=structuredClone(good);change(bad);bad.reduction={errorBound:0,representation:{id:'continuity'}};assert.equal(validate(input,bad),null);
  }
  const candidate=structuredClone(good);candidate.points[2].x+=.0001;candidate.reduction={errorBound:0,representation:{controlCount:9999},verification:{source:'forged'}};
  const checked=validate({...input,tolerance:.001},candidate);assert.ok(checked.reduction.errorBound>0);assert.equal(checked.reduction.representation.controlCount,7);assert.equal(checked.reduction.verification.source,'src/model/splineDegreeReduction.js');compare(input,checked);
  const saved=structuredClone(input);assert.throws(()=>edit('bSplineCurve',input,1e-7,v=>{v.points[0].x=999;throw Error('global fit failure');}),/global fit failure/);assert.deepEqual(input,saved);
  for(const weights of [[1,-1,1],[0,1,1],[1,-2,1]])assert.equal(reduce({degree:2,points:points(3),weights,tolerance:1e6}),null);
  for(const invalid of [{...input,tolerance:-1},{...input,tolerance:Infinity},{...input,points:Array(7)},{...input,degree:1},{degree:3,points:points(4),weights:[1,Number.MIN_VALUE,1e308,1]}])assert.equal(reduce(invalid),null);
});
test('coincident layout validation distinguishes movable C0 joins from the default endpoint contract',()=>{
  const input={degree:3,points:points(7),knots:[0,0,0,0,.5,.5,.5,1,1,1,1],tolerance:100},out=reduce(input);assert.deepEqual(out.knots,bezier(input).knots);assert.notDeepEqual(out.points[2],input.points[3]);
  const checked=validate(input,{...out,reduction:{representation:{id:'bezier'}}});assert.equal(checked.reduction.representation.id,'continuity');compare(input,checked);
});
test('registered continuity reduction is isolated and survives repeated SVG round trips and subsequent operations',()=>{
  const a=createToolset(),b=createToolset();assert.ok(a.list('reduceSplineDegree').some(v=>v.id==='continuity'&&v.algorithm.includes('Givens')&&v.source==='src/model/compactSplineReduction.js'));a.select('reduceSplineDegree','continuity');assert.equal(b.describe('reduceSplineDegree').id,'default');
  for(const periodic of [false,true]){
    let input={degree:2,periodic,points:points(5),weights:[1,2,1,3,1]};for(let i=0;i<3;i++)input=raise(input);
    for(let i=0;i<3;i++){const out=a('reduceSplineDegree',input);compare(input,out);const model=nurbsCurve(out),path=pathData(prepareGeometry(model)),refinement={tool:'reduceSplineDegree',id:'continuity',...out.reduction};
      const source=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'nurbsCurve',refinement}),path);assert.deepEqual(source.refinement,refinement);assert.deepEqual(nurbsCurve(source.input),model);input=source.input;}
    assert.equal(input.points.length,5);
  }
});
