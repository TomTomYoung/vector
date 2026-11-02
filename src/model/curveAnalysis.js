import {advancePoint, interpolatePoint, closestOnSegment, distance, crossProduct} from "../utils/geometry.js";
import {deCasteljau} from "./bezier.js";
import {pointBounds} from "./polygons.js";

const validT = t => t >= 0 && t <= 1;

export function splitBezier({points, t}, ops = {}) {
  if (!points.length || !validT(t)) return null;
  const lerp = ops.interpolatePoint ?? interpolatePoint;
  let row = points;
  const left = [], right = [];
  while (row.length) {
    left.push(row[0]); right.push(row.at(-1));
    row = row.slice(1).map((p, i) => lerp(row[i], p, t));
  }
  return {left, right: right.reverse()};
}

export function subBezier({points, from, to}, ops = {}) {
  if (!points.length || !validT(from) || !validT(to)) return null;
  if (from === to) return points.map(() => deCasteljau(points, from));
  const lo = Math.min(from, to), hi = Math.max(from, to);
  const split = ops.splitBezier ?? splitBezier;
  const left = split({points, t: hi}, ops).left;
  const part = split({points: left, t: lo / hi}, ops).right;
  return from < to ? part : part.reverse();
}

export function bezierDerivative({points, t, order = 1}) {
  if (!points.length || !validT(t) || !Number.isInteger(order) || order < 0) return null;
  if (order >= points.length) return {x: 0, y: 0};
  let row = points;
  for (let j = 0; j < order; j++) {
    const degree = row.length - 1;
    row = row.slice(1).map((p, i) => ({x: degree * (p.x - row[i].x), y: degree * (p.y - row[i].y)}));
  }
  return deCasteljau(row, t);
}

export function bezierTangent({points, t}, ops = {}) {
  const v = (ops.bezierDerivative ?? bezierDerivative)({points, t});
  const speed = v && Math.hypot(v.x, v.y);
  return speed ? {x: v.x / speed, y: v.y / speed} : null;
}

export function bezierCurvature({points, t}, ops = {}) {
  const derive = ops.bezierDerivative ?? bezierDerivative;
  const v = derive({points, t}), speed = v && Math.hypot(v.x, v.y);
  if (!speed) return null;
  return crossProduct(v, derive({points, t, order: 2})) / speed ** 3;
}

export function elevateBezier({points}, ops = {}) {
  if (!points.length) return [];
  const lerp = ops.interpolatePoint ?? interpolatePoint, n = points.length;
  const elevated = [points[0]];
  for (let i = 1; i < n; i++) elevated.push(lerp(points[i], points[i - 1], i / n));
  return [...elevated, points.at(-1)];
}

export function hermiteToBezier({start, end, startTangent, endTangent}) {
  return {kind: "bezier", points: [start, advancePoint(start, startTangent, 1 / 3), advancePoint(end, endTangent, -1 / 3), end]};
}

export function bezierToHermite({points}) {
  if (points.length !== 4) return null;
  const [start, a, b, end] = points;
  return {start, end, startTangent: {x: 3 * (a.x - start.x), y: 3 * (a.y - start.y)}, endTangent: {x: 3 * (end.x - b.x), y: 3 * (end.y - b.y)}};
}

export function rationalBezierPoint({points, weights, t}) {
  if (!points.length || points.length !== weights.length || !validT(t)) return null;
  const row = points.map((p, i) => ({x: p.x * weights[i], y: p.y * weights[i], w: weights[i]}));
  for (let count = row.length - 1; count > 0; count--) {
    for (let i = 0; i < count; i++) {
      const a = row[i], b = row[i + 1];
      row[i] = {x: (1 - t) * a.x + t * b.x, y: (1 - t) * a.y + t * b.y, w: (1 - t) * a.w + t * b.w};
    }
  }
  const {x, y, w} = row[0];
  return w === 0 ? null : {x: x / w, y: y / w};
}

function roots(a, b, c) {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  if (discriminant === 0) return [-b / (2 * a)];
  const q = -(b + (b < 0 ? -1 : 1) * Math.sqrt(discriminant)) / 2;
  return [q / a, c / q];
}

export function bezierBounds({points}) {
  if (!points.length || points.length > 4) return null;
  const extreme = [points[0], points.at(-1)];
  for (const axis of ["x", "y"]) {
    const d = points.slice(1).map((p, i) => p[axis] - points[i][axis]);
    let parameters = [];
    if (d.length === 2) parameters = roots(0, d[1] - d[0], d[0]);
    if (d.length === 3) parameters = roots(d[2] - 2 * d[1] + d[0], 2 * (d[1] - d[0]), d[0]);
    for (const t of parameters) if (t > 0 && t < 1) extreme.push(deCasteljau(points, t));
  }
  return pointBounds({points: extreme});
}

function validSubdivision(points, tolerance, maxDepth) {
  return points.length > 0 && Number.isFinite(tolerance) && tolerance > 0 && Number.isInteger(maxDepth) && maxDepth >= 0 && maxDepth <= 18;
}

export function flattenBezier({points, tolerance = 0.25, maxDepth = 12}, ops = {}) {
  if (!validSubdivision(points, tolerance, maxDepth)) return null;
  if (points.length === 1) return {points: [points[0]], withinTolerance: true};
  const split = ops.splitBezier ?? splitBezier;
  const result = [points[0]], pending = [{curve: points, depth: 0}];
  let withinTolerance = true;
  while (pending.length) {
    const {curve, depth} = pending.pop(), a = curve[0], b = curve.at(-1);
    const flat = curve.slice(1, -1).every(p => distance(p, closestOnSegment(p, a, b).point) <= tolerance);
    if (flat || depth === maxDepth) {
      result.push(b);
      if (!flat) withinTolerance = false;
    } else {
      const {left, right} = split({points: curve, t: 0.5}, ops);
      pending.push({curve: right, depth: depth + 1}, {curve: left, depth: depth + 1});
    }
  }
  return {points: result, withinTolerance};
}

export function bezierLengthBounds({points, tolerance = 0.01, maxDepth = 12}, ops = {}) {
  if (!validSubdivision(points, tolerance, maxDepth)) return null;
  const split = ops.splitBezier ?? splitBezier;
  const pending = [{curve: points, depth: 0, budget: tolerance}];
  let lower = 0, upper = 0;
  while (pending.length) {
    const {curve, depth, budget} = pending.pop();
    const chord = distance(curve[0], curve.at(-1));
    let perimeter = 0;
    for (let i = 1; i < curve.length; i++) perimeter += distance(curve[i - 1], curve[i]);
    if (perimeter - chord <= budget || depth === maxDepth) {
      lower += chord; upper += Math.max(chord, perimeter);
    } else {
      const {left, right} = split({points: curve, t: 0.5}, ops);
      pending.push({curve: left, depth: depth + 1, budget: budget / 2}, {curve: right, depth: depth + 1, budget: budget / 2});
    }
  }
  return {lower, upper, withinTolerance: upper - lower <= tolerance};
}

export function arcToCubics({arc}) {
  if (arc.radius < 0 || !Number.isFinite(arc.turn)) return null;
  const n = Math.ceil(Math.abs(arc.turn) / (Math.PI / 2));
  if (n > 100000) return null;
  const startAngle = Math.atan2(arc.start.y - arc.center.y, arc.start.x - arc.center.x);
  const step = n ? arc.turn / n : 0, k = 4 / 3 * Math.tan(step / 4), segments = [];
  let start = arc.start;
  for (let i = 0; i < n; i++) {
    const a = startAngle + i * step, b = a + step, r = arc.radius;
    const end = {x: arc.center.x + r * Math.cos(b), y: arc.center.y + r * Math.sin(b)};
    const control1 = {x: start.x - k * r * Math.sin(a), y: start.y + k * r * Math.cos(a)};
    const control2 = {x: end.x + k * r * Math.sin(b), y: end.y - k * r * Math.cos(b)};
    segments.push({kind: "cubic", control1, control2, end});
    start = end;
  }
  return {kind: "path", start: arc.start, segments};
}
