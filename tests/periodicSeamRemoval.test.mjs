import test from 'node:test';
import assert from 'node:assert/strict';
import {removeEditableSplineKnot as remove} from '../src/adapters/splineRemoval.js';
import {insertEditableSplineKnot as insert} from '../src/adapters/splineRefinement.js';
import {removeSplineKnot} from '../src/model/splineKnotRemoval.js';
import {bSplineCurve,nurbsCurve,sampleSplineBranches} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';

const points=n=>Array.from({length:n},(_,i)=>({x:20*Math.cos(i),y:30*Math.sin(i)}));
function seamInput(name,input,values=[0.5]) {
  let added=input;for(const t of values)added=insert(name,added,t);
  const u=added.periodicKnots,shift=u.indexOf(values[0]),period=u.at(-1)-u[0];
  const rotate=v=>[...v.slice(shift),...v.slice(0,shift)];
  return {...added,points:rotate(added.points),periodicKnots:[...u.slice(shift),...u.slice(1,shift+1).map(t=>t+period)],
    ...(added.weights?{weights:rotate(added.weights)}:{})};
}
const basic={points:points(5),degree:3,periodic:true,periodicKnots:[0,1,3,4,6,8]};
function deviation(original,changed,rational=false) {
  const at=rational?nurbsPoint:bSplinePoint,a=original.knots[original.degree],b=original.knots[original.points.length],period=b-a;
  const lo=changed.knots[changed.degree],hi=changed.knots[changed.points.length];let maximum=0;
  // Evaluate both the overlap and the part which wrapped across the old seam.
  for(let i=0;i<=240;i++) {
    const t=i===240?hi:lo+(hi-lo)*i/240,wrapped=t>b?t-period:t<a?t+period:t;
    const p=at({...original,t:wrapped}),q=at({...changed,t});assert.ok(p&&q);
    maximum=Math.max(maximum,Math.hypot(p.x-q.x,p.y-q.y));
  }
  return maximum;
}
test('last seam removal shifts one period to the next knot through degrees one to twelve and minimal control counts',()=>{
  for(let degree=1;degree<=12;degree++)for(const count of [degree+1,degree+4])for(const rational of [false,true]) {
    const name=rational?'nurbsCurve':'bSplineCurve',create=rational?nurbsCurve:bSplineCurve;
    const original={degree,points:points(count),periodic:true,periodicKnots:Array.from({length:count+1},(_,i)=>i*i),
      ...(rational?{weights:Array.from({length:count},(_,i)=>1+i%3)}:{})};
    const input=seamInput(name,original),saved=structuredClone(input),end=input.periodicKnots.at(-1);
    const left=remove(name,input,0.5),right=remove(name,input,end),model=create(right);
    assert.deepEqual(left.points,right.points);assert.deepEqual(left.periodicKnots,right.periodicKnots);assert.deepEqual(input,saved);
    assert.equal(right.points.length,count);assert.deepEqual(right.removal.periodic.domainShift,{from:[0.5,end],to:[1,1+count*count],period:count*count});
    assert.equal(right.removal.t,end);assert.equal(right.removal.periodic.t,0.5);assert.equal(right.removal.periodic.copies,2);
    assert.ok(deviation(create(input),model,rational)<1e-7);assert.ok(deviation(create(original),model,rational)<1e-7);
    assert.equal(sampleSplineBranches(model).closed,true);
  }
});
test('shifted origin retains repeated next knots, offset domains, and positive or negative weight scales',()=>{
  for(const offset of [-16,0,1e6])for(const scale of [1,-1,1e-250,-1e250,1e300]) {
    const input={...basic,periodicKnots:[0,1,1,1,2,4].map(t=>t+offset),weights:[1,2,1,3,2]},name='nurbsCurve';
    const seeded=seamInput(name,input,[offset+0.5]),scaled={...seeded,weights:seeded.weights.map(w=>w*scale)};
    const result=remove(name,scaled,offset+0.5);
    assert.deepEqual(result.periodicKnots,[1,1,1,2,4,5].map(t=>t+offset));assert.ok(result.weights.every(w=>Math.sign(w)===Math.sign(scale)));
    assert.ok(deviation(nurbsCurve(input),nurbsCurve({...result,weights:result.weights.map(w=>w/scale)}),true)<1e-7);
    assert.equal(result.removal.periodic.domainShift.period,4);
  }
});
test('several last-seam removals advance the domain successively and allow subsequent internal insertion and removal',()=>{
  for(const name of ['bSplineCurve','nurbsCurve']) {
    const create=name==='nurbsCurve'?nurbsCurve:bSplineCurve,input={...basic,...(name==='nurbsCurve'?{weights:[1,2,1,3,2]}:{})};
    let current=seamInput(name,input,[0.25,0.5,0.75]);
    for(const start of [0.5,0.75,1]) {
      const before=create(current);current=remove(name,current,current.periodicKnots.at(-1));
      assert.equal(current.periodicKnots[0],start);assert.equal(current.periodicKnots.at(-1),start+8);
      assert.ok(deviation(before,create(current),name==='nurbsCurve')<=current.removal.errorBound+1e-10);
    }
    const again=remove(name,insert(name,current,2),2);
    assert.deepEqual(again.periodicKnots,current.periodicKnots);assert.ok(deviation(create(input),create(again),name==='nurbsCurve')<1e-7);
  }
});
test('shifted final verification rejects accumulated callback error and ignores forged deviation metadata',()=>{
  const input=seamInput('bSplineCurve',basic),saved=structuredClone(input);let calls=0;
  const shifted=amount=>value=>{calls++;const out=removeSplineKnot(value);assert.ok(out);out.points=out.points.map(p=>({x:p.x+amount,y:p.y}));out.removal.errorBound=0;return out;};
  assert.throws(()=>remove('bSplineCurve',input,0.5,0.01,shifted(0.006)),/周期再構成後/);assert.equal(calls,2);assert.deepEqual(input,saved);
  calls=0;const result=remove('bSplineCurve',input,8.5,0.01,shifted(0.003));assert.equal(calls,2);
  const error=deviation(bSplineCurve(input),bSplineCurve(result));assert.ok(error>0.0059&&error<=result.removal.errorBound+1e-10);assert.ok(result.removal.errorBound<=0.01);
});
test('unremovable shapes, malformed results, and failures at either translated seam preserve caller state',()=>{
  const input=seamInput('nurbsCurve',{...basic,weights:[1,2,1,3,2]}),saved=structuredClone(input);
  for(const failAt of [1,2]) {
    let calls=0;assert.throws(()=>remove('nurbsCurve',input,8.5,1e-7,value=>{
      if(++calls===failAt){value.points[0].x=999;value.weights[0]=999;value.knots[0]=999;throw Error('seam failure');}
      return removeSplineKnot(value);
    }),/seam failure/);assert.equal(calls,failAt);assert.deepEqual(input,saved);
  }
  assert.throws(()=>remove('nurbsCurve',input,0.5,1e-7,value=>({...removeSplineKnot(value),degree:2})),/出力が不正/);
  assert.throws(()=>remove('bSplineCurve',basic,0,1e-7),/許容差/);assert.deepEqual(input,saved);
});
test('unrepresentable shifted periods and support knots reject before invoking replacements',()=>{
  const inputs=[{...basic,periodicKnots:[0.1,0.3,1,1.4,1.7,2]},
    seamInput('bSplineCurve',{...basic,periodicKnots:[0,0.1,0.2,0.4,0.7,1]},[0.05])];
  for(const input of inputs) {
    assert.ok(bSplineCurve(input));let calls=0;const before=structuredClone(input);
    assert.throws(()=>remove('bSplineCurve',input,input.periodicKnots[0],1e6,value=>{calls++;return removeSplineKnot(value);}),/継ぎ目の移動後/);
    assert.equal(calls,0);assert.deepEqual(input,before);
  }
});
test('representable decimal domains permit tolerance-controlled approximation across the relocated seam',()=>{
  const input={...basic,periodicKnots:[0,0.1,0.2,0.4,0.7,1]};
  assert.throws(()=>remove('bSplineCurve',input,0,1e-7),/許容差/);
  const result=remove('bSplineCurve',input,1,100),error=deviation(bSplineCurve(input),bSplineCurve(result));
  assert.deepEqual(result.periodicKnots,[0.1,0.2,0.4,0.7,1.1]);assert.ok(error>0.1&&error<=result.removal.errorBound+1e-10);assert.ok(result.removal.errorBound<=100);
});
test('last seam removal keeps the original thousand-control limit and bounded expansion',()=>{
  const input=seamInput('bSplineCurve',{points:points(999),degree:12,periodic:true});let maximum=0,calls=0;
  const result=remove('bSplineCurve',input,0.5,1e-7,value=>{maximum=Math.max(maximum,value.points.length);calls++;return removeSplineKnot(value);});
  assert.equal(maximum,3012);assert.equal(calls,2);assert.equal(result.points.length,999);assert.deepEqual(result.removal.periodic.domainShift.to,[1,1000]);
});
test('shifted domain and algorithm provenance survive source round trips including subsequent edits',()=>{
  const result=remove('nurbsCurve',seamInput('nurbsCurve',{...basic,weights:[1,2,1,3,2]}),8.5);
  const model=nurbsCurve(result),path=pathData(prepareGeometry(model)),refinement={tool:'removeSplineKnot',id:'default',...result.removal};
  for(let i=0;i<3;i++) {
    const source=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'nurbsCurve',refinement}),path);
    assert.deepEqual(source.input.periodicKnots,[1,3,4,6,8,9]);assert.deepEqual(source.refinement,refinement);assert.deepEqual(nurbsCurve(source.input),model);
    const changed={...source.input,points:source.input.points.map((p,i)=>({...p,x:p.x+(i===0?1:0)}))};
    assert.equal(sampleSplineBranches(nurbsCurve(changed)).closed,true);
  }
});
