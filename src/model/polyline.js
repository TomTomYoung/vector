import {distance, interpolatePoint, displacement, closestOnSegment, crossProduct, dotProduct} from "../utils/geometry.js";

export function cumulativeLengths({points}, ops = {}) {
  const measure = ops.distance ?? distance;
  const totals = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i) total += measure(points[i - 1], points[i]);
    totals.push(total);
  }
  return totals;
}

function atLength(points, totals, length) {
  if (!points.length) return null;
  if (length <= 0) return points[0];
  if (length >= totals.at(-1)) return points.at(-1);
  let low = 1, high = totals.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (totals[mid] < length) low = mid + 1;
    else high = mid;
  }
  const i = low;
  return interpolatePoint(points[i - 1], points[i], (length - totals[i - 1]) / (totals[i] - totals[i - 1]));
}

export function pointAtLength({points, length}, ops = {}) {
  return atLength(points, cumulativeLengths({points}, ops), length);
}

export function resamplePolyline({points, intervals}, ops = {}) {
  if (!Number.isInteger(intervals) || intervals < 1 || intervals > 100000) return null;
  if (!points.length) return [];
  const totals = cumulativeLengths({points}, ops), length = totals.at(-1);
  if (!length) return [points[0]];
  return Array.from({length: intervals + 1}, (_, i) => atLength(points, totals, (i / intervals) * length));
}

function subchain(points, totals, start, end) {
  // Begin at the first original vertex strictly after start, even for many repeated lengths.
  let low = 0, high = totals.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (totals[mid] <= start) low = mid + 1;
    else high = mid;
  }
  const result = [atLength(points, totals, start)];
  for (let i = low; i < totals.length && totals[i] < end; i++) result.push(points[i]);
  result.push(atLength(points, totals, end));
  return result;
}

export function slicePolyline({points, from, to}, ops = {}) {
  if (!points.length) return [];
  const totals = cumulativeLengths({points}, ops), length = totals.at(-1);
  const a = Math.max(0, Math.min(length, from)), b = Math.max(0, Math.min(length, to));
  if (a === b) return [atLength(points, totals, a)];
  const part = subchain(points, totals, Math.min(a, b), Math.max(a, b));
  return a < b ? part : part.reverse();
}

export function simplifyPolyline({points, tolerance}, ops = {}) {
  if (!(tolerance >= 0)) return null;
  if (points.length < 3) return [...points];
  const closest = ops.closestOnSegment ?? closestOnSegment, measure = ops.distance ?? distance;
  const keep = new Set([0, points.length - 1]), pending = [[0, points.length - 1]];
  while (pending.length) {
    const [a, b] = pending.pop();
    let farthest = -1, error = tolerance;
    for (let i = a + 1; i < b; i++) {
      const separation = measure(points[i], closest(points[i], points[a], points[b]).point);
      if (separation > error) {error = separation; farthest = i;}
    }
    if (farthest >= 0) {
      keep.add(farthest);
      pending.push([a, farthest], [farthest, b]);
    }
  }
  return points.filter((_, i) => keep.has(i));
}

export function dashPolyline({points, pattern, phase = 0}, ops = {}) {
  if (!pattern.length || !pattern.every(n => Number.isFinite(n) && n > 0) || !Number.isFinite(phase)) return null;
  if (points.length < 2) return [];
  const lengths = pattern.length % 2 ? [...pattern, ...pattern] : pattern;
  const period = lengths.reduce((a, b) => a + b, 0);
  const totals = cumulativeLengths({points}, ops), total = totals.at(-1);
  if (!Number.isFinite(total) || !Number.isFinite(period)) return null;
  let used = ((phase % period) + period) % period, i = 0;
  while (i < lengths.length - 1 && used >= lengths[i]) used -= lengths[i++];
  let remaining = lengths[i] - used, position = 0;
  const pieces = [];
  while (position < total) {
    const end = Math.min(total, position + remaining);
    if (!(end > position) || pieces.length >= 100000) return null;
    if (i % 2 === 0) pieces.push(subchain(points, totals, position, end));
    position = end;
    i = (i + 1) % lengths.length;
    remaining = lengths[i];
  }
  return pieces;
}

// Signed distances use the left normal of each directed edge, including after a turn.
export function offsetMiter({points, amount, closed = false, miterLimit = Infinity}) {
  const chain = points.filter((p, i) => !i || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
  if (closed && chain.length > 1 && chain[0].x === chain.at(-1).x && chain[0].y === chain.at(-1).y) chain.pop();
  if (chain.length < (closed ? 3 : 2) || !(miterLimit >= 1)) return null;
  if (amount === 0) return {kind: "polyline", points: chain, closed};
  const normals = [], result = [];
  for (let i = 0; i < (closed ? chain.length : chain.length - 1); i++) {
    const v = displacement(chain[i], chain[(i + 1) % chain.length]), d = Math.hypot(v.x, v.y);
    normals.push({x: -v.y / d, y: v.x / d});
  }
  for (let i = 0; i < chain.length; i++) {
    const a = normals[(i + normals.length - 1) % normals.length], b = normals[i % normals.length];
    let x, y;
    if (!closed && (i === 0 || i === chain.length - 1)) {
      const normal = i === 0 ? b : a;
      x = normal.x; y = normal.y;
    } else {
      const sum = {x: a.x + b.x, y: a.y + b.y};
      const squared = dotProduct(sum, sum);
      if (!squared || (crossProduct(a, b) === 0 && dotProduct(a, b) < 0)) return null;
      x = 2 * sum.x / squared; y = 2 * sum.y / squared;
      if (Math.hypot(x, y) > miterLimit) return null;
    }
    result.push({x: chain[i].x + amount * x, y: chain[i].y + amount * y});
  }
  return {kind: "polyline", points: result, closed};
}
