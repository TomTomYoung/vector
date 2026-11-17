import {homogeneousSplineBezierSpan} from './splineCurves.js';

export const REDUCTION_MAX_DEPTH=12;
export const REDUCTION_MAX_NODES=2048;

// Canonical C0 connections; full source breaks retain separate endpoints.
export function bezierReductionLayout(spans,q,periodic){
  const fixed=new Map(),knots=[];let count=0;
  for(let i=0;i<spans.length;i++){
    const span=spans[i];span.left=i>0&&!span.breakBefore?spans[i-1].right:span.controls[0];
    span.right=periodic&&i===spans.length-1?spans[0].left:(span.right??span.controls.at(-1));
    if(periodic){fixed.set(count,span.left);count+=q;knots.push(...Array(q).fill(span.from));}
    else{if(!i){fixed.set(0,span.left);count=q+1;knots.push(...Array(q+1).fill(span.from));}
      else{const broken=span.breakBefore;fixed.set(broken?count:count-1,span.left);count+=broken?q+1:q;knots.push(...Array(broken?q+1:q).fill(span.from));}
      fixed.set(count-1,span.right);}
  }
  knots.push(...Array(periodic?1:q+1).fill(spans.at(-1).to));
  return {knots,count,fixed:periodic?new Map([...fixed].map(([i,h])=>[(i+q-1)%count,h])):fixed};
}

export function splitReductionInterval(c,span){
  const mid=span.from/2+span.to/2;
  if(span.depth>=REDUCTION_MAX_DEPTH||!(mid>span.from&&mid<span.to))return null;
  // Re-extract from the original spline at the represented parameter values.
  // This avoids treating a rounded midpoint as an exact half of the interval.
  const extract=(from,to)=>homogeneousSplineBezierSpan({controls:c.controls,knots:c.model.knots,degree:c.p,index:span.sourceIndex,from,to});
  const a=extract(span.from,mid),b=extract(mid,span.to);
  if(!a||!b||![...a,...b].every(h=>[h.x,h.y,h.w].every(Number.isFinite)))return null;
  return [{...span,to:mid,controls:a,right:a.at(-1),depth:span.depth+1},
    {...span,from:mid,controls:b,left:a.at(-1),breakBefore:false,depth:span.depth+1}];
}

export function adaptiveLayout(c,spans){
  const layout=bezierReductionLayout(spans,c.q,!!c.model.periodic);
  if(layout.count>1000||layout.count<=c.q)return null;
  return {...layout,spans,subdivision:{algorithm:'極形式de Boor再抽出・許容差による適応二分割',source:'src/model/reductionPartitions.js',
    originalSpans:c.spans.length,resultSpans:spans.length,splits:spans.length-c.spans.length,depth:Math.max(...spans.map(s=>s.depth)),
    maxDepth:REDUCTION_MAX_DEPTH,maxNodes:REDUCTION_MAX_NODES}};
}

// Infer cuts from actual output knots, never from claimed subdivision metadata.
export function inferAdaptiveReductionLayout(c,knots){
  if(!c.layouts.bezier||!Array.isArray(knots)||knots.length>1013||!Array.from(knots).every((k,i)=>Number.isFinite(k)&&(!i||k>=knots[i-1])))return null;
  const cuts=[...new Set(knots)];
  if(cuts[0]!==c.spans[0].from||cuts.at(-1)!==c.spans.at(-1).to||cuts.length<=c.spans.length+1)return null;
  const values=new Set(cuts);if(c.spans.some(s=>!values.has(s.from)||!values.has(s.to)))return null;
  const leaves=[];let nodes=0;
  function visit(span){
    if(++nodes>REDUCTION_MAX_NODES)return false;
    if(!cuts.some(t=>t>span.from&&t<span.to)){leaves.push({...span});return true;}
    const halves=splitReductionInterval(c,span);
    return !!halves&&values.has(halves[0].to)&&visit(halves[0])&&visit(halves[1]);
  }
  return c.spans.every(visit)?adaptiveLayout(c,leaves):null;
}
