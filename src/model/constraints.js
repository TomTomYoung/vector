const finite = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);

function solveLinear(matrix, rhs) {
  const n = rhs.length, a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let i = c + 1; i < n; i++) if (Math.abs(a[i][c]) > Math.abs(a[pivot][c])) pivot = i;
    if (!Number.isFinite(a[pivot][c]) || Math.abs(a[pivot][c]) < Number.MIN_VALUE) return null;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let i = c + 1; i < n; i++) {
      const factor = a[i][c] / a[c][c];
      for (let j = c + 1; j <= n; j++) a[i][j] -= factor * a[c][j];
      a[i][c] = 0;
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let value = a[i][n];
    for (let j = i + 1; j < n; j++) value -= a[i][j] * x[j];
    x[i] = value / a[i][i];
  }
  return x.every(Number.isFinite) ? x : null;
}

function matrixRank(rows, columns) {
  const a = rows.map(row => [...row]);
  const largest = Math.max(0, ...a.flat().map(Math.abs)), threshold = Math.max(1, largest) * 1e-10;
  let rank = 0;
  for (let col = 0; col < columns && rank < a.length; col++) {
    let pivot = rank;
    for (let i = rank + 1; i < a.length; i++) if (Math.abs(a[i][col]) > Math.abs(a[pivot][col])) pivot = i;
    if (Math.abs(a[pivot][col]) <= threshold) continue;
    [a[rank], a[pivot]] = [a[pivot], a[rank]];
    for (let i = rank + 1; i < a.length; i++) {
      const factor = a[i][col] / a[rank][col];
      for (let j = col; j < columns; j++) a[i][j] -= factor * a[rank][j];
    }
    rank++;
  }
  return rank;
}

// Damped least squares. Fixed vertices never become unknowns and inputs are never mutated.
// A local numerical solver: a stalled iterate does not prove the constraints inconsistent.
export function solveConstraints({points, fixed = [], constraints = [], tolerance = 1e-8,
  maxIterations = 100, damping = 1e-3}) {
  if (!Array.isArray(points) || !points.length || points.length > 200 || !points.every(finite) ||
    !Array.isArray(fixed) || !Array.isArray(constraints) || constraints.length > 1000 ||
    !Number.isFinite(tolerance) || tolerance <= 0 || !Number.isInteger(maxIterations) || maxIterations < 0 || maxIterations > 1000 ||
    !Number.isFinite(damping) || damping <= 0) return null;
  const validIndex = i => Number.isInteger(i) && i >= 0 && i < points.length;
  if (!fixed.every(validIndex)) return null;
  for (const c of constraints) {
    if (!c || !["distance", "horizontal", "vertical", "coincident", "perpendicular"].includes(c.type)) return null;
    if (c.type === "perpendicular") {
      if (![c.first, c.second].every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(validIndex) && pair[0] !== pair[1])) return null;
    } else if (!validIndex(c.a) || !validIndex(c.b) || c.a === c.b ||
      (c.type === "distance" && (!Number.isFinite(c.value) || c.value < 0))) return null;
  }
  const fixedSet = new Set(fixed), variables = [], slots = new Map();
  for (let i = 0; i < points.length; i++) if (!fixedSet.has(i)) {
    slots.set(i, variables.length); variables.push([i, "x"], [i, "y"]);
  }
  const origin = points[fixed[0] ?? 0];
  const scale = Math.max(...points.flatMap(p => [Math.abs(p.x - origin.x), Math.abs(p.y - origin.y)]),
    ...constraints.filter(c => c.type === "distance").map(c => c.value)) || 1;
  let current = points.map(p => ({x: (p.x - origin.x) / scale, y: (p.y - origin.y) / scale}));
  const n = variables.length;
  function evaluate(ps) {
    const residual = [], jacobian = [], reports = [];
    let degenerate = false;
    constraints.forEach((c, index) => {
      const values = [], normalized = [];
      function add(value, gradients, unit = scale) {
        const row = Array(n).fill(0);
        for (const [i, x, y] of gradients) {
          if (!slots.has(i)) continue;
          const slot = slots.get(i); row[slot] += x; row[slot + 1] += y;
        }
        normalized.push(value); values.push(value * unit); residual.push(value); jacobian.push(row);
      }
      if (c.type === "perpendicular") {
        const [a, b] = c.first, [d, e] = c.second;
        const u = {x: ps[b].x - ps[a].x, y: ps[b].y - ps[a].y}, v = {x: ps[e].x - ps[d].x, y: ps[e].y - ps[d].y};
        const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y);
        if (lu <= 1e-14 || lv <= 1e-14) {
          degenerate = true; add(1, [], 1);
        } else {
          const value = (u.x * v.x + u.y * v.y) / (lu * lv);
          const gu = {x: v.x / (lu * lv) - value * u.x / lu ** 2, y: v.y / (lu * lv) - value * u.y / lu ** 2};
          const gv = {x: u.x / (lu * lv) - value * v.x / lv ** 2, y: u.y / (lu * lv) - value * v.y / lv ** 2};
          add(value, [[a, -gu.x, -gu.y], [b, gu.x, gu.y], [d, -gv.x, -gv.y], [e, gv.x, gv.y]], 1);
        }
      } else {
        const a = ps[c.a], b = ps[c.b], x = b.x - a.x, y = b.y - a.y;
        if (c.type === "distance" && c.value > 0) {
          const length = Math.hypot(x, y);
          add(length - c.value / scale, length ? [[c.a, -x / length, -y / length], [c.b, x / length, y / length]] : []);
        } else {
          if (c.type !== "horizontal") add(x, [[c.a, -1, 0], [c.b, 1, 0]]);
          if (c.type !== "vertical") add(y, [[c.a, 0, -1], [c.b, 0, 1]]);
        }
      }
      reports.push({index, type: c.type, values, normalized, satisfied: normalized.every(v => Math.abs(v) <= tolerance)});
    });
    const cost = residual.reduce((s, r) => s + r * r, 0);
    return {residual, jacobian, reports, cost, degenerate, maxResidual: Math.max(0, ...residual.map(Math.abs))};
  }
  let state = evaluate(current), lambda = damping, iterations = 0, status = "maxIterations";
  for (; iterations < maxIterations; iterations++) {
    if (!state.degenerate && state.maxResidual <= tolerance) {status = "converged"; break;}
    if (!n || state.degenerate) {status = state.degenerate ? "degenerate" : "stalled"; break;}
    const normal = Array.from({length: n}, () => Array(n).fill(0)), gradient = Array(n).fill(0);
    state.jacobian.forEach((row, k) => {
      for (let i = 0; i < n; i++) {
        gradient[i] += row[i] * state.residual[k];
        for (let j = 0; j < n; j++) normal[i][j] += row[i] * row[j];
      }
    });
    let accepted = false;
    for (let trial = 0; trial < 16; trial++) {
      const damped = normal.map((row, i) => row.map((v, j) => v + (i === j ? lambda * Math.max(1e-6, normal[i][i]) : 0)));
      const step = solveLinear(damped, gradient.map(v => -v));
      if (!step) {lambda *= 10; continue;}
      const candidate = current.map(p => ({...p}));
      variables.forEach(([i, axis], j) => {candidate[i][axis] += step[j];});
      const next = evaluate(candidate);
      if (!next.degenerate && Number.isFinite(next.cost) && next.cost < state.cost) {
        current = candidate; state = next; lambda = Math.max(1e-15, lambda / 3); accepted = true; break;
      }
      lambda *= 10;
    }
    if (!accepted) {status = "stalled"; break;}
  }
  if (!state.degenerate && state.maxResidual <= tolerance) status = "converged";
  const rank = matrixRank(state.jacobian, n);
  const solved = current.map((p, i) => fixedSet.has(i) ? {...points[i]} : {x: p.x * scale + origin.x, y: p.y * scale + origin.y});
  if (!solved.every(finite)) return null;
  return {points: solved, converged: status === "converged", status, iterations,
    residuals: state.reports, maxResidual: state.maxResidual, scale, rank, degreesOfFreedom: n - rank};
}
