import test from 'node:test';
import assert from 'node:assert/strict';
import {removeSplineKnot,validateSplineKnotRemoval} from '../src/model/splineKnotRemoval.js';
import {rationalSplineDeviation} from '../src/model/splineDeviation.js';
import {removeEditableSplineKnot as remove} from '../src/adapters/splineRemoval.js';
import {insertEditableSplineKnot as insert} from '../src/adapters/splineRefinement.js';
import {insertSplineKnot,nurbsPoint,bSplinePoint} from '../src/model/splines.js';
import {nurbsCurve,sampleSplineBranches} from '../src/model/splineCurves.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:20*Math.sin(i),y:30*Math.cos(i)}));
const base={degree:2,points:points(5),weights:[1,-0.125,1,1,1]};
function deviation(a,b) {
  const lo=b.knots[b.degree],hi=b.knots[b.points.length],oldLo=a.knots[a.degree],oldHi=a.knots[a.points.length],period=oldHi-oldLo;let maximum=0;
  const scale=Math.max(...a.weights.map(Math.abs)),left={...a,weights:a.weights.map(w=>w/scale)},right={...b,weights:b.weights.map(w=>w/scale)};
  for(let i=0;i<=320;i++) {
    const t=i===320?hi:lo+(hi-lo)*i/320,u=t>oldHi?t-period:t<oldLo?t+period:t;
    const p=nurbsPoint({...left,t:u}),q=nurbsPoint({...right,t});assert.ok(p&&q);maximum=Math.max(maximum,Math.hypot(p.x-q.x,p.y-q.y));
  }
  return maximum;
}
test('zero and mixed weights remove knots through degree twelve with finite denominator bounds and independent evaluation',()=>{
  for(let degree=2;degree<=12;degree++)for(const value of [0,-0.125]) {
    const input={degree,points:points(degree+4),weights:Array.from({length:degree+4},(_,i)=>i===1?value:1)};
    const added=insert('nurbsCurve',input,0.9),result=remove('nurbsCurve',added,0.9),before=nurbsCurve(added),after=nurbsCurve(result);
    assert.equal(result.points.length,input.points.length);assert.ok(result.weights.some(w=>w<=0));
    assert.ok(deviation(before,after)<=result.removal.errorBound+1e-10);assert.ok(deviation(nurbsCurve(input),after)<1e-7);
    assert.ok(result.removal.denominator.minimumOriginal>result.removal.denominator.originalFloor);
    assert.ok(result.removal.denominator.minimumCandidate>result.removal.denominator.candidateFloor);
    const proof=result.removal.denominator,scale=Math.max(...added.weights.map(Math.abs));
    for(let j=0;j<=100;j++) {
      const w=bSplinePoint({...before,points:before.weights.map(w=>({x:w/scale,y:0})),t:j/100});
      assert.ok(Math.abs(w.x)+1e-12>=proof.minimumOriginal);
    }
  }
});
test('zero homogeneous controls remain finite while genuinely infinite reconstructed controls are rejected',()=>{
  const a={x:0,y:0},b={x:90,y:30},input={degree:3,points:[a,a,{x:999,y:-300},b,b],weights:[1,0.5,0,0.5,1],knots:[0,0,0,0,0.5,1,1,1,1],t:0.5,tolerance:0};
  const result=removeSplineKnot(input);assert.ok(result);assert.deepEqual(result.weights,[1,0,0,1]);assert.equal(result.removal.errorBound,0);
  assert.ok(result.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.ok(deviation(input,result)<1e-10);
  const infinite={degree:2,points:[{x:0,y:0},{x:5,y:5},{x:6,y:6},{x:10,y:0}],weights:[1,0.5,0.5,1],knots:[0,0,0,0.5,1,1,1],t:0.5,tolerance:1e6};
  assert.equal(removeSplineKnot(infinite),null);
});
test('signed bounds are invariant under positive and negative weight scales and ordinary translations',()=>{
  const added=insert('nurbsCurve',base,0.8),original=nurbsCurve(base);
  for(const factor of [1,-1,1e-250,-1e250,1e300])for(const dx of [-1000,0,1000]) {
    const input={...added,points:added.points.map(p=>({x:p.x+dx,y:p.y})),weights:added.weights.map(w=>w*factor)},result=remove('nurbsCurve',input,0.8);
    assert.ok(result.weights.some(w=>w>0)&&result.weights.some(w=>w<0));assert.ok(result.weights.every(Number.isFinite));
    const normalized=nurbsCurve({...result,points:result.points.map(p=>({x:p.x-dx,y:p.y})),weights:result.weights.map(w=>w/factor)});
    assert.ok(deviation(original,normalized)<1e-7);assert.ok(result.removal.denominator.nodes<=32768);
  }
});
test('signed approximation uses independently checked whole-domain error and does not trust replacement claims',()=>{
  const added=insert('nurbsCurve',base,0.8);added.points[4].y+=0.001;const request={...added,t:0.8,tolerance:1};
  assert.equal(removeSplineKnot({...request,tolerance:1e-7}),null);const result=removeSplineKnot(request);assert.ok(result);
  const actual=deviation(nurbsCurve(added),nurbsCurve(result));assert.ok(actual>1e-5&&actual<=result.removal.errorBound+1e-10);
  assert.equal(removeSplineKnot({...request,tolerance:result.removal.errorBound/2}),null);
  const checked=validateSplineKnotRemoval(request,{...result,removal:{errorBound:0,denominator:{minimumOriginal:999,nodes:0}}});
  assert.deepEqual(checked.removal,result.removal);
  assert.equal(validateSplineKnotRemoval(request,{...result,weights:[1,-10,1,1,1]}),null,'candidate poles rejected');
});
test('zeros, double roots, close roots, near-zero denominators and removable singularities reject before replacement execution',()=>{
  for(const weights of [[0,1,1],[1,-1,1],[1,-1-1e-8,1],[1,-1+1e-14,1],[0,0,0]])for(const constant of [false,true]) {
    const input={degree:2,points:constant?Array.from({length:3},()=>({x:4,y:5})):points(3),weights};
    const model=nurbsCurve(input);if(!model){assert.deepEqual(weights,[0,0,0]);continue;}
    const added=insertSplineKnot({...model,t:0.25});assert.ok(added);let calls=0;
    assert.throws(()=>remove('nurbsCurve',added,0.25,1e6,value=>{calls++;return removeSplineKnot(value);}),/分母/);assert.equal(calls,0);
  }
  const zeroSpan=insert('nurbsCurve',{degree:2,points:points(6),weights:[1,0,0,0,1,1]},0.9);let calls=0;
  assert.throws(()=>remove('nurbsCurve',zeroSpan,0.9,1e6,value=>{calls++;return removeSplineKnot(value);}),/分母/);assert.equal(calls,0);
});
test('Bernstein bounds require complete subdivision and reject depth budgets node budgets and nonfinite data',()=>{
  const knots=[0,0,0,1,1,1],h=[{x:0,y:0,w:1},{x:-0.125,y:0,w:-0.125},{x:2,y:1,w:1}];
  const proof=rationalSplineDeviation(h,h,2,knots);assert.equal(proof.errorBound,0);assert.ok(proof.denominator.nodes>1);
  assert.equal(rationalSplineDeviation(h,h,2,knots,{maxDepth:0}),null);
  assert.equal(rationalSplineDeviation(h,h,2,knots,{maxNodes:1}),null);
  assert.equal(rationalSplineDeviation(h,h.map((v,i)=>({...v,x:i?Infinity:v.x})),2,knots),null);
  assert.equal(rationalSplineDeviation(h,h,2,knots,{maxNodes:0}),null);
});
test('independent discontinuous spans may have opposite denominator signs without inventing a connecting pole',()=>{
  const input={degree:1,points:[{x:0,y:0},{x:1,y:1},{x:2,y:2},{x:10,y:5},{x:12,y:4}],weights:[1,1,1,-1,-1],knots:[0,0,0.25,0.5,0.5,1,1],t:0.25,tolerance:0};
  const result=removeSplineKnot(input);assert.ok(result);assert.equal(result.removal.errorBound,0);assert.equal(result.removal.denominator.minimumOriginal,1);
  assert.equal(deviation(input,result),0);assert.equal(sampleSplineBranches(nurbsCurve(result)).branches.length,2);
});
test('periodic zero and mixed weights support internal and repeated seam removal plus final-seam relocation',()=>{
  for(const weights of [[0,1,1,1,1],[1,-0.125,1,1,1]]) {
    const input={degree:3,points:points(5),periodic:true,periodicKnots:[0,1,3,4,6,8],weights};
    for(const t of [0,2.5,8]) {
      const added=insert('nurbsCurve',input,t),result=remove('nurbsCurve',added,t),model=nurbsCurve(result);
      assert.ok(deviation(nurbsCurve(input),model)<1e-7);assert.equal(sampleSplineBranches(model).closed,true);
    }
    const added=insert('nurbsCurve',input,0.5),rotated={...added,points:[...added.points.slice(1),added.points[0]],weights:[...added.weights.slice(1),added.weights[0]],periodicKnots:[...added.periodicKnots.slice(1),8.5]};
    const result=remove('nurbsCurve',rotated,8.5);assert.deepEqual(result.removal.periodic.domainShift.to,[1,9]);assert.ok(deviation(nurbsCurve(input),nurbsCurve(result))<1e-7);
  }
  const constant={degree:3,points:Array.from({length:5},()=>({x:2,y:3})),weights:[1,0,0,1,1],periodic:true};
  const result=remove('nurbsCurve',constant,2,0);assert.equal(result.removal.errorBound,0);assert.ok(result.weights.some(w=>w===0));assert.ok(result.removal.denominator);
});
test('periodic signed validation rejects accumulated error and preserves caller arrays on late failures',()=>{
  const input=insert('nurbsCurve',{...base,periodic:true},3.5),saved=structuredClone(input);let calls=0;
  assert.throws(()=>remove('nurbsCurve',input,3.5,1e-7,value=>{if(++calls===2){value.weights[0]=999;value.points[0].x=999;throw Error('late signed failure');}return removeSplineKnot(value);}),/late signed failure/);assert.equal(calls,2);assert.deepEqual(input,saved);
  const shifted=amount=>value=>{calls++;const out=removeSplineKnot(value);assert.ok(out);out.points=out.points.map(p=>({...p,x:p.x+amount}));return out;};
  calls=0;assert.throws(()=>remove('nurbsCurve',input,3.5,0.01,shifted(0.004)));assert.deepEqual(input,saved);
  calls=0;const result=remove('nurbsCurve',input,3.5,0.01,shifted(0.0001));assert.equal(calls,3);assert.ok(deviation(nurbsCurve(input),nurbsCurve(result))<=result.removal.errorBound+1e-10);
});
test('periodic signed verification respects the thousand-control model limit and bounded temporary expansion',()=>{
  const input={degree:12,points:points(999),weights:Array.from({length:999},(_,i)=>i===1?-0.125:1),periodic:true};
  const added=insert('nurbsCurve',input,1.5),result=remove('nurbsCurve',added,1.5);
  assert.equal(result.points.length,999);assert.ok(result.removal.errorBound<=1e-7);assert.ok(result.removal.denominator);
});
test('denominator validation provenance and signed reduced models survive repeated SVG source reconstruction',()=>{
  for(const periodic of [false,true]) {
    const input={...base,periodic},t=periodic?3.5:0.8,result=remove('nurbsCurve',insert('nurbsCurve',input,t),t);
    const model=nurbsCurve(result),path=pathData(prepareGeometry(model)),refinement={tool:'removeSplineKnot',id:'default',...result.removal};
    for(let i=0;i<3;i++) {
      const source=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:'nurbsCurve',refinement}),path);
      assert.deepEqual(source.refinement,refinement);assert.deepEqual(nurbsCurve(source.input),model);assert.ok(source.input.weights.some(w=>w<0));
    }
  }
});
