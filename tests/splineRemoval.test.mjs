import test from 'node:test';
import assert from 'node:assert/strict';
import {removeSplineKnot,validateSplineKnotRemoval} from '../src/model/splineKnotRemoval.js';
import {removeEditableSplineKnot as remove} from '../src/adapters/splineRemoval.js';
import {insertSplineKnot,bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=[{x:0,y:0},{x:30,y:90},{x:60,y:0},{x:90,y:30}];
const base=bSplineCurve({points,degree:3});
const refined=insertSplineKnot({...base,t:0.37});
function deviation(a,b,rational=false){
  const at=rational?nurbsPoint:bSplinePoint,start=a.knots[a.degree],end=a.knots[a.points.length];let maximum=0;
  for(let i=0;i<=150;i++){
    const t=i===150?end:start+(end-start)*i/150,p=at({...a,t}),q=at({...b,t});assert.ok(p&&q);
    maximum=Math.max(maximum,Math.hypot(p.x-q.x,p.y-q.y));
  }
  return maximum;
}
test('inverse Boehm removal recovers nonuniform B-splines and repeated internal knots through degree twelve',()=>{
  for(let degree=1;degree<=12;degree++){
    const input={points:Array.from({length:degree+4},(_,i)=>({x:Math.sin(i)*40,y:Math.cos(i)*20})),degree,
      knots:[...Array(degree+1).fill(-2),-1,0.2,3,...Array(degree+1).fill(5)]},original=bSplineCurve(input);
    for(const t of [-1.999,1.4,4.999]){
      let curve=original;
      for(let i=0;i<degree;i++)curve=insertSplineKnot({...curve,t});
      for(let i=0;i<degree;i++){
        const next=remove('bSplineCurve',curve,t);assert.equal(next.points.length,curve.points.length-1);
        assert.ok(deviation(original,next)<1e-7);assert.ok(next.removal.errorBound<=next.removal.tolerance);curve=next;
      }
      assert.deepEqual(curve.knots,original.knots);
    }
  }
});
test('NURBS removal uses normalized homogeneous coordinates for positive and negative weight scales',()=>{
  for(const degree of [1,2,3,8,12])for(const scale of [1,-1,1e-250,-1e250,1e300]){
    const input={points:Array.from({length:degree+1},(_,i)=>({x:Math.sin(i)*20,y:Math.cos(i)*10})),degree,weights:Array.from({length:degree+1},(_,i)=>1+i%3)};
    const original=nurbsCurve(input),inserted=insertSplineKnot({...original,t:0.4});inserted.weights=inserted.weights.map(w=>w*scale);
    const result=remove('nurbsCurve',inserted,0.4);
    assert.ok(result.weights.every(w=>Math.sign(w)===Math.sign(scale)));assert.ok(result.weights.every(Number.isFinite));
    // Evaluation is independently scaled here to avoid raw evaluation overflow.
    const normalized={...result,weights:result.weights.map(w=>w/scale)};
    assert.ok(deviation(original,normalized,true)<1e-7);
  }
});
test('removal supports unclamped domains and merges coincident sides of a full discontinuity',()=>{
  for(let degree=1;degree<=8;degree++){
    const input={points:Array.from({length:degree+4},(_,i)=>({x:i,y:Math.sin(i)})),degree,knots:Array.from({length:2*degree+5},(_,i)=>i-3)};
    const model=bSplineCurve(input),t=model.knots[degree]+0.4,result=removeSplineKnot({...insertSplineKnot({...model,t}),t});
    assert.ok(result);assert.ok(deviation(model,result)<1e-8);
  }
  const input={points:[{x:0,y:0},{x:1,y:1},{x:1,y:1},{x:2,y:0}],degree:1,knots:[0,0,0.5,0.5,1,1],t:0.5,tolerance:0};
  const result=removeSplineKnot(input);assert.ok(result);assert.equal(result.removal.errorBound,0);assert.equal(deviation(input,result),0);
  assert.equal(removeSplineKnot({...input,points:input.points.map((p,i)=>({...p,y:p.y+(i===2?1:0)}))}),null);
});
test('control-basis deviation bounds reject tight tolerances and bound accepted approximation across the curve',()=>{
  for(const weights of [undefined,[1,2,3,1],[-1,-2,-3,-1]]){
    const create=weights?nurbsCurve:bSplineCurve,original=create({points,degree:3,...(weights?{weights}:{})});
    const input=insertSplineKnot({...original,t:0.37});input.points[2]={...input.points[2],y:input.points[2].y+0.002};
    assert.equal(removeSplineKnot({...input,t:0.37,tolerance:1e-7}),null);
    const result=removeSplineKnot({...input,t:0.37,tolerance:1});assert.ok(result);
    assert.ok(result.removal.errorBound>0.0001);assert.ok(deviation(input,result,!!weights)<=result.removal.errorBound+1e-10);
    assert.equal(removeSplineKnot({...input,t:0.37,tolerance:result.removal.errorBound/2}),null);
  }
});
test('invalid knots weights tolerances capacity and sparse inputs fail before replacement execution',()=>{
  let calls=0;const callback=v=>{calls++;return removeSplineKnot(v);};
  for(const t of [NaN,Infinity,-1,0,1,0.5])assert.throws(()=>remove('bSplineCurve',refined,t,1e-7,callback));
  for(const tolerance of [NaN,Infinity,-1,1e6+1])assert.throws(()=>remove('bSplineCurve',refined,0.37,tolerance,callback));
  for(const input of [base,{...refined,periodic:true},{...refined,points:[undefined,...refined.points.slice(1)]}])assert.throws(()=>remove('bSplineCurve',input,0.37,1e-7,callback));
  for(const weights of [[0,1,1,1,1],[1,-1,1,1,1],[0,0,0,0,0]])assert.throws(()=>remove('nurbsCurve',{...refined,weights},0.37,1e-7,callback));
  assert.equal(calls,0);assert.throws(()=>remove('circle',refined,0.37));
  for(const field of ['points','knots']){const input=structuredClone(refined);delete input[field][1];assert.equal(removeSplineKnot({...input,t:0.37}),null);}
  assert.equal(removeSplineKnot({...refined,t:0.37,weights:[1,1,Number.MIN_VALUE,1e308,1]}),null,'normalization underflow');
  assert.equal(removeSplineKnot({...refined,t:0.37,points:refined.points.map((p,i)=>({...p,x:i? -1e308:1e308}))}),null,'coordinate subtraction overflow');
});
test('replacement results are structurally and geometrically checked regardless of reported deviation',()=>{
  const input={...refined,t:0.37,tolerance:1e-7},good=removeSplineKnot(input);
  for(const change of [r=>null,r=>({...r,degree:2}),r=>({...r,points:r.points.slice(1)}),r=>({...r,knots:[...r.knots,1]}),r=>({...r,periodic:true}),r=>({...r,weights:r.points.map(()=>1)}),
    r=>({...r,points:r.points.map(p=>({...p,x:Infinity}))}),r=>({...r,points:Array(r.points.length)}),
    r=>({...r,points:r.points.map((p,i)=>({...p,x:p.x+(i===0?1:0)})),removal:{errorBound:0}})]){
    assert.throws(()=>remove('bSplineCurve',input,0.37,1e-7,()=>change(structuredClone(good))));
  }
  const lied={...structuredClone(good),removal:{t:999,tolerance:1e6,errorBound:999}},checked=validateSplineKnotRemoval(input,lied);
  assert.equal(checked.removal.t,0.37);assert.equal(checked.removal.tolerance,1e-7);assert.equal(checked.removal.errorBound,good.removal.errorBound);
  const rational=insertSplineKnot({...nurbsCurve({points,degree:3,weights:[1,2,1,3]}),t:0.37}),result=removeSplineKnot({...rational,t:0.37});
  for(const weights of [result.weights.map(w=>-w),result.weights.map((w,i)=>i? w:0),result.weights.map((w,i)=>i?w:w*2)])
    assert.throws(()=>remove('nurbsCurve',rational,0.37,1e-7,()=>({...result,weights,removal:{errorBound:0}})));
});
test('model and adapter isolate caller data replacement mutations and returned arrays',()=>{
  const input={...refined,t:0.37},before=structuredClone(input);const result=removeSplineKnot(input);assert.deepEqual(input,before);
  assert.throws(()=>remove('bSplineCurve',input,0.37,1e-7,v=>{v.points[0].x=999;v.knots[0]=-999;throw Error('replacement failed');}),/replacement failed/);assert.deepEqual(input,before);
  const checked=remove('bSplineCurve',input,0.37,1e-7,()=>result);result.points[0].x=999;result.knots[0]=-999;assert.notEqual(checked.points[0].x,999);assert.notEqual(checked.knots[0],-999);assert.deepEqual(input,before);
});
test('removal provenance and reduced source models survive repeated SVG reconstruction without resampling controls',()=>{
  for(const name of ['bSplineCurve','nurbsCurve']){
    const create=name==='bSplineCurve'?bSplineCurve:nurbsCurve,original=create({points,degree:3,...(name==='nurbsCurve'?{weights:[1,2,1,3]}:{})});
    const input=insertSplineKnot({...original,t:0.37}),next=remove(name,input,0.37),model=create(next),path=pathData(prepareGeometry(model));
    const refinement={tool:'removeSplineKnot',id:'default',algorithm:'Inverse Boehm',...next.removal};
    for(let i=0;i<3;i++){
      const source=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:name,refinement}),path);
      assert.deepEqual(source.refinement,refinement);assert.equal(source.input.points.length,4);assert.deepEqual(create(source.input),model);
    }
    assert.ok(deviation(original,model,name==='nurbsCurve')<1e-7);
  }
});
test('exact linear removal accepts zero tolerance and local error estimates are invariant under ordinary translations',()=>{
  const line={points:[{x:0,y:0},{x:1,y:1},{x:2,y:2}],degree:1,knots:[0,0,0.5,1,1],t:0.5,tolerance:0};
  const result=removeSplineKnot(line);assert.ok(result);assert.equal(result.removal.errorBound,0);
  for(const dx of [-100,0,100]){
    const input={...line,points:line.points.map((p,i)=>({x:p.x+dx,y:p.y+(i===1?0.01:0)})),tolerance:0.02},next=removeSplineKnot(input);
    assert.ok(next);assert.ok(Math.abs(next.removal.errorBound-0.01)<1e-12);assert.ok(deviation(input,next)<=next.removal.errorBound+1e-12);
  }
});
