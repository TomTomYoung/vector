// Common positive-weight basis bound. All controls share one normalization and
// origin; radius encloses the candidate relative to that origin. This is a
// binary64 estimate, not an outward-rounded interval arithmetic certificate.
export function homogeneousSplineDeviation(original,candidate,radius,rational) {
  if(original.length!==candidate.length||!Number.isFinite(radius)||radius<0)return null;
  let deltaH=0,deltaW=0,minWeight=Infinity;
  for(let i=0;i<original.length;i++){
    const a=original[i],b=candidate[i];
    if(!a||!b||![a.x,a.y,a.w,b.x,b.y,b.w].every(Number.isFinite)||a.w<=0||b.w<=0)return null;
    deltaH=Math.max(deltaH,Math.hypot(a.x-b.x,a.y-b.y));
    deltaW=Math.max(deltaW,Math.abs(a.w-b.w));minWeight=Math.min(minWeight,a.w);
  }
  const estimate=rational?(deltaH+radius*deltaW)/minWeight:deltaH;
  return Number.isFinite(estimate)?estimate:null;
}
