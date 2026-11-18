import {reduceSplineToDegree,validateSplineReductionPlan} from '../model/splineReductionPlan.js';

export function reduceEditableSplineToDegree(method,input,targetDegree,tolerance=1e-3,reduce=reduceSplineToDegree){
  if(!['bSplineCurve','nurbsCurve'].includes(method)||!input)throw Error('一括次数下げは標準B-spline・NURBSに対応しています。');
  const request={...input,targetDegree,tolerance,...(method==='nurbsCurve'?{weights:input.weights??input.points?.map(()=>1)}:{})};
  if(method==='bSplineCurve')delete request.weights;
  if(!Number.isInteger(targetDegree)||targetDegree<1||targetDegree>=input.degree||!Number.isFinite(tolerance)||tolerance<0||tolerance>1e6)
    throw Error('目標次数は1以上・現在の次数未満、全体許容差は0〜1000000で指定してください。');
  const result=reduce(structuredClone(request)),checked=validateSplineReductionPlan(request,result);
  if(!checked)throw Error('一括次数下げに失敗しました。全段階の偏差・分母・累積誤差予算・出力の検証と制御点上限を確認してください。途中結果は適用していません。');
  const {stages,...editable}=checked;return editable;
}
