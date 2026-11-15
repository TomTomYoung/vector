import {deCasteljau} from "./bezier.js";
import {splitBezier, subBezier, elevateBezier, bezierDerivative} from "./curveAnalysis.js";
import {pointBounds} from "./polygons.js";

const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (t, lo, hi) => Math.max(lo, Math.min(hi, t));
const scalar = (values, t) => {
  const row = [...values];
  for (let n = row.length - 1; n > 0; n--) for (let i = 0; i < n; i++) row[i] += t * (row[i + 1] - row[i]);
  return row[0];
};
// Derivative roots partition a Bernstein polynomial into monotone intervals.
function roots(values, epsilon) {
  if (values.every(v => Math.abs(v) <= epsilon)) return [0, 1];
  if (values.length === 1) return [];
  const n = values.length - 1;
  const critical = roots(values.slice(1).map((v, i) => n * (v - values[i])), epsilon);
  const cuts = [0, ...critical.filter(t => t > 0 && t < 1), 1].sort((a, b) => a - b), result = [];
  for (const t of cuts) if (Math.abs(scalar(values, t)) <= epsilon) result.push(t);
  for (let i = 1; i < cuts.length; i++) {
    let lo = cuts[i - 1], hi = cuts[i], f = scalar(values, lo), g = scalar(values, hi);
    if (f * g >= 0 || Math.abs(f) <= epsilon || Math.abs(g) <= epsilon) continue;
    for (let step = 0; step < 52; step++) {
      const t = (lo + hi) / 2, h = scalar(values, t);
      if (h === 0) {lo = hi = t; break;}
      if (f * h < 0) hi = t;
      else {lo = t; f = h;}
    }
    result.push((lo + hi) / 2);
  }
  return result.sort((a, b) => a - b).filter((t, i, all) => !i || t - all[i - 1] > 1e-12);
}

// Finite precision isolation, with explicit unresolved parameter rectangles on budget exhaustion.
export function bezierIntersections({first, second, tolerance = 1e-7, parameterTolerance = 1e-6,
  maxDepth = 60, maxNodes = 100000}, ops = {}) {
  if (![first, second].every(c => Array.isArray(c) && c.length > 0 && c.length <= 33 && c.every(finite)) ||
    !Number.isFinite(tolerance) || tolerance <= 0 || !Number.isFinite(parameterTolerance) || parameterTolerance <= 0 || parameterTolerance > 1 ||
    !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 60 || !Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 1000000) return null;
  const split = ops.splitBezier ?? splitBezier, sub = ops.subBezier ?? subBezier;
  const elevate = ops.elevateBezier ?? elevateBezier, derive = ops.bezierDerivative ?? bezierDerivative;
  const evaluate = ops.deCasteljau ?? deCasteljau;
  const magnitude = Math.max(1, ...[...first, ...second].flatMap(p => [Math.abs(p.x), Math.abs(p.y)]));
  const roundoff = 64 * Number.EPSILON * magnitude * Math.max(first.length, second.length);
  const overlaps = [], intersections = [], unresolved = [];
  if (tolerance < roundoff * 4 || parameterTolerance < 64 * Number.EPSILON) {
    return {intersections, overlaps, complete: false,
      unresolved: [{t: [0, 1], u: [0, 1], reason: "precision"}], visited: 0};
  }
  function parameters(curve, point) {
    const bounds = pointBounds({points: curve}), axis = bounds.width >= bounds.height ? "x" : "y";
    return roots(curve.map(p => p[axis] - point[axis]), roundoff).filter(t => distance(evaluate(curve, t), point) <= roundoff * 4);
  }
  function sameCurves(a, b) {
    while (a.length < b.length) a = elevate({points: a});
    while (b.length < a.length) b = elevate({points: b});
    return a.every((p, i) => distance(p, b[i]) <= roundoff * 4);
  }
  const endpoints = [
    ...parameters(second, first[0]).map(u => [0, u]),
    ...parameters(second, first.at(-1)).map(u => [1, u]),
    ...parameters(first, second[0]).map(t => [t, 0]),
    ...parameters(first, second.at(-1)).map(t => [t, 1]),
  ];
  for (let i = 0; i < endpoints.length; i++) for (let j = i + 1; j < endpoints.length; j++) {
    let [t0, u0] = endpoints[i], [t1, u1] = endpoints[j];
    if (Math.abs(t0 - t1) < 1e-12 || Math.abs(u0 - u1) < 1e-12) continue;
    if (t0 > t1) {[t0, t1] = [t1, t0]; [u0, u1] = [u1, u0];}
    if (sameCurves(sub({points: first, from: t0, to: t1}, ops), sub({points: second, from: u0, to: u1}, ops)))
      overlaps.push({t: [t0, t1], u: [u0, u1], mapping: "affine"});
  }
  // Collinear polynomials can trace the same interval with different speeds or reversals.
  const all = [...first, ...second], origin = all[0], far = all.reduce((a, p) => distance(origin, p) > distance(origin, a) ? p : a);
  const span = distance(origin, far);
  if (span <= roundoff) {
    return {intersections: [], overlaps: [{t: [0, 1], u: [0, 1], mapping: "point"}], complete: true, unresolved: [], visited: 0};
  }
  const dx = (far.x - origin.x) / span, dy = (far.y - origin.y) / span;
  const collinear = all.every(p => Math.abs((p.x - origin.x) * dy - (p.y - origin.y) * dx) <= roundoff);
  if (collinear) {
    overlaps.length = 0;
    const projection = curve => curve.map(p => (p.x - origin.x) * dx + (p.y - origin.y) * dy);
    const a = projection(first), b = projection(second);
    const intervals = values => {
      const cuts = [0, ...roots(values.slice(1).map((v, i) => (values.length - 1) * (v - values[i])), roundoff).filter(t => t > 0 && t < 1), 1];
      return cuts.slice(1).map((hi, i) => [cuts[i], hi]);
    };
    const inverse = (v, range, value) => {
      let [lo, hi] = range;
      const increasing = scalar(v, hi) >= scalar(v, lo);
      for (let i = 0; i < 52; i++) {
        const mid = (lo + hi) / 2;
        if ((scalar(v, mid) < value) === increasing) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    };
    for (const tr of intervals(a)) for (const ur of intervals(b)) {
      const av = tr.map(t => scalar(a, t)), bv = ur.map(u => scalar(b, u));
      const lo = Math.max(Math.min(...av), Math.min(...bv)), hi = Math.min(Math.max(...av), Math.max(...bv));
      if (lo > hi + roundoff) continue;
      const constantA = Math.abs(av[1] - av[0]) <= roundoff, constantB = Math.abs(bv[1] - bv[0]) <= roundoff;
      const t = constantA ? tr : [inverse(a, tr, lo), inverse(a, tr, hi)];
      const u = constantB ? ur : [inverse(b, ur, lo), inverse(b, ur, hi)];
      if (t[0] > t[1]) {t.reverse(); u.reverse();}
      if (hi - lo > roundoff || constantA || constantB) overlaps.push({t, u, mapping: "collinear"});
      else {
        const point = evaluate(first, t[0]);
        intersections.push({t: t[0], u: u[0], point, residual: distance(point, evaluate(second, u[0])),
          tRange: [t[0], t[0]], uRange: [u[0], u[0]]});
      }
    }
    return {intersections, overlaps, complete: true, unresolved, visited: 0};
  }
  // Constant curves represent a whole parameter interval at each matching point.
  for (const [constant, other, swap] of [[first, second, false], [second, first, true]]) {
    if (!constant.every(p => distance(p, constant[0]) <= roundoff)) continue;
    const matches = parameters(other, constant[0]);
    return {intersections: [], overlaps: matches.map(t => ({t: swap ? [t, t] : [0, 1],
      u: swap ? [0, 1] : [t, t], mapping: "point"})), complete: true, unresolved: [], visited: 0};
  }
  // Drop overlap intervals contained in a larger one, including duplicate endpoint pairs.
  overlaps.sort((a, b) => (b.t[1] - b.t[0]) - (a.t[1] - a.t[0]));
  for (let i = overlaps.length - 1; i >= 0; i--) {
    if (overlaps.slice(0, i).some(o => overlaps[i].t.every(t => t >= o.t[0] - 1e-12 && t <= o.t[1] + 1e-12) &&
      overlaps[i].u.every(u => u >= Math.min(...o.u) - 1e-12 && u <= Math.max(...o.u) + 1e-12))) overlaps.splice(i, 1);
  }
  // Curve/line intersections reduce to one Bernstein polynomial, including even roots.
  for (const [line, curve, swap] of [[second, first, false], [first, second, true]]) {
    const base = line[0], tip = line.reduce((best, p) => distance(base, p) > distance(base, best) ? p : best);
    const length = distance(base, tip);
    if (length <= roundoff) continue;
    const nx = -(tip.y - base.y) / length, ny = (tip.x - base.x) / length;
    if (!line.every(p => Math.abs((p.x - base.x) * nx + (p.y - base.y) * ny) <= roundoff)) continue;
    const polynomial = curve.map(p => (p.x - base.x) * nx + (p.y - base.y) * ny);
    for (const t of roots(polynomial, roundoff)) {
      const point = evaluate(curve, t);
      for (const u of parameters(line, point)) intersections.push({t: swap ? u : t, u: swap ? t : u,
        point, residual: distance(point, evaluate(line, u)), tRange: swap ? [u, u] : [t, t], uRange: swap ? [t, t] : [u, u]});
    }
    intersections.sort((a, b) => a.t - b.t || a.u - b.u);
    return {intersections, overlaps, complete: true, unresolved, visited: 0};
  }
  function separated(a, b) {
    // Project control hulls onto edge normals as well as x/y. This keeps rotated
    // tangencies from producing a broad band of false AABB contacts.
    const origin = a[0];
    for (const curve of [a, b]) for (let i = 0; i < curve.length; i++) {
      const p = curve[i], q = curve[(i + 1) % curve.length], length = distance(p, q);
      if (!length) continue;
      const nx = (p.y - q.y) / length, ny = (q.x - p.x) / length;
      const project = c => c.map(p => (p.x - origin.x) * nx + (p.y - origin.y) * ny);
      const u = project(a), v = project(b);
      if (Math.min(...u) > Math.max(...v) + roundoff || Math.min(...v) > Math.max(...u) + roundoff) return true;
    }
    return false;
  }
  const pending = [{a: first, b: second, t: [0, 1], u: [0, 1], depth: 0}];
  let visited = 0;
  function covered(t, u) {
    return overlaps.some(o => t[0] >= o.t[0] - 1e-12 && t[1] <= o.t[1] + 1e-12 &&
      u[0] >= Math.min(...o.u) - 1e-12 && u[1] <= Math.max(...o.u) + 1e-12);
  }
  function candidate(tr, ur) {
    let t = (tr[0] + tr[1]) / 2, u = (ur[0] + ur[1]) / 2;
    for (let i = 0; i < 10; i++) {
      const a = evaluate(first, t), b = evaluate(second, u), v = derive({points: first, t}), w = derive({points: second, t: u});
      const x = b.x - a.x, y = b.y - a.y, det = v.x * w.y - v.y * w.x;
      if (Math.abs(det) <= Number.EPSILON * Math.hypot(v.x, v.y) * Math.hypot(w.x, w.y)) break;
      const nt = clamp(t + (x * w.y - y * w.x) / det, ...tr), nu = clamp(u + (x * v.y - y * v.x) / det, ...ur);
      if (nt === t && nu === u) break;
      t = nt; u = nu;
    }
    const a = evaluate(first, t), b = evaluate(second, u), residual = distance(a, b);
    if (residual > tolerance + roundoff) return false;
    intersections.push({t, u, point: {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2}, residual, tRange: tr, uRange: ur});
    return true;
  }
  while (pending.length) {
    if (visited >= maxNodes) {
      unresolved.push(...pending.map(({t, u}) => ({t, u, reason: "maxNodes"}))); break;
    }
    const node = pending.pop(), {a, b, t, u, depth} = node;
    visited++;
    if (covered(t, u)) continue;
    const ba = pointBounds({points: a}), bb = pointBounds({points: b});
    // Pad only by arithmetic roundoff, not by the requested geometric tolerance.
    if (ba.x > bb.x + bb.width + roundoff || bb.x > ba.x + ba.width + roundoff || ba.y > bb.y + bb.height + roundoff || bb.y > ba.y + ba.height + roundoff) continue;
    if (separated(a, b)) continue;
    const small = Math.max(t[1] - t[0], u[1] - u[0]) <= parameterTolerance &&
      Math.max(ba.width, ba.height, bb.width, bb.height) <= tolerance;
    if (small && candidate(t, u)) continue;
    if (depth >= maxDepth) {unresolved.push({t, u, reason: "maxDepth"}); continue;}
    const splitA = Math.max(ba.width, ba.height) > Math.max(bb.width, bb.height) ||
      (ba.width === bb.width && ba.height === bb.height && t[1] - t[0] >= u[1] - u[0]);
    const range = splitA ? t : u, mid = (range[0] + range[1]) / 2;
    const parts = split({points: splitA ? a : b, t: 0.5}, ops);
    for (const [curve, r] of [[parts.right, [mid, range[1]]], [parts.left, [range[0], mid]]]) {
      pending.push(splitA ? {...node, a: curve, t: r, depth: depth + 1} : {...node, b: curve, u: r, depth: depth + 1});
    }
  }
  // Adjacent parameter rectangles represent one root at the requested resolution.
  const merged = [];
  intersections.sort((a, b) => a.t - b.t || a.u - b.u);
  for (const hit of intersections) {
    const previous = merged.find(p => p.tRange[0] <= hit.tRange[1] + parameterTolerance && hit.tRange[0] <= p.tRange[1] + parameterTolerance &&
      p.uRange[0] <= hit.uRange[1] + parameterTolerance && hit.uRange[0] <= p.uRange[1] + parameterTolerance);
    if (!previous) merged.push(hit);
    else {
      previous.tRange = [Math.min(previous.tRange[0], hit.tRange[0]), Math.max(previous.tRange[1], hit.tRange[1])];
      previous.uRange = [Math.min(previous.uRange[0], hit.uRange[0]), Math.max(previous.uRange[1], hit.uRange[1])];
      if (hit.residual < previous.residual) {
        previous.t = hit.t; previous.u = hit.u; previous.point = hit.point; previous.residual = hit.residual;
      }
    }
  }
  return {intersections: merged, overlaps, complete: unresolved.length === 0, unresolved, visited};
}
