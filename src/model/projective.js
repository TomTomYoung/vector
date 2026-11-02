import {barycentricCoordinates} from "./affine.js";

// Row-major 3x3 matrix, up to a common nonzero scale.
export function projectPoint({matrix, point}) {
  const [a, b, c, d, e, f, g, h, i] = matrix, {x, y} = point;
  const w = g * x + h * y + i;
  return w === 0 ? null : {x: (a * x + b * y + c) / w, y: (d * x + e * y + f) / w};
}

export function composeProjective({first, then}) {
  return Array.from({length: 9}, (_, index) => {
    const row = index - index % 3, col = index % 3;
    return then[row] * first[col] + then[row + 1] * first[col + 3] + then[row + 2] * first[col + 6];
  });
}

export function invertProjective({matrix}) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const adj = [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
  const det = a * adj[0] + b * adj[3] + c * adj[6];
  return det === 0 ? null : adj.map(value => value / det);
}

function quadFrame(points, barycentric) {
  if (points.length !== 4) return null;
  const triangle = points.slice(0, 3), weights = barycentric({point: points[3], triangle});
  if (!weights || weights.some(w => w === 0)) return null;
  return [...triangle.map((p, j) => p.x * weights[j]), ...triangle.map((p, j) => p.y * weights[j]), ...weights];
}

export function homographyFromQuads({source, target}, ops = {}) {
  const barycentric = ops.barycentricCoordinates ?? barycentricCoordinates;
  const a = quadFrame(source, barycentric), b = quadFrame(target, barycentric);
  if (!a || !b) return null;
  const inverse = (ops.invertProjective ?? invertProjective)({matrix: a});
  return inverse && (ops.composeProjective ?? composeProjective)({first: inverse, then: b});
}
