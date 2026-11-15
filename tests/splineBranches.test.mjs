import test from 'node:test';
import assert from 'node:assert/strict';
import {bSplineCurve, nurbsCurve, splineBezierSpans, sampleSplineBranches, sampleSplineCurve} from '../src/model/splineCurves.js';
import {bSplinePoint, nurbsPoint, bSplineDerivative} from '../src/model/splines.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
const p = (x,y) => ({x,y});
const near = (a,b,e=1e-8) => assert.ok(Math.abs(a-b)<=e, `${a} != ${b}`);
const pointNear = (a,b,e) => {near(a.x,b.x,e); near(a.y,b.y,e);};
function homogeneous(controls, t) {
  let row=controls;
  while(row.length>1)row=row.slice(1).map((b,i)=>Object.fromEntries(['x','y','w'].map(k=>[k,(1-t)*row[i][k]+t*b[k]])));
  return p(row[0].x/row[0].w,row[0].y/row[0].w);
}

test('polar de Boor extraction matches direct evaluation on nonuniform and repeated knot spans through degree 12',()=>{
  for(let degree=1;degree<=12;degree++){
    const points=Array.from({length:degree+7},(_,i)=>p(i*5,Math.sin(i)*7));
    const knots=[...Array(degree+1).fill(0),0.01,0.07,0.07,0.19,0.7,0.91,...Array(degree+1).fill(1)];
    const shape=nurbsCurve({points,degree,knots,weights:points.map((_,i)=>1+i%3)});
    for(const span of splineBezierSpans(shape))for(let i=1;i<20;i++){
      const t=i/20;
      pointNear(homogeneous(span.controls,t),nurbsPoint({...shape,t:span.from+(span.to-span.from)*t}),1e-10);
    }
  }
});

test('full-multiplicity knots form independent SVG subpaths with exact one-sided endpoints',()=>{
  const shape=bSplineCurve({points:[p(0,0),p(1,2),p(10,4),p(11,6)],degree:1,knots:[0,0,0.5,0.5,1,1]});
  const r=sampleSplineBranches(shape,{sampleCount:2});
  assert.equal(r.complete,true); assert.equal(r.branches.length,2);
  assert.deepEqual(r.branches.map(b=>[b.points[0],b.points.at(-1)]),[[p(0,0),p(1,2)],[p(10,4),p(11,6)]]);
  const d=pathData(prepareGeometry(shape));assert.equal(d.match(/M/g).length,2);
  assert.throws(()=>sampleSplineCurve(shape),/sampleSplineBranches/);
  const joined=bSplineCurve({points:[p(0,0),p(1,2),p(10,4)],degree:1});
  assert.equal(sampleSplineBranches(joined).branches.length,1);
});

test('uniform periodic B-splines and weighted NURBS close through the seam and retain the source control count',()=>{
  for(let degree=1;degree<=6;degree++){
    const points=Array.from({length:degree+4},(_,i)=>p(Math.cos(i)*100,Math.sin(i)*80));
    const shape=bSplineCurve({points,degree,periodic:true});
    const end=shape.knots[shape.points.length];
    assert.equal(shape.controlCount,points.length);
    assert.equal(shape.points.length,points.length+degree);
    pointNear(bSplinePoint({...shape,t:0}),bSplinePoint({...shape,t:end}));
    if(degree>=2)pointNear(bSplineDerivative({...shape,t:0}),bSplineDerivative({...shape,t:end}));
    const weighted=nurbsCurve({points,degree,periodic:true,weights:points.map((_,i)=>1+i)});
    pointNear(nurbsPoint({...weighted,t:0}),nurbsPoint({...weighted,t:end}));
    const r=sampleSplineBranches(weighted);assert.equal(r.closed,true);
    pointNear(r.branches[0].points[0],r.branches[0].points.at(-1));
    assert.match(pathData(prepareGeometry(weighted)),/Z$/);
  }
  assert.equal(bSplineCurve({points:[p(0,0),p(1,1)],degree:1,periodic:true,knots:[0,0,1,1]}),null);
});

test('signed and zero weights preserve finite curves and homogeneous scale invariance',()=>{
  const points=[p(0,0),p(1,2),p(2,0)];
  for(const weights of [[1,-0.2,1],[1,0,1],[-1,-2,-1]]){
    const result=sampleSplineBranches(nurbsCurve({points,degree:2,weights}));
    assert.equal(result.complete,true);assert.equal(result.branches.length,1);
    for(const scale of [-1,1e-300,1e300]){
      const other=sampleSplineBranches(nurbsCurve({points,degree:2,weights:weights.map(w=>w*scale)}));
      assert.equal(other.complete,true);
      assert.equal(other.branches[0].points.length,result.branches[0].points.length);
      other.branches[0].points.forEach((q,i)=>pointNear(q,result.branches[0].points[i]));
    }
  }
});

test('denominator bounds isolate double roots and two poles even with only two requested samples',()=>{
  const points=[p(0,0),p(1,2),p(2,0)];
  const two=[(1-1/Math.sqrt(3))/2,(1+1/Math.sqrt(3))/2];
  const close=[0.493,0.507], product=close[0]*close[1];
  for(const [weights,roots] of [[[1,-1,1],[0.5]],[[1,-2,1],two],[[product,product-0.5,product],close]]){
    const shape=nurbsCurve({points,degree:2,weights}), r=sampleSplineBranches(shape,{sampleCount:2});
    assert.equal(r.complete,false);assert.equal(r.branches.length,roots.length+1);
    for(const root of roots){
      assert.ok(r.omitted.some(g=>g.from<=root&&g.to>=root),'root omitted');
      for(const b of r.branches)assert.ok(!(b.from<=root&&root<=b.to),'no line bridges root');
    }
    assert.ok(r.branches.flatMap(b=>b.points).every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)));
    const prepared=prepareGeometry(shape);assert.ok(prepared.warning);
    assert.equal(pathData(prepared).match(/M/g).length,r.branches.length);
    assert.equal(prepared.closed,false);
  }
});

test('zero denominator spans and endpoint zeros are omitted explicitly, including removable singularities',()=>{
  const endpoint=nurbsCurve({points:[p(0,0),p(1,2),p(2,0)],degree:2,weights:[0,0,1]});
  assert.equal(sampleSplineBranches(endpoint).omitted[0].from,0);
  const shape=nurbsCurve({points:[p(0,0),p(1,1),p(2,2),p(3,3)],degree:1,weights:[1,1,0,0],knots:[0,0,0.5,0.5,1,1]});
  const r=sampleSplineBranches(shape);assert.equal(r.branches.length,1);
  assert.deepEqual(r.omitted,[{from:0.5,to:1,reason:'near-zero'}]);
  const removable=nurbsCurve({points:[p(1,1),p(1,1),p(1,1)],degree:2,weights:[1,-1,1]});
  assert.equal(sampleSplineBranches(removable).complete,false);
});

test('depth and work budgets report missing intervals instead of joining unclassified poles',()=>{
  const shape=nurbsCurve({points:[p(0,0),p(1,2),p(2,0)],degree:2,weights:[1,-2,1]});
  const depth=sampleSplineBranches(shape,{maxDepth:0});
  assert.equal(depth.complete,false);assert.equal(depth.branches.length,0);
  assert.deepEqual(depth.omitted,[{from:0,to:1,reason:'unresolved'}]);
  const budget=sampleSplineBranches(shape,{maxNodes:1});
  assert.equal(budget.complete,false);assert.equal(budget.nodes,1);
  assert.deepEqual(budget.omitted,[{from:0,to:1,reason:'budget'}]);
  assert.equal(prepareGeometry(shape,'default',{maxDepth:0}),null);
  for(const options of [{sampleCount:1},{poleTolerance:0},{maxDepth:25},{maxNodes:0}])assert.throws(()=>sampleSplineBranches(shape,options));
});

test('curve inputs are immutable and reject malformed points, weights and excessive knot multiplicity',()=>{
  const input={points:[p(0,0),p(1,1),p(2,0)],degree:2,periodic:true,weights:[1,0,-1]},before=structuredClone(input);
  const shape=nurbsCurve(input);sampleSplineBranches(shape);assert.deepEqual(input,before);
  shape.points[0].x=42;shape.weights[0]=9;assert.deepEqual(input,before);
  for(const change of [{points:[null,p(0,0),p(1,1)]},{weights:[0,0,0]},{weights:[1,Infinity,1]},{periodic:'true'}])assert.equal(nurbsCurve({...input,...change}),null);
  assert.equal(bSplineCurve({points:[p(0,0),p(1,1),p(2,0)],degree:1,knots:[0,0,0,1,1]}),null);
  assert.equal(bSplineCurve({points:[p(0,0),p(1,1)],degree:1,knots:[-1e308,-1e308,1e308,1e308]}),null);
});
