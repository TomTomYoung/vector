// Knot vector U and control point count N satisfy |U| = N+p+1. The active parameter domain is [U[p],U[N]].
function spanFor(points, knots, degree, t) {
  const n = points.length;
  if (!Number.isInteger(degree) || degree < 0 || n <= degree || knots.length !== n + degree + 1 ||
    !Number.isFinite(t) || !knots.every((k, i) => Number.isFinite(k) && (!i || k >= knots[i - 1]))) return -1;
  if (knots[degree] >= knots[n] || t < knots[degree] || t > knots[n]) return -1;
  let span = degree;
  if (t === knots[n]) {
    span = n - 1;
    while (span > degree && knots[span] === t) span--;
  } else {
    while (span < n - 1 && t >= knots[span + 1]) span++;
  }
  return span;
}

export function clampedKnots({count, degree}) {
  if (!Number.isInteger(count) || count > 100000 || !Number.isInteger(degree) || degree < 0 || count <= degree) return null;
  return Array.from({length: count + degree + 1}, (_, i) => Math.max(0, Math.min(1, (i - degree) / (count - degree))));
}

function evaluate(points, knots, degree, t, weights) {
  const span = spanFor(points, knots, degree, t);
  if (span < 0 || (weights && weights.length !== points.length)) return null;
  const row = Array.from({length: degree + 1}, (_, j) => {
    const i = span - degree + j, w = weights ? weights[i] : 1;
    return {x: points[i].x * w, y: points[i].y * w, w};
  });
  for (let level = 1; level <= degree; level++) {
    for (let j = degree; j >= level; j--) {
      const i = span - degree + j, width = knots[i + degree - level + 1] - knots[i];
      const a = width ? (t - knots[i]) / width : 0, before = row[j - 1], after = row[j];
      row[j] = {x: (1 - a) * before.x + a * after.x, y: (1 - a) * before.y + a * after.y, w: (1 - a) * before.w + a * after.w};
    }
  }
  const {x, y, w} = row[degree];
  return w === 0 ? null : {x: x / w, y: y / w};
}

export function bSplinePoint({points, knots, degree, t}) {
  return evaluate(points, knots, degree, t, null);
}

export function nurbsPoint({points, knots, degree, t, weights}) {
  if (!Array.isArray(weights)) return null;
  return evaluate(points, knots, degree, t, weights);
}

export function insertSplineKnot({points, knots, degree, t, weights}) {
  const k = spanFor(points, knots, degree, t);
  if (k < 0 || t <= knots[degree] || t >= knots[points.length] || (weights && weights.length !== points.length)) return null;
  const multiplicity = knots.filter(knot => knot === t).length;
  if (multiplicity >= degree) return null;
  const result = [], outWeights = [];
  for (let i = 0; i <= points.length; i++) {
    if (i <= k - degree || i > k - multiplicity) {
      const j = i <= k - degree ? i : i - 1;
      result.push(points[j]);
      if (weights) outWeights.push(weights[j]);
    } else {
      const alpha = (t - knots[i]) / (knots[i + degree] - knots[i]);
      const u = (1 - alpha) * (weights ? weights[i - 1] : 1), v = alpha * (weights ? weights[i] : 1), w = u + v;
      if (!w) return null;
      result.push({x: (u * points[i - 1].x + v * points[i].x) / w, y: (u * points[i - 1].y + v * points[i].y) / w});
      if (weights) outWeights.push(w);
    }
  }
  const refined = {degree, points: result, knots: [...knots.slice(0, k + 1), t, ...knots.slice(k + 1)]};
  if (weights) refined.weights = outWeights;
  return refined;
}

export function bSplineDerivative({points, knots, degree, t}) {
  if (spanFor(points, knots, degree, t) < 0 || degree === 0) return null;
  // Interior breaks of multiplicity >= p have no guaranteed two-sided derivative.
  if (t > knots[degree] && t < knots[points.length] && knots.filter(k => k === t).length >= degree) return null;
  const controls = points.slice(1).map((p, i) => {
    const width = knots[i + degree + 1] - knots[i + 1], factor = width ? degree / width : 0;
    return {x: factor * (p.x - points[i].x), y: factor * (p.y - points[i].y)};
  });
  return bSplinePoint({points: controls, knots: knots.slice(1, -1), degree: degree - 1, t});
}
