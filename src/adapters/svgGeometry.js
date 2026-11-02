import {createElement, setAttributes} from "../utils/svg.js";
import {buildPathData} from "../utils/bezier.js";

const pair = p => p.x + " " + p.y;
const pairs = points => points.map(p => p.x + "," + p.y).join(" ");

export function pathData(shape, options = {}) {
  if (!shape) return "";
  if (shape.kind === "arc") {
    const {start, end, radius, turn} = shape;
    return ["M", pair(start), "A", radius, radius, 0, Number(Math.abs(turn) > Math.PI), Number(turn > 0), pair(end)].join(" ");
  }
  if (shape.kind === "bezier") {
    const degree = shape.points.length - 1;
    if (options.sampleCount != null) return buildPathData("bezierN", shape.points, {...options, degree});
    const method = degree === 2 ? "quadraticBezier" : degree === 3 ? "cubicBezier" : "bezierN";
    return buildPathData(method, shape.points, options);
  }
  const commands = ["M " + pair(shape.start)];
  for (const segment of shape.segments) {
    commands.push(segment.kind === "cubic"
      ? "C " + [segment.control1, segment.control2, segment.end].map(pair).join(", ")
      : "L " + pair(segment.end));
  }
  return commands.join(" ");
}

export function renderGeometry(shape, element = null, options = {}, encodePath = pathData) {
  if (!shape) return null;
  let tag = shape.kind, attrs;
  switch (shape.kind) {
    case "segment":
      tag = "line";
      attrs = {x1: shape.start.x, y1: shape.start.y, x2: shape.end.x, y2: shape.end.y};
      break;
    case "rectangle":
      tag = "rect";
      attrs = {x: shape.x, y: shape.y, width: shape.width, height: shape.height};
      break;
    case "circle":
      attrs = {cx: shape.center.x, cy: shape.center.y, r: shape.radius};
      break;
    case "polyline":
    case "polygon":
      attrs = {points: pairs(shape.closed && shape.points.length ? [...shape.points, shape.points[0]] : shape.points)};
      break;
    case "text":
      attrs = {x: shape.point.x, y: shape.point.y};
      break;
    case "path":
    case "bezier":
    case "arc":
      tag = "path";
      attrs = {d: encodePath(shape, options)};
      break;
    default:
      throw new TypeError("Unsupported geometry: " + shape.kind);
  }
  const target = element ?? createElement(tag);
  setAttributes(target, attrs);
  if (shape.kind === "text") target.textContent = shape.content;
  return target;
}

// Offset measures in the selected object's local units. Keep its coordinate frame on output.
export function readOffsetShape(el) {
  const value = key => el[key].baseVal.value;
  switch (el.tagName) {
    case "line":
      return {kind: "segment", start: {x: value("x1"), y: value("y1")}, end: {x: value("x2"), y: value("y2")}};
    case "polyline":
      return {kind: "polyline", points: Array.from(el.points, ({x, y}) => ({x, y}))};
    case "rect":
      return {kind: "rectangle", x: value("x"), y: value("y"), width: value("width"), height: value("height")};
    case "circle":
      return {kind: "circle", center: {x: value("cx"), y: value("cy")}, radius: value("r")};
    default:
      return null;
  }
}
