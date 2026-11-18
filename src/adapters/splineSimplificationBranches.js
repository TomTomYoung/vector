import {nurbsCurve,sampleSplineBranches} from '../model/splineCurves.js';

// Use the denominator subdivision's certified intervals. Display sampling
// preferences and polyline distances do not select the branch.
export function listSimplificationBranches(input){
  const model=nurbsCurve(input);
  if(!model||!Array.from(model.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))||
    !Array.from(model.weights).every(Number.isFinite)||!Array.from(model.knots).every(Number.isFinite))return [];
  const scale=Math.max(...model.weights.map(Math.abs));
  if(model.weights.some(w=>w!==0&&w/scale===0))return [];
  const {branches,omitted}=sampleSplineBranches(model,{sampleCount:2,poleTolerance:1e-12,maxDepth:18,maxNodes:32768});
  if(omitted.some(part=>part.reason==='budget'||part.reason==='numeric'))return [];
  const from=model.knots[model.degree],to=model.knots[model.points.length];
  const ranges=branches.map(part=>[[part.from,part.to]]);
  if(model.periodic&&ranges.length>1&&ranges[0][0][0]===from&&ranges.at(-1)[0][1]===to){
    ranges[0].push(...ranges.pop());
  }
  return ranges.map((ranges,i)=>({index:i+1,domain:[from,to],periodic:!!model.periodic,ranges}));
}

// Step verification can report ranges relative to a relocated periodic seam.
// Compare to the original selection, including the join between consecutive
// copies. Reject translations that lose an endpoint or change an interval width.
export function branchContains(branch,from,to){
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>to)return false;
  const {ranges,domain,periodic}=branch;
  if(ranges.some(([lo,hi])=>lo<=from&&to<=hi))return true;
  if(!periodic)return false;
  const period=domain[1]-domain[0],turn=Math.floor((from-domain[0])/period);
  if(!Number.isSafeInteger(turn-1)||!Number.isSafeInteger(turn+1)||to-from>period)return false;
  let covered=from;
  for(let cycle=turn-1;cycle<=turn+1;cycle++){
    const shift=cycle*period;
    for(const [lo,hi] of ranges){
      const start=lo+shift,end=hi+shift;
      if(start-shift!==lo||end-shift!==hi||end-start!==hi-lo)continue;
      if(start<=covered&&covered<=end){
        covered=end;
        if(covered>=to)return true;
      }
    }
  }
  return false;
}
