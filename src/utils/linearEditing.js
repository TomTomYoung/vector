// Open straight-edged outlines supported by trim, extend and split.
// Geometry is compared in canvas units and written back in the object's local space.
import { distance, lineIntersection, crossProduct } from "./geometry.js";

const epsilon = 1e-8;
const numeric = /[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/iy;

function linearPathPoints(data) {
  const points = [];
  let i = 0, command = "";
  let x = 0, y = 0;
  const skip = () => { while (i < data.length && /[\s,]/.test(data[i])) i++; };
  const number = () => {
    skip();
    numeric.lastIndex = i;
    const match = numeric.exec(data);
    if (!match) return NaN;
    i = numeric.lastIndex;
    return Number(match[0]);
  };
  while (i < data.length) {
    skip();
    if (i === data.length) break;
    if (/[a-z]/i.test(data[i])) command = data[i++];
    const op = command.toUpperCase();
    if (!(points.length ? ["L","H","V"].includes(op) : op === "M")) return [];
    const relative = op !== command;
    if (op !== "V") x = number() + (relative ? x : 0);
    if (op !== "H") y = number() + (relative ? y : 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    points.push({x, y});
    if (op === "M") command = relative ? "l" : "L";
  }
  return points;
}

export function localPoints(el) {
  if (el.tagName === "line") {
    return ["1", "2"].map(n => ({x: el["x" + n].baseVal.value, y: el["y" + n].baseVal.value}));
  }
  if (el.tagName === "polyline") return Array.from(el.points, p => ({x: p.x, y: p.y}));
  if (el.tagName === "path") return linearPathPoints(el.getAttribute("d") || "");
  return [];
}

function outline(el, canvas) {
  const local = localPoints(el);
  if (local.length < 2) return null;
  const matrix = canvas.getScreenCTM().inverse().multiply(el.getScreenCTM());
  const inverse = matrix.inverse();
  if (![inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f].every(Number.isFinite)) return null;
  const points = local.map(p => matrix.transformPoint(p));
  return {points, inverse};
}

function writePoints(el, points, inverse) {
  const local = points.map(p => inverse.transformPoint(p));
  if (el.tagName === "line") {
    local.forEach((p, i) => {
      el.setAttribute("x" + (i + 1), p.x);
      el.setAttribute("y" + (i + 1), p.y);
    });
  } else if (el.tagName === "polyline") {
    el.setAttribute("points", local.map(p => p.x + "," + p.y).join(" "));
  } else {
    el.setAttribute("d", local.map((p, i) => (i ? "L" : "M") + p.x + " " + p.y).join(" "));
  }
}

function nearestPosition(points, click) {
  let best = {distance: Infinity, position: 0};
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i];
    const dx = b.x-a.x, dy = b.y-a.y;
    const len2 = dx*dx + dy*dy;
    if (!len2) continue;
    const t = Math.max(0, Math.min(1, ((click.x-a.x)*dx + (click.y-a.y)*dy)/len2));
    const d = distance(click, {x: a.x+t*dx, y: a.y+t*dy});
    if (d < best.distance) best = {distance: d, position: i-1+t};
  }
  return best;
}

function at(points, position) {
  const i = Math.floor(position), t = position-i;
  if (!t) return points[i];
  const a = points[i], b = points[i+1];
  return {x:a.x+t*(b.x-a.x), y:a.y+t*(b.y-a.y)};
}

function part(points, from, to) {
  if (to-from < epsilon) return [];
  return [at(points, from), ...points.slice(Math.floor(from)+1, Math.ceil(to)), at(points, to)];
}

function applyParts(el, inverse, parts) {
  const kept = parts.filter(p => p.length > 1);
  if (!kept.length) return;
  window.saveState();
  // The original retains its identity, transform, style, layer and stacking position.
  if (kept.length > 1) {
    const second = el.cloneNode(false);
    for (const attr of ["id", "data-line-id", "data-polyline-id", "data-path-id", "data-vector-selected", "data-vector-indice"]) second.removeAttribute(attr);
    writePoints(second, kept[1], inverse);
    el.after(second);
  }
  writePoints(el, kept[0], inverse);
}

function boundarySegments(edges, canvas) {
  const segments = [];
  for (const edge of edges) {
    const points = outline(edge, canvas)?.points || [];
    for (let i=1; i<points.length; i++) segments.push([points[i-1],points[i]]);
  }
  return segments;
}

export function split(el, canvas, click) {
  const shape = outline(el, canvas);
  if (!shape) return;
  const {points, inverse} = shape, end = points.length-1;
  const hit = nearestPosition(points, click);
  const p = at(points, hit.position);
  if (hit.distance > 5 || distance(p, points[0]) < 5 || distance(p, points[end]) < 5) return;
  applyParts(el, inverse, [part(points,0,hit.position), part(points,hit.position,end)]);
}

export function trim(el, canvas, edges, click) {
  const shape = outline(el, canvas);
  if (!shape || edges.includes(el)) return;
  const {points, inverse} = shape, end = points.length-1;
  const cuts = [];
  const boundaries = boundarySegments(edges, canvas);
  for (let i=1; i<points.length; i++) {
    const a = points[i-1], b = points[i], length = distance(a,b);
    if (length < epsilon) continue;
    for (const [c,d] of boundaries) {
      const p = lineIntersection({x1:a.x,y1:a.y,x2:b.x,y2:b.y}, {x1:c.x,y1:c.y,x2:d.x,y2:d.y});
      if (!p) continue;
      const t = i-1 + distance(a,p)/length;
      if (t > epsilon && t < end-epsilon) cuts.push(t);
    }
  }
  if (!cuts.length) return;
  const {position} = nearestPosition(points, click);
  let left = 0, right = end;
  for (const t of cuts) {
    if (t <= position) left = Math.max(left,t);
    else right = Math.min(right,t);
  }
  applyParts(el, inverse, [part(points,0,left), part(points,right,end)]);
}

function extendEnd(tip, neighbor, boundaries) {
  const ray = {x: tip.x-neighbor.x, y: tip.y-neighbor.y};
  let nearest = Infinity;
  for (const [a,b] of boundaries) {
    const edge = {x:b.x-a.x, y:b.y-a.y};
    const div = crossProduct(ray,edge);
    if (Math.abs(div) < epsilon) continue;
    const offset = {x:a.x-tip.x, y:a.y-tip.y};
    const t = crossProduct(offset,edge)/div, u = crossProduct(offset,ray)/div;
    if (t > epsilon && u >= -epsilon && u <= 1+epsilon) nearest = Math.min(nearest,t);
  }
  return Number.isFinite(nearest) ? {x:tip.x+nearest*ray.x, y:tip.y+nearest*ray.y} : tip;
}

export function extend(el, canvas, edges) {
  const shape = outline(el, canvas);
  if (!shape || edges.includes(el)) return;
  const {points, inverse} = shape, end = points.length-1;
  const boundaries = boundarySegments(edges,canvas);
  const start = extendEnd(points[0], points[1], boundaries);
  const finish = extendEnd(points[end], points[end-1], boundaries);
  if (start === points[0] && finish === points[end]) return;
  window.saveState();
  writePoints(el, [start, ...points.slice(1,-1), finish], inverse);
}
