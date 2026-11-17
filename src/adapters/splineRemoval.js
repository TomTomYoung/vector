import {bSplineCurve,nurbsCurve} from '../model/splineCurves.js';
import {removeSplineKnot,prepareSplineKnotRemoval,validateSplineKnotRemoval} from '../model/splineKnotRemoval.js';
import {removePeriodicSplineKnot} from './periodicSplineRemoval.js';

export function removeEditableSplineKnot(method,input,t,tolerance=1e-7,remove=removeSplineKnot) {
  const create=method==='bSplineCurve'?bSplineCurve:method==='nurbsCurve'?nurbsCurve:null;
  if(!create||!input)throw Error('ノット削除は標準B-spline・NURBSに対応しています。');
  const model=create(input);
  if(!model)throw Error('削除前の制御点・次数・ノット・重みを確認してください。');
  const removeChecked=(value,knot,limit)=>{
    const request={...value,t:knot,tolerance:limit};
    if(!prepareSplineKnotRemoval(request))throw Error('存在する内部ノット、削除後の制御点数、0〜1000000の有限な許容差と、分母を零から分離できる重みを確認してください。');
    const result=remove({...request,points:value.points.map(p=>({...p})),knots:[...value.knots],...(value.weights?{weights:[...value.weights]}:{})});
    const checked=validateSplineKnotRemoval(request,result);
    if(!checked)throw Error('ノットを削除できません。偏差が許容差を超えるか、分母の検証に失敗したか、実装の出力が不正です。');
    return checked;
  };
  if(model.periodic)return removePeriodicSplineKnot(method,model,t,tolerance,create,removeChecked);
  const checked=removeChecked(model,t,tolerance);
  return {...checked,periodic:false};
}
