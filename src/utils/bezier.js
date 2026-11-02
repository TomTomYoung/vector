/**
 * ============================================================
 * Bezier utility helpers
 * ============================================================
 *
 * - Provides reusable helpers for generating SVG path data for
 *   quadratic, cubic, and arbitrary-degree Bezier curves.
 * - Exports functions so that both dedicated Bezier tools and
 *   composite tools (e.g. VerticesTool) can share the same
 *   implementation.
 */

import { createElement } from './svg.js';
import { sampleBezierPoints } from '../model/bezier.js';
export { sampleBezierPoints };

function toMoveLinePath(points) {
  if (!points || points.length === 0) {
    return '';
  }
  const commands = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length; i += 1) {
    commands.push(`L ${points[i].x} ${points[i].y}`);
  }
  return commands.join(' ');
}

export function quadraticPath(points) {
  if (!points || points.length < 3) {
    return '';
  }
  const [p0, p1, p2] = points;
  return `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
}

export function cubicPath(points) {
  if (!points || points.length < 4) {
    return '';
  }
  const [p0, p1, p2, p3] = points;
  return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;
}

export function bezierNPath(points, options = {}) {
  const { sampleCount = 80, degree } = options;
  const samples = sampleBezierPoints(points, sampleCount, degree);
  if (samples.length === 0) {
    return '';
  }
  return toMoveLinePath(samples);
}

export function buildPathData(method, points, options = {}) {
  switch (method) {
    case 'quadraticBezier':
      return quadraticPath(points);
    case 'cubicBezier':
      return cubicPath(points);
    case 'bezierN':
      return bezierNPath(points, options);
    default:
      return '';
  }
}

export function createPathElement(method, points, options = {}) {
  const d = buildPathData(method, points, options);
  if (!d) {
    return null;
  }
  return createElement('path', { d });
}

const bezier = {
  buildPathData,
  createPathElement,
  quadraticPath,
  cubicPath,
  bezierNPath,
  sampleBezierPoints,
};

export default bezier;
