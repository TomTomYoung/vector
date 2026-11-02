import {crossProduct, displacement} from "../utils/geometry.js";

import {convexHull} from "./polygons.js";

const orientation = (a, b, c) => crossProduct(displacement(a, b), displacement(a, c));

// Positive for a point strictly inside a counterclockwise triangle's circumcircle.
function insideCircle(a, b, c, p) {
  const u = displacement(p, a), v = displacement(p, b), w = displacement(p, c);
  const length2 = v => v.x * v.x + v.y * v.y;
  const uu = length2(u), vv = length2(v), ww = length2(w);
  const det = uu * crossProduct(v, w) + vv * crossProduct(w, u) + ww * crossProduct(u, v);
  const magnitude = (a, b) => Math.abs(a.x * b.y) + Math.abs(a.y * b.x);
  const error = 16 * Number.EPSILON * (uu * magnitude(v, w) + vv * magnitude(w, u) + ww * magnitude(u, v));
  return det > error;
}

// Seed with the convex hull, then insert remaining vertices and flip non-Delaunay edges.
// No synthetic enclosing triangle: skinny input triangles have unbounded circumradii.

export function delaunayTriangles({points}, ops = {}) {
  const inCircle = ops.insideCircle ?? insideCircle, orient = ops.orientation ?? orientation;
  const unique = new Map();
  for (let i = 0; i < points.length; i++) {
    const key = points[i].x + "," + points[i].y;
    if (!unique.has(key)) unique.set(key, i);
  }
  const indices = [...unique.values()];
  const hull = (ops.convexHull ?? convexHull)({points: indices.map(i => points[i])}).map(p => unique.get(p.x + "," + p.y));
  if (hull.length < 3) return [];
  let triangles = [];
  function add(a, b, c) {
    const direction = orient(points[a], points[b], points[c]);
    if (direction) triangles.push(direction > 0 ? [a, b, c] : [b, a, c]);
  }
  for (let i = 1; i < hull.length - 1; i++) add(hull[0], hull[i], hull[i + 1]);
  const boundary = new Set(hull);
  for (const index of indices) {
    if (boundary.has(index)) continue;
    const p = points[index], previous = triangles;
    triangles = [];
    for (const tri of previous) {
      const sides = tri.map((a, j) => orient(points[a], points[tri[(j + 1) % 3]], p));
      if (sides.some(s => s < 0)) triangles.push(tri);
      else for (let j = 0; j < 3; j++) add(tri[j], tri[(j + 1) % 3], index);
    }
  }
  // A tie keeps the existing diagonal. A guard reports nonconvergence for ill-conditioned floating-point input.
  const limit = 8 * indices.length * indices.length;
  for (let pass = 0; pass <= limit; pass++) {
    let flipped = false;
    const edges = new Map();
    for (let i = 0; i < triangles.length && !flipped; i++) {
      const tri = triangles[i];
      for (let j = 0; j < 3; j++) {
        const a = tri[j], b = tri[(j + 1) % 3], c = tri[(j + 2) % 3], key = Math.min(a, b) + "," + Math.max(a, b);
        const neighbor = edges.get(key);
        if (!neighbor) {edges.set(key, {index: i, opposite: c}); continue;}
        const d = neighbor.opposite;
        if (orient(points[c], points[d], points[b]) <= 0 || orient(points[d], points[c], points[a]) <= 0 ||
          !inCircle(points[a], points[b], points[c], points[d])) continue;
        triangles[i] = [c, d, b]; triangles[neighbor.index] = [d, c, a];
        flipped = true; break;
      }
    }
    if (!flipped) return triangles;
  }
  return null;
}
