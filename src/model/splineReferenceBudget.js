// Uniform distance at the same parameter, in the curve's local coordinates.
import {bSplineCurve,nurbsCurve,homogeneousSplineBezierSpan,splitHomogeneousBezier} from './splineCurves.js';
import {addReductionErrorBounds} from './splineReductionPlan.js';
import {raiseHomogeneousBezier} from './splineDegreeElevation.js';

const binomial=[[1]];
for(let n=1;n<=24;n++)binomial.push(Array.from({length:n+1},(_,i)=>(binomial[n-1][i-1]??0)+(binomial[n-1][i]??0)));

function model(method,input){
  const create=method==='bSplineCurve'?bSplineCurve:method==='nurbsCurve'?nurbsCurve:null;
  if(!create||!input||!Array.isArray(input.points)||input.points.length>1000||
    !Array.from(input.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))||
    (method==='bSplineCurve'&&input.weights!==undefined))return null;
  for(const key of ['weights','knots','periodicKnots']){
    if(input[key]!==undefined&&(!Array.isArray(input[key])||input[key].length>1013||!Array.from(input[key]).every(Number.isFinite)))return null;
  }
  return create(input);
}

function homogeneous(model,origin){
  const scale=model.weights?Math.max(...model.weights.map(Math.abs)):1;
  return model.points.map((p,i)=>{
    const w=model.weights?model.weights[i]/scale:1;
    if(!w&&model.weights?.[i])throw Error('重みの正規化で精度を保てません。');
    const x=(p.x-origin.x)*w,y=(p.y-origin.y)*w;
    if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('同次座標を有限値で表せません。');
    return {x,y,w};
  });
}

function intervals(shape,shifts,lo,hi){
  const result=[];
  for(const shift of shifts){
    for(let i=shape.degree;i<shape.points.length;i++){
      const a=shape.knots[i],b=shape.knots[i+1];
      if(a===b)continue;
      const from=a+shift,to=b+shift;
      if(to<=lo||from>=hi)continue;
      if(!Number.isFinite(from)||!Number.isFinite(to)||to-from!==b-a)throw Error('周期移動で区間の幅を保持できません。');
      if(result.length&&result.at(-1).to!==from)throw Error('周期区間を連続に並べられません。');
      result.push({from,to,index:i,shift});
    }
  }
  return result;
}

function extract(model,controls,span,from,to){
  const k=span.index,source=t=>t===span.from?model.knots[k]:t===span.to?model.knots[k+1]:t-span.shift;
  const a=source(from),b=source(to);
  if(a+span.shift!==from||b+span.shift!==to||b-a!==to-from)throw Error('同じパラメータ区間を再現できません。');
  return homogeneousSplineBezierSpan({degree:model.degree,knots:model.knots,controls,index:k,from:a,to:b});
}

function lowerWeight(row){
  const values=row.map(h=>h.w);
  return Math.max(0,Math.min(...values),-Math.max(...values));
}

// Bernstein coefficients of (Ha-Hb) Wb - Hb (Wa-Wb). Writing differences
// first gives an exact zero numerator when the normalized control rows match.
function numeratorBound(a,b){
  const p=a.length-1;
  let bound=0;
  for(let k=0;k<=2*p;k++){
    let x=0,y=0;
    for(let i=Math.max(0,k-p);i<=Math.min(k,p);i++){
      const j=k-i,ratio=binomial[p][i]*binomial[p][j]/binomial[2*p][k];
      const dw=a[i].w-b[i].w;
      x+=ratio*((a[i].x-b[i].x)*b[j].w-b[j].x*dw);
      y+=ratio*((a[i].y-b[i].y)*b[j].w-b[j].y*dw);
    }
    bound=Math.max(bound,Math.hypot(x,y));
  }
  return bound;
}

function intervalBound(left,right,rational,work,depth=0){
  if(++work.nodes>32768)throw Error('基準曲線との比較が処理上限に達しました。');
  while(left.length<right.length)left=raiseHomogeneousBezier(left);
  while(right.length<left.length)right=raiseHomogeneousBezier(right);
  if(!rational)return Math.max(...left.map((p,i)=>Math.hypot(p.x-right[i].x,p.y-right[i].y)));
  const wa=lowerWeight(left),wb=lowerWeight(right),floor=1e-12;
  if(wa>floor&&wb>floor)return numeratorBound(left,right)/(wa*wb);
  const ends=[left[0],left.at(-1),right[0],right.at(-1)];
  if(depth>=18||ends.some(p=>Math.abs(p.w)<=floor))throw Error('区間全体でNURBSの分母を確認できません。');
  const [al,ar]=splitHomogeneousBezier(left),[bl,br]=splitHomogeneousBezier(right);
  return Math.max(intervalBound(al,bl,true,work,depth+1),intervalBound(ar,br,true,work,depth+1));
}

export function splineReferenceDeviation(method,reference,current,work={nodes:0}){
  const a=model(method,reference),b=model(method,current);
  if(!a||!b||!!a.periodic!==!!b.periodic)throw Error('基準と比較する曲線の制御点・次数・ノット・周期指定を確認してください。');
  const lo=a.knots[a.degree],hi=a.knots[a.points.length],start=b.knots[b.degree],end=b.knots[b.points.length];
  let shifts=[0];
  if(lo!==start||hi!==end){
    const period=hi-lo;
    if(!a.periodic||end-start!==period)throw Error('基準と同じパラメータ区間または周期が必要です。');
    const turns=Math.floor((lo-start)/period);
    if(!Number.isSafeInteger(turns)||!Number.isSafeInteger(turns+1))throw Error('周期の移動量を表せません。');
    shifts=[turns*period,(turns+1)*period];
  }
  const left=intervals(a,[0],lo,hi),right=intervals(b,shifts,lo,hi);
  const ca=homogeneous(a,a.points[0]),cb=homogeneous(b,a.points[0]);
  let i=0,j=0,t=lo,errorBound=0;
  while(t<hi){
    const l=left[i],r=right[j];
    if(!l||!r||l.from>t||r.from>t)throw Error('曲線全体を同じ区間で比較できません。');
    const to=Math.min(l.to,r.to,hi);
    if(to<=t)throw Error('比較区間が不正です。');
    const x=extract(a,ca,l,t,to),y=extract(b,cb,r,t,to);
    if(!x||!y)throw Error('曲線の区間係数を計算できません。');
    errorBound=Math.max(errorBound,intervalBound(x,y,!!a.weights,work));
    if(!Number.isFinite(errorBound))throw Error('基準曲線からの偏差上限を計算できません。');
    if(l.to===to)i++;
    if(r.to===to)j++;
    t=to;
  }
  return errorBound;
}

// Rebuild history from the stored curve inputs. The editor reuses this checker
// while typing or dragging; stored error totals are never taken on trust.
export function prepareSplineReferenceBudget(method,budget){
  if(budget?.version!==1||!Number.isFinite(budget.tolerance)||budget.tolerance<0||budget.tolerance>1e6)throw Error('基準曲線の許容差は0〜1000000で指定してください。');
  const history=budget.checkpoints;
  if(history!==undefined&&(!Array.isArray(history)||history.length>128))throw Error('累積検査の記録は128回までです。');
  let last=budget.reference,used=0,pointCount=last?.points?.length??0;
  const work={nodes:0};
  for(const input of history??[]){
    pointCount+=input?.points?.length??0;
    if(pointCount>16000)throw Error('累積検査の記録は合計16000制御点までです。');
    used=addReductionErrorBounds(used,splineReferenceDeviation(method,last,input,work));
    if(used===null||used>budget.tolerance)throw Error('保存された編集の累積偏差上限が許容差を超えます。');
    last=input;
  }
  return input=>{
    const errorBound=splineReferenceDeviation(method,budget.reference,input);
    if(errorBound>budget.tolerance)throw Error('基準曲線からの推定偏差上限 '+errorBound+' が許容差 '+budget.tolerance+' を超えます。');
    if(!history)return {errorBound,remaining:budget.tolerance-errorBound};
    const stepWork={nodes:0};
    const step=last===budget.reference?errorBound:splineReferenceDeviation(method,last,input,stepWork);
    if(step>0&&work.nodes+stepWork.nodes>32768)throw Error('累積記録の全区間検査が処理上限に達しました。');
    const cumulative=addReductionErrorBounds(used,step);
    if(cumulative===null||cumulative>budget.tolerance)throw Error('適用ごとの累積偏差上限 '+cumulative+' が許容差 '+budget.tolerance+' を超えます。');
    if(step>0&&(history.length>=128||pointCount+input.points.length>16000))throw Error('累積検査の記録上限に達しました。新しい基準を設定してください。');
    return {errorBound,step,cumulative,remaining:budget.tolerance-Math.max(errorBound,cumulative)};
  };
}

export function checkSplineReferenceBudget(method,budget,input){
  return prepareSplineReferenceBudget(method,budget)(input);
}
