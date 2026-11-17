import {expandPeriodicSpline} from '../model/periodicSplineExpansion.js';
import {homogeneousSplineDeviation} from '../model/splineDeviation.js';
import {insertSplineKnot} from '../model/splines.js';
import {insertEditableSplineKnot} from './splineRefinement.js';

// Align equivalent distributions of seam repeats without moving the parameter
// interval. Moving trailing duplicates to the front rotates controls backwards.
function canonical(model,create) {
  const {degree,controlCount:n}=model,u=model.knots.slice(degree,degree+n+1);
  let tail=0;while(u[n-tail-1]===u[n])tail++;
  const rotate=list=>[...list.slice(n-tail,n),...list.slice(0,n-tail)];
  return create({degree,periodic:true,periodicKnots:[...Array(tail).fill(u[0]),...u.slice(0,n+1-tail)],
    points:rotate(model.points),...(model.weights?{weights:rotate(model.weights)}:{})});
}

function normalizedInsertion(input) {
  if(!input.weights)return insertSplineKnot(input);
  const sign=Math.sign(input.weights[0]),scale=Math.max(...input.weights.map(Math.abs));
  const result=insertSplineKnot({...input,weights:input.weights.map(w=>sign*(w/scale))});
  if(result)result.weights=result.weights.map(w=>sign*w*scale);
  return result;
}

// Each single removal is checked by the caller. After extracting and wrapping
// the candidate, verify the actual periodic result on the original common basis.
export function removePeriodicSplineKnot(method,model,requested,tolerance,create,removeChecked) {
  const {degree:p,controlCount:n}=model,u=model.knots.slice(p,p+n+1),a=u[0],b=u[n];
  if(n-1<=p)throw Error('削除後の元制御点数は次数より多くしてください。');
  if(!Number.isFinite(requested)||requested<a||requested>b||!u.includes(requested)||
    !Number.isFinite(tolerance)||tolerance<0||tolerance>1e6)
    throw Error('存在する周期ノットと、0〜1000000の有限な許容差を確認してください。');
  const t=requested===b?a:requested,nextKnots=[...u];
  if(t===a){
    if(u[1]===a)nextKnots.splice(u.lastIndexOf(a),1);
    else if(u[n-1]===b)nextKnots.splice(n-1,1);
    else throw Error('継ぎ目の最後のノットは削除できません。周期の始端・終端を保持します。');
  }else nextKnots.splice(u.lastIndexOf(t),1);
  const {period,originalPoints,originalWeights,expanded:initial}=expandPeriodicSpline(model);
  const copies=t===a?[a,b]:[t-period,t,t+period];let expanded=initial;
  for(const value of copies)expanded=removeChecked(expanded,value,tolerance);
  const probe=create({degree:p,periodic:true,periodicKnots:nextKnots,points:originalPoints.slice(0,-1),
    ...(originalWeights?{weights:originalWeights.slice(0,-1)}:{})});
  const numericError=()=>Error('周期削除後のノット列または再挿入照合を有限精度で保持できません。');
  if(!probe)throw numericError();
  const offset=expanded.knots.indexOf(a)-probe.knots.indexOf(a),count=n-1;
  if(offset<0||probe.knots.some((k,i)=>k!==expanded.knots[offset+i]))throw numericError();
  const candidate={degree:p,periodic:true,periodicKnots:nextKnots,points:expanded.points.slice(offset,offset+count),
    ...(expanded.weights?{weights:expanded.weights.slice(offset,offset+count)}:{})};
  const candidateModel=create(candidate);if(!candidateModel)throw numericError();
  // This fixed verifier is independent of the user's chosen insertion implementation.
  const rebuilt=create(insertEditableSplineKnot(method,candidate,t,normalizedInsertion));
  const before=canonical(model,create),after=rebuilt&&canonical(rebuilt,create);
  if(!before||!after||before.points.length!==after.points.length||before.knots.length!==after.knots.length||
    before.knots.some((k,i)=>k!==after.knots[i]))throw numericError();
  const rational=!!before.weights,origin=before.points[0],sign=rational?Math.sign(before.weights[0]):1;
  const scale=rational?Math.max(...before.weights.map(Math.abs)):1;
  const controls=shape=>shape.points.map((point,i)=>{
    const w=rational?sign*(shape.weights[i]/scale):1;
    return {x:(point.x-origin.x)*w,y:(point.y-origin.y)*w,w};
  });
  const radius=rational?Math.max(...after.points.map(point=>Math.hypot(point.x-origin.x,point.y-origin.y))):0;
  const errorBound=homogeneousSplineDeviation(controls(before),controls(after),radius,rational);
  if(errorBound===null||errorBound>tolerance)throw Error('周期再構成後の偏差が許容差を超えるため、ノットを削除できません。');
  return {...candidate,removal:{t:requested,tolerance,errorBound,periodic:{
    algorithm:'3周期展開・同値ノット削除・中央周期抽出・再挿入照合',source:'src/adapters/periodicSplineRemoval.js',t,copies:copies.length}}};
}
