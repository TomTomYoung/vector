// Extend a periodic curve over three periods, refine the periodic copies, then
// extract the central period. The underlying single-knot operation is replaceable.
// Derivation, numerical limits and references: doc/periodic-knot-insertion.md.
export function refinePeriodicSpline(model,t,create,insertChecked) {
  const {degree:p,controlCount:n}=model,u=model.knots.slice(p,p+n+1),a=u[0],b=u[n],period=b-a;
  if(!Number.isFinite(t)||t<a||t>b)throw Error('周期ノットの挿入値は有効範囲内の有限数で指定してください。');
  if(t===b)t=a;
  if(u.slice(0,-1).filter(k=>k===t||(t===a&&k===b)).length>=p)
    throw Error('挿入後の周期ノット重複度は次数以下にしてください。');
  const nextKnots=[...u];nextKnots.splice(nextKnots.findLastIndex(k=>k<=t)+1,0,t);
  const originalPoints=model.points.slice(0,n),originalWeights=model.weights?.slice(0,n);
  // Normalize repeated end knots to the same seam anchor before translation.
  const knotAt=q=>{
    const r=((q%n)+n)%n;let cycle=Math.floor(q/n),value=u[r];
    if(value===b){value=a;cycle++;}
    if(value===a)return cycle===0?a:cycle===1?b:cycle<0?a+cycle*period:b+(cycle-1)*period;
    return cycle===0?value:value+cycle*period;
  };
  let expanded={degree:p,points:Array.from({length:3*n+p},(_,i)=>({...originalPoints[i%n]})),
    knots:Array.from({length:3*n+2*p+1},(_,i)=>knotAt(i-n-p)),
    ...(originalWeights?{weights:Array.from({length:3*n+p},(_,i)=>originalWeights[i%n])}:{})};
  const numericError=()=>Error('周期展開後のノット間隔または継ぎ目を有限精度で保持できません。');
  if(!expanded.knots.every((k,i)=>{
    if(!Number.isFinite(k))return false;if(!i)return true;
    const j=((i-n-p-1)%n+n)%n;
    return u[j]===u[j+1]?k===expanded.knots[i-1]:k>expanded.knots[i-1];
  })||!Number.isFinite(expanded.knots.at(-1)-expanded.knots[0]))throw numericError();
  const copies=t===a?[a,b]:[t-period,t,t+period];
  // Each translated insertion must retain its position in the original interval.
  const span=u.findLastIndex(k=>k<=t);
  if(t!==a&&copies.some((k,i)=>{
    const shift=i-1,lo=knotAt(span+shift*n),hi=knotAt(span+1+shift*n);
    return !Number.isFinite(k)||(t===u[span]?k!==lo:!(k>lo))||!(k<hi);
  }))throw numericError();
  for(const value of copies)expanded=insertChecked(expanded,value);
  // Build the exact knot extension expected by the persisted periodic model.
  const probe=create({degree:p,periodic:true,periodicKnots:nextKnots,
    points:[...originalPoints,originalPoints[0]],...(originalWeights?{weights:[...originalWeights,originalWeights[0]]}:{})});
  if(!probe)throw numericError();
  const offset=expanded.knots.indexOf(a)-probe.knots.indexOf(a),count=n+1;
  if(offset<0||probe.knots.some((k,i)=>k!==expanded.knots[offset+i]))throw numericError();
  const points=expanded.points.slice(offset,offset+count),weights=expanded.weights?.slice(offset,offset+count);
  const close=(x,y)=>Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=1e-11*Math.max(1,Math.abs(x),Math.abs(y));
  for(let i=0;i<p;i++){
    const first=points[i],last=expanded.points[offset+count+i];
    if(!first||!last||!close(first.x,last.x)||!close(first.y,last.y)||
      (weights&&!close(weights[i],expanded.weights[offset+count+i])))throw numericError();
  }
  const result={points,degree:p,periodic:true,periodicKnots:nextKnots,...(weights?{weights}:{})};
  if(!create(result))throw numericError();
  return result;
}
