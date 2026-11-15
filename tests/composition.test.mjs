import assert from "node:assert/strict";
import test from "node:test";
import {createToolset} from "../src/model/tools.js";
import {deCasteljau} from "../src/model/bezier.js";
import {orientation, insideCircle} from "../src/model/predicates.js";
import {geometryExamples} from "../src/ui/geometryExamples.js";

const run = createToolset(), p = (x, y) => ({x, y});
const square = (x, y, size) => [p(x,y),p(x+size,y),p(x+size,y+size),p(x,y+size)];
const near = (a, b, epsilon = 1e-7) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const nearPoint = (a, b, e) => {near(a.x,b.x,e); near(a.y,b.y,e);};
const area = points => run("signedArea", {points});
const triangleArea = (result, points) => result.triangles.reduce((s, t) => s + area(t.map(i => points[i])), 0);
const key = ([a, b]) => Math.min(a,b) + "," + Math.max(a,b);
function seeded(seed, n) {
  const draw = () => {seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return (seed % 20001)/1000;};
  return Array.from({length:n}, () => p(draw(),draw()));
}
function verifyMesh(result, points) {
  assert.ok(result);
  for (const [i, tri] of result.triangles.entries()) {
    assert.ok(area(tri.map(j => points[j])) > 0);
    for (let side=0;side<3;side++) {
      const neighbor = result.neighbors[i][side];
      if (neighbor < 0) continue;
      assert.ok(result.neighbors[neighbor].includes(i));
      const vertices=[tri[side],tri[(side+1)%3]];
      assert.ok(vertices.every(v => result.triangles[neighbor].includes(v)));
    }
  }
  for (const edge of result.edges) {
    assert.ok(edge.triangles.length===1 || edge.triangles.length===2);
    if (edge.constrained || edge.triangles.length!==2) continue;
    const [a,b]=edge.vertices;
    const [i,j]=edge.triangles, c=result.triangles[i].find(v=>v!==a&&v!==b), d=result.triangles[j].find(v=>v!==a&&v!==b);
    if (orientation(points[c],points[d],points[a])*orientation(points[c],points[d],points[b])<0)
      assert.equal(insideCircle(...result.triangles[i].map(v=>points[v]),points[d]),false);
  }
}

test("cell boundaries restore holes, islands and containment from unequal shared edges", () => {
  const first=square(0,0,10), second=square(2,2,6);
  const cells=run("polygonBoolean",{first,second,operation:"difference"});
  cells.push(square(4,4,2),square(20,0,3));
  const original=structuredClone(cells), result=run("regionBoundary",{cells});
  assert.ok(result);
  near(result.area,77);
  assert.equal(result.rings.length,4);
  assert.equal(result.regions.length,3);
  assert.deepEqual(result.rings.map(r=>r.depth),[0,1,0,2]);
  assert.equal(result.rings.filter(r=>r.hole).length,1);
  assert.deepEqual(cells,original);
  for(const ring of result.rings) assert.equal(area(ring.points)<0,ring.hole);
});

test("boundary welding handles reversed cells, T junctions and point touching islands", () => {
  const cells=[square(0,0,2),square(2,0,1),square(2,1,1).reverse(),square(3,2,1)];
  const result=run("regionBoundary",{cells});
  assert.ok(result); near(result.area,7); assert.equal(result.regions.length,2);
  assert.equal(result.rings.length,2);
  const shifted=cells.map(c=>c.map(q=>p(q.x+1e5,q.y-1e5)));
  near(run("regionBoundary",{cells:shifted}).area,7);
  assert.deepEqual(run("regionBoundary",{cells:[]}),{rings:[],regions:[],area:0});
  assert.equal(run("regionBoundary",{cells:[square(0,0,2),square(1,1,2)]}),null);
  assert.equal(run("regionBoundary",{cells:[square(0,0,2),square(0,0,2)]}),null);
  assert.equal(run("regionBoundary",{cells:[[]]}),null);
  assert.equal(run("regionBoundary",{cells:[],tolerance:0}),null);
});

test("all Boolean operations reconstruct boundaries whose signed area matches cell area", () => {
  for(let seed=1;seed<=12;seed++) {
    const first=run("convexHull",{points:seeded(seed,8)}), second=run("convexHull",{points:seeded(seed+100,8)});
    for(const operation of ["union","intersection","difference","xor"]) {
      const cells=run("polygonBoolean",{first,second,operation});
      const result=run("regionBoundary",{cells,tolerance:1e-7});
      assert.ok(result,`${seed} ${operation}`);
      near(result.area,cells.reduce((s,c)=>s+Math.abs(area(c)),0),1e-6);
    }
  }
});

test("constrained mesh recovers a non-Delaunay diagonal and preserves original indices", () => {
  const points=[p(0,0),p(4,0),p(3,1),p(0,3),p(0,0)];
  const plain=run("delaunayTriangles",{points});
  const existing=new Set(plain.flatMap(t=>t.map((v,i)=>key([v,t[(i+1)%3]]))));
  const edge=existing.has("0,2")?[1,3]:[0,2];
  const result=run("constrainedDelaunay",{points,edges:[edge]});
  verifyMesh(result,points); near(triangleArea(result,points),6.5);
  assert.ok(result.edges.some(e=>key(e.vertices)===key(edge)&&e.constrained));
  assert.ok(!result.triangles.flat().includes(4));
});

test("constraint intersections at supplied vertices split edges; unsupplied crossings are rejected", () => {
  const points=[...square(0,0,4),p(2,2)];
  const result=run("constrainedDelaunay",{points,edges:[[0,2],[1,3],[2,0]]});
  verifyMesh(result,points); near(triangleArea(result,points),16);
  assert.equal(result.constraints.length,4);
  assert.ok(result.constraints.every(e=>e.includes(4)));
  assert.equal(run("constrainedDelaunay",{points:points.slice(0,4),edges:[[0,2],[1,3]]}),null);
  assert.equal(run("constrainedDelaunay",{points,edges:[[0,20]]}),null);
  assert.equal(run("constrainedDelaunay",{points,edges:[[0,0]]}),null);
});

test("mesh clips concave exteriors and holes and reports adjacent triangles", () => {
  const example=geometryExamples.constrainedDelaunay.input;
  const result=run("constrainedDelaunay",example);
  verifyMesh(result,example.points); near(triangleArea(result,example.points),12);
  for(const tri of result.triangles) {
    const centroid=run("polygonCentroid",{points:tri.map(i=>example.points[i])});
    assert.notEqual(run("classifyPointInPolygon",{point:centroid,points:square(1,1,2)}),"inside");
  }
  const points=[p(0,0),p(4,0),p(4,1),p(1,1),p(1,4),p(0,4)];
  const edges=points.map((_,i)=>[i,(i+1)%points.length]);
  const concave=run("constrainedDelaunay",{points,edges,clipExterior:true});
  verifyMesh(concave,points); near(triangleArea(concave,points),7);
  assert.equal(run("constrainedDelaunay",{...example,holes:[p(1,2)]}),null);
});

test("random constraint recovery covers the hull, uses all vertices and retains locked edges", () => {
  for(let seed=1;seed<=20;seed++) {
    const points=seeded(seed,18);
    // A fan is a planar set of segments, with several forced non-Delaunay edges.
    const edges=Array.from({length:7},(_,i)=>[0,i+1]);
    const result=run("constrainedDelaunay",{points,edges});
    verifyMesh(result,points);
    near(triangleArea(result,points),area(run("convexHull",{points})),1e-7);
    assert.equal(new Set(result.triangles.flat()).size,points.length);
    for(const edge of edges) assert.ok(result.edges.some(e=>e.constrained&&key(e.vertices)===key(edge)));
  }
});

function verifyIntersections(result,first,second) {
  assert.ok(result.complete,JSON.stringify(result.unresolved.slice(0,2)));
  for(const hit of result.intersections) {
    nearPoint(deCasteljau(first,hit.t),deCasteljau(second,hit.u),1e-6);
    nearPoint(hit.point,deCasteljau(first,hit.t),1e-6);
  }
}

test("Bezier isolation finds two crossings and a double root tangent", () => {
  const first=[p(0,0),p(2,4),p(4,0)];
  const second=[p(0,1),p(4,1)];
  let result=run("bezierIntersections",{first,second});
  verifyIntersections(result,first,second); assert.equal(result.intersections.length,2);
  near(result.intersections[0].t,(1-Math.SQRT1_2)/2);
  near(result.intersections[1].t,(1+Math.SQRT1_2)/2);
  const tangent=[p(0,2),p(4,2)];
  result=run("bezierIntersections",{first,second:tangent});
  verifyIntersections(result,first,tangent); assert.equal(result.intersections.length,1); near(result.intersections[0].t,0.5);
});

test("Bezier crossings survive rotation, reversal and endpoint contact; near misses stay empty", () => {
  const rotate=q=>p(q.x*0.8-q.y*0.6+3,q.x*0.6+q.y*0.8-2);
  const first=[p(0,0),p(2,4),p(4,0)].map(rotate), second=[p(0,2),p(4,2)].map(rotate);
  let result=run("bezierIntersections",{first,second});
  verifyIntersections(result,first,second); assert.equal(result.intersections.length,1); near(result.intersections[0].t,0.5,1e-6);
  const edge=[p(4,0),p(5,1)];
  result=run("bezierIntersections",{first:[p(0,0),p(2,4),p(4,0)],second:edge});
  verifyIntersections(result,[p(0,0),p(2,4),p(4,0)],edge); assert.equal(result.intersections.length,1); near(result.intersections[0].t,1);
  result=run("bezierIntersections",{first:[p(0,0),p(2,4),p(4,0)],second:[p(0,2.000001),p(4,2.000001)]});
  assert.ok(result.complete); assert.equal(result.intersections.length,0);
});

test("Bezier overlap recognizes degree elevation, reversed partial curves and nonlinear line speeds", () => {
  const first=[p(0,0),p(2,4),p(4,0)];
  const second=run("elevateBezier",{points:run("subBezier",{points:first,from:0.8,to:0.2})});
  const result=run("bezierIntersections",{first,second});
  assert.ok(result.complete); assert.equal(result.overlaps.length,1);
  near(result.overlaps[0].t[0],0.2); near(result.overlaps[0].t[1],0.8);
  near(result.overlaps[0].u[0],1); near(result.overlaps[0].u[1],0);
  const line=run("bezierIntersections",{first:[p(0,0),p(0,0),p(4,0)],second:[p(1,0),p(3,0)]});
  assert.ok(line.complete); assert.equal(line.overlaps.length,1);
  near(line.overlaps[0].t[0],0.5); near(line.overlaps[0].t[1],Math.sqrt(0.75));
  assert.equal(line.overlaps[0].mapping,"collinear");
});

test("Bezier returns unresolved intervals on exhausted budgets and handles point curves", () => {
  const input={first:[p(-1,1),p(0,-1),p(1,1)],second:[p(-1,-0.5),p(0,1.5),p(1,-0.5)]};
  const result=run("bezierIntersections",{...input,maxNodes:1});
  assert.equal(result.complete,false); assert.ok(result.unresolved.length>0);
  const depth=run("bezierIntersections",{...input,maxDepth:0});
  assert.equal(depth.complete,false);
  const point=run("bezierIntersections",{first:[p(2,2)],second:[p(0,0),p(2,4),p(4,0)]});
  assert.ok(point.complete); assert.equal(point.overlaps.length,1); near(point.overlaps[0].u[0],0.5);
  assert.equal(run("bezierIntersections",{...input,tolerance:0}),null);
});

test("distance and perpendicular constraints solve a fixed-origin triangle without mutating inputs", () => {
  const input=structuredClone(geometryExamples.solveConstraints.input), original=structuredClone(input);
  const result=run("solveConstraints",input);
  assert.equal(result.status,"converged"); assert.ok(result.residuals.every(r=>r.satisfied));
  assert.deepEqual(result.points[0],input.points[0]);
  nearPoint(result.points[1],p(4,0)); nearPoint(result.points[2],p(4,3));
  assert.equal(result.degreesOfFreedom,0); assert.deepEqual(input,original);
});

test("constraint solver reports contradiction, free motion, degenerate directions and iteration limits", () => {
  const contradiction=run("solveConstraints",{points:[p(0,0),p(2,0)],fixed:[0,1],constraints:[{type:"distance",a:0,b:1,value:4}]});
  assert.equal(contradiction.converged,false); assert.equal(contradiction.status,"stalled");
  near(contradiction.residuals[0].values[0],-2);
  const free=run("solveConstraints",{points:[p(0,0),p(3,1)],constraints:[{type:"distance",a:0,b:1,value:4}]});
  assert.ok(free.converged); assert.equal(free.degreesOfFreedom,3);
  const zero=run("solveConstraints",{points:[p(0,0),p(0,0),p(1,1)],constraints:[{type:"perpendicular",first:[0,1],second:[1,2]}]});
  assert.equal(zero.converged,false); assert.equal(zero.status,"degenerate");
  const limited=run("solveConstraints",{...geometryExamples.solveConstraints.input,maxIterations:0});
  assert.equal(limited.status,"maxIterations"); assert.equal(limited.converged,false);
  const impossible=run("solveConstraints",{points:[p(0,0),p(1,0)],fixed:[0],constraints:[{type:"distance",a:0,b:1,value:2},{type:"distance",a:0,b:1,value:4}]});
  assert.equal(impossible.converged,false); assert.ok(impossible.maxResidual>0.1);
});

test("zero distances, coincidence and aligned constraints use coordinate residuals across scales", () => {
  for(const scale of [1e-6,1,1e6]) {
    const input={points:[p(3*scale,4*scale),p(8*scale,9*scale)],fixed:[0],constraints:[{type:"distance",a:0,b:1,value:0}]};
    const result=run("solveConstraints",input);
    assert.ok(result.converged); nearPoint(result.points[0],result.points[1],scale*1e-7);
  }
  const result=run("solveConstraints",{points:[p(2,3),p(4,5)],fixed:[0],constraints:[{type:"vertical",a:0,b:1},{type:"horizontal",a:0,b:1}]});
  assert.ok(result.converged); nearPoint(result.points[1],p(2,3));
  assert.equal(run("solveConstraints",{points:[p(0,0)],constraints:[{type:"distance",a:0,b:9,value:1}]}),null);
});


test("two curved Beziers isolate crossings and rotated tangencies at the same parameters", () => {
  const transforms=[q=>q,q=>p(q.x*0.8-q.y*0.6+2,q.x*0.6+q.y*0.8-3)];
  for(const transform of transforms) for(const height of [0,0.5]) {
    const first=[p(-1,1),p(0,-1),p(1,1)].map(transform);
    const second=[p(-1,-1+height),p(0,1+height),p(1,-1+height)].map(transform);
    const result=run("bezierIntersections",{first,second});
    verifyIntersections(result,first,second);
    assert.equal(result.intersections.length,height?2:1);
    near(result.intersections[0].t,height?0.25:0.5,1e-6);
    if(height) near(result.intersections[1].t,0.75,1e-6);
    const reversed=run("bezierIntersections",{first,second:[...second].reverse()});
    verifyIntersections(reversed,first,[...second].reverse());
    assert.equal(reversed.intersections.length,result.intersections.length);
    result.intersections.forEach((hit,i)=>near(reversed.intersections[i].u,1-hit.u,1e-6));
  }
});

test("nonlinear curved overlaps keep an unresolved result instead of claiming all roots found", () => {
  const first=[p(0,0),p(0.5,0),p(1,1)];
  const second=[p(0,0),p(0,0),p(1/6,0),p(0.5,0),p(1,1)];
  const result=run("bezierIntersections",{first,second,maxNodes:2000});
  assert.equal(result.complete,false); assert.ok(result.unresolved.length>0);
});
