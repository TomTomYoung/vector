import {distance, midpoint, snapToOrtho} from "../utils/geometry.js";

export function line({start, end, ortho = false}, ops = {}) {
  return {kind: "segment", start, end: ortho ? (ops.snapToOrtho ?? snapToOrtho)(start, end) : end};
}

export function rectangle({start, end}) {
  return {kind: "rectangle", x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y)};
}

export function circle({center, point}, ops = {}) {
  return {kind: "circle", center, radius: (ops.distance ?? distance)(center, point)};
}

export function polyline({points, closed = false}) {
  return {kind: "polyline", points: [...points], closed};
}

export function polygon({points}) {
  return {kind: "polygon", points: [...points]};
}

export function text({point, content}) {
  return content?.trim() ? {kind: "text", point, content} : null;
}

export function path({points, mode = "line"}) {
  if (!points.length) return null;
  const segments = [];
  for (let i = 1; i < points.length;) {
    if (mode !== "line" && i + 2 < points.length) {
      segments.push({kind: "cubic", control1: points[i], control2: points[i + 1], end: points[i + 2]});
      i += 3;
    } else {
      segments.push({kind: "segment", end: points[i++]});
    }
  }
  return {kind: "path", start: points[0], segments};
}

function bezier(points, degree) {
  if (!Number.isInteger(degree) || degree < 1 || points.length <= degree) return null;
  return {kind: "bezier", points: points.slice(0, degree + 1)};
}

export const quadraticBezier = ({points}) => bezier(points, 2);
export const cubicBezier = ({points}) => bezier(points, 3);
export const nthBezier = ({points, degree = points.length - 1}) => bezier(points, degree);

export function spline({points, tension = 0.5}) {
  if (points.length < 2) return null;
  if (points.length === 2) return path({points});
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const before = points[i - 2] ?? a, after = points[i + 1] ?? b;
    segments.push({kind: "cubic",
      control1: {x: a.x + (b.x - before.x) * tension / 6, y: a.y + (b.y - before.y) * tension / 6},
      control2: {x: b.x - (after.x - a.x) * tension / 6, y: b.y - (after.y - a.y) * tension / 6},
      end: b});
  }
  return {kind: "path", start: points[0], segments};
}

// Positive turns follow increasing atan2 angles in the caller's coordinate system.
const fullTurn = 2 * Math.PI;
const positiveTurn = angle => (angle % fullTurn + fullTurn) % fullTurn;
const direction = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);

export function circleCenter(a, b, c) {
  const bx = b.x - a.x, by = b.y - a.y, cx = c.x - a.x, cy = c.y - a.y;
  const d = 2 * (bx * cy - by * cx);
  if (Math.abs(d) < 0.0001) return null;
  const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  return {x: a.x + (cy * b2 - by * c2) / d, y: a.y + (bx * c2 - cx * b2) / d};
}

export function arc({start, through, end}, ops = {}) {
  const center = (ops.circleCenter ?? circleCenter)(start, through, end);
  if (!center) return null;
  const angle = direction(center, start);
  const positive = positiveTurn(direction(center, end) - angle);
  const turn = positiveTurn(direction(center, through) - angle) <= positive ? positive : positive - fullTurn;
  return {kind: "arc", center, start, end, radius: (ops.distance ?? distance)(center, start), turn};
}

export function dimension({points, mode = "linear"}, ops = {}) {
  if (mode === "linear") {
    const [start, end] = points;
    return {start, end, angle: direction(start, end), middle: (ops.midpoint ?? midpoint)(start, end),
      length: (ops.distance ?? distance)(start, end)};
  }
  const [first, vertex, last] = points;
  const startAngle = direction(vertex, first), endAngle = direction(vertex, last);
  return {vertex, startAngle, endAngle, turn: positiveTurn(endAngle - startAngle)};
}

export function select({bounds, candidates, selected = [], target, toggle = false}) {
  if (!bounds) {
    if (!toggle) return [target];
    return selected.includes(target) ? selected.filter(id => id !== target) : [...selected, target];
  }
  return candidates.filter(({box}) => box && box.x >= bounds.x && box.y >= bounds.y &&
    box.x + box.width <= bounds.x + bounds.width && box.y + box.height <= bounds.y + bounds.height
  ).map(({id}) => id);
}

const vertexMethods = {line, polyline, polygon, quadraticBezier, cubicBezier, nthBezier};

export function vertices({vectors, indices, method, params = {}}, ops = {}, run) {
  const points = indices.map(index => vectors[index]).filter(Boolean);
  const name = method === "bezierN" ? "nthBezier" : method;
  if (!Object.hasOwn(vertexMethods, name)) return null;
  if (points.length < (name === "polygon" ? 3 : 2)) return null;
  const input = {...params, points, start: points[0], end: points[1]};
  if (name === "nthBezier") input.degree = Math.max(2, Math.round(params.degree || points.length - 1));
  return run ? run(name, input) : vertexMethods[name](input, ops);
}
