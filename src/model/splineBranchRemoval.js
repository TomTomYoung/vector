// On a protected span, compare every raw input that the local de Boor
// recurrence reads. This identity remains meaningful even at a denominator zero.
import {homogeneousSplineBezierSpan} from './splineCurves.js';
import {rationalBezierDeviation} from './splineDeviation.js';

function sameLocalBasis(a,b,i,j){
  for(let offset=1-a.degree;offset<=a.degree;offset++){
    if(a.knots[i+offset]!==b.knots[j+offset])return false;
  }
  for(let offset=-a.degree;offset<=0;offset++){
    const left=a.points[i+offset],right=b.points[j+offset];
    if(left.x!==right.x||left.y!==right.y||a.weights[i+offset]!==b.weights[j+offset])return false;
  }
  return true;
}

function homogeneous(shape,origin,scale){
  return shape.points.map((point,i)=>{
    const w=shape.weights[i]/scale;
    return {x:(point.x-origin.x)*w,y:(point.y-origin.y)*w,w};
  });
}

// Both models are validated, with equal degree and aligned parameter domains.
// Check every knot span that can see the removed knot, including its periodic
// copies. Compare directly on the native bases, before rounding by reinsertion.
export function branchRemovalDeviation(before,after,t){
  if(!before||!after)return null;
  const p=before.degree,start=before.knots[p],end=before.knots[before.points.length];
  if(start!==after.knots[p]||end!==after.knots[after.points.length]||!before.weights||!after.weights)return null;
  const n=before.controlCount;
  const knotAt=index=>n?before.knots[p+((index-p)%n+n)%n]:before.knots[index];
  const target=n&&t===end?start:t;
  const matches=index=>{const u=knotAt(index);return u===target||(n&&u===end&&target===start);};
  if(!n&&before.knots.filter(k=>k===t).length>p)return null;
  const scaleA=Math.max(...before.weights.map(Math.abs)),scaleB=Math.max(...after.weights.map(Math.abs));
  if(!scaleA||!scaleB)return null;
  const scale=Math.max(scaleA,scaleB),origin=before.points[0];
  if([before,after].some(shape=>shape.weights.some(w=>w!==0&&w/scale===0)))return null;
  const a=homogeneous(before,origin,scale),b=homogeneous(after,origin,scale);
  const ranges=[],pairs=[];
  let j=p,protectedSpans=0;
  for(let i=p;i<before.points.length;i++){
    const from=before.knots[i],to=before.knots[i+1];
    if(from===to)continue;
    while(j<after.points.length&&after.knots[j+1]<=from)j++;
    if(j>=after.points.length||after.knots[j]>from||after.knots[j+1]<to)return null;
    let affected=false;
    for(let k=i-p+1;k<=i+p;k++)if(matches(k)){affected=true;break;}
    if(!affected){
      if(!sameLocalBasis(before,after,i,j))return null;
      protectedSpans++;
      continue;
    }
    const left=homogeneousSplineBezierSpan({degree:p,knots:before.knots,controls:a,index:i,from,to});
    const right=homogeneousSplineBezierSpan({degree:p,knots:after.knots,controls:b,index:j,from,to});
    if(!left||!right)return null;
    pairs.push({from,to,a:left,b:right});
    if(ranges.length&&ranges.at(-1)[1]===from)ranges.at(-1)[1]=to;
    else ranges.push([from,to]);
  }
  const deviation=rationalBezierDeviation(pairs,scaleA/scale,scaleB/scale);
  return deviation&&{...deviation,branch:{ranges,checkedSpans:pairs.length,protectedSpans}};
}
