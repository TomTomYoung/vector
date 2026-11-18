import {homogeneousSplineBezierSpans,splitHomogeneousBezier} from './splineCurves.js';

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

// Signed weights require bounds on the denominator functions, not on individual
// weights. Complete subdivision is mandatory: no omitted interval is accepted.
export function rationalSplineDeviation(original,candidate,degree,knots,options) {
  if(original.length!==candidate.length||!Number.isInteger(degree)||degree<1||degree>12||original.length<=degree||
    knots.length!==original.length+degree+1||!knots.every((k,i)=>Number.isFinite(k)&&(!i||k>=knots[i-1]))||
    ![...original,...candidate].every(h=>h&&[h.x,h.y,h.w].every(Number.isFinite)))return null;
  const scaleA=Math.max(...original.map(h=>Math.abs(h.w))),scaleB=Math.max(...candidate.map(h=>Math.abs(h.w)));
  const a=homogeneousSplineBezierSpans({controls:original,degree,knots}),b=homogeneousSplineBezierSpans({controls:candidate,degree,knots});
  return rationalBezierDeviation(a.map((span,i)=>({from:span.from,to:span.to,a:span.controls,b:b[i].controls})),scaleA,scaleB,options);
}

// Each pair covers the same parameter interval on both native curves.
export function rationalBezierDeviation(pairs,scaleA,scaleB,{maxDepth=18,maxNodes=32768}={}) {
  if(!Number.isInteger(maxDepth)||maxDepth<0||maxDepth>24||!Number.isInteger(maxNodes)||maxNodes<1||maxNodes>200000||!scaleA||!scaleB)return null;
  const relativeFloor=1e-12,floorA=scaleA*relativeFloor,floorB=scaleB*relativeFloor;
  if(!floorA||!floorB)return null;
  let errorBound=0,nodes=0,minimumOriginal=Infinity,minimumCandidate=Infinity;
  const finite=row=>row.every(h=>[h.x,h.y,h.w].every(Number.isFinite));
  const lower=row=>{const w=row.map(h=>h.w),lo=Math.min(...w),hi=Math.max(...w);return lo>0?lo:hi<0?-hi:0;};
  for(const pair of pairs) {
    const pending=[{...pair,depth:0}];
    while(pending.length) {
      const part=pending.pop();if(++nodes>maxNodes||!finite(part.a)||!finite(part.b))return null;
      const wa=lower(part.a),wb=lower(part.b);
      if(wa>floorA&&wb>floorB) {
        let deltaH=0,deltaW=0,radius=0;
        for(let j=0;j<part.a.length;j++) {
          const h=part.a[j],g=part.b[j];deltaH=Math.max(deltaH,Math.hypot(h.x-g.x,h.y-g.y));
          deltaW=Math.max(deltaW,Math.abs(h.w-g.w));radius=Math.max(radius,Math.hypot(g.x,g.y)/wb);
        }
        const bound=(deltaH+radius*deltaW)/wa;if(!Number.isFinite(bound))return null;
        errorBound=Math.max(errorBound,bound);minimumOriginal=Math.min(minimumOriginal,wa);minimumCandidate=Math.min(minimumCandidate,wb);
      }else {
        // Endpoint zeros, including double roots at a subdivision boundary, fail.
        if([part.a[0],part.a.at(-1)].some(h=>Math.abs(h.w)<=floorA)||
          [part.b[0],part.b.at(-1)].some(h=>Math.abs(h.w)<=floorB))return null;
        const mid=part.from/2+part.to/2;if(part.depth>=maxDepth||mid<=part.from||mid>=part.to)return null;
        const [al,ar]=splitHomogeneousBezier(part.a),[bl,br]=splitHomogeneousBezier(part.b);
        pending.push({a:ar,b:br,from:mid,to:part.to,depth:part.depth+1},{a:al,b:bl,from:part.from,to:mid,depth:part.depth+1});
      }
    }
  }
  if(!Number.isFinite(minimumOriginal)||!Number.isFinite(minimumCandidate))return null;
  return {errorBound,denominator:{algorithm:'同次de Boor区間化・Bernstein分母範囲・de Casteljau再分割',source:'src/model/splineDeviation.js',
    relativeFloor,maxDepth,maxNodes,nodes,minimumOriginal,minimumCandidate,originalFloor:floorA,candidateFloor:floorB}};
}

export function boundedSplineDeviation(original,candidate,radius,rational,degree,knots,options) {
  if(!rational||[...original,...candidate].every(h=>h.w>0)) {
    const errorBound=homogeneousSplineDeviation(original,candidate,radius,rational);
    return errorBound===null?null:{errorBound};
  }
  return rationalSplineDeviation(original,candidate,degree,knots,options);
}
