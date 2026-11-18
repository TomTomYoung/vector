import {bSplineCurve,nurbsCurve} from './splineCurves.js';
import {reduceSplineDegree,validateSplineDegreeReduction} from './splineDegreeReduction.js';
import {reduceSplineDegreeAdaptive} from './adaptiveSplineReduction.js';
import {reduceSplineDegreeContinuity} from './compactSplineReduction.js';

function inputFromModel(model){
  const n=model.controlCount??model.points.length;
  return {points:model.points.slice(0,n).map(p=>({x:p.x,y:p.y})),degree:model.degree,periodic:!!model.periodic,
    [model.periodic?'periodicKnots':'knots']:model.periodic?model.knots.slice(model.degree,model.degree+n+1):[...model.knots],
    ...(model.weights?{weights:model.weights.slice(0,n)}:{})};
}
function prepare(input){
  const create=input?.weights===undefined?bSplineCurve:nurbsCurve,model=input&&create(input),budget=input?.tolerance??1e-3,target=input?.targetDegree;
  if(!model||!Number.isInteger(target)||target<1||target>=model.degree||!Number.isFinite(budget)||budget<0||budget>1e6)return null;
  // Reject sparse/nonfinite data before any implementation call.
  if(!Array.from(model.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))||!Array.from(model.knots).every(Number.isFinite)||
    model.weights&&!Array.from(model.weights).every(Number.isFinite))return null;
  return {create,input:inputFromModel(model),budget,target,fromDegree:model.degree};
}
// Positive floating-point sums are moved one representable value upward so the
// accumulator itself cannot understate the sum of the per-step estimates.
// This does not turn the underlying binary64 geometric estimates into proofs.
export function addReductionErrorBounds(a,b){
  if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||b<0)return null;
  if(a===0)return b;if(b===0)return a;const sum=a+b;if(!Number.isFinite(sum))return null;
  const bytes=new ArrayBuffer(8),view=new DataView(bytes);view.setFloat64(0,sum);view.setBigUint64(0,view.getBigUint64(0)+1n);
  const upper=view.getFloat64(0);return Number.isFinite(upper)?upper:null;
}
function checkedStep(c,current,candidate,used){
  const allocation=(c.budget-used)/(current.degree-c.target);
  if(!Number.isFinite(allocation)||allocation<0)return null;
  const checked=validateSplineDegreeReduction({...current,tolerance:allocation},candidate);if(!checked)return null;
  const total=addReductionErrorBounds(used,checked.reduction.errorBound);if(total===null||total>c.budget)return null;
  const model=c.create(checked);if(!model)return null;
  return {input:inputFromModel(model),total,record:{...checked.reduction,cumulativeErrorBound:total}};
}
function finish(c,current,stages,steps,total){
  return {...current,stages,reductionPlan:{fromDegree:c.fromDegree,toDegree:c.target,tolerance:c.budget,errorBound:total,
    remainingBudget:Math.max(0,c.budget-total),stepCount:steps.length,steps,
    allocation:'残予算を残段階数で等分し、未使用分を次段階へ繰り越す',
    verification:{algorithm:'各段階の独立した全区間偏差検証・三角不等式・上向き加算による累積上限',source:'src/model/splineReductionPlan.js'}}};
}

export function validateSplineReductionPlan(input,result){
  const c=prepare(input);if(!c||!result||!Array.isArray(result.stages)||result.stages.length!==c.fromDegree-c.target)return null;
  let current=c.input,total=0;const stages=[],steps=[];
  for(const candidate of Array.from(result.stages)){
    const step=checkedStep(c,current,candidate,total);if(!step)return null;
    current=step.input;total=step.total;stages.push(current);steps.push(step.record);
  }
  // The displayed final curve must be exactly the verified final stage's model.
  if((result.weights!==undefined)!==(current.weights!==undefined))return null;
  const actual=c.create(result),expected=c.create(current);
  if(!actual||JSON.stringify(actual)!==JSON.stringify(expected))return null;
  return finish(c,current,stages,steps,total);
}

function run(input,reduce){
  const c=prepare(input);if(!c)return null;
  let current=c.input,total=0;const stages=[],steps=[];
  while(current.degree>c.target){
    const allocation=(c.budget-total)/(current.degree-c.target);
    const candidate=reduce({...current,points:current.points.map(p=>({...p})),knots:current.knots&&[...current.knots],
      periodicKnots:current.periodicKnots&&[...current.periodicKnots],weights:current.weights&&[...current.weights],tolerance:allocation});
    const step=checkedStep(c,current,candidate,total);if(!step)return null;
    current=step.input;total=step.total;stages.push(current);steps.push(step.record);
  }
  return finish(c,current,stages,steps,total);
}
export const reduceSplineToDegree=input=>run(input,reduceSplineDegreeAdaptive);
export const reduceSplineToDegreeBezier=input=>run(input,reduceSplineDegree);
export const reduceSplineToDegreeContinuity=input=>run(input,reduceSplineDegreeContinuity);
