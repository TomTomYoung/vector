import {distance, displacement, dotProduct} from "../utils/geometry.js";
import {circleFromDiameter} from "./conics.js";

export function meanPoint({points}) {
  if (!points.length) return null;
  const origin = points[0];
  let x = 0, y = 0;
  for (const p of points) {x += p.x - origin.x; y += p.y - origin.y;}
  return {x: origin.x + x / points.length, y: origin.y + y / points.length};
}

export function principalAxes({points}, ops = {}) {
  const center = (ops.meanPoint ?? meanPoint)({points});
  if (!center) return null;
  let xx = 0, xy = 0, yy = 0;
  for (const p of points) {
    const x = p.x - center.x, y = p.y - center.y;
    xx += x * x; xy += x * y; yy += y * y;
  }
  const n = points.length;
  xx /= n; xy /= n; yy /= n;
  const gap = Math.hypot(xx - yy, 2 * xy), high = (xx + yy + gap) / 2;
  const variance = [high, Math.max(0, (xx + yy - gap) / 2)];
  if (gap === 0) return {center, variance, major: null, minor: null};
  const angle = Math.atan2(2 * xy, xx - yy) / 2, major = {x: Math.cos(angle), y: Math.sin(angle)};
  return {center, variance, major, minor: {x: -major.y, y: major.x}};
}

export function fitLine({points}, ops = {}) {
  const axes = (ops.principalAxes ?? principalAxes)({points}, ops);
  if (!axes?.major) return null;
  return {kind: "line", point: axes.center, direction: axes.major, rms: Math.sqrt(axes.variance[1])};
}

export function fitCircle({points}, ops = {}) {
  if (points.length < 3) return null;
  const mean = (ops.meanPoint ?? meanPoint)({points});
  let xx = 0, xy = 0, yy = 0, xz = 0, yz = 0;
  for (const p of points) {
    const {x, y} = displacement(mean, p), z = x * x + y * y;
    xx += x * x; xy += x * y; yy += y * y; xz += x * z; yz += y * z;
  }
  const det = xx * yy - xy * xy;
  if (!(det > 16 * Number.EPSILON * xx * yy)) return null;
  const dx = (yy * xz - xy * yz) / (2 * det), dy = (xx * yz - xy * xz) / (2 * det);
  const center = {x: mean.x + dx, y: mean.y + dy}, radius = Math.sqrt((xx + yy) / points.length + dx * dx + dy * dy);
  const errors = points.reduce((sum, p) => sum + (distance(p, center) - radius) ** 2, 0);
  return {kind: "circle", center, radius, rms: Math.sqrt(errors / points.length)};
}

export function closestPair({points}, ops = {}) {
  if (points.length < 2) return null;
  const measure = ops.distance ?? distance;
  let best = Infinity, indices;
  for (let i = 0; i < points.length - 1; i++) for (let j = i + 1; j < points.length; j++) {
    const d = measure(points[i], points[j]);
    if (d < best) {best = d; indices = [i, j];}
  }
  return {indices, distance: best};
}

export function minimumEnclosingCircle({points}) {
  if (!points.length) return null;
  const contains = (c, p) => distance(c.center, p) <= c.radius * (1 + 16 * Number.EPSILON);
  function through(a, b, c) {
    const u = displacement(a, b), v = displacement(a, c), det = 2 * (u.x * v.y - u.y * v.x);
    if (!det) {
      return [[a, b], [a, c], [b, c]].map(([start, end]) => circleFromDiameter({start, end})).sort((s, t) => t.radius - s.radius)[0];
    }
    const uu = dotProduct(u, u), vv = dotProduct(v, v);
    const center = {x: a.x + (v.y * uu - u.y * vv) / det, y: a.y + (u.x * vv - v.x * uu) / det};
    return {kind: "circle", center, radius: Math.max(distance(center, a), distance(center, b), distance(center, c))};
  }
  let circle = {kind: "circle", center: points[0], radius: 0};
  for (let i = 1; i < points.length; i++) {
    if (contains(circle, points[i])) continue;
    circle = {kind: "circle", center: points[i], radius: 0};
    for (let j = 0; j < i; j++) {
      if (contains(circle, points[j])) continue;
      circle = circleFromDiameter({start: points[i], end: points[j]});
      for (let k = 0; k < j; k++) {
        if (!contains(circle, points[k])) circle = through(points[i], points[j], points[k]);
      }
    }
  }
  return circle;
}
