import {signedArea} from "./measurements.js";
import {convexHull, intersectConvexPolygons, classifyPointInPolygon} from "./polygons.js";

const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Recover oriented boundary cycles from convex cells with disjoint interiors.
// Splitting at every welded vertex is essential: shared edges need not have equal lengths.
export function regionBoundary({cells, tolerance = 1e-8}, ops = {}) {
  if (!Array.isArray(cells) || !Number.isFinite(tolerance) || tolerance <= 0) return null;
  const vertices = [], rings = [];
  const area = ops.signedArea ?? signedArea;
  const hull = ops.convexHull ?? convexHull;
  const classify = ops.classifyPointInPolygon ?? classifyPointInPolygon;
  function vertex(p) {
    let i = vertices.findIndex(q => distance(p, q) <= tolerance);
    if (i < 0) {i = vertices.length; vertices.push({x: p.x, y: p.y});}
    return i;
  }
  for (const cell of cells) {
    if (!Array.isArray(cell) || cell.length < 3 || !cell.every(finite)) return null;
    const ids = cell.map(vertex).filter((id, i, all) => !i || id !== all[i - 1]);
    if (ids.length > 1 && ids[0] === ids.at(-1)) ids.pop();
    const points = ids.map(i => vertices[i]);
    const perimeter = points.reduce((s, p, i) => s + distance(p, points[(i + 1) % points.length]), 0);
    const signed = area({points});
    // Clipping can leave machine-width slivers; welding deliberately collapses them.
    if (Math.abs(signed) <= tolerance * perimeter) continue;
    const boundary = hull({points}, ops);
    if (Math.abs(area({points: boundary}) - Math.abs(signed)) > tolerance * perimeter) return null;
    rings.push(boundary.map(vertex));
  }
  // Interior overlap is an invalid cell decomposition, not an extra boundary.
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
    const common = (ops.intersectConvexPolygons ?? intersectConvexPolygons)({
      first: rings[i].map(k => vertices[k]), second: rings[j].map(k => vertices[k]),
    }, ops);
    const perimeter = (common ?? []).reduce((s, p, k) => s + distance(p, common[(k + 1) % common.length]), 0);
    if (common && Math.abs(area({points: common})) > tolerance * perimeter) return null;
  }
  const edges = new Map();
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const start = ring[i], end = ring[(i + 1) % ring.length], a = vertices[start], b = vertices[end];
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const cuts = [{id: start, t: 0}, {id: end, t: 1}];
    vertices.forEach((p, id) => {
      if (id === start || id === end) return;
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / length ** 2;
      if (t > 0 && t < 1 && Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) <= tolerance * length)
        cuts.push({id, t});
    });
    cuts.sort((a, b) => a.t - b.t);
    for (let j = 1; j < cuts.length; j++) {
      const from = cuts[j - 1].id, to = cuts[j].id, key = from + "," + to, reverse = to + "," + from;
      if (edges.has(key)) return null;
      if (edges.has(reverse)) edges.delete(reverse);
      else edges.set(key, {from, to});
    }
  }
  const outgoing = new Map(), incoming = new Map();
  for (const [key, edge] of edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(key);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  for (const [id, candidates] of outgoing) if (incoming.get(id) !== candidates.length) return null;
  const next = new Map(), used = new Set(), contours = [];
  for (const [key, {from, to}] of edges) {
    const a = vertices[from], b = vertices[to], back = Math.atan2(a.y - b.y, a.x - b.x);
    let best, turn = Infinity;
    for (const candidate of outgoing.get(to) ?? []) {
      const c = vertices[edges.get(candidate).to];
      const clockwise = (back - Math.atan2(c.y - b.y, c.x - b.x) + 2 * Math.PI) % (2 * Math.PI);
      if (clockwise < turn) {best = candidate; turn = clockwise;}
    }
    if (!best) return null;
    next.set(key, best);
  }
  for (const key of edges.keys()) {
    if (used.has(key)) continue;
    const points = [];
    let edge = key;
    while (!used.has(edge)) {
      used.add(edge); points.push({...vertices[edges.get(edge).from]}); edge = next.get(edge);
    }
    if (edge !== key || points.length < 3) return null;
    const signed = area({points});
    if (Math.abs(signed) <= tolerance ** 2) return null;
    contours.push({points, area: signed, parent: null, depth: 0, hole: false});
  }
  // Large rings first makes containment parents available before their children.
  contours.sort((a, b) => Math.abs(b.area) - Math.abs(a.area));
  for (let i = 0; i < contours.length; i++) {
    const ring = contours[i];
    for (let j = i - 1; j >= 0; j--) {
      const states = ring.points.map(point => classify({point, points: contours[j].points}, ops));
      if (states.includes("inside")) {ring.parent = j; ring.depth = contours[j].depth + 1; break;}
    }
    ring.hole = ring.depth % 2 === 1;
    if ((ring.area < 0) !== ring.hole) return null;
  }
  const regions = contours.flatMap((ring, outer) => ring.hole ? [] : [{outer,
    holes: contours.flatMap((child, i) => child.hole && child.parent === outer ? [i] : []),
  }]);
  return {rings: contours, regions, area: contours.reduce((sum, ring) => sum + ring.area, 0)};
}
