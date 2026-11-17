import {clampedKnots} from './splines.js';

// One period contains N intervals (including zero widths) for N original controls. Extend U[i+N]
// = U[i]+T and wrap the first p controls; see doc/nonuniform-periodic-knots.md.
function curve(input, rational, maxControls=1000) {
  if (!input || typeof input !== 'object') return null;
  const {points, degree = 3, weights, periodic = false} = input;
  if (!Array.isArray(points) || points.length > maxControls || !points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y)) ||
    !Number.isInteger(degree) || degree < 1 || degree > 12 || points.length <= degree || typeof periodic !== 'boolean') return null;
  const data = {points: points.map(p => ({...p})), degree};
  if (rational) {
    data.weights = weights ?? points.map(() => 1);
    if (!Array.isArray(data.weights) || data.weights.length !== points.length || !data.weights.every(Number.isFinite) || !data.weights.some(w => w !== 0)) return null;
    data.weights = [...data.weights];
  }
  if (periodic) {
    if (input.knots !== undefined) return null;
    const count = points.length;
    const periodKnots = input.periodicKnots === undefined ? Array.from({length:count+1}, (_,i) => i) : input.periodicKnots;
    if (!Array.isArray(periodKnots) || periodKnots.length !== count+1 ||
      !periodKnots.every((k,i) => Number.isFinite(k) && (!i || k >= periodKnots[i-1]))) return null;
    const period = periodKnots[count]-periodKnots[0];
    if (!Number.isFinite(period) || period <= 0) return null;
    // Count one cyclic period: the final endpoint is a copy of the first.
    // Leading and trailing repetitions belong to the same seam knot.
    const multiplicities = new Map();
    for (const knot of periodKnots.slice(0,-1)) {
      const key = knot === periodKnots[count] ? periodKnots[0] : knot;
      const multiplicity = (multiplicities.get(key) ?? 0)+1;
      if (multiplicity > degree) return null;
      multiplicities.set(key,multiplicity);
    }
    // Anchor repeated seam values exactly; subtracting T may not recover U[0]
    // bit for bit. Every distinct source interval must remain distinct after shifting.
    data.knots = [...periodKnots.slice(count-degree,count).map(k=>k === periodKnots[count] ? periodKnots[0] : k-period), ...periodKnots,
      ...periodKnots.slice(1,degree+1).map(k=>k === periodKnots[0] ? periodKnots[count] : k+period)];
    if (!data.knots.every((k,i) => {
      if (!Number.isFinite(k)) return false;
      if (!i) return true;
      const interval = ((i-degree-1)%count+count)%count;
      return periodKnots[interval] === periodKnots[interval+1] ? k === data.knots[i-1] : k > data.knots[i-1];
    }) ||
      !Number.isFinite(data.knots.at(-1)-data.knots[0])) return null;
    data.points.push(...data.points.slice(0, degree).map(p => ({...p})));
    if (rational) data.weights.push(...data.weights.slice(0, degree));
    data.periodic = true; data.controlCount = points.length;
  } else {
    if (input.periodicKnots !== undefined) return null;
    const knots = input.knots ?? clampedKnots({count: points.length, degree});
    if (!Array.isArray(knots) || knots.length !== points.length + degree + 1 ||
      !knots.every((k, i) => Number.isFinite(k) && (!i || k >= knots[i - 1])) || knots[degree] >= knots[points.length] || !Number.isFinite(knots.at(-1)-knots[0])) return null;
    let count = 0, previous;
    for (const knot of knots) {
      count = knot === previous ? count + 1 : 1; previous = knot;
      if (count > degree + 1) return null;
    }
    data.knots = [...knots];
  }
  return {kind: 'splineCurve', ...data};
}
export const bSplineCurve = input => curve(input, false);
export const nurbsCurve = input => curve(input, true);

// Temporary nonperiodic evaluation arrays for three periods of at most 1000
// original controls, plus degree <= 12. Editable curve limits remain unchanged.
export const nonperiodicSplineEvaluation = input => input?.periodic ? null : curve(input,input?.weights!==undefined,3012);

const mix = (a, b, t) => ({x: (1-t)*a.x+t*b.x, y: (1-t)*a.y+t*b.y, w: (1-t)*a.w+t*b.w});

// Polar de Boor: Q_j = blossom(a,...,a,b,...,b), with j copies of b.
// The local polynomial on each nonempty knot span is converted in homogeneous coordinates.
// No division by a weight occurs here, including zero and negative weights.
export function splineBezierSpans(shape) {
  const {points, knots, degree} = shape;
  const scale = shape.weights ? Math.max(...shape.weights.map(Math.abs)) : 1;
  const controls = points.map((p, i) => {
    const w = shape.weights ? shape.weights[i] / scale : 1;
    return {x: p.x * w, y: p.y * w, w};
  });
  return homogeneousSplineBezierSpans({controls,knots,degree});
}

// Already normalized homogeneous data, shared by rendering and error validation.
export function homogeneousSplineBezierSpans({controls,knots,degree}) {
  const spans = [];
  for (let k = degree; k < controls.length; k++) {
    const from = knots[k], to = knots[k+1];
    if (!(to > from)) continue;
    const bezier = [];
    for (let j = 0; j <= degree; j++) {
      const row = controls.slice(k-degree, k+1);
      for (let level = 1; level <= degree; level++) {
        const t = level <= degree-j ? from : to;
        for (let n = degree; n >= level; n--) {
          const i = k-degree+n, width = knots[i+degree-level+1]-knots[i];
          row[n] = mix(row[n-1], row[n], width ? (t-knots[i])/width : 0);
        }
      }
      bezier.push(row[degree]);
    }
    spans.push({from, to, controls: bezier, breakBefore: knots.filter(t => t === from).length > degree});
  }
  return spans;
}
export function splitHomogeneousBezier(controls) {
  let row = controls; const left = [], right = [];
  while (row.length) {
    left.push(row[0]); right.push(row.at(-1));
    row = row.slice(1).map((p, i) => mix(row[i], p, 0.5));
  }
  return [left, right.reverse()];
}
function project(controls, t) {
  let row = controls;
  while (row.length > 1) row = row.slice(1).map((p, i) => mix(row[i], p, t));
  const {x, y, w} = row[0], point = {x: x/w, y: y/w};
  return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
}

// The Bernstein coefficient bounds on W determine whether a whole interval stays away
// from zero. An endpoint sign test alone would miss double roots and two nearby poles.
export function sampleSplineBranches(shape, {sampleCount = 80, poleTolerance = 1e-8, maxDepth = 18, maxNodes = 32768} = {}) {
  if (!Number.isInteger(sampleCount) || sampleCount < 2 || sampleCount > 10000) throw new RangeError('分割数は2〜10000です。');
  if (!Number.isFinite(poleTolerance) || poleTolerance < 1e-14 || poleTolerance > 0.1) throw new RangeError('分母の除外幅は1e-14〜0.1です。');
  if (!Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > 24 || !Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 200000)
    throw new RangeError('分母検査の深さは0〜24、処理上限は1〜200000です。');
  const start = shape.knots[shape.degree], end = shape.knots[shape.points.length];
  const branches = [], omitted = []; let current = null, nodes = 0;
  function omit(from, to, reason) {
    current = null;
    const last = omitted.at(-1);
    if (last?.to === from && last.reason === reason) last.to = to;
    else omitted.push({from, to, reason});
  }
  for (const span of splineBezierSpans(shape)) {
    if (span.breakBefore) current = null;
    const pending = [{...span, depth: 0}];
    while (pending.length) {
      const {controls, from, to, depth} = pending.pop();
      if (nodes >= maxNodes) {omit(from, to, 'budget'); continue;}
      nodes++;
      if (controls.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.w))) {omit(from, to, 'numeric'); continue;}
      const weights = controls.map(p => p.w), min = Math.min(...weights), max = Math.max(...weights);
      if (min > poleTolerance || max < -poleTolerance) {
        const count = Math.max(1, Math.ceil(sampleCount * ((to-from)/(end-start))));
        const points = Array.from({length: count+1}, (_, i) => project(controls, i/count));
        if (points.some(p => !p)) {omit(from, to, 'numeric'); continue;}
        if (current?.to === from) {current.points.push(...points.slice(1)); current.to = to;}
        else {current = {from, to, points}; branches.push(current);}
      } else if (Math.max(Math.abs(min), Math.abs(max)) <= poleTolerance) {
        omit(from, to, 'near-zero');
      } else {
        const mid = from/2+to/2;
        if (depth >= maxDepth || mid <= from || mid >= to) {omit(from, to, 'unresolved'); continue;}
        const [left, right] = splitHomogeneousBezier(controls);
        pending.push({controls: right, from: mid, to, depth: depth+1}, {controls: left, from, to: mid, depth: depth+1});
      }
    }
  }
  const complete = omitted.length === 0;
  return {branches, omitted, complete, closed: !!shape.periodic && complete && branches.length === 1,
    settings: {sampleCount, poleTolerance, maxDepth, maxNodes}, nodes};
}

// Compatibility helper for callers expecting one point array: refuse to erase a gap.
export function sampleSplineCurve(shape, sampleCount = 80) {
  const result = sampleSplineBranches(shape, {sampleCount});
  if (!result.complete || result.branches.length !== 1) throw new RangeError('分離された曲線はsampleSplineBranchesで取得してください。');
  return result.branches[0].points;
}
