import {bSplineCurve,nurbsCurve,homogeneousSplineBezierSpans,homogeneousSplineBezierSpan} from './splineCurves.js';
import {raiseHomogeneousBezier} from './splineDegreeElevation.js';
import {boundedSplineDeviation} from './splineDeviation.js';
import {addSparseQrRow,solveSparseQr} from './sparseQr.js';
import {periodicReductionDomain} from './periodicReductionDomain.js';

const finite=h=>h&&[h.x,h.y,h.w].every(Number.isFinite);
function project(c,h){
  if(!finite(h)||(h.w===0&&(h.x!==0||h.y!==0)))return null;
  const point=h.w===0?{...c.origin}:{x:c.origin.x+h.x/h.w,y:c.origin.y+h.y/h.w},weight=c.sign*h.w*c.scale;
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(weight)||(h.w!==0&&weight===0))return null;
  return {point,weight};
}

export function prepareSplineDegreeReduction(input,{representation='bezier'}={}){
  if(!input||!['bezier','continuity','either'].includes(representation))return null;
  const rational=input.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,model=create(input),tolerance=input.tolerance??1e-7;
  if(!model||model.degree<2||!Number.isFinite(tolerance)||tolerance<0||tolerance>1e6||
    !Array.from(model.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))||!Array.from(model.knots).every(Number.isFinite)||
    (rational&&!Array.from(model.weights).every(Number.isFinite)))return null;
  const p=model.degree,q=p-1,origin=model.points[0],scale=rational?Math.max(...model.weights.map(Math.abs)):1,
    sign=rational?Math.sign(model.weights.find(w=>w!==0)):1;
  if(rational&&model.weights.some(w=>w!==0&&w/scale===0))return null;
  const toHomogeneous=shape=>shape.points.map((point,i)=>{const w=rational?sign*(shape.weights[i]/scale):1;return {x:(point.x-origin.x)*w,y:(point.y-origin.y)*w,w};});
  const controls=toHomogeneous(model);if(!controls.every(finite))return null;
  const spans=homogeneousSplineBezierSpans({controls,degree:p,knots:model.knots});if(!spans.length||spans.some(s=>!s.controls.every(finite)))return null;
  const fixed=new Map(),knots=[];let count=0;
  for(let i=0;i<spans.length;i++){
    const span=spans[i];span.left=i>0&&!span.breakBefore?spans[i-1].right:span.controls[0];
    span.right=model.periodic&&i===spans.length-1?spans[0].left:span.controls.at(-1);
    if(model.periodic){fixed.set(count,span.left);count+=q;knots.push(...Array(q).fill(span.from));}
    else {if(!i){fixed.set(0,span.left);count=q+1;knots.push(...Array(q+1).fill(span.from));}
      else{const broken=span.breakBefore;fixed.set(broken?count:count-1,span.left);count+=broken?q+1:q;knots.push(...Array(broken?q+1:q).fill(span.from));}
      fixed.set(count-1,span.right);}
  }
  knots.push(...Array(model.periodic?1:q+1).fill(spans.at(-1).to));
  const orderedFixed=model.periodic?new Map([...fixed].map(([i,h])=>[(i+q-1)%count,h])):fixed;
  const layouts={bezier:{knots,count,fixed:orderedFixed}};
  const start=spans[0].from,end=spans.at(-1).to,multiplicities=new Map();
  const source=model.periodic?model.knots.slice(p,p+model.controlCount):model.knots;
  for(const value of source){const t=model.periodic&&value===end?start:value;multiplicities.set(t,(multiplicities.get(t)??0)+1);}
  const target=model.periodic?spans.flatMap(s=>Array(multiplicities.get(s.from)-1).fill(s.from)):
    [...Array(q+1).fill(start),...spans.slice(1).flatMap(s=>Array(multiplicities.get(s.from)-1).fill(s.from))];
  const moved=model.periodic&&target.length&&target[0]!==start;
  const domain=moved?periodicReductionDomain(model,spans,target[0],create):null;
  if(!moved||domain){
    target.push(...Array(model.periodic?1:q+1).fill(domain?.domainShift.to[1]??end));
    const size=target.length-(model.periodic?1:q+1),ends=new Map();
    if(!model.periodic){ends.set(0,spans[0].controls[0]);ends.set(size-1,spans.at(-1).controls.at(-1));
      for(let i=1;i<spans.length;i++)if(spans[i].breakBefore){const k=target.indexOf(spans[i].from);ends.set(k-1,spans[i-1].controls.at(-1));ends.set(k,spans[i].controls[0]);}}
    layouts.continuity={knots:target,count:size,fixed:ends,...(domain??{})};
  }
  const c={model,create,rational,tolerance,p,q,origin,scale,sign,toHomogeneous,spans,knots,count,fixed:orderedFixed,layouts};
  for(const id of Object.keys(layouts)){const l=layouts[id];
    if(l.count>1000||l.count<=q||[...l.fixed.values()].some(h=>!project(c,h)))delete layouts[id];}
  if(representation==='either'?!Object.keys(layouts).length:!layouts[representation])return null;
  return c;
}

function inspect(c,result,preferred){
  const {model,create,rational,p,q,tolerance,scale,layouts}=c,periodic=!!model.periodic,actual=periodic?result?.periodicKnots:result?.knots;
  if(!result||result.degree!==q||!!result.periodic!==periodic||!Array.isArray(result.points)||
    !Array.from(result.points).every(point=>point&&Number.isFinite(point.x)&&Number.isFinite(point.y))||rational!==(result.weights!==undefined))return null;
  if(rational&&(!Array.isArray(result.weights)||result.weights.length!==result.points.length||!Array.from(result.weights).every(w=>Number.isFinite(w)&&(w===0||w/scale!==0))))return null;
  // Infer the representation from the actual knots AND endpoint constraints.
  // Coincident C0 knot vectors can have different fixed-endpoint policies.
  const representation=(preferred?[preferred]:['bezier','continuity']).find(id=>{
    const layout=layouts[id];return layout&&result.points.length===layout.count&&Array.isArray(actual)&&actual.length===layout.knots.length&&layout.knots.every((k,i)=>k===actual[i])&&
      [...layout.fixed].every(([i,h])=>{const expected=project(c,h),point=result.points[i];return expected&&point.x===expected.point.x&&point.y===expected.point.y&&(!rational||result.weights[i]===expected.weight);});
  });
  if(!representation)return null;const {count,knots,domainShift}=layouts[representation],spans=layouts[representation].spans??c.spans;
  const candidate=create(result);if(!candidate)return null;
  const homogeneous=c.toHomogeneous(candidate);if(!homogeneous.every(finite))return null;

  let errorBound=0,denominatorSpans=0,denominatorNodes=0;
  const commonKnots=[...Array(p+1).fill(0),...Array(p+1).fill(1)];
  let index=q;
  for(let i=0;i<spans.length;i++){
    const a=spans[i];while(candidate.knots[index+1]<=a.from)index++;
    const b=homogeneousSplineBezierSpan({controls:homogeneous,degree:q,knots:candidate.knots,index,from:a.from,to:a.to});if(!b)return null;
    const elevated=raiseHomogeneousBezier(b);if(!elevated.every(finite))return null;
    const radius=rational&&elevated.every(h=>h.w>0)?Math.max(...elevated.map(h=>Math.hypot(h.x/h.w,h.y/h.w))):0;
    const checked=boundedSplineDeviation(a.controls,elevated,radius,rational,p,commonKnots,{maxNodes:32768-denominatorNodes});
    if(!checked||checked.errorBound>tolerance)return null;errorBound=Math.max(errorBound,checked.errorBound);
    if(checked.denominator){denominatorSpans++;denominatorNodes+=checked.denominator.nodes;}
  }
  return {points:result.points.map(point=>({x:point.x,y:point.y})),degree:q,periodic,[periodic?'periodicKnots':'knots']:[...knots],
    ...(rational?{weights:[...result.weights]}:{}),reduction:{fromDegree:p,toDegree:q,tolerance,errorBound,spans:spans.length,
      ...(domainShift?{periodic:{algorithm:'単純継ぎ目の除去・残存ノットへの始端移動・元の全区間係数の周期再配置',source:'src/model/periodicReductionDomain.js',domainShift}}:{}),
      representation:{id:representation,label:representation==='continuity'?'元の連続性を保つノット列':'端点固定の区間ベジェ接続',controlCount:count,originalControlCount:model.controlCount??model.points.length,endpointPolicy:representation==='bezier'?'全区間端点固定':periodic?'周期の閉接続・継ぎ目は許容差内で移動':'両端と不連続点の片側端点を固定'},
      verification:{algorithm:(domainShift?'元の全区間を周期再配置・':'')+'再次数上げ・共通Bernstein基底の全区間偏差検証'+(denominatorSpans?'・Bernstein分母範囲検査':''),
        source:'src/model/splineDegreeReduction.js',denominatorSpans,denominatorNodes}}};
}

export function validateSplineDegreeReduction(input,result){const c=prepareSplineDegreeReduction(input,{representation:'either'});return c?inspect(c,result):null;}

export function reduceSplineDegree(input){
  const c=prepareSplineDegreeReduction(input);if(!c)return null;
  const {p,q,model,rational}=c;let layout=[];
  for(let s=0;s<c.spans.length;s++){
    const span=c.spans[s],rows=Array(q-1);
    for(let i=1;i<p;i++){
      const a=i/p,b=1-a,h=span.controls[i],rhs=[h.x,h.y,h.w],coefficients=new Map();
      if(i===1){for(let axis=0;axis<3;axis++)rhs[axis]-=a*span.left[['x','y','w'][axis]];}else coefficients.set(i-2,a);
      if(i===q){for(let axis=0;axis<3;axis++)rhs[axis]-=b*span.right[['x','y','w'][axis]];}else coefficients.set(i-1,b);
      if(!rhs.every(Number.isFinite)||!addSparseQrRow(rows,coefficients,rhs))return null;
    }
    const solved=solveSparseQr(rows);if(!solved)return null;
    const reduced=[span.left,...solved.map(h=>({x:h[0],y:h[1],w:rational?h[2]:1})),span.right];
    layout.push(...(model.periodic?reduced.slice(0,-1):s&&!span.breakBefore?reduced.slice(1):reduced));
  }
  if(model.periodic&&q>1)layout=[...layout.slice(-(q-1)),...layout.slice(0,-(q-1))];
  return projectSplineDegreeReduction(c,layout,'bezier');
}

export function projectSplineDegreeReduction(c,layout,representation){
  const projected=layout.map(h=>project(c,h));if(projected.some(h=>!h))return null;
  return inspect(c,{points:projected.map(h=>h.point),degree:c.q,periodic:!!c.model.periodic,
    [c.model.periodic?'periodicKnots':'knots']:c.layouts[representation].knots,
    ...(c.rational?{weights:projected.map(h=>h.weight)}:{})},representation);
}
