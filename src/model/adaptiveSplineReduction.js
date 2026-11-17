import {prepareSplineDegreeReduction,reduceHomogeneousSpan,checkReducedSpan,joinReducedSpans,projectSplineDegreeReduction} from './splineDegreeReduction.js';
import {splitReductionInterval,adaptiveLayout,REDUCTION_MAX_NODES} from './reductionPartitions.js';
import {boundedSplineDeviation} from './splineDeviation.js';

export function reduceSplineDegreeAdaptive(input){
  const c=prepareSplineDegreeReduction(input);if(!c)return null;
  // Reject source poles before searching; each source interval must be verified.
  let denominatorNodes=0;
  for(const span of c.spans){
    const check=boundedSplineDeviation(span.controls,span.controls,0,c.rational,c.p,[...Array(c.p+1).fill(0),...Array(c.p+1).fill(1)],{maxNodes:32768-denominatorNodes});
    if(!check)return null;denominatorNodes+=check.denominator?.nodes??0;
  }
  const pending=c.spans.map(s=>({...s})).reverse(),leaves=[],reduced=[];let nodes=0,count=c.count;
  while(pending.length){
    if(++nodes>REDUCTION_MAX_NODES)return null;
    const span=pending.pop(),candidate=reduceHomogeneousSpan(c,span),checked=checkReducedSpan(c,span,candidate);
    if(checked&&checked.errorBound<=c.tolerance){leaves.push(span);reduced.push(candidate);continue;}
    const halves=splitReductionInterval(c,span);if(!halves||(count+=c.q)>1000)return null;
    pending.push(halves[1],halves[0]);
  }
  const representation=leaves.length===c.spans.length?'bezier':'adaptive';
  if(representation==='adaptive'){c.layouts.adaptive=adaptiveLayout(c,leaves);if(!c.layouts.adaptive)return null;}
  return projectSplineDegreeReduction(c,joinReducedSpans(c,leaves,reduced),representation);
}
