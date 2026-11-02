function clonePoint(point) {
  return { x: Number(point.x), y: Number(point.y) };
}

export function deCasteljau(points, t) {
  const work = points.map(clonePoint);
  const last = work.length - 1;
  for (let r = 1; r <= last; r += 1) {
    for (let i = 0; i <= last - r; i += 1) {
      work[i] = {
        x: (1 - t) * work[i].x + t * work[i + 1].x,
        y: (1 - t) * work[i].y + t * work[i + 1].y,
      };
    }
  }
  return work[0];
}

export function sampleBezierPoints(points, sampleCount = 60, degreeOverride) {
  if (!points || points.length < 2) {
    return [];
  }
  const degree = degreeOverride ?? points.length - 1;
  if (degree < 1) {
    return [];
  }
  const controlPoints = points.slice(0, degree + 1).map(clonePoint);
  const steps = Math.max(2, Math.floor(sampleCount));
  const result = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    result.push(deCasteljau(controlPoints, t));
  }
  return result;
}
