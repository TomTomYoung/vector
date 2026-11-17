import test from 'node:test';
import assert from 'node:assert/strict';
import {insertEditableSplineKnot} from '../src/adapters/splineRefinement.js';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint,insertSplineKnot} from '../src/model/splines.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const points=[{x:0,y:0},{x:30,y:90},{x:60,y:0},{x:90,y:30}];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function sameCurve(a,b,rational=false){
  const evalAt=rational?nurbsPoint:bSplinePoint,start=a.knots[a.degree],end=a.knots[a.points.length];
  for(let i=0;i<=120;i++){const t=start+(end-start)*i/120,p=evalAt({...a,t}),q=evalAt({...b,t});assert.ok(p&&q);near(p.x,q.x);near(p.y,q.y);}
}
test('editable knot insertion preserves nonuniform B-splines through degree twelve and stops at the multiplicity bound',()=>{
  for(let degree=1;degree<=12;degree++){
    const input={points:Array.from({length:degree+4},(_,i)=>({x:i,y:Math.sin(i)})),degree,knots:[...Array(degree+1).fill(-2),-1,0.2,3,...Array(degree+1).fill(5)]};
    const model=bSplineCurve(input);let next=insertEditableSplineKnot('bSplineCurve',input,1.4);sameCurve(model,bSplineCurve(next));
    for(let i=1;i<degree;i++){next=insertEditableSplineKnot('bSplineCurve',next,0.2);sameCurve(model,bSplineCurve(next));}
    assert.equal(next.points.length,input.points.length+degree);
  }
});
test('rational refinement preserves positive zero and signed weights whenever the inserted finite controls are representable',()=>{
  for(const weights of [[1,2,3,4],[1,0,2,1],[1,-0.2,1,1],[-1,-2,-3,-4]]){
    const input={points,degree:3,weights},before=nurbsCurve(input),next=insertEditableSplineKnot('nurbsCurve',input,0.23);
    sameCurve(before,nurbsCurve(next),true);assert.equal(next.weights.length,5);
  }
});
test('refinement validates before invocation and preserves inputs and unrelated control point identity by value',()=>{
  const input={points,degree:3},before=structuredClone(input);let calls=0;
  const execute=value=>{calls++;return insertSplineKnot(value);};
  for(const t of [NaN,Infinity,-1,0,1,2])assert.throws(()=>insertEditableSplineKnot('bSplineCurve',input,t,execute));
  assert.equal(calls,0);assert.throws(()=>insertEditableSplineKnot('circle',input,0.5,execute));assert.throws(()=>insertEditableSplineKnot('bSplineCurve',{...input,periodic:true,knots:[0,1]},0.5,execute));
  const next=insertEditableSplineKnot('bSplineCurve',input,0.5,execute);assert.equal(calls,1);assert.deepEqual(input,before);assert.deepEqual(next.points[0],points[0]);assert.deepEqual(next.points.at(-1),points.at(-1));next.points[0].x=900;assert.deepEqual(input,before);
});
test('full multiplicities capacity invalid models and unrepresentable homogeneous results fail without partial updates',()=>{
  const input={points,degree:3},before=structuredClone(input);let next=input;
  for(let i=0;i<3;i++)next=insertEditableSplineKnot('bSplineCurve',next,0.5);
  assert.throws(()=>insertEditableSplineKnot('bSplineCurve',next,0.5),/重複度/);
  assert.throws(()=>insertEditableSplineKnot('bSplineCurve',{points:Array.from({length:1000},(_,i)=>({x:i,y:i})),degree:3},0.4),/1000/);
  assert.throws(()=>insertEditableSplineKnot('bSplineCurve',{...input,points:[{x:NaN,y:0},...points.slice(1)]},0.5));
  assert.throws(()=>insertEditableSplineKnot('nurbsCurve',{points:points.slice(0,2),degree:1,weights:[1,-1]},0.5));
  assert.throws(()=>insertEditableSplineKnot('nurbsCurve',{points:points.map(p=>({x:1e308,y:p.y})),degree:3,weights:[1e308,1e308,1e308,1e308]},0.5));
  assert.deepEqual(input,before);
});
test('replacement insertion implementations get isolated data and must return a compatible finite refinement',()=>{
  const input={points,degree:3},before=structuredClone(input);
  const good=insertSplineKnot({...bSplineCurve(input),t:0.5});
  for(const change of [r=>null,r=>({...r,degree:2}),r=>({...r,points:r.points.slice(1)}),r=>({...r,knots:[...r.knots,1]}),r=>({...r,weights:r.points.map(()=>1)}),r=>({...r,periodic:true}),r=>({...r,points:r.points.map(p=>({...p,x:Infinity}))})])
    assert.throws(()=>insertEditableSplineKnot('bSplineCurve',input,0.5,()=>change(structuredClone(good))));
  assert.throws(()=>insertEditableSplineKnot('bSplineCurve',input,0.5,value=>{value.points[0].x=400;value.knots[0]=-400;throw Error('external failed');}),/external failed/);
  assert.deepEqual(input,before);assert.deepEqual(insertEditableSplineKnot('bSplineCurve',input,0.5,()=>good).knots,good.knots);
});
test('refined saved models recover inserted knots without accumulated controls or altered shape',()=>{
  for(const name of ['bSplineCurve','nurbsCurve']){
    const create=name==='bSplineCurve'?bSplineCurve:nurbsCurve;
    const initial={points,degree:3,...(name==='nurbsCurve'?{weights:[1,2,1,3]}:{})},refined=insertEditableSplineKnot(name,initial,0.3),model=create(refined),path=pathData(prepareGeometry(model));
    const record={version:1,tool:name,refinement:{tool:'insertSplineKnot',id:'default',algorithm:'Boehm',source:'src/model/splines.js',t:0.3}};
    const result=readSplineSource(JSON.stringify({version:1,model,path}),JSON.stringify(record),path);assert.deepEqual(result.refinement,record.refinement);
    assert.deepEqual(create(result.input),model);assert.equal(result.input.points.length,5);assert.ok(result.input.knots.includes(0.3));sameCurve(create(initial),model,name==='nurbsCurve');
  }
});
