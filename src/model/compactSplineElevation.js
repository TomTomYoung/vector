import {addSparseQrRow,solveSparseQr} from './sparseQr.js';
import {prepareSplineDegreeElevation,projectSplineDegreeElevation} from './splineDegreeElevation.js';
import {bSplineCurve,homogeneousSplineBezierSpans} from './splineCurves.js';

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
    for(let j=0;j<=q;j++){const h=span.controls[j];if(!addSparseQrRow(rows,coefficients[j],[h.x,h.y,h.w]))return null;}
  }
  if(spanIndex!==spans.length)return null;
  const solved=solveSparseQr(rows);if(!solved)return null;
  const controls=Array.from({length:count},(_,i)=>{const h=solved[column(i)];return {x:h[0],y:h[1],w:rational?h[2]:1};});
  return projectSplineDegreeElevation(c,controls,knots,'continuity');
}
