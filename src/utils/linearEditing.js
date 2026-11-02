// Open straight-edged outlines supported by trim, extend and split.
// Geometry is compared in canvas units and written back in the object's local space.
import * as linear from "../model/linear.js";

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

function transformPoint(matrix, point) {
  const {a, b, c, d, e, f} = matrix;
  return {x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f};
}

export function outline(el, canvas) {
  const local = localPoints(el);
  if (local.length < 2) return null;
  const matrix = canvas.getScreenCTM().inverse().multiply(el.getScreenCTM());
  if (Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < Number.EPSILON) return null;
  const inverse = matrix.inverse();
  if (![inverse.a, inverse.b, inverse.c, inverse.d, inverse.e, inverse.f].every(Number.isFinite)) return null;
  const points = local.map(p => transformPoint(matrix, p));
  return {points, inverse};
}

export function writePoints(el, points, inverse) {
  const local = points.map(p => transformPoint(inverse, p));
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


// The editor's picking thresholds are in canvas units.
export function edit(name, el, canvas, edges, point, execute, save) {
  if (edges.includes(el)) return;
  const shape = outline(el, canvas);
  if (!shape) return;
  const boundaries = edges.map(edge => outline(edge, canvas)?.points ?? []);
  const parts = execute(name, {points: shape.points, point, boundaries, tolerance: 5, endMargin: 5});
  if (!parts.length) return;
  save();
  let previous = el;
  for (const points of parts.slice(1)) {
    const next = el.cloneNode(false);
    for (const attr of ["id", "data-line-id", "data-polyline-id", "data-path-id", "data-vector-selected", "data-vector-indice"]) next.removeAttribute(attr);
    writePoints(next, points, shape.inverse);
    previous.after(next);
    previous = next;
  }
  writePoints(el, parts[0], shape.inverse);
}

const execute = (name, input) => linear[name](input);
const save = () => window.saveState();

export function split(el, canvas, point) {
  return edit("split", el, canvas, [], point, execute, save);
}

export function trim(el, canvas, edges, point) {
  return edit("trim", el, canvas, edges, point, execute, save);
}

export function extend(el, canvas, edges) {
  return edit("extend", el, canvas, edges, undefined, execute, save);
}
