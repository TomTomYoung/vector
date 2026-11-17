import {bSplineCurve,nurbsCurve} from '../model/splineCurves.js';
import {insertSplineKnot} from '../model/splines.js';
import {refinePeriodicSpline} from './periodicSplineRefinement.js';

function insertChecked(model,t,insert,rational) {
  const {degree,knots,points}=model,count=points.length;
  if(!Number.isFinite(t)||t<=knots[degree]||t>=knots[count])throw Error('挿入値は有効範囲の両端を除く有限数で指定してください。');
  if(knots.filter(k=>k===t).length>=degree)throw Error('挿入後のノット重複度は次数以下にしてください。');
  let index=degree;while(index+1<knots.length&&knots[index+1]<=t)index++;
  const expected=[...knots.slice(0,index+1),t,...knots.slice(index+1)];
  const refined=insert({degree,points:points.map(p=>({...p})),knots:[...knots],t,...(rational?{weights:[...model.weights]}:{})});
  if(!refined || refined.periodic || refined.periodicKnots!==undefined || refined.degree!==degree ||
    !Array.isArray(refined.points) || refined.points.length!==count+1 || !Array.isArray(refined.knots) ||
    refined.knots.length!==expected.length || expected.some((k,i)=>k!==refined.knots[i]) ||
    rational!==(refined.weights!==undefined))throw Error('ノット挿入が失敗したか、実装が対応する形式の結果を返しませんでした。');
  if(!Array.from(refined.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)) ||
    (rational&&(!Array.isArray(refined.weights)||refined.weights.length!==count+1||!Array.from(refined.weights).every(Number.isFinite)||!refined.weights.some(w=>w!==0))))
    throw Error('挿入結果を有限な制御点・重みで表せません。');
  return {degree,points:refined.points.map(p=>({x:p.x,y:p.y})),knots:expected,...(rational?{weights:[...refined.weights]}:{})};
}

// Validate the editable model and operation result before replacing any draft fields.
// A replacement insert implementation must preserve the mathematical curve itself;
// structural validation cannot prove that contract for arbitrary external code.
export function insertEditableSplineKnot(method,input,t,insert=insertSplineKnot) {
  const create=method==='bSplineCurve'?bSplineCurve:method==='nurbsCurve'?nurbsCurve:null;
  if(!create || !input)throw Error('ノット挿入はB-spline・NURBSに対応しています。');
  const model=create(input);
  if(!model)throw Error('挿入前の制御点・次数・ノット・重みを確認してください。');
  const {degree}=model,count=model.controlCount??model.points.length;
  if(count>=1000)throw Error('挿入後の制御点は1000個までです。');
  const refine=(value,knot)=>insertChecked(value,knot,insert,method==='nurbsCurve');
  if(model.periodic)return refinePeriodicSpline(model,t,create,refine);
  const refined=refine(model,t);
  const checked=create(refined);
  if(!checked)throw Error('挿入結果を有限な制御点・重みで表せません。');
  return {points:checked.points,degree,periodic:false,knots:checked.knots,...(checked.weights?{weights:checked.weights}:{})};
}
