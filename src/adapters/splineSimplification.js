import {bSplineCurve,nurbsCurve} from '../model/splineCurves.js';
import {boundedSplineDeviation} from '../model/splineDeviation.js';
import {addReductionErrorBounds} from '../model/splineReductionPlan.js';
import {removeEditableSplineKnot,validateEditableSplineKnotRemoval} from './splineRemoval.js';

const attemptLimit=4096;
function editable(model){
  const n=model.controlCount??model.points.length;
  return {degree:model.degree,periodic:!!model.periodic,points:model.points.slice(0,n).map(p=>({x:p.x,y:p.y})),
    [model.periodic?'periodicKnots':'knots']:model.periodic?model.knots.slice(model.degree,model.degree+n+1):[...model.knots],
    ...(model.weights?{weights:model.weights.slice(0,n)}:{})};
}
function prepare(input){
  const rational=input?.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,model=input&&create(input),budget=input?.tolerance??1e-7,maxAttempts=input?.maxAttempts??attemptLimit;
  if(!model||!Number.isInteger(maxAttempts)||maxAttempts<1||maxAttempts>attemptLimit||!Number.isFinite(budget)||budget<0||budget>1e6||
    !Array.from(model.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))||!Array.from(model.knots).every(Number.isFinite)||
    rational&&!Array.from(model.weights).every(Number.isFinite))return null;
  // Even a no-op must not claim a whole-curve bound across an unverified pole.
  if(rational){
    const scale=Math.max(...model.weights.map(Math.abs)),sign=Math.sign(model.weights.find(w=>w!==0)),origin=model.points[0];
    const weights=model.weights.map(w=>sign*(w/scale));
    if(weights.some((w,i)=>model.weights[i]!==0&&w===0))return null;
    const h=model.points.map((p,i)=>({x:(p.x-origin.x)*weights[i],y:(p.y-origin.y)*weights[i],w:weights[i]}));
    if(!boundedSplineDeviation(h,h,0,true,model.degree,model.knots))return null;
  }
  return {create,method:rational?'nurbsCurve':'bSplineCurve',input:editable(model),budget,maxAttempts};
}
function candidates(input){
  if(input.points.length<=input.degree+1)return [];
  if(input.periodic)return [...new Set(input.periodicKnots.slice(0,-1))];
  const lo=input.knots[input.degree],hi=input.knots[input.points.length];
  return [...new Set(input.knots.filter(t=>t>lo&&t<hi))];
}
function step(c,current,t,candidate,total){
  const checked=validateEditableSplineKnotRemoval(c.method,current,t,c.budget-total,candidate);if(!checked)return null;
  const nextTotal=addReductionErrorBounds(total,checked.removal.errorBound);if(nextTotal===null||nextTotal>c.budget)return null;
  return {curve:editable(c.create(checked)),total:nextTotal,record:{...checked.removal,cumulativeErrorBound:nextTotal}};
}
function finish(c,current,stages,steps,total){
  return {...current,stages,simplification:{originalControlCount:c.input.points.length,controlCount:current.points.length,
    removedKnots:steps.length,tolerance:c.budget,errorBound:total,remainingBudget:Math.max(0,c.budget-total),steps,
    verification:{algorithm:'削除ごとの独立した再挿入・全区間検証・三角不等式・上向き加算',source:'src/adapters/splineSimplification.js'}}};
}
export function validateSplineSimplification(input,result){
  const c=prepare(input);if(!c||!result||!Array.isArray(result.stages)||result.stages.length>Math.min(c.maxAttempts,c.input.points.length-c.input.degree-1))return null;
  let current=c.input,total=0;const stages=[],steps=[];
  for(const stage of Array.from(result.stages)){
    if(!stage)return null;const checked=step(c,current,stage.t,stage.curve,total);if(!checked)return null;
    current=checked.curve;total=checked.total;stages.push({t:stage.t,curve:current});steps.push(checked.record);
  }
  if((result.weights!==undefined)!==(current.weights!==undefined))return null;
  const actual=c.create(result),expected=c.create(current);
  if(!actual||JSON.stringify(actual)!==JSON.stringify(expected))return null;
  return finish(c,current,stages,steps,total);
}
function run(input,reverse){
  const c=prepare(input);if(!c)return null;
  let current=c.input,total=0,attempts=0;const stages=[],steps=[];
  // Retry a full ordered sweep after changes: a later removal can make an
  // earlier rejected knot removable. The finite attempt budget is atomic.
  while(true){
    const knots=candidates(current);if(reverse)knots.reverse();let changed=false;
    for(const t of knots){
      while(candidates(current).includes(t)){
        if(++attempts>c.maxAttempts)return null;
        let candidate;try{candidate=removeEditableSplineKnot(c.method,current,t,c.budget-total);}catch{break;}
        const checked=step(c,current,t,candidate,total);if(!checked)break;
        current=checked.curve;total=checked.total;stages.push({t,curve:current});steps.push(checked.record);changed=true;
      }
    }
    if(!changed)return finish(c,current,stages,steps,total);
  }
}
export const simplifySplineKnots=input=>run(input,false);
export const simplifySplineKnotsReverse=input=>run(input,true);

export function simplifyEditableSplineKnots(method,input,tolerance=1e-7,simplify=simplifySplineKnots){
  if(!['bSplineCurve','nurbsCurve'].includes(method)||!input)throw Error('ノット一括簡約は標準B-spline・NURBSに対応しています。');
  const request=structuredClone({...input,tolerance});
  if(method==='nurbsCurve')request.weights??=request.points?.map(()=>1);else delete request.weights;
  if(!Number.isFinite(tolerance)||tolerance<0||tolerance>1e6)throw Error('全体許容差は0〜1000000の有限数で指定してください。');
  const result=simplify(structuredClone(request)),checked=validateSplineSimplification(request,result);
  if(!checked)throw Error('ノット一括簡約に失敗しました。分母・累積偏差・出力と走査上限4096回を確認してください。途中結果は適用していません。');
  const {stages,...out}=checked;return out;
}
