import {line, rectangle, circle, arc, polygon, path, spline, quadraticBezier, cubicBezier,
  nthBezier, polyline, vertices, text, dimension, select} from "./drawing.js";
import {trim, extend, split, join} from "./linear.js";
import {offset, fillet, chamfer} from "./construction.js";

const defaults = {select, line, rectangle, circle, arc, polygon, path, spline, quadraticBezier,
  cubicBezier, nthBezier, polyline, vertices, text, dimension, offset, trim, extend, fillet, chamfer, split, join};

// Optional dispatcher. Every default tool can also be imported and called directly.
export function createToolset({tools = {}, operations = {}} = {}) {
  const implementations = {...defaults, ...tools};
  const ops = {...operations};
  function execute(name, input) {
    if (!Object.hasOwn(implementations, name)) throw new RangeError("Unknown tool: " + name);
    return implementations[name](input, ops, execute);
  }
  return execute;
}
