import {prepareSplineDegreeReduction,projectSplineDegreeReduction} from './splineDegreeReduction.js';
import {bSplineCurve,homogeneousSplineBezierSpan} from './splineCurves.js';
import {raiseHomogeneousBezier} from './splineDegreeElevation.js';
import {addSparseQrRow,solveSparseQr} from './sparseQr.js';

// Global homogeneous coefficient least squares in the prescribed m-1 knot
// vector. Outer endpoints and both sides of full breaks are eliminated exactly;
// ordinary joins and a periodic seam may move within the verified tolerance.
export function reduceSplineDegreeContinuity(input){
  const c=prepareSplineDegreeReduction(input,{representation:'continuity'});if(!c)return null;
  const {model,p,q,rational,spans}=c,{knots,count,fixed}=c.layouts.continuity,periodic=!!model.periodic;
  const probe=bSplineCurve({degree:q,points:Array.from({length:count},()=>({x:0,y:0})),periodic,
    [periodic?'periodicKnots':'knots']:knots});if(!probe)return null;
  const order=Array.from({length:count},(_,i)=>periodic?(i+q)%count:i).filter(i=>!fixed.has(i));
  const columns=new Map(order.map((i,j)=>[i,j])),rows=Array(order.length);let index=q;
  for(const span of spans){
    while(probe.knots[index+1]<=span.from)index++;
    const coefficients=Array.from({length:p+1},()=>new Map()),localKnots=probe.knots.slice(index-q,index+q+2);
    // Restrict the lower-degree basis to each original interval, including cuts
    // whose simple knots have disappeared, then elevate those coefficients.
    for(let base=0;base<=q;base+=3){
      const controls=Array.from({length:q+1},(_,i)=>({x:Number(i===base),y:Number(i===base+1),w:Number(i===base+2)}));
      const extracted=homogeneousSplineBezierSpan({controls,degree:q,knots:localKnots,index:q,from:span.from,to:span.to});if(!extracted)return null;
      const elevated=raiseHomogeneousBezier(extracted);
      for(let j=0;j<=p;j++)for(let axis=0;axis<3&&base+axis<=q;axis++){
        const value=elevated[j][['x','y','w'][axis]];if(!Number.isFinite(value))return null;
        if(value!==0)coefficients[j].set((index-q+base+axis)%count,value);
      }
    }
    for(let j=0;j<=p;j++){
      const h=span.controls[j],rhs=[h.x,h.y,h.w],row=new Map();
      for(const [i,value] of coefficients[j]){
        const endpoint=fixed.get(i);if(endpoint){rhs[0]-=value*endpoint.x;rhs[1]-=value*endpoint.y;rhs[2]-=value*endpoint.w;}
        else row.set(columns.get(i),value);
      }
      if(!rhs.every(Number.isFinite)||!addSparseQrRow(rows,row,rhs))return null;
    }
  }
  const solved=solveSparseQr(rows);if(!solved)return null;
  const controls=Array.from({length:count},(_,i)=>{if(fixed.has(i))return fixed.get(i);const h=solved[columns.get(i)];return {x:h[0],y:h[1],w:rational?h[2]:1};});
  // QR can recover an exactly zero weight with a small nonzero x/y residual.
  // Use the representable zero homogeneous vector as a candidate, then subject
  // the changed curve to the same independent full-domain error/denominator test.
  const finiteCandidate=controls.map(h=>h.w===0?{x:0,y:0,w:0}:h);
  return projectSplineDegreeReduction(c,finiteCandidate,'continuity');
}
