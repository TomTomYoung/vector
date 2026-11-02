import {advancePoint, crossProduct, displacement, dotProduct, closestOnSegment, distance} from "../utils/geometry.js";

const same = (a, b) => a.x === b.x && a.y === b.y;
const empty = () => ({kind: "none"});
const one = point => ({kind: "point", point});

// Inclusive finite segments. A shared collinear interval has its own result type.
export function segmentContact({first: [a, b], second: [c, d]}) {
  const u = displacement(a, b), v = displacement(c, d), w = displacement(a, c);
  const det = crossProduct(u, v);
  if (det !== 0) {
    const t = crossProduct(w, v) / det, s = crossProduct(w, u) / det;
    return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? one(advancePoint(a, u, t)) : empty();
  }
  if (same(a, b)) {
    const on = crossProduct(displacement(c, a), v) === 0 &&
      a.x >= Math.min(c.x, d.x) && a.x <= Math.max(c.x, d.x) && a.y >= Math.min(c.y, d.y) && a.y <= Math.max(c.y, d.y);
    return on ? one(a) : empty();
  }
  if (crossProduct(w, u) !== 0) return empty();
  const axis = Math.abs(u.x) >= Math.abs(u.y) ? "x" : "y";
  const t0 = (c[axis] - a[axis]) / u[axis], t1 = (d[axis] - a[axis]) / u[axis];
  const lo = Math.max(0, Math.min(t0, t1)), hi = Math.min(1, Math.max(t0, t1));
  if (lo > hi) return empty();
  const start = advancePoint(a, u, lo);
  return lo === hi ? one(start) : {kind: "overlap", start, end: advancePoint(a, u, hi)};
}

export function segmentDistance({first, second}, ops = {}) {
  const hit = (ops.segmentContact ?? segmentContact)({first, second});
  if (hit.kind !== "none") return 0;
  const closest = ops.closestOnSegment ?? closestOnSegment, measure = ops.distance ?? distance;
  const from = (p, segment) => measure(p, closest(p, ...segment).point);
  return Math.min(from(first[0], second), from(first[1], second), from(second[0], first), from(second[1], first));
}

// Work in a unit line frame; negative/near-zero discriminants are classified relative to r² and height².
export function lineCircleIntersections({start, end, center, radius, domain = "line"}) {
  if (!["line", "ray", "segment"].includes(domain)) throw new RangeError("Invalid line domain");
  if (radius < 0) return [];
  const v = displacement(start, end), length = Math.hypot(v.x, v.y);
  if (!length) return domain === "segment" && Math.hypot(start.x - center.x, start.y - center.y) === radius ? [start] : [];
  const unit = {x: v.x / length, y: v.y / length}, offset = displacement(start, center);
  const along = dotProduct(offset, unit), height = crossProduct(unit, offset);
  const disc = radius * radius - height * height;
  const error = 16 * Number.EPSILON * Math.max(radius * radius, height * height);
  if (disc < -error) return [];
  const roots = Math.abs(disc) <= error ? [along] : [along - Math.sqrt(disc), along + Math.sqrt(disc)];
  const eps = 16 * Number.EPSILON * Math.max(length, Math.abs(along), radius);
  return roots.filter(t => domain === "line" || (t >= -eps && (domain !== "segment" || t <= length + eps)))
    .map(t => advancePoint(start, unit, domain === "line" ? t : Math.max(0, domain === "segment" ? Math.min(length, t) : t)));
}

export function circleIntersections({first, second}) {
  const a = first.center, b = second.center, r = first.radius, s = second.radius;
  if (r < 0 || s < 0) return empty();
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (!d) return r !== s ? empty() : r === 0 ? one(a) : {kind: "coincident"};
  if (d > r + s || d < Math.abs(r - s)) return empty();
  const x = (d + (r - s) * (r + s) / d) / 2;
  const unit = {x: dx / d, y: dy / d}, base = advancePoint(a, unit, x);
  if (d === r + s || d === Math.abs(r - s)) return one(base);
  const h = Math.sqrt(Math.max(0, (r - x) * (r + x))), normal = {x: -unit.y, y: unit.x};
  return {kind: "pair", points: [advancePoint(base, normal, h), advancePoint(base, normal, -h)]};
}

// Each tangent includes a unit normal, so it is usable even when its contacts coincide.
export function commonCircleTangents({first, second}) {
  const a = first.center, b = second.center, r = first.radius, s = second.radius;
  if (!(r > 0 && s > 0)) return null;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (!d) return r === s ? {kind: "coincident"} : {kind: "finite", tangents: []};
  const ux = dx / d, uy = dy / d, tangents = [];
  for (const side of [1, -1]) {
    const k = (r - side * s) / d;
    if (Math.abs(k) > 1) continue;
    const h = Math.sqrt((1 - k) * (1 + k));
    for (const v of h === 0 ? [0] : [-h, h]) {
      const normal = {x: k * ux - v * uy, y: k * uy + v * ux};
      tangents.push({
        family: side === 1 ? "external" : "internal", normal,
        first: advancePoint(a, normal, r), second: advancePoint(b, normal, side * s)
      });
    }
  }
  return {kind: "finite", tangents};
}

export function clipSegmentToBox({start, end, box}) {
  if (box.width < 0 || box.height < 0) return null;
  const v = displacement(start, end);
  let enter = 0, leave = 1;
  for (const [axis, size] of [["x", "width"], ["y", "height"]]) {
    const min = box[axis], max = min + box[size], origin = start[axis];
    if (v[axis] === 0) {
      if (origin < min || origin > max) return null;
    } else {
      const t1 = (min - origin) / v[axis], t2 = (max - origin) / v[axis];
      enter = Math.max(enter, Math.min(t1, t2));
      leave = Math.min(leave, Math.max(t1, t2));
      if (enter > leave) return null;
    }
  }
  return {kind: "segment", start: advancePoint(start, v, enter), end: advancePoint(start, v, leave)};
}
