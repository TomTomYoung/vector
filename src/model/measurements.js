import {crossProduct, displacement, distance} from "../utils/geometry.js";

export function polylineLength({points, closed = false}, ops = {}) {
  if (points.length < 2) return 0;
  const measure = ops.distance ?? distance;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += measure(points[i - 1], points[i]);
  if (closed) total += measure(points.at(-1), points[0]);
  return total;
}

export function signedArea({points}, ops = {}) {
  if (points.length < 3) return 0;
  const cross = ops.crossProduct ?? crossProduct;
  // Work relative to the first vertex to keep large translations out of the products.
  const origin = points[0];
  let previous = displacement(origin, points[1]);
  let twiceArea = 0;
  for (let i = 2; i < points.length; i++) {
    const current = displacement(origin, points[i]);
    twiceArea += cross(previous, current);
    previous = current;
  }
  return twiceArea / 2;
}
