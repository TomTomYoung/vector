import test from 'node:test';
import assert from 'node:assert/strict';
import {insertEditableSplineKnot as insert} from '../src/adapters/splineRefinement.js';
import {bSplineCurve,nurbsCurve,sampleSplineBranches} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint,insertSplineKnot} from '../src/model/splines.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=n=>Array.from({length:n},(_,i)=>({x:Math.cos(i)*20,y:Math.sin(i)*30}));
const base={points:points(4),degree:3,periodic:true};
function same(a,b,rational=false){
  const at=rational?nurbsPoint:bSplinePoint,lo=a.knots[a.degree],hi=a.knots[a.points.length];
  for(let i=0;i<=120;i++){
    const t=i===120?hi:lo+(hi-lo)*i/120,p=at({...a,t}),q=at({...b,t});
    if(!p||!q){assert.equal(p,q);continue;}
    for(const k of ['x','y'])assert.ok(Math.abs(p[k]-q[k])<1e-8*Math.max(1,Math.abs(p[k])),`${t}: ${p[k]} != ${q[k]}`);
  }
}
test('periodic refinement preserves minimal and larger curves through degree twelve under nonuniform decimal knots',()=>{
  for(let degree=1;degree<=12;degree++)for(const count of [degree+1,degree+4])for(const decimal of [false,true]){
    const periodicKnots=Array.from({length:count+1},(_,i)=>(decimal?0.1:0)+i*i/(decimal?7:1));
    const input={points:points(count),degree,periodic:true,periodicKnots},initial=bSplineCurve(input);let current=input;
    for(const fraction of [0.19,0.63,0.99]){
      current=insert('bSplineCurve',current,periodicKnots[0]+(periodicKnots.at(-1)-periodicKnots[0])*fraction);
      same(initial,bSplineCurve(current));
    }
    assert.equal(current.points.length,count+3);assert.equal(current.periodicKnots.length,count+4);
    assert.deepEqual(bSplineCurve(current).points.slice(-degree),current.points.slice(0,degree));
  }
});
test('both seam endpoints refine the same curve and combine leading and trailing multiplicities',()=>{
  for(let degree=2;degree<=12;degree++)for(const split of [false,true]){
    const count=degree+2,u=Array.from({length:count+1},(_,i)=>0.1+i);
    if(split)u[count-1]=u[count];
    const input={points:points(count),degree,periodic:true,periodicKnots:u},initial=bSplineCurve(input);let current=input;
    const existing=split?2:1;
    for(let i=existing;i<degree;i++){
      const left=insert('bSplineCurve',current,u[0]),right=insert('bSplineCurve',current,u.at(-1));
      assert.deepEqual(left,right);same(initial,bSplineCurve(left));current=left;
    }
    assert.throws(()=>insert('bSplineCurve',current,u[0]),/重複度/);
  }
});
test('existing internal periodic knots can be refined to degree multiplicity without altering corners',()=>{
  for(let degree=2;degree<=12;degree++){
    const input={points:points(degree+2),degree,periodic:true},initial=bSplineCurve(input);let current=input;
    for(let i=1;i<degree;i++){current=insert('bSplineCurve',current,2);same(initial,bSplineCurve(current));}
    assert.throws(()=>insert('bSplineCurve',current,2),/重複度/);assert.equal(sampleSplineBranches(bSplineCurve(current)).closed,true);
  }
});
test('periodic rational insertion preserves an exact nonuniform circle and signed or zero weight curves',()=>{
  const circle={points:[{x:1,y:-1},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:-1,y:1},{x:-1,y:0},{x:-1,y:-1},{x:0,y:-1}],degree:2,periodic:true,
    periodicKnots:[0,0,1,1,3,3,6,6,10],weights:Array.from({length:8},(_,i)=>i%2?1:Math.SQRT1_2)};
  let current=circle;for(const t of [0.4,2,4.2,9])current=insert('nurbsCurve',current,t);
  same(nurbsCurve(circle),nurbsCurve(current),true);
  for(const p of sampleSplineBranches(nurbsCurve(current)).branches[0].points)assert.ok(Math.abs(p.x*p.x+p.y*p.y-1)<1e-10);
  for(const weights of [[1,2,3,4],[1,0,2,1],[1,-0.2,1,1],[-1,-2,-3,-4]])for(const t of [0,1.37,4]){
    const input={...base,weights},next=insert('nurbsCurve',input,t);same(nurbsCurve(input),nurbsCurve(next),true);assert.equal(next.weights.length,5);
  }
  const poles={points:points(8),degree:2,periodic:true,periodicKnots:[0,0,1,1,2,2,3,3,4],weights:[1,-1,1,-1,1,-1,1,-1]};
  const refined=insert('nurbsCurve',poles,0.23),sample=sampleSplineBranches(nurbsCurve(refined));
  same(nurbsCurve(poles),nurbsCurve(refined),true);assert.equal(sample.closed,false);assert.ok(sample.omitted.length>=4);
});
test('periodic insertion validates before callbacks and reaches the original-control capacity without wrapping growth',()=>{
  let calls=0;const callback=v=>{calls++;return insertSplineKnot(v);};
  for(const t of [NaN,Infinity,-1,5])assert.throws(()=>insert('bSplineCurve',base,t,callback));
  assert.throws(()=>insert('bSplineCurve',{...base,degree:1},0,callback),/重複度/);
  assert.throws(()=>insert('bSplineCurve',{points:points(1000),degree:3,periodic:true},0.5,callback),/1000/);assert.equal(calls,0);
  const next=insert('bSplineCurve',{points:points(999),degree:3,periodic:true},0.5,callback);
  assert.equal(next.points.length,1000);assert.equal(bSplineCurve(next).points.length,1003);assert.equal(calls,3);
  assert.throws(()=>insert('bSplineCurve',next,0.7,callback),/1000/);
});
test('unrepresentable translated intervals and homogeneous results reject refinement without mutating inputs',()=>{
  for(const [input,t] of [[{...base,periodicKnots:[0,1e307,2e307,3e307,4e307]},1.5e307],[{...base,periodicKnots:[0,1,2,3,4]},Number.MIN_VALUE]]){
    assert.ok(bSplineCurve(input));const before=structuredClone(input);let calls=0;
    assert.throws(()=>insert('bSplineCurve',input,t,v=>{calls++;return insertSplineKnot(v);}));
    assert.deepEqual(input,before);assert.equal(calls,0);
  }
  const input={points:points(2),degree:1,periodic:true,weights:[1,-1]},before=structuredClone(input);
  assert.throws(()=>insert('nurbsCurve',input,0.5));assert.deepEqual(input,before);
});
test('periodic replacement calls are isolated and late failure or inconsistent seam cannot leak partial results',()=>{
  const input={...base,weights:[1,2,3,4]},before=structuredClone(input);
  for(const failAt of [2,3]){
    let calls=0;assert.throws(()=>insert('nurbsCurve',input,0.37,v=>{
      if(++calls===failAt){v.points[0].x=900;v.weights[0]=999;throw Error('late failure');}return insertSplineKnot(v);
    }),/late failure/);assert.equal(calls,failAt);assert.deepEqual(input,before);
  }
  let calls=0;const result=insert('nurbsCurve',input,4,v=>{calls++;assert.equal(v.periodic,undefined);return insertSplineKnot(v);});
  assert.equal(calls,2);same(nurbsCurve(input),nurbsCurve(result),true);result.points[0].x=900;assert.deepEqual(input,before);
  assert.throws(()=>insert('nurbsCurve',input,0.37,v=>{const r=insertSplineKnot(v);r.points=r.points.map((p,i)=>({x:p.x+i,y:p.y}));return r;}),/継ぎ目/);
});
test('periodic refined models round trip saved SVG sources with one-period controls and provenance',()=>{
  for(const name of ['bSplineCurve','nurbsCurve']){
    const create=name==='bSplineCurve'?bSplineCurve:nurbsCurve;let input={...base,weights:[1,2,1,3],periodicKnots:[0.1,0.1,1,2,2]};
    const original=create(input);for(const t of [0.3,1.4,0.7]){
      input=insert(name,input,t);const model=create(input),path=pathData(prepareGeometry(model));
      const refinement={tool:'insertSplineKnot',id:'default',t,periodic:{algorithm:'3周期展開',t,copies:3}};
      const saved=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify({version:1,tool:name,refinement}),path);
      assert.deepEqual(saved.refinement,refinement);assert.equal(saved.input.points.length,input.points.length);assert.deepEqual(create(saved.input),model);input=saved.input;same(original,model,name==='nurbsCurve');
    }
  }
});
