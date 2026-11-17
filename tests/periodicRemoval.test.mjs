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
const points=n=>Array.from({length:n},(_,i)=>({x:Math.cos(i)*20,y:Math.sin(i)*30}));
const base={points:points(5),degree:3,periodic:true,periodicKnots:[0.1,0.3,1,1.4,1.7,2]};
function deviation(a,b,rational=false){
  const at=rational?nurbsPoint:bSplinePoint,lo=a.knots[a.degree],hi=a.knots[a.points.length];let max=0;
  for(let i=0;i<=120;i++){
    const t=i===120?hi:lo+(hi-lo)*i/120,p=at({...a,t}),q=at({...b,t});assert.ok(p&&q);
    max=Math.max(max,Math.hypot(p.x-q.x,p.y-q.y));
  }
  return max;
}
test('periodic removal recovers minimal and larger curves through degree twelve with nonuniform decimal knots',()=>{
  for(let degree=1;degree<=12;degree++)for(const count of [degree+1,degree+4])for(const rational of [false,true]){
    const name=rational?'nurbsCurve':'bSplineCurve',create=rational?nurbsCurve:bSplineCurve;
    const u=Array.from({length:count+1},(_,i)=>0.1+i*i/7),input={points:points(count),degree,periodic:true,periodicKnots:u,...(rational?{weights:points(count).map((_,i)=>1+i%3)}:{})};
    for(const fraction of [0.019,0.37,0.99]){
      const t=u[0]+(u.at(-1)-u[0])*fraction,added=insert(name,input,t),result=remove(name,added,t);
      assert.equal(result.points.length,count);assert.deepEqual(result.periodicKnots,u);assert.ok(deviation(create(input),create(result),rational)<1e-7);
      assert.equal(result.removal.periodic.copies,3);assert.ok(result.removal.errorBound<=1e-7);
    }
  }
});
test('either endpoint removes one seam copy across leading trailing and split repeats without moving the domain',()=>{
  for(const name of ['bSplineCurve','nurbsCurve'])for(const shift of [0,1,2]){
    const create=name==='bSplineCurve'?bSplineCurve:nurbsCurve,input={...base,...(name==='nurbsCurve'?{weights:[1,2,1,3,1]}:{})},original=create(input);
    let current=insert(name,insert(name,input,0.1),2);
    const rotate=v=>[...v.slice(shift),...v.slice(0,shift)];
    current={...current,points:rotate(current.points),periodicKnots:[...current.periodicKnots.slice(shift),...Array(shift).fill(2)],...(current.weights?{weights:rotate(current.weights)}:{})};
    for(let i=0;i<2;i++){
      const left=remove(name,current,0.1),right=remove(name,current,2);
      assert.deepEqual(left.points,right.points);assert.deepEqual(left.periodicKnots,right.periodicKnots);assert.equal(right.removal.t,2);assert.equal(right.removal.periodic.t,0.1);assert.equal(right.removal.periodic.copies,2);
      assert.ok(deviation(original,create(right),name==='nurbsCurve')<1e-7);current=right;
    }
    assert.deepEqual(current.periodicKnots,base.periodicKnots);assert.throws(()=>remove(name,current,2),/継ぎ目の移動後/);
  }
});
test('repeated interior removal and rational circles retain their original curve and closed rendering',()=>{
  for(let degree=2;degree<=8;degree++){
    const input={points:points(degree+3),degree,periodic:true},original=bSplineCurve(input);let current=input;
    for(let i=0;i<degree;i++)current=insert('bSplineCurve',current,1.4);
    for(let i=0;i<degree;i++){current=remove('bSplineCurve',current,1.4);assert.ok(deviation(original,bSplineCurve(current))<1e-7);}
    assert.throws(()=>remove('bSplineCurve',current,1.4));
  }
  const circle={points:[{x:1,y:-1},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:-1,y:1},{x:-1,y:0},{x:-1,y:-1},{x:0,y:-1}],degree:2,periodic:true,
    periodicKnots:[0,0,1,1,3,3,6,6,10],weights:Array.from({length:8},(_,i)=>i%2?1:Math.SQRT1_2)};
  const result=remove('nurbsCurve',insert('nurbsCurve',circle,0.4),0.4),model=nurbsCurve(result),sample=sampleSplineBranches(model);
  assert.equal(sample.closed,true);for(const p of sample.branches[0].points)assert.ok(Math.abs(p.x*p.x+p.y*p.y-1)<1e-10);
  assert.match(pathData(prepareGeometry(model)),/Z$/);
});
test('periodic NURBS removal keeps positive and negative common weight scales including very large weights',()=>{
  const input={...base,weights:[1,2,1,3,1]},original=nurbsCurve(input),added=insert('nurbsCurve',input,0.7);
  for(const scale of [1,-1,1e-250,-1e250,1e300]){
    const scaled={...added,weights:added.weights.map(w=>w*scale)},result=remove('nurbsCurve',scaled,0.7);
    assert.ok(result.weights.every(w=>Number.isFinite(w)&&Math.sign(w)===Math.sign(scale)));
    assert.ok(deviation(original,nurbsCurve({...result,weights:result.weights.map(w=>w/scale)}),true)<1e-7);
  }
});
test('final periodic verification checks accumulated deviation after wrapping instead of trusting individual removals',()=>{
  const added=insert('bSplineCurve',base,0.7),tolerance=0.01;let calls=0;
  const shifted=amount=>value=>{
    calls++;const result=removeSplineKnot(value);assert.ok(result);
    result.points=result.points.map(p=>({x:p.x+amount,y:p.y}));result.removal.errorBound=0;return result;
  };
  assert.throws(()=>remove('bSplineCurve',added,0.7,tolerance,shifted(tolerance*0.4)),/周期再構成後/);assert.equal(calls,3);
  calls=0;const result=remove('bSplineCurve',added,0.7,tolerance,shifted(tolerance*0.2));assert.equal(calls,3);
  const actual=deviation(bSplineCurve(added),bSplineCurve(result));assert.ok(actual>0.0059);assert.ok(actual<=result.removal.errorBound+1e-10);assert.ok(result.removal.errorBound<=tolerance);
});
test('late failures malformed replacement results and caller mutations never leak a partial periodic result',()=>{
  const added=insert('nurbsCurve',{...base,weights:[1,2,1,3,1]},0.7),before=structuredClone(added);
  for(const failAt of [2,3]){
    let calls=0;assert.throws(()=>remove('nurbsCurve',added,0.7,1e-7,value=>{
      if(++calls===failAt){value.points[0].x=999;value.weights[0]=999;throw Error('late removal failure');}
      return removeSplineKnot(value);
    }),/late removal failure/);assert.equal(calls,failAt);assert.deepEqual(added,before);
  }
  assert.throws(()=>remove('nurbsCurve',added,0.7,1e-7,value=>{const result=removeSplineKnot(value);result.points[0].x+=100;result.removal.errorBound=0;return result;}),/出力が不正/);
  assert.deepEqual(added,before);const result=remove('nurbsCurve',added,0.7);result.points[0].x=999;result.weights[0]=999;assert.deepEqual(added,before);
});
test('invalid periodic removals reject unrepresentable seam shifts missing knots and unrepresentable expansion before callbacks',()=>{
  let calls=0;const callback=v=>{calls++;return removeSplineKnot(v);};
  for(const t of [NaN,Infinity,0,0.7,2.1,0.1,2])assert.throws(()=>remove('bSplineCurve',base,t,1e-7,callback));
  for(const tolerance of [NaN,Infinity,-1,1e6+1])assert.throws(()=>remove('bSplineCurve',base,1,tolerance,callback));
  assert.throws(()=>remove('bSplineCurve',{points:points(4),degree:3,periodic:true},1,1e-7,callback),/制御点数/);
  const huge={...base,periodicKnots:[0,1e307,2e307,3e307,4e307,5e307]};assert.ok(bSplineCurve(huge));assert.throws(()=>remove('bSplineCurve',huge,2e307,1e-7,callback),/周期展開/);assert.equal(calls,0);
});
test('a thousand original controls use the bounded 3012-control evaluation path without changing editable curve limits',()=>{
  const input={points:points(999),degree:12,periodic:true},added=insert('bSplineCurve',input,0.4);let maximum=0,calls=0;
  const result=remove('bSplineCurve',added,0.4,1e-7,value=>{maximum=Math.max(maximum,value.points.length);calls++;return removeSplineKnot(value);});
  assert.equal(maximum,3012);assert.equal(calls,3);assert.equal(result.points.length,999);assert.equal(bSplineCurve(result).points.length,1011);
  assert.equal(bSplineCurve({points:points(1001),degree:3}),null);
  assert.equal(removeSplineKnot({points:points(3013),degree:3,t:0.5}),null);
});
test('periodic removal saves reduced original controls and full deviation provenance through repeated source reconstruction',()=>{
  for(const name of ['bSplineCurve','nurbsCurve']){
    const create=name==='bSplineCurve'?bSplineCurve:nurbsCurve,input={...base,...(name==='nurbsCurve'?{weights:[1,2,1,3,1]}:{})};
    const result=remove(name,insert(name,input,2),2),model=create(result),path=pathData(prepareGeometry(model));
    const refinement={tool:'removeSplineKnot',id:'default',algorithm:'Inverse Boehm',...result.removal};
    for(let i=0;i<3;i++){
      const source=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:name,refinement}),path);
      assert.deepEqual(source.refinement,refinement);assert.equal(source.input.points.length,5);assert.deepEqual(create(source.input),model);
    }
  }
});
