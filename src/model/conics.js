import {distance, midpoint, displacement, advancePoint, normalizeVector, crossProduct, normalizeAngle} from "../utils/geometry.js";
import {circleCenter} from "./drawing.js";
import {pointFromPolar} from "./affine.js";
import {lineCircleIntersections} from "./intersections.js";

export function circleFromDiameter({start, end}, ops = {}) {
  return {kind: "circle", center: (ops.midpoint ?? midpoint)(start, end), radius: (ops.distance ?? distance)(start, end) / 2};
}

export function circumcircle({triangle}, ops = {}) {
  if (triangle.length !== 3) return null;
  const center = (ops.circleCenter ?? circleCenter)(...triangle);
  return center && {kind: "circle", center, radius: (ops.distance ?? distance)(center, triangle[0])};
}

export function triangleIncircle({triangle}, ops = {}) {
  if (triangle.length !== 3) return null;
  const [a, b, c] = triangle, u = displacement(a, b), v = displacement(a, c);
  const twice = Math.abs(crossProduct(u, v));
  if (!twice) return null;
  const measure = ops.distance ?? distance;
  const ab = measure(a, b), bc = measure(b, c), ca = measure(c, a), total = ab + bc + ca;
  const center = advancePoint(advancePoint(a, u, ca / total), v, ab / total);
  return {kind: "circle", center, radius: twice / total};
}

export function triangleOrthocenter({triangle}, ops = {}) {
  if (triangle.length !== 3) return null;
  const center = (ops.circleCenter ?? circleCenter)(...triangle);
  if (!center) return null;
  return advancePoint(advancePoint(triangle[0], displacement(center, triangle[1]), 1), displacement(center, triangle[2]), 1);
}

export function perpendicularBisector({start, end}) {
  const d = displacement(start, end);
  if (!d.x && !d.y) return null;
  return {kind: "line", point: midpoint(start, end), direction: normalizeVector({x: -d.y, y: d.x})};
}

export function angleBisectors({vertex, first, second}) {
  const a = normalizeVector(displacement(vertex, first)), b = normalizeVector(displacement(vertex, second));
  if ((!a.x && !a.y) || (!b.x && !b.y)) return null;
  const sum = {x: a.x + b.x, y: a.y + b.y};
  // Opposite rays have two equally valid half-turn directions; choose the left normal.
  const internal = !sum.x && !sum.y ? {x: -a.y, y: a.x} : normalizeVector(sum);
  return {point: vertex, internal, external: {x: -internal.y, y: internal.x}};
}

export function regularPolygon({center, radius, sides, angle = 0}, ops = {}) {
  if (!Number.isSafeInteger(sides) || sides < 3 || sides > 100000 || !(radius > 0)) return null;
  const polar = ops.pointFromPolar ?? pointFromPolar;
  const points = Array.from({length: sides}, (_, i) => polar({center, radius, angle: angle + i * 2 * Math.PI / sides}));
  return {kind: "polygon", points};
}

export function arcPoint({arc, t}, ops = {}) {
  if (arc.radius < 0 || !(t >= 0 && t <= 1)) return null;
  const angle = Math.atan2(arc.start.y - arc.center.y, arc.start.x - arc.center.x);
  return (ops.pointFromPolar ?? pointFromPolar)({center: arc.center, radius: arc.radius, angle: angle + t * arc.turn});
}

export function arcLength({radius, turn}) {
  return radius < 0 ? null : radius * Math.abs(turn);
}

export function chordLength({radius, turn}) {
  return radius < 0 ? null : 2 * radius * Math.abs(Math.sin(turn / 2));
}

export function sectorArea({radius, turn}) {
  return radius < 0 ? null : radius * radius * turn / 2;
}

export function circularSegmentArea({radius, turn}) {
  return radius < 0 ? null : radius * radius * (turn - Math.sin(turn)) / 2;
}

export function arcBounds({arc}, ops = {}) {
  const evaluate = ops.arcPoint ?? arcPoint;
  const first = evaluate({arc, t: 0}), last = evaluate({arc, t: 1});
  if (!first || !last) return null;
  const {center, radius, turn} = arc;
  const angle = Math.atan2(arc.start.y - center.y, arc.start.x - center.x);
  const points = [first, last];
  for (const [i, x, y] of [[0, 1, 0], [1, 0, 1], [2, -1, 0], [3, 0, -1]]) {
    if (normalizeAngle((i * Math.PI / 2 - angle) * Math.sign(turn)) <= Math.abs(turn) && turn !== 0)
      points.push({x: center.x + radius * x, y: center.y + radius * y});
  }
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return {x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)};
}

function ellipseFrame(ellipse) {
  const {rx, ry, angle = 0} = ellipse;
  if (!(rx > 0 && ry > 0)) return null;
  const c = Math.cos(angle), s = Math.sin(angle);
  return {u: {x: rx * c, y: rx * s}, v: {x: -ry * s, y: ry * c}};
}

export function ellipsePoint({ellipse, angle}) {
  const basis = ellipseFrame(ellipse);
  if (!basis) return null;
  return advancePoint(advancePoint(ellipse.center, basis.u, Math.cos(angle)), basis.v, Math.sin(angle));
}

export function ellipseTangent({ellipse, angle}) {
  const basis = ellipseFrame(ellipse);
  if (!basis) return null;
  return normalizeVector({
    x: -basis.u.x * Math.sin(angle) + basis.v.x * Math.cos(angle),
    y: -basis.u.y * Math.sin(angle) + basis.v.y * Math.cos(angle)
  });
}

export function ellipseArea({ellipse}) {
  return ellipse.rx > 0 && ellipse.ry > 0 ? Math.PI * ellipse.rx * ellipse.ry : null;
}

export function ellipseBounds({ellipse}) {
  const basis = ellipseFrame(ellipse);
  if (!basis) return null;
  const x = Math.hypot(basis.u.x, basis.v.x), y = Math.hypot(basis.u.y, basis.v.y);
  return {x: ellipse.center.x - x, y: ellipse.center.y - y, width: 2 * x, height: 2 * y};
}

export function lineEllipseIntersections({start, end, ellipse, domain = "line"}, ops = {}) {
  if (!ellipseFrame(ellipse)) return [];
  const {center, rx, ry, angle = 0} = ellipse, c = Math.cos(angle), s = Math.sin(angle);
  function local(point) {
    const dx = point.x - center.x, dy = point.y - center.y;
    return {x: (c * dx + s * dy) / rx, y: (-s * dx + c * dy) / ry};
  }
  const hits = (ops.lineCircleIntersections ?? lineCircleIntersections)({
    start: local(start), end: local(end), center: {x: 0, y: 0}, radius: 1, domain
  });
  return hits.map(p => ({x: center.x + rx * c * p.x - ry * s * p.y, y: center.y + rx * s * p.x + ry * c * p.y}));
}
