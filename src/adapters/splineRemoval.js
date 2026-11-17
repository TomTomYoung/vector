import {bSplineCurve,nurbsCurve} from '../model/splineCurves.js';
import {removeSplineKnot,prepareSplineKnotRemoval,validateSplineKnotRemoval} from '../model/splineKnotRemoval.js';

export function removeEditableSplineKnot(method,input,t,tolerance=1e-7,remove=removeSplineKnot) {
  const create=method==='bSplineCurve'?bSplineCurve:method==='nurbsCurve'?nurbsCurve:null;
  if(!create||!input||input.periodic)throw Error('ノット削除は非周期の標準B-spline・NURBSに対応しています。');
  const model=create(input);
  if(!model)throw Error('削除前の制御点・次数・ノット・重みを確認してください。');
  if(model.weights&&!(model.weights.every(w=>w>0)||model.weights.every(w=>w<0)))
    throw Error('ノット削除の重みは全て正、または全て負にしてください。零・正負混在は未対応です。');
  const request={...model,t,tolerance};
  if(!prepareSplineKnotRemoval(request))throw Error('存在する内部ノット、削除後の制御点数、0〜1000000の有限な許容差を確認してください。');
  const result=remove({...request,points:model.points.map(p=>({...p})),knots:[...model.knots],...(model.weights?{weights:[...model.weights]}:{})});
  const checked=validateSplineKnotRemoval(request,result);
  if(!checked)throw Error('ノットを削除できません。偏差が許容差を超えるか、実装の出力が不正です。');
  return {...checked,periodic:false};
}
