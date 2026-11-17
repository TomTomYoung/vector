// Validated periodic model -> three periods and p supporting controls.
// Repeated seams are anchored exactly; translated positive intervals may not collapse.
export function expandPeriodicSpline(model) {
  const {degree:p,controlCount:n}=model,u=model.knots.slice(p,p+n+1),a=u[0],b=u[n],period=b-a;
  const originalPoints=model.points.slice(0,n),originalWeights=model.weights?.slice(0,n);
  const knotAt=q=>{
    const r=((q%n)+n)%n;let cycle=Math.floor(q/n),value=u[r];
    if(value===b){value=a;cycle++;}
    if(value===a)return cycle===0?a:cycle===1?b:cycle<0?a+cycle*period:b+(cycle-1)*period;
    return cycle===0?value:value+cycle*period;
  };
  const expanded={degree:p,points:Array.from({length:3*n+p},(_,i)=>({...originalPoints[i%n]})),
    knots:Array.from({length:3*n+2*p+1},(_,i)=>knotAt(i-n-p)),
    ...(originalWeights?{weights:Array.from({length:3*n+p},(_,i)=>originalWeights[i%n])}:{})};
  if(!expanded.knots.every((k,i)=>{
    if(!Number.isFinite(k))return false;if(!i)return true;
    const j=((i-n-p-1)%n+n)%n;
    return u[j]===u[j+1]?k===expanded.knots[i-1]:k>expanded.knots[i-1];
  })||!Number.isFinite(expanded.knots.at(-1)-expanded.knots[0]))
    throw Error('周期展開後のノット間隔を有限精度で保持できません。');
  return {u,a,b,period,originalPoints,originalWeights,knotAt,expanded};
}
