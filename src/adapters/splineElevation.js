import {elevateSplineDegree,prepareSplineDegreeElevation,validateSplineDegreeElevation} from '../model/splineDegreeElevation.js';

export function elevateEditableSplineDegree(method,input,tolerance=1e-7,elevate=elevateSplineDegree) {
  if(!['bSplineCurve','nurbsCurve'].includes(method)||!input)throw Error('次数上げは標準B-spline・NURBSに対応しています。');
  const request={...input,tolerance,...(method==='nurbsCurve'?{weights:input.weights??input.points?.map(()=>1)}:{})};
  if(method==='bSplineCurve')delete request.weights;
  if(!prepareSplineDegreeElevation(request,{representation:'either'}))throw Error('次数1〜11、変換後1000制御点以下、ノット・重みと0〜1000000の検証許容差を確認してください。');
  const result=elevate({...request,points:request.points.map(p=>({...p})),...(request.knots?{knots:[...request.knots]}:{}),
    ...(request.periodicKnots?{periodicKnots:[...request.periodicKnots]}:{}),...(request.weights?{weights:[...request.weights]}:{})});
  const checked=validateSplineDegreeElevation(request,result);
  if(!checked)throw Error('次数を上げられません。偏差・分母・有限制御点の検証に失敗したか、実装の出力が不正です。');
  return checked;
}
