import test from 'node:test';
import assert from 'node:assert/strict';
import {reduceSplineDegreeContinuity as reduce} from '../src/model/compactSplineReduction.js';
import {elevateSplineDegreeContinuity as raise} from '../src/model/compactSplineElevation.js';
import {validateSplineDegreeReduction as validate} from '../src/model/splineDegreeReduction.js';
import {insertEditableSplineKnot as insert} from '../src/adapters/splineRefinement.js';
import {reduceEditableSplineDegree as edit} from '../src/adapters/splineReduction.js';
import {bSplineCurve,nurbsCurve,splineBezierSpans} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {createToolset} from '../src/model/tools.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:20*Math.sin(i),y:30*Math.cos(i)}));
function seed(original,values=[0.5]) {
  const method=original.weights?'nurbsCurve':'bSplineCurve';let added=raise(original);assert.ok(added,'raise fixture');
  for(const t of values)added=insert(method,added,t);
  const u=added.periodicKnots,n=added.points.length,offset=u.indexOf(values[0]),period=u[n]-u[0];
  const rotate=v=>[...v.slice(offset),...v.slice(0,offset)];
  return {degree:added.degree,periodic:true,points:rotate(added.points),periodicKnots:[...u.slice(offset,n),...u.slice(0,offset+1).map(t=>t+period)],...(added.weights?{weights:rotate(added.weights)}:{})};
}
function compare(input,out){
  assert.ok(out,'reduced result');const rational=input.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,at=rational?nurbsPoint:bSplinePoint;
  const a=create(input),b=create(out),lo=a.knots[a.degree],hi=a.knots[a.points.length],start=b.knots[b.degree],end=b.knots[b.points.length],period=hi-lo;
  assert.equal(out.degree,input.degree-1);assert.equal(end-start,period);assert.deepEqual(out.reduction.periodic.domainShift,{from:[lo,hi],to:[start,end],period});
  const scale=rational?Math.max(...a.weights.map(Math.abs)):1,origin=a.points[0];for(const m of [a,b]){m.points=m.points.map(p=>({x:p.x-origin.x,y:p.y-origin.y}));if(rational)m.weights=m.weights.map(w=>w/scale);}
  let max=0;const probes=[...Array.from({length:401},(_,i)=>i===400?end:start+(end-start)*i/400),...new Set(b.knots.filter(t=>t>=start&&t<=end))];
  for(const t of probes){const u=t>hi?t-period:t<lo?t+period:t,p=at({...a,t:u}),q=at({...b,t});assert.ok(p&&q);max=Math.max(max,Math.hypot(p.x-q.x,p.y-q.y));}
  assert.ok(max<=out.reduction.errorBound+1e-8,`independent error ${max} > ${out.reduction.errorBound}`);assert.ok(out.reduction.errorBound<=out.reduction.tolerance);
  assert.equal(out.reduction.spans,splineBezierSpans(create(input)).length);return max;
}
test('simple-seam degree reduction checks one relocated period for degrees two through twelve and minimal bases',()=>{
  for(let degree=1;degree<=11;degree++)for(const count of [degree+1,degree+3])for(const rational of [false,true]) {
    const original={degree,periodic:true,points:points(count),periodicKnots:Array.from({length:count+1},(_,i)=>i*i),...(rational?{weights:Array.from({length:count},(_,i)=>1+i%3)}:{})};
    const input=seed(original),before=structuredClone(input),out=reduce(input);compare(input,out);assert.deepEqual(input,before);assert.equal(out.points.length,count);
    assert.deepEqual(out.periodicKnots,[...original.periodicKnots.slice(1),count*count+1]);assert.equal(out.reduction.representation.id,'continuity');
  }
});
test('the new seam skips every disappearing simple knot and retains repeated survivors with offset domains',()=>{
  for(const offset of [-16,0,1024]) {
    const original={degree:3,periodic:true,points:points(6),periodicKnots:[0,1,1,1,3,5,8].map(t=>t+offset)};
    const input=seed(original,[offset+.25,offset+.5,offset+.75]),out=reduce(input);compare(input,out);
    assert.deepEqual(out.periodicKnots,[1,1,1,3,5,8,9].map(t=>t+offset));assert.equal(out.reduction.periodic.domainShift.to[0],offset+1);
  }
  const original={degree:3,periodic:true,points:points(5),periodicKnots:[0,.125,.375,.5,.75,1]},input=seed(original,[.0625]);compare(input,reduce(input));
});
test('relocated rational reduction supports zero and signed weights and extreme common scales',()=>{
  for(const weight of [0,-.125,2])for(const scale of [1,-1,1e-250,-1e250]) {
    const input=seed({degree:3,periodic:true,points:points(5),weights:[1,weight,1,1,1],periodicKnots:[0,1,3,4,6,8]});
    input.weights=input.weights.map(w=>w*scale);const out=reduce(input);compare(input,out);assert.ok(out.weights.every(Number.isFinite));
  }
});
test('approximate reduction includes the wrapped interval in its whole-period tolerance',()=>{
  const input={degree:3,periodic:true,points:points(8),periodicKnots:[0,.5,1,1,3,3,5,5,6]};
  assert.equal(reduce(input),null);const out=reduce({...input,tolerance:1000});assert.ok(compare(input,out)>0.1);assert.equal(out.reduction.spans,5);
  assert.equal(reduce({...input,tolerance:out.reduction.errorBound/2}),null);
  const corrupt=structuredClone(out);corrupt.points.at(-1).x+=1e6;corrupt.reduction.errorBound=0;corrupt.reduction.spans=1;assert.equal(validate({...input,tolerance:1000},corrupt),null);
});
test('verification derives the canonical shifted interval and ignores forged metadata, while edits stay atomic',()=>{
  const input=seed({degree:3,periodic:true,points:points(5)}),before=structuredClone(input),out=reduce(input),forged=structuredClone(out);
  forged.reduction={errorBound:0,spans:1,periodic:{domainShift:{from:[99,100],to:[99,100],period:1}}};
  const checked=validate(input,forged);assert.deepEqual(checked.reduction,out.reduction);
  for(const change of [r=>r.periodicKnots[0]-=.125,r=>r.periodicKnots[r.periodicKnots.length-1]+=.125,r=>r.points[0].x+=1,r=>r.degree++]){const bad=structuredClone(out);change(bad);assert.equal(validate(input,bad),null);}
  assert.throws(()=>edit('bSplineCurve',input,1e-7,request=>{request.points[0].x=999;request.periodicKnots[0]=999;throw Error('delegated failure');}),/delegated failure/);assert.deepEqual(input,before);
  assert.throws(()=>edit('bSplineCurve',input,1e-7,()=>({...out,points:out.points.map(p=>({x:p.x+1,y:p.y}))})),/検証/);
  compare(input,edit('bSplineCurve',input,1e-7,()=>forged));
});
test('unrepresentable periods or translated widths and insufficient remaining bases are refused',()=>{
  for(const periodicKnots of [[.1,.3,.3,1,1,1.7,1.7,2],[0,.1,.1,.2,.2,.7,.7,1]]) {
    const input={degree:3,periodic:true,points:points(7),periodicKnots,tolerance:1e6},before=structuredClone(input);assert.ok(bSplineCurve(input));assert.equal(reduce(input),null);assert.deepEqual(input,before);
  }
  for(const periodicKnots of [[0,1,2,3,4,5],[0,1,1,2,3,4]])assert.equal(reduce({degree:3,periodic:true,points:points(5),periodicKnots,tolerance:1e6}),null);
  const pole={degree:3,periodic:true,points:points(7),periodicKnots:[0,1,1,2,2,3,3,4],weights:[1,-10,1,1,1,1,1],tolerance:1e6};assert.equal(reduce(pole),null);
});
test('a thousand-control seam-shift input keeps the editable cap while solving the compact cyclic basis',()=>{
  const original={degree:11,periodic:true,points:points(499)},input=seed(original,[.25,.5]);assert.equal(input.points.length,1000);
  const out=reduce(input);compare(input,out);assert.equal(out.degree,11);assert.equal(out.points.length,499);assert.equal(out.reduction.periodic.domainShift.to[0],1);
  const tooMany={...input,points:[...input.points,input.points[0]],periodicKnots:[...input.periodicKnots.slice(0,-1),input.periodicKnots.at(-1),input.periodicKnots.at(-1)]};assert.equal(reduce(tooMany),null);
});
function jet(span,last){
  const c=span.controls,p=c.length-1,h=span.to-span.from,i=last?p:0,a=c[i],b=last?c[i-1]:c[1],d=last?c[i-2]:c[2],sgn=last?1:-1;
  const first={x:sgn*p*(a.x-b.x)/h,y:sgn*p*(a.y-b.y)/h,w:sgn*p*(a.w-b.w)/h};
  const second={x:p*(p-1)*(a.x-2*b.x+d.x)/(h*h),y:p*(p-1)*(a.y-2*b.y+d.y)/(h*h),w:p*(p-1)*(a.w-2*b.w+d.w)/(h*h)};
  const v={x:a.x/a.w,y:a.y/a.w},v1={x:(first.x-first.w*v.x)/a.w,y:(first.y-first.w*v.y)/a.w};
  return [v,v1,{x:(second.x-2*first.w*v1.x-second.w*v.x)/a.w,y:(second.y-2*first.w*v1.y-second.w*v.y)/a.w}];
}
test('the new seam retains C2 after control edits and the model plus shift provenance round trips through SVG metadata',()=>{
  const tools=createToolset();tools.select('reduceSplineDegree','continuity');
  const input=seed({degree:3,periodic:true,points:points(5),weights:[1,2,1,3,1]}),out=tools('reduceSplineDegree',input);compare(input,out);
  const model=nurbsCurve(out),path=pathData(prepareGeometry(model)),refinement={tool:'reduceSplineDegree',id:'continuity',...out.reduction};assert.ok(path.endsWith('Z'));
  const source=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'nurbsCurve',refinement}),path);assert.deepEqual(source.refinement,refinement);assert.deepEqual(nurbsCurve(source.input),model);
  const moved=structuredClone(source.input);moved.points[0].x+=10;const spans=splineBezierSpans(nurbsCurve(moved)),left=jet(spans.at(-1),true),right=jet(spans[0],false);
  for(let i=0;i<3;i++)assert.ok(Math.hypot(left[i].x-right[i].x,left[i].y-right[i].y)<1e-8,`seam C${i}`);
  const again=tools('reduceSplineDegree',raise(source.input));assert.deepEqual(again.periodicKnots,out.periodicKnots);assert.equal(again.reduction.periodic,undefined,'no stale shift on a later unshifted operation');
});
