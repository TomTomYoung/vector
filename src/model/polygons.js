import {clipCell} from "./clipCell.js";
import {displacement, crossProduct} from "../utils/geometry.js";
import {signedArea} from "./measurements.js";
import {segmentContact} from "./intersections.js";

const same = (a, b) => a.x === b.x && a.y === b.y;
const turn = (a, b, c) => crossProduct(displacement(a, b), displacement(a, c));
const between = (a, b, p) => p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
  p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);

function openRing(points) {
  const ring = points.filter((p, i) => i === 0 || !same(points[i - 1], p));
  if (ring.length > 1 && same(ring[0], ring.at(-1))) ring.pop();
  return ring;
}

export function pointBounds({points}) {
  if (!points.length) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
}

export function boxIntersection({first: a, second: b}) {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x, height = Math.min(a.y + a.height, b.y + b.height) - y;
  return width < 0 || height < 0 ? null : {x, y, width, height};
}

export function boxUnion({first: a, second: b}) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return {x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y};
}

export function polygonCentroid({points}) {
  if (points.length < 3) return null;
  const o = points[0];
  let sum = 0, x = 0, y = 0;
  for (let i = 2; i < points.length; i++) {
    const a = displacement(o, points[i - 1]), b = displacement(o, points[i]), w = crossProduct(a, b);
    sum += w; x += (a.x + b.x) * w; y += (a.y + b.y) * w;
  }
  return sum === 0 ? null : {x: o.x + x / (3 * sum), y: o.y + y / (3 * sum)};
}

export function classifyPointInPolygon({point, points, rule = "evenOdd"}) {
  if (rule !== "evenOdd" && rule !== "nonzero") throw new RangeError("Unknown fill rule");
  let winding = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], side = turn(a, b, point);
    if (side === 0 && between(a, b, point)) return "boundary";
    if (a.y <= point.y && point.y < b.y && side > 0) winding++;
    if (b.y <= point.y && point.y < a.y && side < 0) winding--;
  }
  return (rule === "evenOdd" ? winding % 2 !== 0 : winding !== 0) ? "inside" : "outside";
}

export function convexHull({points}) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y).filter((p, i, arr) => !i || !same(p, arr[i - 1]));
  if (sorted.length <= 2) return sorted;
  function chain(sequence) {
    const result = [];
    for (const p of sequence) {
      while (result.length >= 2 && turn(result.at(-2), result.at(-1), p) <= 0) result.pop();
      result.push(p);
    }
    result.pop();
    return result;
  }
  return [...chain(sorted), ...chain(sorted.reverse())];
}

export function polygonCrossings({points}, ops = {}) {
  const ring = openRing(points), n = ring.length, result = [];
  if (n < 3) return result;
  const contact = ops.segmentContact ?? segmentContact;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const hit = contact({first: [ring[i], ring[(i + 1) % n]], second: [ring[j], ring[(j + 1) % n]]});
    const adjacent = j === i + 1 || (i === 0 && j === n - 1);
    if (hit.kind !== "none" && !(adjacent && hit.kind === "point")) result.push({edges: [i, j], hit});
  }
  return result;
}

export function isSimplePolygon({points}, ops = {}) {
  const ring = openRing(points);
  return ring.length >= 3 && signedArea({points: ring}) !== 0 && (ops.polygonCrossings ?? polygonCrossings)({points: ring}, ops).length === 0;
}

export function isConvexPolygon({points}, ops = {}) {
  const ring = openRing(points);
  if (!(ops.isSimplePolygon ?? isSimplePolygon)({points: ring}, ops)) return false;
  const sign = Math.sign(signedArea({points: ring}));
  return ring.every((p, i) => sign * turn(p, ring[(i + 1) % ring.length], ring[(i + 2) % ring.length]) >= 0);
}

export function triangulatePolygon({points}, ops = {}) {
  const ring = openRing(points);
  if (!(ops.isSimplePolygon ?? isSimplePolygon)({points: ring}, ops)) return null;
  const sign = Math.sign(signedArea({points: ring})), triangles = [];
  while (ring.length > 3) {
    let removed = false;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
      const corner = sign * turn(a, b, c);
      if (corner < 0) continue;
      if (corner > 0) {
        if (ring.some(p => p !== a && p !== b && p !== c && sign * turn(a, b, p) >= 0 && sign * turn(b, c, p) >= 0 && sign * turn(c, a, p) >= 0)) continue;
        triangles.push([a, b, c]);
      }
      ring.splice(i, 1); removed = true; break;
    }
    if (!removed) return null;
  }
  if (turn(...ring) !== 0) triangles.push(ring);
  return triangles;
}

export function intersectConvexPolygons({first, second}, ops = {}) {
  const valid = ops.isConvexPolygon ?? isConvexPolygon;
  if (!valid({points: first}, ops) || !valid({points: second}, ops)) return null;
  let output = openRing(first);
  const clip = openRing(second), sign = Math.sign(signedArea({points: clip}));
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    output = (ops.clipCell ?? clipCell)(output, point => sign * turn(a, b, point));
  }
  return openRing(output);
}
