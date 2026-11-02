import {interpolatePoint} from "../utils/geometry.js";
import {signedArea} from "./measurements.js";

// Convex cell, one signed half-plane. Keep positive-area cells only.
export function clipCell(cell, side) {
  if (!cell.length) return [];
  const result = [];
  let previous = cell.at(-1), before = side(previous);
  for (const p of cell) {
    const after = side(p);
    if ((before < 0 && after > 0) || (before > 0 && after < 0))
      result.push(interpolatePoint(previous, p, before / (before - after)));
    if (after >= 0) result.push(p);
    previous = p; before = after;
  }
  // Intersections on a shared edge can create a one-ulp sliver. Scale the area
  // threshold by the cell diameter so changing drawing units keeps the decision.
  if (result.length < 3) return [];
  const origin = result[0];
  let span = 0;
  for (const p of result) span = Math.max(span, Math.abs(p.x - origin.x), Math.abs(p.y - origin.y));
  return Math.abs(signedArea({points: result})) <= 16 * Number.EPSILON * span * span ? [] : result;
}
