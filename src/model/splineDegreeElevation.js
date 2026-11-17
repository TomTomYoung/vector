import {bSplineCurve,nurbsCurve,homogeneousSplineBezierSpans} from './splineCurves.js';
import {boundedSplineDeviation} from './splineDeviation.js';

const finite=h=>h&&[h.x,h.y,h.w].every(Number.isFinite);
const raise=controls=>{
  const q=controls.length;
  return [controls[0],...controls.slice(1).map((h,i)=>{
    const a=(i+1)/q,b=controls[i];return {x:a*b.x+(1-a)*h.x,y:a*b.y+(1-a)*h.y,w:a*b.w+(1-a)*h.w};
  }),controls.at(-1)];
};

// Canonical piecewise-Bezier result. Continuous joins share endpoints; true
// full-multiplicity breaks stay separate. Periodic controls wrap in model order.
export function prepareSplineDegreeElevation(input) {
  if(!input)return null;
  const rational=input.weights!==undefined,create=rational?nurbsCurve:bSplineCurve,model=create(input);
  const tolerance=input.tolerance??1e-7;
  if(!model||model.degree>=12||!Number.isFinite(tolerance)||tolerance<0||tolerance>1e6||
    !Array.from(model.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))||
    !Array.from(model.knots).every(Number.isFinite)||(rational&&!Array.from(model.weights).every(Number.isFinite)))return null;
  const origin=model.points[0],sign=rational?Math.sign(model.weights.find(w=>w!==0)):1;
  const scale=rational?Math.max(...model.weights.map(Math.abs)):1;
  const toHomogeneous=shape=>shape.points.map((p,i)=>{
    const w=rational?sign*(shape.weights[i]/scale):1;
    return {x:(p.x-origin.x)*w,y:(p.y-origin.y)*w,w};
  });
  if(rational&&model.weights.some(w=>w!==0&&w/scale===0))return null;
  const controls=toHomogeneous(model);if(!controls.every(finite))return null;
  const q=model.degree+1,spans=homogeneousSplineBezierSpans({controls,degree:model.degree,knots:model.knots}).map(s=>({...s,controls:raise(s.controls)}));
  if(!spans.length||spans.some(s=>!s.controls.every(finite)))return null;
  let layout=[],knots=[];
  if(model.periodic) {
    for(const span of spans){layout.push(...span.controls.slice(0,-1));knots.push(...Array(q).fill(span.from));}
    knots.push(spans.at(-1).to);
    layout=[...layout.slice(-(q-1)),...layout.slice(0,-(q-1))];
  }else {
    layout.push(...spans[0].controls);knots.push(...Array(q+1).fill(spans[0].from));
    for(const span of spans.slice(1)){layout.push(...(span.breakBefore?span.controls:span.controls.slice(1)));knots.push(...Array(span.breakBefore?q+1:q).fill(span.from));}
    knots.push(...Array(q+1).fill(spans.at(-1).to));
  }
  if(layout.length>1000)return null;
  return {model,create,rational,tolerance,origin,sign,scale,toHomogeneous,q,spans,layout,knots};
}

function inspect(c,result) {
  const {model,create,rational,tolerance,q,knots,layout,toHomogeneous,spans,scale}=c,periodic=!!model.periodic;
  if(!result||result.degree!==q||!!result.periodic!==periodic||!Array.isArray(result.points)||result.points.length!==layout.length||
    !Array.from(result.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))||rational!==(result.weights!==undefined))return null;
  const actual=periodic?result.periodicKnots:result.knots;
  if(!Array.isArray(actual)||actual.length!==knots.length||knots.some((k,i)=>k!==actual[i]))return null;
  if(rational&&(!Array.isArray(result.weights)||result.weights.length!==layout.length||
    !Array.from(result.weights).every(w=>Number.isFinite(w)&&(w===0||w/scale!==0))))return null;
  const candidate=create(result);if(!candidate)return null;
  const controls=toHomogeneous(candidate);if(!controls.every(finite))return null;
  const rebuilt=homogeneousSplineBezierSpans({controls,degree:q,knots:candidate.knots});
  if(rebuilt.length!==spans.length)return null;
  let errorBound=0,denominatorSpans=0,denominatorNodes=0;
  const commonKnots=[...Array(q+1).fill(0),...Array(q+1).fill(1)];
  for(let i=0;i<spans.length;i++) {
    const a=spans[i],b=rebuilt[i];if(a.from!==b.from||a.to!==b.to||(i>0&&a.breakBefore!==b.breakBefore))return null;
    if(!b.controls.every(finite))return null;
    const radius=rational&&b.controls.every(h=>h.w>0)?Math.max(...b.controls.map(h=>Math.hypot(h.x/h.w,h.y/h.w))):0;
    const checked=boundedSplineDeviation(a.controls,b.controls,radius,rational,q,commonKnots,{maxNodes:32768-denominatorNodes});
    if(!checked||checked.errorBound>tolerance)return null;
    errorBound=Math.max(errorBound,checked.errorBound);
    if(checked.denominator){denominatorSpans++;denominatorNodes+=checked.denominator.nodes;}
  }
  return {degree:q,periodic,points:result.points.map(p=>({x:p.x,y:p.y})),[periodic?'periodicKnots':'knots']:[...knots],
    ...(rational?{weights:[...result.weights]}:{}),elevation:{fromDegree:model.degree,toDegree:q,tolerance,errorBound,spans:spans.length,
      verification:{algorithm:'同次Bernstein次数上げ後の区間偏差検証'+(denominatorSpans?'・Bernstein分母範囲検査':''),
        source:'src/model/splineDegreeElevation.js',denominatorSpans,denominatorNodes}}};
}

export function validateSplineDegreeElevation(input,result) {
  const c=prepareSplineDegreeElevation(input);return c?inspect(c,result):null;
}

export function elevateSplineDegree(input) {
  const c=prepareSplineDegreeElevation(input);if(!c)return null;
  const {layout,rational,origin,sign,scale,q,knots,model}=c;
  if(layout.some(h=>h.w===0&&(h.x!==0||h.y!==0)))return null;
  const points=layout.map(h=>h.w===0?{...origin}:{x:origin.x+h.x/h.w,y:origin.y+h.y/h.w});
  const weights=rational?layout.map(h=>sign*h.w*scale):undefined;
  if(weights?.some((w,i)=>layout[i].w!==0&&w===0))return null;
  return inspect(c,{points,degree:q,periodic:!!model.periodic,[model.periodic?'periodicKnots':'knots']:knots,...(rational?{weights}:{})});
}
