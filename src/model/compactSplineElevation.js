import {prepareSplineDegreeElevation,projectSplineDegreeElevation} from './splineDegreeElevation.js';
import {bSplineCurve,homogeneousSplineBezierSpans} from './splineCurves.js';

// Streaming sparse QR by Givens rotations. Rows have local B-spline support;
// periodic seam columns are ordered last to preserve a narrow band plus border.
function addRow(rows,coefficients,rhs) {
  while(coefficients.size){
    const i=Math.min(...coefficients.keys()),b=coefficients.get(i),previous=rows[i];
    if(!previous){rows[i]={coefficients,rhs};return true;}
    const a=previous.coefficients.get(i),r=Math.hypot(a,b),c=a/r,s=b/r;
    if(!Number.isFinite(r)||r===0)return false;
    const keys=new Set([...previous.coefficients.keys(),...coefficients.keys()]);
    previous.coefficients.set(i,r);coefficients.delete(i);
    for(const j of keys){if(j===i)continue;const x=previous.coefficients.get(j)??0,y=coefficients.get(j)??0;
      const upper=c*x+s*y,lower=c*y-s*x;if(!Number.isFinite(upper)||!Number.isFinite(lower))return false;
      if(upper===0)previous.coefficients.delete(j);else previous.coefficients.set(j,upper);
      if(lower===0)coefficients.delete(j);else coefficients.set(j,lower);
    }
    for(let axis=0;axis<3;axis++){const x=previous.rhs[axis],y=rhs[axis];previous.rhs[axis]=c*x+s*y;rhs[axis]=c*y-s*x;
      if(!Number.isFinite(previous.rhs[axis])||!Number.isFinite(rhs[axis]))return false;}
  }
  return true;
}

export function elevateSplineDegreeContinuity(input) {
  const c=prepareSplineDegreeElevation(input,{representation:'continuity'});if(!c)return null;
  const {model,q,layouts,rational,spans}=c,{knots,count}=layouts.continuity,periodic=!!model.periodic;
  const probe=bSplineCurve({degree:q,points:Array.from({length:count},()=>({x:0,y:0})),periodic,
    [periodic?'periodicKnots':'knots']:knots});if(!probe)return null;
  const column=i=>{i%=count;return periodic?(i<q?count-q+i:i-q):i;},rows=Array(count);
  let spanIndex=0;
  for(let k=q;k<probe.points.length;k++){
    if(!(probe.knots[k+1]>probe.knots[k]))continue;
    const span=spans[spanIndex++];if(!span||span.from!==probe.knots[k]||span.to!==probe.knots[k+1])return null;
    const coefficients=Array.from({length:q+1},()=>new Map()),localKnots=probe.knots.slice(k-q,k+q+2);
    // Extract three columns of the local Bernstein conversion matrix at a time.
    // The shared polar de Boor helper is linear in x, y and w; here these are
    // independent basis coefficients, not projected geometric coordinates.
    for(let base=0;base<=q;base+=3){
      const controls=Array.from({length:q+1},(_,i)=>({x:Number(i===base),y:Number(i===base+1),w:Number(i===base+2)}));
      const extracted=homogeneousSplineBezierSpans({controls,degree:q,knots:localKnots})[0];if(!extracted)return null;
      for(let j=0;j<=q;j++)for(let axis=0;axis<3&&base+axis<=q;axis++){
        const value=extracted.controls[j][['x','y','w'][axis]];if(!Number.isFinite(value))return null;
        if(value!==0)coefficients[j].set(column(k-q+base+axis),value);
      }
    }
    for(let j=0;j<=q;j++){const h=span.controls[j];if(!addRow(rows,coefficients[j],[h.x,h.y,h.w]))return null;}
  }
  if(spanIndex!==spans.length)return null;
  const solved=Array(count);
  for(let i=count-1;i>=0;i--){
    const row=rows[i];if(!row)return null;const diagonal=row.coefficients.get(i),h=[...row.rhs];
    if(!Number.isFinite(diagonal)||diagonal===0)return null;
    for(const [j,value] of row.coefficients){if(j===i)continue;if(j<i||!solved[j])return null;for(let axis=0;axis<3;axis++)h[axis]-=value*solved[j][axis];}
    solved[i]=h.map(v=>v/diagonal);if(!solved[i].every(Number.isFinite))return null;
  }
  const controls=Array.from({length:count},(_,i)=>{const h=solved[column(i)];return {x:h[0],y:h[1],w:rational?h[2]:1};});
  return projectSplineDegreeElevation(c,controls,knots,'continuity');
}
