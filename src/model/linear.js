import {distance, lineIntersection, crossProduct} from "../utils/geometry.js";

const epsilon = 1e-8;

// A position is a segment index plus a fraction of that segment.
export function nearestPosition(points, point, measure = distance) {
  let best = {distance: Infinity, position: 0};
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const squared = dx * dx + dy * dy;
    if (!squared) continue;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / squared));
    const separation = measure(point, {x: a.x + t * dx, y: a.y + t * dy});
    if (separation < best.distance) best = {distance: separation, position: i - 1 + t};
  }
  return best;
}

function at(points, position) {
  const i = Math.floor(position), t = position - i;
  if (!t) return points[i];
  const a = points[i], b = points[i + 1];
  return {x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y)};
}

function part(points, from, to) {
  return [at(points, from), ...points.slice(Math.floor(from) + 1, Math.ceil(to)), at(points, to)];
}

export function splitAt(points, position) {
  const end = points.length - 1;
  if (!(position > epsilon && position < end - epsilon)) return [];
  return [part(points, 0, position), part(points, position, end)];
}

export function split({points, point, tolerance = Infinity, endMargin = 0}, ops = {}) {
  if (points.length < 2) return [];
  const measure = ops.distance ?? distance;
  const hit = (ops.nearestPosition ?? nearestPosition)(points, point, measure);
  if (!Number.isFinite(hit.distance) || hit.distance > tolerance) return [];
  const p = at(points, hit.position);
  if (measure(p, points[0]) < endMargin || measure(p, points.at(-1)) < endMargin) return [];
  return (ops.splitAt ?? splitAt)(points, hit.position);
}

function segments(outlines) {
  return outlines.flatMap(points => points.slice(1).map((b, i) => [points[i], b]));
}

const endpoints = (a, b) => ({x1: a.x, y1: a.y, x2: b.x, y2: b.y});

export function trim({points, boundaries, point}, ops = {}) {
  const end = points.length - 1;
  if (end < 1) return [];
  const measure = ops.distance ?? distance;
  const intersect = ops.lineIntersection ?? lineIntersection;
  const edges = segments(boundaries);
  const {position} = (ops.nearestPosition ?? nearestPosition)(points, point, measure);
  let left = 0, right = end;
  for (let i = 1; i <= end; i++) {
    const a = points[i - 1], b = points[i], length = measure(a, b);
    if (length < epsilon) continue;
    for (const [c, d] of edges) {
      const hit = intersect(endpoints(a, b), endpoints(c, d));
      if (!hit) continue;
      const cut = i - 1 + measure(a, hit) / length;
      if (cut <= epsilon || cut >= end - epsilon) continue;
      if (cut <= position) left = Math.max(left, cut);
      else right = Math.min(right, cut);
    }
  }
  const kept = [];
  if (left > 0) kept.push(part(points, 0, left));
  if (right < end) kept.push(part(points, right, end));
  return kept;
}

export function extendEnd(tip, neighbor, edges, cross = crossProduct) {
  const ray = {x: tip.x - neighbor.x, y: tip.y - neighbor.y};
  let nearest = Infinity;
  for (const [a, b] of edges) {
    const edge = {x: b.x - a.x, y: b.y - a.y};
    const div = cross(ray, edge);
    if (Math.abs(div) < epsilon) continue;
    const offset = {x: a.x - tip.x, y: a.y - tip.y};
    const t = cross(offset, edge) / div, u = cross(offset, ray) / div;
    if (t > epsilon && u >= -epsilon && u <= 1 + epsilon) nearest = Math.min(nearest, t);
  }
  return Number.isFinite(nearest) ? {x: tip.x + nearest * ray.x, y: tip.y + nearest * ray.y} : tip;
}

export function extend({points, boundaries}, ops = {}) {
  if (points.length < 2) return [];
  const edges = segments(boundaries);
  const reach = ops.extendEnd ?? extendEnd;
  const start = reach(points[0], points[1], edges, ops.crossProduct);
  const end = reach(points.at(-1), points.at(-2), edges, ops.crossProduct);
  if (start === points[0] && end === points.at(-1)) return [];
  return [[start, ...points.slice(1, -1), end]];
}

export function join({segments, tolerance = 0.1}, ops = {}) {
  if (!segments.length || segments.some(part => part.length < 2)) return [];
  const measure = ops.distance ?? distance;
  const near = (a, b) => measure(a, b) < tolerance;
  const chain = [...segments[0]], remaining = segments.slice(1);
  while (remaining.length) {
    const i = remaining.findIndex(part => [part[0], part.at(-1)].some(p => near(chain[0], p) || near(chain.at(-1), p)));
    if (i < 0) return [];
    const [part] = remaining.splice(i, 1);
    if (near(chain.at(-1), part[0])) chain.push(...part.slice(1));
    else if (near(chain.at(-1), part.at(-1))) chain.push(...part.slice(0, -1).reverse());
    else if (near(chain[0], part.at(-1))) chain.unshift(...part.slice(0, -1));
    else chain.unshift(...part.slice(1).reverse());
  }
  return chain;
}
