import assert from "node:assert/strict";
import test from "node:test";
import {createToolset, toolNames} from "../src/model/tools.js";
import {geometryExamples} from "../src/ui/geometryExamples.js";
import {deCasteljau} from "../src/model/bezier.js";
import {distance} from "../src/utils/geometry.js";

const run = createToolset();
const p = (x, y) => ({x, y});
const o = p(0, 0);
const rect = (x, y, w, h) => [p(x, y), p(x + w, y), p(x + w, y + h), p(x, y + h)];
const area = points => run("signedArea", {points});
const near = (a, b, epsilon = 1e-9) => assert.ok(Math.abs(a - b) <= epsilon, a + " != " + b);
const nearPoint = (a, b, epsilon) => {near(a.x, b.x, epsilon); near(a.y, b.y, epsilon);};
const totalArea = cells => cells.reduce((sum, cell) => sum + Math.abs(area(cell)), 0);
function seededPoints(seed, count) {
  const draw = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed % 2001) - 1000;};
  return Array.from({length: count}, () => p(draw(), draw()));
}

test("every public tool has a runnable, serializable, immutable workbench example", () => {
  assert.deepEqual([...toolNames].sort(), Object.keys(geometryExamples).sort());
  for (const [name, {input}] of Object.entries(geometryExamples)) {
    const original = structuredClone(input);
    const result = run(name, input);
    assert.notEqual(result, null, name);
    assert.deepEqual(JSON.parse(JSON.stringify(result)), JSON.parse(JSON.stringify(run(name, original))), name);
    JSON.stringify(result, (_, v) => {if (typeof v === "number") assert.ok(Number.isFinite(v), name); return v;});
    assert.deepEqual(input, original, name);
  }
});

test("affine order, direction, inverse, reflection and replacement are independent", () => {
  const translation = run("translationMatrix", {dx: 5, dy: -3});
  const rotation = run("rotationMatrix", {angle: Math.PI / 2});
  const matrix = run("composeAffine", {first: translation, then: rotation});
  const point = p(2, 1), image = run("applyToPoint", {matrix, point});
  nearPoint(image, p(2, 7));
  nearPoint(run("applyToVector", {matrix, vector: point}), p(-1, 2));
  nearPoint(run("applyToPoint", {matrix: run("invertAffine", {matrix}), point: image}), point);
  assert.equal(run("invertAffine", {matrix: run("scaleMatrix", {sx: 0})}), null);
  const axis = {start: p(1, 2), end: p(3, 4)};
  nearPoint(run("applyToPoint", {matrix: run("reflectionMatrix", axis), point}), run("reflectPoint", {...axis, point}));
  const replace = createToolset({operations: {applyToPoint: () => o}});
  assert.deepEqual(replace("transformPoints", {matrix, points: [point, point]}), [o, o]);
});

test("triangle and four-point maps recover the correspondences and report degeneracy", () => {
  const source = rect(0, 0, 5, 3), target = [p(-1, 1), p(8, 1), p(6, 4), p(1, 5)];
  const matrix = run("homographyFromQuads", {source, target});
  const inv = run("invertProjective", {matrix});
  const product = run("composeProjective", {first: matrix, then: inv});
  source.forEach((point, i) => {
    nearPoint(run("projectPoint", {matrix, point}), target[i]);
    nearPoint(run("projectPoint", {matrix: product, point}), point);
  });
  const triangle = source.slice(0, 3), affine = run("affineFromTriangles", {source: triangle, target: target.slice(0, 3)});
  triangle.forEach((point, i) => nearPoint(run("applyToPoint", {matrix: affine, point}), target[i]));
  const point = p(-2, 3), weights = run("barycentricCoordinates", {point, triangle});
  nearPoint(run("fromBarycentric", {triangle, weights}), point);
  assert.equal(run("homographyFromQuads", {source: [o, p(1, 1), p(2, 2), p(1, 0)], target}), null);
  assert.equal(run("projectPoint", {matrix: [1, 0, 0, 0, 1, 0, 1, 0, 0], point: o}), null);
  assert.equal(run("polarCoordinates", {point: o}).angle, null);
});

test("segment contacts preserve overlap, zero length, parallel gaps and clipping", () => {
  const first = [p(3, 0), o];
  assert.deepEqual(run("segmentContact", {first, second: [p(1, 0), p(4, 0)]}), {kind: "overlap", start: p(3, 0), end: p(1, 0)});
  assert.deepEqual(run("segmentContact", {first, second: [o, o]}), {kind: "point", point: o});
  assert.equal(run("segmentContact", {first: [o, o], second: [p(1, 0), p(1, 0)]}).kind, "none");
  near(run("segmentDistance", {first, second: [p(1, 2), p(4, 2)]}), 2);
  const box = {x: 0, y: 0, width: 2, height: 2};
  const clipped = run("clipSegmentToBox", {start: p(-1, -1), end: p(4, 4), box});
  nearPoint(clipped.start, o); nearPoint(clipped.end, p(2, 2));
  assert.equal(run("clipSegmentToBox", {start: p(-1, 0), end: p(-1, 1), box}), null);
});

test("line domains, circular degeneracy and tangent normal constraints", () => {
  const first = {center: o, radius: 2}, second = {center: p(5, 0), radius: 1};
  for (const [domain, count] of [["line", 2], ["ray", 1], ["segment", 0]]) {
    assert.equal(run("lineCircleIntersections", {...first, start: o, end: p(1, 0), domain}).length, count);
  }
  assert.equal(run("circleIntersections", {first, second: first}).kind, "coincident");
  const zero = {center: o, radius: 0};
  assert.deepEqual(run("circleIntersections", {first: zero, second: zero}), {kind: "point", point: o});
  assert.equal(run("circleIntersections", {first, second: {center: p(3, 0), radius: 1}}).kind, "point");
  const tangents = run("commonCircleTangents", {first, second}).tangents;
  assert.equal(tangents.length, 4);
  for (const t of tangents) {
    near(distance(t.first, o), 2); near(distance(t.second, second.center), 1);
    near((t.first.x - t.second.x) * t.normal.x + (t.first.y - t.second.y) * t.normal.y, 0);
  }
});

test("triangle centers, arc orientation and rotated ellipse bounds", () => {
  const triangle = [o, p(4, 0), p(0, 3)];
  nearPoint(run("circumcircle", {triangle}).center, p(2, 1.5));
  nearPoint(run("triangleIncircle", {triangle}).center, p(1, 1));
  nearPoint(run("triangleOrthocenter", {triangle}), o);
  assert.equal(run("circumcircle", {triangle: [o, o, o]}), null);
  const arc = {center: o, start: p(2, 0), radius: 2, turn: -Math.PI};
  const b = run("arcBounds", {arc});
  near(b.x, -2); near(b.y, -2); near(b.width, 4); near(b.height, 2);
  near(run("sectorArea", arc), -2 * Math.PI); near(run("arcLength", arc), 2 * Math.PI);
  const ellipse = {center: p(2, 1), rx: 3, ry: 1, angle: 0.7};
  const bounds = run("ellipseBounds", {ellipse});
  for (let i = 0; i <= 120; i++) {
    const v = run("ellipsePoint", {ellipse, angle: 2 * Math.PI * i / 120});
    assert.ok(v.x >= bounds.x - 1e-9 && v.x <= bounds.x + bounds.width + 1e-9);
    assert.ok(v.y >= bounds.y - 1e-9 && v.y <= bounds.y + bounds.height + 1e-9);
  }
  const hits = run("lineEllipseIntersections", {ellipse, start: p(-10, 1), end: p(10, 1)});
  assert.equal(hits.length, 2);
  for (const hit of hits) near(((hit.x - 2) * Math.cos(0.7) / 3) ** 2 + ((hit.x - 2) * Math.sin(0.7)) ** 2, 1);
});

test("polygon winding, intersections, ear clipping, centroids and clipping", () => {
  const concave = [o, p(4, 0), p(4, 4), p(2, 2), p(0, 4)];
  assert.equal(run("isSimplePolygon", {points: concave}), true);
  assert.equal(run("isConvexPolygon", {points: concave}), false);
  const square = rect(0, 0, 4, 4), point = p(2, 2);
  assert.equal(run("classifyPointInPolygon", {point, points: [...square, ...square]}), "outside");
  assert.equal(run("classifyPointInPolygon", {point, points: [...square, ...square], rule: "nonzero"}), "inside");
  assert.equal(run("classifyPointInPolygon", {point: o, points: concave}), "boundary");
  assert.equal(run("polygonCrossings", {points: [square[0], square[2], square[1], square[3]]}).length, 1);
  nearPoint(run("polygonCentroid", {points: square}), point);
  for (const points of [concave, [...concave].reverse()]) {
    const triangles = run("triangulatePolygon", {points: [...points, points[0]]});
    near(triangles.reduce((s, t) => s + area(t), 0), area(points));
  }
  near(totalArea([run("intersectConvexPolygons", {first: square, second: rect(2, 0, 4, 4).reverse()})]), 8);
  assert.deepEqual(run("intersectConvexPolygons", {first: square, second: rect(4, 0, 1, 1)}), []);
});

test("polygon Boolean outputs cover expected area, exclude holes and have disjoint interiors", () => {
  const first = rect(0, 0, 4, 4), second = rect(2, 0, 4, 4);
  for (const [operation, expected] of [["intersection", 8], ["union", 24], ["difference", 8], ["xor", 16]]) {
    const cells = run("polygonBoolean", {first, second, operation});
    near(totalArea(cells), expected);
    assert.ok(cells.every(cell => run("isConvexPolygon", {points: cell})));
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++)
      near(totalArea([run("intersectConvexPolygons", {first: cells[i], second: cells[j]})]), 0);
  }
  const hole = run("polygonBoolean", {first, second: rect(1, 1, 2, 2), operation: "difference"});
  near(totalArea(hole), 12);
  assert.ok(hole.every(points => run("classifyPointInPolygon", {points, point: p(2, 2)}) === "outside"));
  const concave = [o, p(4, 0), p(4, 1), p(1, 1), p(1, 4), p(0, 4)];
  near(totalArea(run("polygonBoolean", {first: concave, second: rect(2, 0, 1, 2), operation: "difference"})), 6);
  assert.deepEqual(run("polygonBoolean", {first, second: rect(4, 0, 2, 2), operation: "intersection"}), []);
  assert.deepEqual(run("polygonBoolean", {first, second: first, operation: "xor"}), []);
});

test("polyline stationing, repeated vertices, dashes and signed miter offsets", () => {
  const points = [o, o, p(3, 0), p(3, 4)];
  assert.deepEqual(run("cumulativeLengths", {points}), [0, 0, 3, 7]);
  nearPoint(run("pointAtLength", {points, length: 5}), p(3, 2));
  assert.deepEqual(run("slicePolyline", {points, from: 5, to: 2}), [p(3, 2), p(3, 0), p(2, 0)]);
  nearPoint(run("resamplePolyline", {points, intervals: 2})[1], p(3, 0.5));
  assert.deepEqual(run("simplifyPolyline", {points, tolerance: 0}), [o, p(3, 0), p(3, 4)]);
  const dashes = run("dashPolyline", {points: [o, p(5, 0)], pattern: [1], phase: 0});
  assert.deepEqual(dashes, [[o, p(1, 0)], [p(2, 0), p(3, 0)], [p(4, 0), p(5, 0)]]);
  const offset = run("offsetMiter", {points, amount: 1, miterLimit: 2});
  nearPoint(offset.points[1], p(2, 1));
  assert.equal(run("offsetMiter", {points, amount: 1, miterLimit: 1}), null);
  assert.equal(run("offsetMiter", {points: [o, p(1, 0), o], amount: 1}), null);
});

test("Bézier restrictions, elevation, Hermite conversion, derivatives and curvature", () => {
  const points = [o, p(1, 3), p(3, 3), p(4, 0)];
  const t = 0.4, split = run("splitBezier", {points, t});
  const elevated = run("elevateBezier", {points});
  const reverse = run("subBezier", {points, from: 0.9, to: 0.2});
  for (const u of [0, 0.17, 0.5, 1]) {
    nearPoint(deCasteljau(split.left, u), deCasteljau(points, t * u));
    nearPoint(deCasteljau(split.right, u), deCasteljau(points, t + (1 - t) * u));
    nearPoint(deCasteljau(elevated, u), deCasteljau(points, u));
    nearPoint(deCasteljau(reverse, u), deCasteljau(points, 0.9 - 0.7 * u));
  }
  assert.deepEqual(run("hermiteToBezier", run("bezierToHermite", {points})).points, points);
  nearPoint(run("bezierDerivative", {points, t: 0}), p(3, 9));
  nearPoint(run("bezierTangent", {points, t: 0.5}), p(1, 0));
  near(run("bezierCurvature", {points, t: 0.5}), -18 / (4.5 ** 2));
  assert.equal(run("bezierTangent", {points: [o, o], t}), null);
});

test("adaptive flattening and length bounds distinguish depth limit from tolerance", () => {
  const points = [o, p(0, 2), p(2, 2), p(2, 0)]; // speed integrates to exactly four.
  const exact = 4, bounds = run("bezierBounds", {points});
  near(bounds.height, 1.5);
  const length = run("bezierLengthBounds", {points, tolerance: 0.0001});
  assert.ok(length.withinTolerance && length.lower <= exact && exact <= length.upper && length.upper - length.lower <= 0.0001);
  for (const name of ["bezierLengthBounds", "flattenBezier"]) assert.equal(run(name, {points, tolerance: 1e-8, maxDepth: 0}).withinTolerance, false);
  const flat = run("flattenBezier", {points, tolerance: 0.05});
  assert.ok(flat.withinTolerance && flat.points.length > 2);
  const arc = {center: o, start: p(1, 0), radius: 1, turn: -Math.PI};
  const path = run("arcToCubics", {arc});
  assert.equal(path.segments.length, 2);
  nearPoint(path.segments.at(-1).end, p(-1, 0));
  nearPoint(path.segments[0].control1, p(1, -4 / 3 * Math.tan(Math.PI / 8)));
});

test("clamped B-splines, weighted conic, knot insertion and analytic derivative", () => {
  const points = [p(1, 0), p(1, 1), p(0, 1)], degree = 2, weights = [1, Math.SQRT1_2, 1];
  const knots = run("clampedKnots", {count: 3, degree});
  assert.deepEqual(knots, [0, 0, 0, 1, 1, 1]);
  const curve = {points, degree, knots};
  const refined = run("insertSplineKnot", {...curve, weights, t: 0.4});
  for (let i = 0; i <= 20; i++) {
    const t = i / 20, hit = run("nurbsPoint", {...curve, weights, t});
    near(Math.hypot(hit.x, hit.y), 1);
    nearPoint(run("rationalBezierPoint", {points, weights, t}), hit);
    nearPoint(run("nurbsPoint", {...refined, t}), hit);
    nearPoint(run("bSplineDerivative", {...curve, t}), run("bezierDerivative", {points, t}));
  }
  assert.equal(run("nurbsPoint", {...curve, weights: [0, 0, 0], t: 0.5}), null);
  assert.equal(run("bSplinePoint", {...curve, t: 1.1}), null);
  assert.equal(run("insertSplineKnot", {...curve, t: 1}), null);
  assert.equal(run("bSplineDerivative", {points: [o, p(1, 1), p(2, 0)], degree: 1, knots: [0, 0, 0.5, 1, 1], t: 0.5}), null);
});

test("point fit reports orthogonal/radial errors, isotropy and non-identifiable fits", () => {
  const circle = run("fitCircle", {points: rect(4, 6, 2, 2)});
  nearPoint(circle.center, p(5, 7)); near(circle.radius, Math.SQRT2); near(circle.rms, 0);
  const points = [o, p(0, 1), p(0, 4)], line = run("fitLine", {points});
  near(Math.abs(line.direction.y), 1); near(line.rms, 0);
  assert.equal(run("fitCircle", {points}), null);
  assert.equal(run("fitLine", {points: rect(0, 0, 1, 1)}), null);
  assert.deepEqual(run("closestPair", {points: [...points, o]}), {indices: [0, 3], distance: 0});
});

test("enclosing disk agrees with exhaustive support circles on reproducible point sets", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const points = seededPoints(seed, 8);
    const candidates = [];
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) {
      candidates.push(run("circleFromDiameter", {start: points[i], end: points[j]}));
      for (let k = j + 1; k < points.length; k++) candidates.push(run("circumcircle", {triangle: [points[i], points[j], points[k]]}));
    }
    const enclosing = candidates.filter(c => c && points.every(p => distance(p, c.center) <= c.radius + 1e-8));
    const actual = run("minimumEnclosingCircle", {points});
    assert.ok(points.every(p => distance(p, actual.center) <= actual.radius + 1e-8));
    near(actual.radius, Math.min(...enclosing.map(c => c.radius)), 1e-8);
  }
});

test("Voronoi cells cover the rectangle, respect the bisectors and keep first site indices", () => {
  const sites = [o, p(3, 0), p(1, 4), o, p(100, 100)], box = {x: -2, y: -2, width: 8, height: 8};
  const cells = run("voronoiCells", {sites, box});
  assert.deepEqual(cells.map(c => c.index), [0, 1, 2, 4]);
  near(totalArea(cells.map(c => c.points)), 64);
  for (const cell of cells) for (const vertex of cell.points) for (const site of sites)
    assert.ok(distance(vertex, cell.site) <= distance(vertex, site) + 1e-9);
  assert.deepEqual(cells.at(-1).points, []);
});

test("Delaunay triangles cover the hull, use original unique sites and have empty circumcircles", () => {
  const square = rect(0, 0, 4, 4), edgePoints = [...square, p(2, 0), p(2, 2), p(0, 2), o];
  for (const points of [edgePoints, ...Array.from({length: 15}, (_, i) => seededPoints(1 + i, 15))]) {
    const triangles = run("delaunayTriangles", {points});
    const used = new Set(triangles.flat()), unique = new Set(points.map(p => p.x + "," + p.y));
    assert.equal(used.size, unique.size);
    const cells = triangles.map(indices => indices.map(i => points[i]));
    near(totalArea(cells), area(run("convexHull", {points})), 1e-7);
    for (const cell of cells) {
      assert.ok(area(cell) > 0);
      const circle = run("circumcircle", {triangle: cell});
      for (const point of points) assert.ok(distance(circle.center, point) >= circle.radius - 1e-7);
    }
  }
  assert.deepEqual(run("delaunayTriangles", {points: [o, p(1, 1), p(3, 3), o]}), []);
});
