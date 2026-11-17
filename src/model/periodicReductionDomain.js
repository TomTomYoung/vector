import {expandPeriodicSpline} from './periodicSplineExpansion.js';

// A disappearing simple seam is replaced by the first surviving knot. Keep
// the original Bernstein coefficients: shifting their parameter intervals must
// not change the approximation objective or omit the wrapped part of the curve.
export function periodicReductionDomain(model,spans,start,create) {
  try {
    const {u,a,b,period,knotAt}=expandPeriodicSpline(model),n=model.controlCount,p=model.degree;
    const offset=u.indexOf(start),cut=spans.findIndex(s=>s.from===start),end=start+period;
    if(offset<=0||offset>=n||cut<=0||!Number.isFinite(end)||end-start!==period)return null;
    const rotate=list=>[...list.slice(offset,n),...list.slice(0,offset)];
    const translate=t=>t===a?b:t+period;
    const shifted=create({degree:p,periodic:true,points:rotate(model.points),
      periodicKnots:[...u.slice(offset,n),...u.slice(0,offset+1).map(translate)],
      ...(model.weights?{weights:rotate(model.weights)}:{})});
    if(!shifted||shifted.knots.some((k,i)=>k!==knotAt(i+offset-p)))return null;
    const wrapped=spans.slice(0,cut).map(s=>({...s,from:translate(s.from),to:translate(s.to)}));
    // Reusing a Bernstein polynomial requires the same normalized interval.
    // Refuse rounding which changes a translated interval's width.
    if(wrapped.some((s,i)=>s.to-s.from!==spans[i].to-spans[i].from))return null;
    const comparison=[...spans.slice(cut),...wrapped];
    if(comparison[0].from!==start||comparison.at(-1).to!==end||
      comparison.some((s,i)=>!(s.to>s.from)||(i>0&&s.from!==comparison[i-1].to)))return null;
    return {spans:comparison,domainShift:{from:[a,b],to:[start,end],period}};
  } catch {return null;}
}
