import {advancePoint, displacement, distance, normalizeVector, projectOnLine} from "../utils/geometry.js";

export function reflectPoint({point, start, end}, ops = {}) {
  const foot = (ops.projectOnLine ?? projectOnLine)(point, start, end);
  if (!foot) return null;
  return advancePoint(foot.point, displacement(point, foot.point), 1);
}

export function infiniteIntersection(a, b, c, d) {
  const u = displacement(a, b), v = displacement(c, d);
  const denominator = u.x * v.y - u.y * v.x;
  if (Math.abs(denominator) < 0.0001) return null;
  const t = ((c.x - a.x) * v.y - (c.y - a.y) * v.x) / denominator;
  return advancePoint(a, u, t);
}

function corner(first, second, ops) {
  const intersect = ops.infiniteIntersection ?? infiniteIntersection;
  const vertex = intersect(...first, ...second);
  if (!vertex) return null;
  const measure = ops.distance ?? distance, unit = ops.normalizeVector ?? normalizeVector;
  const sides = [first, second].map(([a, b]) => {
    const nearest = measure(vertex, a) <= measure(vertex, b) ? 0 : 1;
    const axis = nearest === 0 ? displacement(a, b) : displacement(b, a);
    return {nearest, axis: unit(axis)};
  });
  return {vertex, sides};
}

function cornerEdit(first, second, sides, bridge) {
  const segments = [first, second].map((line, i) => {
    const points = [...line];
    points[sides[i].nearest] = i === 0 ? bridge.start : bridge.end;
    return points;
  });
  return {segments, bridge};
}

export function chamfer({first, second, distance1, distance2}, ops = {}) {
  const axes = corner(first, second, ops);
  if (!axes) return null;
  const {vertex, sides} = axes;
  const start = advancePoint(vertex, sides[0].axis, distance1), end = advancePoint(vertex, sides[1].axis, distance2);
  return cornerEdit(first, second, sides, {kind: "segment", start, end});
}

export function fillet({first, second, radius}, ops = {}) {
  const axes = corner(first, second, ops);
  if (!axes || !(radius > 0)) return null;
  const {vertex, sides} = axes;
  const [a, b] = sides.map(side => side.axis);
  const angle = Math.atan2(Math.abs(a.x * b.y - a.y * b.x), a.x * b.x + a.y * b.y);
  const travel = radius / Math.tan(angle / 2);
  const start = advancePoint(vertex, a, travel), end = advancePoint(vertex, b, travel);
  const unit = ops.normalizeVector ?? normalizeVector;
  const center = advancePoint(vertex, unit({x: a.x + b.x, y: a.y + b.y}), radius / Math.sin(angle / 2));
  const turn = Math.sign(b.x * a.y - b.y * a.x) * (Math.PI - angle);
  return cornerEdit(first, second, sides, {kind: "arc", center, radius, start, end, turn});
}

export function offset({shape, point, amount}, ops = {}) {
  const measure = ops.distance ?? distance;
  if (shape.kind === "circle") {
    const radius = shape.radius + (measure(shape.center, point) > shape.radius ? amount : -amount);
    return radius > 0 ? {...shape, radius} : null;
  }
  if (shape.kind === "rectangle") {
    const {x, y, width, height} = shape;
    const outside = point.x < x || point.y < y || point.x > x + width || point.y > y + height;
    const d = outside ? amount : -amount;
    if (width + 2 * d <= 0 || height + 2 * d <= 0) return null;
    return {kind: "rectangle", x: x - d, y: y - d, width: width + 2 * d, height: height + 2 * d};
  }
  if (shape.kind !== "segment" && shape.kind !== "polyline") return null;
  const points = shape.kind === "segment" ? [shape.start, shape.end] : shape.points;
  const result = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], length = measure(a, b);
    if (!length) continue;
    const normal = {x: (a.y - b.y) / length, y: (b.x - a.x) / length};
    // Match the editor's per-segment polyline offset.
    const side = (point.x - a.x) * normal.x + (point.y - a.y) * normal.y;
    const d = !result.length && side <= 0 ? -amount : amount;
    if (!result.length) result.push(advancePoint(a, normal, d));
    result.push(advancePoint(b, normal, d));
  }
  if (result.length < 2) return null;
  return shape.kind === "segment" ? {kind: "segment", start: result[0], end: result[1]} : {...shape, points: result};
}
