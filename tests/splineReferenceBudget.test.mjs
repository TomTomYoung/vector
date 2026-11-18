import test from 'node:test';
import assert from 'node:assert/strict';
import {splineReferenceDeviation as bound,checkSplineReferenceBudget as check} from '../src/model/splineReferenceBudget.js';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {insertEditableSplineKnot} from '../src/adapters/splineRefinement.js';
import {elevateEditableSplineDegree} from '../src/adapters/splineElevation.js';
import {readSplineSource} from '../src/adapters/splineSource.js';

const poly='bSplineCurve',rational='nurbsCurve';
const points=[{x:0,y:0},{x:1,y:3},{x:3,y:-1},{x:4,y:2}];
const moved=(curve,dx,dy)=>({...curve,points:curve.points.map(p=>({x:p.x+dx,y:p.y+dy}))});
const near=(actual,expected,eps=1e-9)=>assert.ok(Math.abs(actual-expected)<=eps,actual+' vs '+expected);

test('a fixed budget survives consecutive geometry changes, measures local distance and recovers when a change is reversed',()=>{
  const origin={points,degree:3},budget={version:1,reference:origin,tolerance:5};
  assert.deepEqual(check(poly,budget,moved(origin,3,4)),{errorBound:5,remaining:0});
  assert.throws(()=>check(poly,budget,moved(origin,3,4.01)),/超え/);
  assert.deepEqual(check(poly,budget,origin),{errorBound:0,remaining:5});
  for(const tolerance of [-1,Infinity,'1',1000001])assert.throws(()=>check(poly,{...budget,tolerance},origin));
});

test('common spans cover degrees 1 through 12, knot insertion, degree elevation and independent dense evaluations',()=>{
  for(let degree=1;degree<=12;degree++)for(const method of [poly,rational]){
    const n=degree+3,base={degree,points:Array.from({length:n},(_,i)=>({x:i/3,y:Math.sin(i)})),
      ...(method===rational?{weights:Array.from({length:n},(_,i)=>1+(i%3)/2)}:{})};
    const inserted=insertEditableSplineKnot(method,base,.25);
    const next=degree<12?elevateEditableSplineDegree(method,inserted,1e-6):inserted;
    let changed=moved(next,.08,-.06);changed.points[1].y+=.05;
    const upper=bound(method,base,changed);
    assert.ok(Number.isFinite(upper)&&upper<.5);
    const create=method===poly?bSplineCurve:nurbsCurve,at=method===poly?bSplinePoint:nurbsPoint,a=create(base),b=create(changed);
    for(let k=0;k<=200;k++){const t=k/200,p=at({...a,t}),q=at({...b,t});assert.ok(Math.hypot(p.x-q.x,p.y-q.y)<=upper+1e-10);}
    assert.ok(bound(method,base,next)<1e-8);
  }
});

test('periodic seam rotation compares the same parameter across several periods, with nonuniform knots',()=>{
  for(const method of [poly,rational]){
    const a={degree:2,periodic:true,points,periodicKnots:[0,1,3,4,6],...(method===rational?{weights:[2,3,4,5]}:{})};
    const b={...a,points:[...points.slice(1),points[0]],periodicKnots:[13,15,16,18,19],...(a.weights?{weights:[3,4,5,2]}:{})};
    assert.ok(bound(method,a,b)<1e-10);assert.ok(bound(method,b,a)<1e-10);
    assert.ok(bound(method,a,moved(b,0,1))>=1-1e-9);
    assert.throws(()=>bound(method,a,{...b,periodicKnots:[13,15,16,18,20]}),/周期/);
  }
});

test('both sides of a full knot break and both endpoints contribute to the estimate',()=>{
  const a={degree:1,points,knots:[0,0,.5,.5,1,1]},b=structuredClone(a);b.points[1].y+=9;
  near(bound(poly,a,b),9);b.points[2].y+=12;near(bound(poly,a,b),12);
  assert.throws(()=>bound(poly,a,{...a,knots:[0,0,1,1,2,2]}),/パラメータ/);
});

test('signed and zero weights, global weight scaling and an interior double pole are distinguished',()=>{
  const a={degree:2,points:points.slice(0,3),weights:[1,-.25,1]},b=moved(a,0,2);
  for(const weights of [[1,-.25,1],[1,0,1],[-10,2.5,-10]]){
    const input={...a,weights};near(bound(rational,input,input),0);
    const scaled={...input,weights:weights.map(x=>-7*x)};near(bound(rational,input,scaled),0);
  }
  assert.ok(bound(rational,a,b)>=2);assert.ok(bound(rational,b,a)>=2);
  for(const weights of [[1,-1,1],[0,1,1],[1,-2,1]])assert.throws(()=>bound(rational,{...a,weights},{...a,weights}),/分母/);
});

test('SVG reopening recomputes the bound, rejects false saved estimates and preserves old files',()=>{
  const a={degree:2,points},b=moved(a,0,3),budget={version:1,reference:a,tolerance:4};
  const record={version:1,path:'M0 0',model:bSplineCurve(b)};
  const read=s=>readSplineSource(JSON.stringify(s),undefined,'M0 0');
  assert.equal(read(record).referenceBudget,undefined);
  const source=read({...record,referenceBudget:budget});
  near(source.referenceReport.errorBound,3);near(source.referenceReport.remaining,1);
  assert.throws(()=>read({...record,referenceBudget:{...budget,tolerance:2,errorBound:0}}),/超え/);
  for(const invalid of [{...budget,version:9},{...budget,reference:null},{...budget,reference:{...a,points:Array(1001).fill(points[0])}}])
    assert.throws(()=>read({...record,referenceBudget:invalid}));
});

test('degenerate domains, nonfinite homogeneous data and underflowing nonzero weights are rejected',()=>{
  const a={degree:1,points:points.slice(0,2)};
  assert.throws(()=>bound(poly,a,{...a,periodic:true}));
  assert.throws(()=>bound(poly,a,{...a,points:[null,points[0]]}));
  assert.throws(()=>bound(poly,a,{...a,weights:[1,1]}));
  assert.throws(()=>bound(rational,{...a,weights:[1e308,1e-320]},a));
  assert.throws(()=>bound(poly,{...a,points:[{x:-1e308,y:0},{x:1e308,y:0}]},a));
});

test('cumulative mode replays accepted checkpoints, charges a return journey and ignores claimed totals',()=>{
  const a={degree:1,points:points.slice(0,2)},b=moved(a,3,0),c=moved(a,2,0);
  const budget={version:1,reference:a,checkpoints:[b],tolerance:5,cumulative:0};
  const report=check(poly,budget,c);near(report.errorBound,2);near(report.cumulative,4);near(report.remaining,1);
  assert.throws(()=>check(poly,budget,a),/累積/);
  const saved={version:1,model:bSplineCurve(b),path:'M0 0',referenceBudget:budget};
  assert.equal(readSplineSource(JSON.stringify(saved),undefined,'M0 0').referenceReport.cumulative,3);
  assert.throws(()=>check(poly,{...budget,checkpoints:Array(129).fill(a)},a),/128/);
  assert.throws(()=>check(poly,{...budget,tolerance:2},b),/累積/);
});

test('a thousand control points compare against the same reference and the replay limit also bounds total controls',()=>{
  const a={degree:1,points:Array.from({length:1000},(_,i)=>({x:i,y:i%5}))};
  near(bound(poly,a,a),0);
  assert.throws(()=>check(poly,{version:1,reference:a,checkpoints:Array(16).fill(a),tolerance:1},a),/16000/);
});
