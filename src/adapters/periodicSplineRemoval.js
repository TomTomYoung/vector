import {expandPeriodicSpline} from '../model/periodicSplineExpansion.js';
import {branchRemovalDeviation} from '../model/splineBranchRemoval.js';
import {boundedSplineDeviation} from '../model/splineDeviation.js';
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
  const sign=Math.sign(input.weights.find(w=>w!==0)),scale=Math.max(...input.weights.map(Math.abs));
  const weights=input.weights.map(w=>sign*(w/scale));
  if(weights.some((w,i)=>input.weights[i]!==0&&w===0))return null;
  if(!weights.every(w=>w>0)) {
    // Insert numerator and denominator as polynomial splines. A (0,0,0)
    // homogeneous control is representable by a finite point of weight zero.
    const origin=input.points[0],numerator=insertSplineKnot({...input,weights:undefined,points:input.points.map((p,i)=>({x:(p.x-origin.x)*weights[i],y:(p.y-origin.y)*weights[i]}))});
    const denominator=insertSplineKnot({...input,weights:undefined,points:weights.map(w=>({x:w,y:0}))});
    if(!numerator||!denominator)return null;
    const points=[],restored=[];
    for(let i=0;i<numerator.points.length;i++) {
      const h=numerator.points[i],w=denominator.points[i].x;
      if(![h.x,h.y,w].every(Number.isFinite)||(w===0&&(h.x!==0||h.y!==0)))return null;
      points.push(w===0?{...origin}:{x:origin.x+h.x/w,y:origin.y+h.y/w});restored.push(sign*w*scale);
      if(w!==0&&restored.at(-1)===0)return null;
    }
    return {...numerator,points,weights:restored};
  }
  const result=insertSplineKnot({...input,weights});
  if(result)result.weights=result.weights.map(w=>sign*w*scale);
  return result;
}

// Move a simple seam to the next knot. The same infinite periodic basis must
// remain representable, including its supporting knots and exact period.
function shiftedOrigin(model,create,{u,period,knotAt}) {
  const {degree:p,controlCount:n}=model,start=u[1],end=start+period;
  const rotate=list=>[...list.slice(1,n),list[0]];
  const shifted=create({degree:p,periodic:true,periodicKnots:[...u.slice(1),end],
    points:rotate(model.points),...(model.weights?{weights:rotate(model.weights)}:{})});
  if(!shifted||end-start!==period||shifted.knots.some((k,i)=>k!==knotAt(i+1-p)))
    throw Error('継ぎ目の移動後の周期・ノット間隔を有限精度で保持できません。');
  return shifted;
}

function context(model,requested,tolerance,create) {
  const {degree:p,controlCount:n}=model,u=model.knots.slice(p,p+n+1),a=u[0],b=u[n];
  if(n-1<=p)throw Error('削除後の元制御点数は次数より多くしてください。');
  if(!Number.isFinite(requested)||requested<a||requested>b||!u.includes(requested)||
    !Number.isFinite(tolerance)||tolerance<0||tolerance>1e6)
    throw Error('存在する周期ノットと、0〜1000000の有限な許容差を確認してください。');
  const t=requested===b?a:requested,nextKnots=[...u],expansion=expandPeriodicSpline(model);
  let comparison=model,domainShift=null;
  if(t===a){
    if(u[1]===a)nextKnots.splice(u.lastIndexOf(a),1);
    else if(u[n-1]===b)nextKnots.splice(n-1,1);
    else {
      comparison=shiftedOrigin(model,create,expansion);
      const end=comparison.knots[p+n];
      nextKnots.splice(0,nextKnots.length,...u.slice(1,-1),end);
      domainShift={from:[a,b],to:[u[1],end],period:expansion.period};
    }
  }else nextKnots.splice(u.lastIndexOf(t),1);
  const copies=t===a?[a,b]:[t-expansion.period,t,t+expansion.period];
  return {model,requested,tolerance,p,n,t,b,nextKnots,expansion,comparison,domainShift,copies};
}

function inspect(method,c,candidate,create,scope) {
  const {model,requested,tolerance,p,n,t,b,nextKnots,comparison,domainShift,copies}=c;
  const rationalInput=!!model.weights;
  if(!candidate||candidate.periodic!==true||candidate.knots!==undefined||candidate.degree!==p||
    !Array.isArray(candidate.points)||candidate.points.length!==n-1||!Array.from(candidate.points).every(v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y))||
    !Array.isArray(candidate.periodicKnots)||candidate.periodicKnots.length!==nextKnots.length||nextKnots.some((v,i)=>v!==candidate.periodicKnots[i])||
    rationalInput!==(candidate.weights!==undefined)||rationalInput&&(!Array.isArray(candidate.weights)||candidate.weights.length!==n-1||!Array.from(candidate.weights).every(Number.isFinite)))
    throw Error('周期ノット削除の出力形式が不正です。');
  const numericError=()=>Error('周期削除後のノット列または再挿入照合を有限精度で保持できません。');
  const candidateModel=create(candidate);if(!candidateModel)throw numericError();
  let deviation;
  if(scope==='branch'){
    deviation=branchRemovalDeviation(canonical(comparison,create),canonical(candidateModel,create),domainShift?b:t);
  }else if(scope==='whole'){
    deviation=reinsertedDeviation(method,c,candidate,create);
  }
  if(!deviation||deviation.errorBound>tolerance)throw Error('周期再構成後の偏差が許容差を超えるか分母を検証できないため、ノットを削除できません。');
  return {degree:p,periodic:true,periodicKnots:[...nextKnots],points:candidateModel.points.slice(0,n-1).map(v=>({x:v.x,y:v.y})),...(rationalInput?{weights:candidateModel.weights.slice(0,n-1)}:{}),removal:{t:requested,tolerance,...deviation,periodic:{
    algorithm:scope==='branch'?'3周期展開・同値ノット削除・1周期の枝検証と影響外照合':domainShift?'3周期展開・同値ノット削除・継ぎ目移動・1周期抽出・再挿入照合':'3周期展開・同値ノット削除・中央周期抽出・再挿入照合',
    source:'src/adapters/periodicSplineRemoval.js',t,copies:copies.length,...(domainShift?{domainShift}:{})}}};
}

function reinsertedDeviation(method,{comparison,domainShift,b,t,p},candidate,create){
  const numericError=()=>Error('周期再構成後の再挿入照合を有限精度で保持できません。');
  // This fixed verifier is independent of the user's chosen insertion implementation.
  const rebuilt=create(insertEditableSplineKnot(method,candidate,domainShift?b:t,normalizedInsertion));
  const before=canonical(comparison,create),after=rebuilt&&canonical(rebuilt,create);
  if(!before||!after||before.points.length!==after.points.length||before.knots.length!==after.knots.length||
    before.knots.some((k,i)=>k!==after.knots[i]))throw numericError();
  const rational=!!before.weights,origin=before.points[0],sign=rational?Math.sign(before.weights.find(w=>w!==0)):1;
  const scale=rational?Math.max(...before.weights.map(Math.abs)):1;
  const controls=shape=>shape.points.map((point,i)=>{
    const w=rational?sign*(shape.weights[i]/scale):1;
    return {x:(point.x-origin.x)*w,y:(point.y-origin.y)*w,w};
  });
  if(rational&&[before,after].some(shape=>shape.weights.some(w=>w!==0&&w/scale===0)))throw numericError();
  const radius=rational?Math.max(...after.points.map(point=>Math.hypot(point.x-origin.x,point.y-origin.y))):0;
  return boundedSplineDeviation(controls(before),controls(after),radius,rational,p,before.knots);
}

// Validate an arbitrary final periodic candidate independently of its solver.
export function validatePeriodicSplineKnotRemoval(method,model,t,tolerance,create,candidate,scope='whole') {
  try {return inspect(method,context(model,t,tolerance,create),candidate,create,scope);}catch{return null;}
}

// Each expanded removal and the actual wrapped result are checked separately.
export function removePeriodicSplineKnot(method,model,requested,tolerance,create,removeChecked,scope='whole') {
  const c=context(model,requested,tolerance,create),{p,n,nextKnots,expansion,copies}=c;
  const {originalPoints,originalWeights,expanded:initial}=expansion;let expanded=initial;
  for(const value of copies)expanded=removeChecked(expanded,value,tolerance);
  const probe=create({degree:p,periodic:true,periodicKnots:nextKnots,points:originalPoints.slice(0,-1),
    ...(originalWeights?{weights:originalWeights.slice(0,-1)}:{})});
  const numericError=()=>Error('周期削除後のノット列または再挿入照合を有限精度で保持できません。');
  if(!probe)throw numericError();
  const start=nextKnots[0],offset=expanded.knots.indexOf(start)-probe.knots.indexOf(start),count=n-1;
  if(offset<0||probe.knots.some((k,i)=>k!==expanded.knots[offset+i]))throw numericError();
  const candidate={degree:p,periodic:true,periodicKnots:nextKnots,points:expanded.points.slice(offset,offset+count),
    ...(expanded.weights?{weights:expanded.weights.slice(offset,offset+count)}:{})};
  return inspect(method,c,candidate,create,scope);
}
