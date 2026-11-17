import {reduceSplineDegree,prepareSplineDegreeReduction,validateSplineDegreeReduction} from '../model/splineDegreeReduction.js';

export function reduceEditableSplineDegree(method,input,tolerance=1e-7,reduce=reduceSplineDegree){
  if(!['bSplineCurve','nurbsCurve'].includes(method)||!input)throw Error('次数下げは標準B-spline・NURBSに対応しています。');
  const request={...input,tolerance,...(method==='nurbsCurve'?{weights:input.weights??input.points?.map(()=>1)}:{})};
  if(method==='bSplineCurve')delete request.weights;
  if(!prepareSplineDegreeReduction(request,{representation:reduce===reduceSplineDegree?'bezier':'either'}))throw Error('次数2〜12、変換後1000制御点以下、ノット・重みと0〜1000000の許容差を確認してください。');
  const result=reduce({...request,points:request.points.map(p=>({...p})),...(request.knots?{knots:[...request.knots]}:{}),
    ...(request.periodicKnots?{periodicKnots:[...request.periodicKnots]}:{}),...(request.weights?{weights:[...request.weights]}:{})});
  const checked=validateSplineDegreeReduction(request,result);
  if(!checked)throw Error('次数を下げられません。指定許容差での偏差・分母・端点固定・有限制御点の検証に失敗したか、実装の出力が不正です。');
  return checked;
}
