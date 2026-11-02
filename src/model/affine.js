// Column vectors. Matrices store [a c e; b d f; 0 0 1].
const origin = {x: 0, y: 0};

export function translationMatrix({dx, dy}) {
  return {a: 1, b: 0, c: 0, d: 1, e: dx, f: dy};
}

function about(a, b, c, d, center) {
  return {a, b, c, d, e: (1 - a) * center.x - c * center.y, f: -b * center.x + (1 - d) * center.y};
}

export function rotationMatrix({angle, center = origin}) {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return about(cos, sin, -sin, cos, center);
}

export function scaleMatrix({sx, sy = sx, center = origin}) {
  return about(sx, 0, 0, sy, center);
}

export function shearMatrix({kx = 0, ky = 0, center = origin}) {
  return about(1, ky, kx, 1, center);
}

export function reflectionMatrix({start, end}) {
  const dx = end.x - start.x, dy = end.y - start.y, length = Math.hypot(dx, dy);
  if (!length) return null;
  const x = dx / length, y = dy / length;
  return about(x * x - y * y, 2 * x * y, 2 * x * y, y * y - x * x, start);
}

export function applyToPoint({matrix: m, point: p}) {
  return {x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f};
}

export function applyToVector({matrix: m, vector: v}) {
  return {x: m.a * v.x + m.c * v.y, y: m.b * v.x + m.d * v.y};
}

export function transformPoints({matrix, points}, ops = {}) {
  const apply = ops.applyToPoint ?? applyToPoint;
  return points.map(point => apply({matrix, point}));
}

export function composeAffine({first: f, then: g}) {
  return {
    a: g.a * f.a + g.c * f.b, b: g.b * f.a + g.d * f.b,
    c: g.a * f.c + g.c * f.d, d: g.b * f.c + g.d * f.d,
    e: g.a * f.e + g.c * f.f + g.e, f: g.b * f.e + g.d * f.f + g.f,
  };
}

export function invertAffine({matrix: m}) {
  const det = m.a * m.d - m.b * m.c;
  if (det === 0) return null;
  const a = m.d / det, b = -m.b / det, c = -m.c / det, d = m.a / det;
  return {a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f)};
}

function triangleFrame([o, a, b]) {
  return {a: a.x - o.x, b: a.y - o.y, c: b.x - o.x, d: b.y - o.y, e: o.x, f: o.y};
}

export function affineFromTriangles({source, target}, ops = {}) {
  if (source.length !== 3 || target.length !== 3) return null;
  const inverse = (ops.invertAffine ?? invertAffine)({matrix: triangleFrame(source)});
  return inverse && (ops.composeAffine ?? composeAffine)({first: inverse, then: triangleFrame(target)});
}

export function barycentricCoordinates({point, triangle}, ops = {}) {
  if (triangle.length !== 3) return null;
  const inverse = (ops.invertAffine ?? invertAffine)({matrix: triangleFrame(triangle)});
  if (!inverse) return null;
  // Subtract the frame origin first to retain local precision after a large translation.
  const vector = {x: point.x - triangle[0].x, y: point.y - triangle[0].y};
  const {x, y} = (ops.applyToVector ?? applyToVector)({matrix: inverse, vector});
  return [1 - x - y, x, y];
}

export function fromBarycentric({triangle, weights}) {
  if (triangle.length !== 3 || weights.length !== 3) return null;
  const [a, b, c] = triangle, [u, v, w] = weights;
  return {x: u * a.x + v * b.x + w * c.x, y: u * a.y + v * b.y + w * c.y};
}

export function pointFromPolar({center = origin, radius, angle}) {
  return {x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle)};
}

export function polarCoordinates({center = origin, point}) {
  const dx = point.x - center.x, dy = point.y - center.y;
  return {radius: Math.hypot(dx, dy), angle: dx || dy ? Math.atan2(dy, dx) : null};
}
