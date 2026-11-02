import {crossProduct, displacement} from "../utils/geometry.js";

export function orientation(a, b, c) {
  return crossProduct(displacement(a, b), displacement(a, c));
}

// Positive for a point strictly inside a counterclockwise triangle's circumcircle.
export function insideCircle(a, b, c, p) {
  const u = displacement(p, a), v = displacement(p, b), w = displacement(p, c);
  const length2 = v => v.x * v.x + v.y * v.y;
  const uu = length2(u), vv = length2(v), ww = length2(w);
  const det = uu * crossProduct(v, w) + vv * crossProduct(w, u) + ww * crossProduct(u, v);
  const magnitude = (a, b) => Math.abs(a.x * b.y) + Math.abs(a.y * b.x);
  const error = 16 * Number.EPSILON * (uu * magnitude(v, w) + vv * magnitude(w, u) + ww * magnitude(u, v));
  return det > error;
}
