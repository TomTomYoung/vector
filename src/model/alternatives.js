// Independently callable alternatives. Contracts and sources: doc/implementation-options.md.
import {spline} from './drawing.js';
import {offset} from './construction.js';
import {offsetMiter} from './polyline.js';
import {orientation} from './predicates.js';

export const uniformCatmullRom = input => spline({...input, tension: 1});

export function parameterizedCatmullRom({points}, alpha = 0.5) {
  const p = points.filter((v, i) => !i || v.x !== points[i - 1].x || v.y !== points[i - 1].y);
  if (p.length < 2) return null;
  const phantom = (a, b) => ({x: 2 * a.x - b.x, y: 2 * a.y - b.y});
  const segments = [];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] ?? phantom(p[i], p[i + 1]), b = p[i], c = p[i + 1], d = p[i + 2] ?? phantom(c, b);
    const h0 = Math.hypot(b.x - a.x, b.y - a.y) ** alpha;
    const h1 = Math.hypot(c.x - b.x, c.y - b.y) ** alpha;
    const h2 = Math.hypot(d.x - c.x, d.y - c.y) ** alpha;
    if (![h0, h1, h2].every(h => h > 0 && Number.isFinite(h))) return null;
    const control1 = {}, control2 = {};
    for (const axis of ['x', 'y']) {
      const m1 = h1 * ((b[axis] - a[axis]) / h0 - (c[axis] - a[axis]) / (h0 + h1) + (c[axis] - b[axis]) / h1);
      const m2 = h1 * ((c[axis] - b[axis]) / h1 - (d[axis] - b[axis]) / (h1 + h2) + (d[axis] - c[axis]) / h2);
      control1[axis] = b[axis] + m1 / 3; control2[axis] = c[axis] - m2 / 3;
    }
    segments.push({kind: 'cubic', control1, control2, end: c});
  }
  return {kind: 'path', start: p[0], segments};
}

export function miterOffset(input, ops = {}) {
  const {shape, point, amount, miterLimit = 10} = input;
  if (!['segment', 'polyline'].includes(shape.kind)) return offset(input, ops);
  const points = shape.kind === 'segment' ? [shape.start, shape.end] : shape.points;
  const a = points[0], b = points.find(p => p.x !== a.x || p.y !== a.y);
  if (!b) return null;
  const side = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  const result = offsetMiter({points, amount: side > 0 ? amount : -amount, closed: !!shape.closed, miterLimit});
  return result && (shape.kind === 'segment' ? {kind: 'segment', start: result.points[0], end: result.points[1]} : result);
}

export function jarvisHull({points}, ops = {}) {
  const turn = ops.orientation ?? orientation;
  const unique = [...new Map(points.map(p => [p.x + ',' + p.y, p])).values()];
  if (unique.length < 2) return unique;
  const start = unique.reduce((a, b) => b.x < a.x || (b.x === a.x && b.y < a.y) ? b : a);
  const hull = []; let current = start;
  do {
    hull.push(current);
    let next = unique.find(p => p !== current);
    for (const p of unique) {
      const sign = turn(current, next, p);
      if (sign < 0 || (sign === 0 && Math.hypot(p.x - current.x, p.y - current.y) > Math.hypot(next.x - current.x, next.y - current.y))) next = p;
    }
    current = next;
    if (hull.length > unique.length) return null;
  } while (current !== start);
  return hull;
}

export function cohenSutherland({start, end, box}) {
  if (box.width < 0 || box.height < 0) return null;
  const left = box.x, right = box.x + box.width, top = box.y, bottom = box.y + box.height;
  if (![start.x, start.y, end.x, end.y, left, right, top, bottom].every(Number.isFinite)) return null;
  const code = p => (p.x < left ? 1 : p.x > right ? 2 : 0) | (p.y < top ? 4 : p.y > bottom ? 8 : 0);
  let a = {...start}, b = {...end};
  for (let iteration = 0; iteration < 16; iteration++) {
    const ca = code(a), cb = code(b);
    if (!(ca | cb)) return {kind: 'segment', start: a, end: b};
    if (ca & cb) return null;
    const c = ca || cb; let p;
    if (c & 8) p = {x: a.x + (b.x - a.x) * ((bottom - a.y) / (b.y - a.y)), y: bottom};
    else if (c & 4) p = {x: a.x + (b.x - a.x) * ((top - a.y) / (b.y - a.y)), y: top};
    else if (c & 2) p = {x: right, y: a.y + (b.y - a.y) * ((right - a.x) / (b.x - a.x))};
    else p = {x: left, y: a.y + (b.y - a.y) * ((left - a.x) / (b.x - a.x))};
    if (![p.x, p.y].every(Number.isFinite)) return null;
    if (ca) a = p; else b = p;
  }
  throw new Error('クリッピングが数値精度内で収束しません。');
}
