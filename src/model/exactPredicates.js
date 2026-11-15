// Exact signs of determinants of the supplied binary64 coordinates (not exact constructions).
// BigInt dyadic arithmetic; this is not Shewchuk's adaptive expansion algorithm.
const buffer = new ArrayBuffer(8), view = new DataView(buffer);
function dyadic(value) {
  if (!Number.isFinite(value)) throw new TypeError('厳密判定には有限座標が必要です。');
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0), exponent = Number((bits >> 52n) & 2047n);
  let mantissa = bits & ((1n << 52n) - 1n);
  if (exponent) mantissa |= 1n << 52n;
  if (bits >> 63n) mantissa = -mantissa;
  return {mantissa, exponent: exponent ? exponent - 1075 : -1074};
}
function integers(points) {
  const values = points.flatMap(p => [dyadic(p.x), dyadic(p.y)]);
  const exponent = Math.min(...values.filter(v => v.mantissa).map(v => v.exponent), 0);
  return values.map(v => v.mantissa ? v.mantissa << BigInt(v.exponent - exponent) : 0n);
}
const sign = n => n < 0n ? -1 : n > 0n ? 1 : 0;
export function orientationSign(a, b, c) {
  const [ax, ay, bx, by, cx, cy] = integers([a, b, c]);
  return sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
}
export function exactInsideCircle(a, b, c, p) {
  const [ax, ay, bx, by, cx, cy, px, py] = integers([a, b, c, p]);
  const ux = ax - px, uy = ay - py, vx = bx - px, vy = by - py, wx = cx - px, wy = cy - py;
  return (ux * ux + uy * uy) * (vx * wy - vy * wx) +
    (vx * vx + vy * vy) * (wx * uy - wy * ux) + (wx * wx + wy * wy) * (ux * vy - uy * vx) > 0n;
}
