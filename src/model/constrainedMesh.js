import {delaunayTriangles} from "./mesh.js";
import {orientation, insideCircle} from "./predicates.js";
import {segmentContact} from "./intersections.js";
import {signedArea} from "./measurements.js";

const edgeKey = (a, b) => Math.min(a, b) + "," + Math.max(a, b);
const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
function topology(triangles) {
  const edges = new Map();
  triangles.forEach((tri, index) => tri.forEach((a, side) => {
    const b = tri[(side + 1) % 3], key = edgeKey(a, b);
    if (!edges.has(key)) edges.set(key, {vertices: [Math.min(a, b), Math.max(a, b)], uses: []});
    edges.get(key).uses.push({index, side, opposite: tri[(side + 2) % 3]});
  }));
  return edges;
}

// PSLG constraints are recovered by retriangulating the crossed triangle strip.
// No Steiner vertices: a crossing constraint must supply its intersection as an input vertex.
export function constrainedDelaunay({points, edges = [], holes = [], clipExterior = false}, ops = {}) {
  if (!Array.isArray(points) || !points.every(finite) || !Array.isArray(edges) || !Array.isArray(holes) ||
      !holes.every(finite) || typeof clipExterior !== "boolean") return null;
  const orient = ops.orientation ?? orientation, incircle = ops.insideCircle ?? insideCircle;
  const contact = ops.segmentContact ?? segmentContact;
  const canonical = new Map(), ids = [];
  points.forEach((p, i) => {
    const key = p.x + "," + p.y;
    if (!canonical.has(key)) {canonical.set(key, i); ids.push(i);}
  });
  const constraints = new Map();
  const onSegment = (a, b, p) => orient(a, b, p) === 0 &&
    (p.x - a.x) * (p.x - b.x) + (p.y - a.y) * (p.y - b.y) <= 0;
  for (const edge of edges) {
    if (!Array.isArray(edge) || edge.length !== 2 || !edge.every(i => Number.isInteger(i) && i >= 0 && i < points.length)) return null;
    const [a, b] = edge.map(i => canonical.get(points[i].x + "," + points[i].y));
    if (a === b) return null;
    const pa = points[a], pb = points[b], axis = Math.abs(pb.x - pa.x) >= Math.abs(pb.y - pa.y) ? "x" : "y";
    const cuts = ids.filter(i => onSegment(pa, pb, points[i])).sort((i, j) => (points[i][axis] - points[j][axis]) / (pb[axis] - pa[axis]));
    for (let j = 1; j < cuts.length; j++) constraints.set(edgeKey(cuts[j - 1], cuts[j]), [cuts[j - 1], cuts[j]]);
  }
  const segments = [...constraints.values()];
  for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
    if (segments[i].some(id => segments[j].includes(id))) continue;
    if (contact({first: segments[i].map(i => points[i]), second: segments[j].map(i => points[i])}).kind !== "none") return null;
  }
  let triangles = (ops.delaunayTriangles ?? delaunayTriangles)({points}, ops);
  if (!triangles) return null;
  if (!triangles.length && (segments.length || holes.length)) return null;
  const locked = new Set();
  function earClip(indices) {
    if (indices.length < 3) return [];
    const ring = [...indices], result = [];
    if (signedArea({points: ring.map(i => points[i])}) < 0) ring.reverse();
    while (ring.length > 3) {
      let found = false;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
        if (orient(points[a], points[b], points[c]) <= 0) continue;
        if (ring.some(p => p !== a && p !== b && p !== c && orient(points[a], points[b], points[p]) >= 0 &&
          orient(points[b], points[c], points[p]) >= 0 && orient(points[c], points[a], points[p]) >= 0)) continue;
        result.push([a, b, c]); ring.splice(i, 1); found = true; break;
      }
      if (!found) return null;
    }
    if (orient(...ring.map(i => points[i])) <= 0) return null;
    return [...result, ring];
  }
  for (const [key, [a, b]] of constraints) {
    if (!topology(triangles).has(key)) {
      const pa = points[a], pb = points[b], removed = [], kept = [];
      for (const tri of triangles) {
        let lo = 0, hi = 1;
        for (let i = 0; i < 3; i++) {
          const p = points[tri[i]], q = points[tri[(i + 1) % 3]], f = orient(p, q, pa), g = orient(p, q, pb);
          if (f < 0 && g < 0) {hi = -1; break;}
          if (f < 0) lo = Math.max(lo, f / (f - g));
          if (g < 0) hi = Math.min(hi, f / (f - g));
        }
        (hi > lo ? removed : kept).push(tri);
      }
      const boundary = [...topology(removed).values()].filter(e => e.uses.length === 1);
      const neighbors = new Map();
      for (const {vertices: [u, v]} of boundary) {
        if (!neighbors.has(u)) neighbors.set(u, []);
        if (!neighbors.has(v)) neighbors.set(v, []);
        neighbors.get(u).push(v); neighbors.get(v).push(u);
      }
      if (!neighbors.has(a) || !neighbors.has(b) || [...neighbors.values()].some(v => v.length !== 2)) return null;
      const additions = [];
      for (const first of neighbors.get(a)) {
        const chain = [a];
        let previous = a, current = first;
        while (current !== b) {
          if (chain.includes(current)) return null;
          chain.push(current);
          const next = neighbors.get(current).find(i => i !== previous);
          previous = current; current = next;
        }
        chain.push(b);
        const side = earClip(chain);
        if (!side) return null;
        additions.push(...side);
      }
      triangles = [...kept, ...additions];
      const recovered = topology(triangles);
      if (!recovered.has(key) || [...locked].some(k => !recovered.has(k))) return null;
    }
    locked.add(key);
  }
  // A crossed strip can surround an unconstrained vertex. Reinsert every such site
  // before legalizing the cavity; boundary recovery alone must never discard input data.
  const used = new Set(triangles.flat());
  for (const id of ids) {
    if (used.has(id)) continue;
    const previous = triangles;
    triangles = [];
    for (const tri of previous) {
      const sides = tri.map((a, i) => orient(points[a], points[tri[(i + 1) % 3]], points[id]));
      if (sides.some(s => s < 0)) triangles.push(tri);
      else for (let i = 0; i < 3; i++) {
        if (sides[i] > 0) triangles.push([tri[i], tri[(i + 1) % 3], id]);
      }
    }
    if (!triangles.some(t => t.includes(id))) return null;
  }
  // Restore local Delaunay legality while preserving every recovered constraint.
  let settled = false;
  const limit = 8 * ids.length ** 2;
  for (let pass = 0; pass <= limit; pass++) {
    let changed = false;
    for (const [key, {vertices: [a, b], uses}] of topology(triangles)) {
      if (locked.has(key) || uses.length !== 2) continue;
      const [{index: i, opposite: c}, {index: j, opposite: d}] = uses;
      if (orient(points[c], points[d], points[a]) * orient(points[c], points[d], points[b]) >= 0) continue;
      const tri = triangles[i];
      if (!incircle(...tri.map(i => points[i]), points[d])) continue;
      const positive = (a, b, c) => orient(points[a], points[b], points[c]) > 0 ? [a, b, c] : [b, a, c];
      triangles[i] = positive(c, d, a); triangles[j] = positive(d, c, b);
      changed = true; break;
    }
    if (!changed) {settled = true; break;}
  }
  if (!settled) return null;
  const graph = topology(triangles), deleted = new Set(), seeds = [];
  const neighbors = triangles.map(() => [-1, -1, -1]);
  for (const [key, {uses}] of graph) {
    if (locked.has(key)) continue;
    if (uses.length === 1 && clipExterior) seeds.push(uses[0].index);
    if (uses.length === 2) {
      neighbors[uses[0].index][uses[0].side] = uses[1].index;
      neighbors[uses[1].index][uses[1].side] = uses[0].index;
    }
  }
  for (const hole of holes) {
    if (segments.some(([a, b]) => onSegment(points[a], points[b], hole))) return null;
    const containing = triangles.flatMap((tri, i) => tri.every((a, side) => orient(points[a], points[tri[(side + 1) % 3]], hole) >= 0) ? [i] : []);
    if (!containing.length) return null;
    seeds.push(...containing);
  }
  while (seeds.length) {
    const i = seeds.pop();
    if (deleted.has(i)) continue;
    deleted.add(i); seeds.push(...neighbors[i].filter(j => j >= 0 && !deleted.has(j)));
  }
  triangles = triangles.filter((_, i) => !deleted.has(i));
  const adjacency = triangles.map(() => [-1, -1, -1]);
  const resultEdges = [...topology(triangles)].map(([key, {vertices, uses}]) => {
    if (uses.length === 2) {
      adjacency[uses[0].index][uses[0].side] = uses[1].index;
      adjacency[uses[1].index][uses[1].side] = uses[0].index;
    }
    return {vertices, triangles: uses.map(u => u.index), constrained: locked.has(key)};
  });
  return {triangles, neighbors: adjacency, edges: resultEdges, constraints: segments};
}
