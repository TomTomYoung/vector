import {nonperiodicSplineEvaluation} from './splineCurves.js';
import {boundedSplineDeviation} from './splineDeviation.js';

// Reverse the local Boehm equations from both sides, then reinsert on the
// original basis to estimate a deviation bound. See doc/spline-knot-removal.md.
export function prepareSplineKnotRemoval(input) {
  if(!input||input.periodic||input.periodicKnots!==undefined)return null;
  const rational=input.weights!==undefined,create=nonperiodicSplineEvaluation,model=create(input);
  if(!model)return null;
  if(!Array.from(model.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))||
    !Array.from(model.knots).every(Number.isFinite)||(rational&&!Array.from(model.weights).every(Number.isFinite)))return null;
  const {degree:p,points,knots}=model,{t,tolerance=1e-7}=input,n=points.length;
  if(n-1<=p||!Number.isFinite(t)||t<=knots[p]||t>=knots[n]||
    !Number.isFinite(tolerance)||tolerance<0||tolerance>1e6)return null;
  const index=knots.lastIndexOf(t);if(index<0)return null;
  const reduced=[...knots];reduced.splice(index,1);
  const k=reduced.findLastIndex(u=>u<=t),s=reduced.filter(u=>u===t).length;
  const origin=points[0],sign=rational?Math.sign(model.weights.find(w=>w!==0)):1;
  const scale=rational?Math.max(...model.weights.map(Math.abs)):1;
  const weights=rational?model.weights.map(w=>sign*(w/scale)):points.map(()=>1);
  if(!weights.every((w,i)=>Number.isFinite(w)&&(!rational||model.weights[i]===0||w!==0)))return null;
  const homogeneous=points.map((point,i)=>({x:(point.x-origin.x)*weights[i],y:(point.y-origin.y)*weights[i],w:weights[i]}));
  if(!homogeneous.every(finite))return null;
  if(rational&&!weights.every(w=>w>0)&&!boundedSplineDeviation(homogeneous,homogeneous,0,true,p,knots))return null;
  return {model,create,rational,t,tolerance,reduced,k,left:k-p,right:k-s,origin,sign,scale,homogeneous};
}
const finite=h=>h&&Number.isFinite(h.x)&&Number.isFinite(h.y)&&Number.isFinite(h.w);
const alpha=(c,i)=>(c.t-c.reduced[i])/(c.reduced[i+c.model.degree]-c.reduced[i]);

function inspect(c,result) {
  const {model,create,rational,reduced,left,right,origin,sign,scale,t,tolerance}=c;
  if(!result||result.periodic||result.periodicKnots!==undefined||result.degree!==model.degree||
    !Array.isArray(result.points)||result.points.length!==model.points.length-1||
    !Array.from(result.points).every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y))||
    !Array.isArray(result.knots)||result.knots.length!==reduced.length||reduced.some((u,i)=>u!==result.knots[i])||
    rational!==(result.weights!==undefined))return null;
  if(rational&&(!Array.isArray(result.weights)||result.weights.length!==result.points.length||
    !Array.from(result.weights).every(w=>Number.isFinite(w)&&(w===0||w/scale!==0))))return null;
  const candidate=create(result);if(!candidate)return null;
  const controls=candidate.points.map((p,i)=>{
    const w=rational?sign*(candidate.weights[i]/scale):1;
    return {x:(p.x-origin.x)*w,y:(p.y-origin.y)*w,w};
  });
  if(!controls.every(finite))return null;
  const reconstructed=[];
  for(let i=0;i<model.points.length;i++){
    let rebuilt;
    if(i<=left)rebuilt=controls[i];
    else if(i>right)rebuilt=controls[i-1];
    else {
      const a=alpha(c,i);if(!Number.isFinite(a)||a<0||a>1)return null;
      const before=controls[i-1],after=controls[i];
      rebuilt={x:(1-a)*before.x+a*after.x,y:(1-a)*before.y+a*after.y,w:(1-a)*before.w+a*after.w};
    }
    if(!finite(rebuilt))return null;
    reconstructed.push(rebuilt);
  }
  // Positive reinserted weights admit a control-hull bound. Otherwise bound
  // both denominator functions over every Bernstein subinterval.
  const radius=rational&&reconstructed.every(h=>h.w>0)?Math.max(...reconstructed.map(h=>Math.hypot(h.x/h.w,h.y/h.w))):0;
  const deviation=boundedSplineDeviation(c.homogeneous,reconstructed,radius,rational,model.degree,model.knots);
  if(!deviation||deviation.errorBound>tolerance)return null;
  return {points:candidate.points.map(p=>({x:p.x,y:p.y})),degree:model.degree,knots:[...reduced],
    ...(rational?{weights:[...candidate.weights]}:{}),removal:{t,tolerance,...deviation}};
}

// Also checks replacement implementations; never trust their reported deviation.
export function validateSplineKnotRemoval(input,result) {
  const context=prepareSplineKnotRemoval(input);
  return context?inspect(context,result):null;
}

export function removeSplineKnot(input) {
  const c=prepareSplineKnotRemoval(input);if(!c)return null;
  const {model,left,right,homogeneous:h,rational,origin,sign,scale}=c,n=model.points.length-1;
  const controls=Array(n);
  for(let i=0;i<=left;i++)controls[i]={...h[i],point:model.points[i]};
  for(let i=Math.max(left+1,right);i<n;i++)controls[i]={...h[i+1],point:model.points[i+1]};
  let l=left,r=right;
  while(r-l>1){
    const a=alpha(c,l+1),b=alpha(c,r);
    if(!Number.isFinite(a)||!Number.isFinite(b)||a<0||a>1||b<0||b>1)return null;
    let value;
    if(a>=1-b){
      if(a===0)return null;
      value=Object.fromEntries(['x','y','w'].map(key=>[key,(h[l+1][key]-(1-a)*controls[l][key])/a]));
      controls[++l]=value;
    }else{
      if(b===1)return null;
      value=Object.fromEntries(['x','y','w'].map(key=>[key,(h[r][key]-b*controls[r][key])/(1-b)]));
      controls[--r]=value;
    }
    if(!rational)value.w=1;
    if(!finite(value))return null;
  }
  if(!controls.every(h=>finite(h)&&(h.w!==0||(h.x===0&&h.y===0))))return null;
  const points=controls.map(h=>h.w===0?{...(h.point??origin)}:{x:origin.x+h.x/h.w,y:origin.y+h.y/h.w});
  const weights=rational?controls.map(h=>sign*h.w*scale):undefined;
  if(weights?.some((w,i)=>controls[i].w!==0&&w===0))return null;
  return inspect(c,{degree:model.degree,knots:c.reduced,points,...(rational?{weights}:{})});
}
