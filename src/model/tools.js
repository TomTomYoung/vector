import {line, rectangle, circle, arc, polygon, path, spline, quadraticBezier, cubicBezier,
  nthBezier, polyline, vertices, text, dimension, select} from "./drawing.js";
import {trim, extend, split, join} from "./linear.js";
import {polylineLength, signedArea} from "./measurements.js";
import {offset, fillet, chamfer, reflectPoint} from "./construction.js";

import * as affine from "./affine.js";
import * as intersections from "./intersections.js";
import * as conics from "./conics.js";
import * as polygons from "./polygons.js";
import * as chains from "./polyline.js";
import * as curveAnalysis from "./curveAnalysis.js";
import * as regions from "./regions.js";
import * as splines from "./splines.js";
import * as pointSets from "./pointSets.js";
import * as projective from "./projective.js";
import * as mesh from "./mesh.js";

const defaults = {select, line, rectangle, circle, arc, polygon, path, spline, quadraticBezier,
  cubicBezier, nthBezier, polyline, vertices, text, dimension, offset, trim, extend, fillet, chamfer, split, join,
  reflectPoint, polylineLength, signedArea,
  ...affine, ...intersections, ...conics, ...polygons, ...chains, ...curveAnalysis,
  ...regions, ...splines, ...pointSets, ...projective, ...mesh};

export const toolNames = Object.freeze(Object.keys(defaults));

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
