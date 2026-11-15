import {clampedKnots, bSplinePoint, nurbsPoint} from './splines.js';

function curve(input, rational) {
  const {points, degree = 3, weights} = input;
  if (!Array.isArray(points) || points.length > 1000 || !points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) ||
    !Number.isInteger(degree) || degree < 1 || degree > 12 || points.length <= degree) return null;
  const knots = input.knots ?? clampedKnots({count: points.length, degree});
  const data = {points, degree, knots, ...(rational ? {weights: weights ?? points.map(() => 1)} : {})};
  if (rational && (!Array.isArray(data.weights) || data.weights.length !== points.length || !data.weights.every(w => Number.isFinite(w) && w > 0))) return null;
  if (!Array.isArray(knots) || !bSplinePoint({...data, t: knots[degree]})) return null;
  const lo = knots[degree], hi = knots[points.length];
  // A continuous curve only: never draw a spurious segment across a knot discontinuity.
  for (const knot of new Set(knots)) if (knot > lo && knot < hi && knots.filter(k => k === knot).length > degree) return null;
  return {kind: 'splineCurve', ...data};
}
export const bSplineCurve = input => curve(input, false);
export const nurbsCurve = input => curve(input, true);

export function sampleSplineCurve(shape, intervals = 80) {
  if (!Number.isInteger(intervals) || intervals < 2 || intervals > 10000) throw new RangeError('分割数は2〜10000です。');
  const evaluate = shape.weights ? nurbsPoint : bSplinePoint;
  const start = shape.knots[shape.degree], end = shape.knots[shape.points.length];
  const parameters = new Set(Array.from({length: intervals + 1}, (_, i) => start + (end - start) * i / intervals));
  shape.knots.forEach(t => {if (t >= start && t <= end) parameters.add(t);});
  return [...parameters].sort((a, b) => a - b).map(t => evaluate({...shape, t}));
}
