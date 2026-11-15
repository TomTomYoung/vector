import test from 'node:test';
import assert from 'node:assert/strict';
import {createToolset, toolNames} from '../src/model/tools.js';
import {deCasteljau} from '../src/model/bezier.js';
import {orientationSign, exactInsideCircle} from '../src/model/exactPredicates.js';
import {orientation} from '../src/model/predicates.js';
import {sampleSplineCurve} from '../src/model/splineCurves.js';
import {prepareGeometry, bernsteinPoint, createRenderRegistry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
import {closestOnSegment, distance} from '../src/utils/geometry.js';
const p = (x,y) => ({x,y}), near = (a,b,e=1e-8) => assert.ok(Math.abs(a-b)<=e, `${a} != ${b}`);
const pointNear = (a,b,e) => {near(a.x,b.x,e);near(a.y,b.y,e);};
const run = createToolset();

test('every tool has implementation identity; selections are isolated and nested dispatch is traced', () => {
  for (const name of toolNames) {const d=run.describe(name); assert.ok(d?.algorithm && d.source, name);}
  const first=createToolset(), second=createToolset();
  first.register('line',{id:'external',label:'test',algorithm:'fixed endpoint',source:'test',run:()=>({kind:'segment',start:p(0,0),end:p(9,7)})});
  first.select('line','external');
  const input={vectors:[p(1,2),p(3,4)],indices:[0,1],method:'line'};
  assert.deepEqual(first('vertices',input).end,p(9,7));
  assert.deepEqual(first.trace().map(x=>x.tool),['vertices','line']);
  assert.equal(first.trace()[1].id,'external');
  assert.deepEqual(second('vertices',input).end,p(3,4));
  assert.throws(()=>first.select('line','missing'));
  assert.throws(()=>first.register('line',{id:'external',label:'duplicate',algorithm:'test',run:()=>null}));
  assert.match(createToolset({tools:{line:()=>null}}).describe('line').algorithm,/情報未指定/);
});

test('Catmull–Rom alternatives interpolate endpoints and preserve straight lines with uneven spacing', () => {
  const points=[p(0,0),p(1,2),p(5,10),p(12,24)];
  for (const implementation of ['uniform','centripetal','chordal']) {
    const curve=run('spline',{points},{implementation});
    let start=curve.start;
    curve.segments.forEach((s,i)=>{
      pointNear(start,points[i]); pointNear(s.end,points[i+1]);
      for(let j=0;j<=20;j++){const q=deCasteljau([start,s.control1,s.control2,s.end],j/20);near(q.y,2*q.x);}
      start=s.end;
    });
  }
  const nonuniform=[p(0,0),p(1,4),p(8,5),p(9,0)];
  assert.notDeepEqual(run('spline',{points:nonuniform},{implementation:'uniform'}),run('spline',{points:nonuniform},{implementation:'centripetal'}));
  assert.ok(run('spline',{points:[points[0],points[0],...points.slice(1)]},{implementation:'centripetal'}));
});

test('miter offset follows the chosen side around every corner and reports an excessive join', () => {
  const input={shape:{kind:'polyline',points:[p(0,0),p(10,0),p(10,10)]},point:p(0,-1),amount:2};
  const result=run('offset',input,{implementation:'miter'});
  assert.deepEqual(result.points,[p(0,-2),p(12,-2),p(12,10)]);
  assert.equal(run('offset',{...input,miterLimit:1},{implementation:'miter'}),null);
});

test('Jarvis and exact Andrew hulls agree on duplicates, collinear inputs and seeded point sets', () => {
  let seed=42; const draw=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%300;};
  const cases=[[p(0,0),p(1,1),p(2,2),p(0,0)],[]];
  for(let i=0;i<20;i++)cases.push(Array.from({length:30},()=>p(draw(),draw())));
  const keys=points=>points.map(q=>q.x+','+q.y).sort();
  for(const points of cases) for(const implementation of ['jarvis','exact']) assert.deepEqual(keys(run('convexHull',{points},{implementation})),keys(run('convexHull',{points})));
});

test('region-code clipping agrees with slab intervals for reversal, corners and zero-size boxes', () => {
  for(const box of [{x:0,y:0,width:10,height:10},{x:2,y:2,width:0,height:6}]) {
    for(let x=-8;x<=16;x+=3)for(let y=-6;y<=16;y+=4){
      const input={start:p(x,y),end:p(12-x,10-y),box};
      const a=run('clipSegmentToBox',input),b=run('clipSegmentToBox',input,{implementation:'cohen-sutherland'});
      assert.equal(!!a,!!b);if(a){pointNear(a.start,b.start);pointNear(a.end,b.end);}
    }
  }
});

test('BigInt predicates recover cancelled orientation and cocircular ties, preserving mesh vertices', () => {
  const a=p(0,0),b=p(134217729,134217728),c=p(134217728,134217727);
  assert.equal(orientation(a,b,c),0); assert.equal(orientationSign(a,b,c),-1);
  assert.equal(exactInsideCircle(p(0,0),p(4,0),p(0,4),p(4,4)),false);
  assert.equal(exactInsideCircle(p(0,0),p(4,0),p(0,4),p(1,1)),true);
  const points=[p(0,0),p(4,0),p(4,4),p(0,4),p(2,1),p(1,2)];
  const triangles=run('delaunayTriangles',{points},{implementation:'exact'});
  assert.equal(new Set(triangles.flat()).size,points.length);
  for(const tri of triangles) for(const q of points) assert.equal(exactInsideCircle(...tri.map(i=>points[i]),q),false);
  assert.throws(()=>orientationSign(a,b,p(Infinity,0)),/有限/);
});

test('render alternatives preserve curves and adaptive error status; render selections are isolated', () => {
  for(let n=2;n<=12;n++){
    const points=Array.from({length:n+1},(_,i)=>p(i,Math.sin(i)*8));
    for(let j=0;j<=20;j++)pointNear(bernsteinPoint(points,j/20),deCasteljau(points,j/20));
  }
  const shape={kind:'bezier',points:[p(0,0),p(0,40),p(30,-40),p(30,0)]};
  const flat=prepareGeometry(shape,'adaptive',{tolerance:0.1,maxDepth:16});
  assert.equal(flat.withinTolerance,true);
  const points=[flat.start,...flat.segments.map(s=>s.end)];
  for(let i=0;i<=500;i++){
    const q=deCasteljau(shape.points,i/500);
    assert.ok(Math.min(...points.slice(1).map((b,j)=>distance(q,closestOnSegment(q,points[j],b).point)))<=0.10001);
  }
  assert.equal(prepareGeometry(shape,'adaptive',{tolerance:0.00001,maxDepth:0}).withinTolerance,false);
  const circle=prepareGeometry({kind:'circle',center:p(0,0),radius:10},'cubic');
  assert.equal(circle.segments.length,4);assert.match(pathData(circle),/Z$/);
  const first=createRenderRegistry(),second=createRenderRegistry();first.select('cubicBezier','adaptive');
  assert.equal(second.describe('cubicBezier').id,'default');assert.throws(()=>first.select('line','adaptive'));
});

test('spline shapes preserve NURBS circles and custom knots while rejecting invalid weights', () => {
  const shape=run('nurbsCurve',{points:[p(1,0),p(1,1),p(0,1)],degree:2,weights:[1,Math.SQRT1_2,1]});
  for(const point of sampleSplineCurve(shape,80))near(Math.hypot(point.x,point.y),1);
  const input={points:[p(0,0),p(1,1),p(2,0),p(3,1)],degree:2,knots:[0,0,0,0.2,1,1,1]};
  const curve=run('bSplineCurve',input); assert.ok(curve);
  pointNear(sampleSplineCurve(curve,20)[0],input.points[0]);pointNear(sampleSplineCurve(curve,20).at(-1),input.points.at(-1));
  assert.ok(run('bSplineCurve',{...input,degree:1,knots:[0,0,0.5,0.5,1,1]}));
  assert.equal(run('nurbsCurve',{...input,weights:[0,0,0,0]}),null);
  assert.throws(()=>sampleSplineCurve(curve,10001));
});
