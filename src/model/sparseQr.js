// Streaming sparse QR by Givens rotations. Rows have local B-spline support;
// periodic seam columns are ordered last to preserve a narrow band plus border.
export function addSparseQrRow(rows,coefficients,rhs) {
  while(coefficients.size){
    const i=Math.min(...coefficients.keys()),b=coefficients.get(i),previous=rows[i];
    if(!previous){rows[i]={coefficients,rhs};return true;}
    const a=previous.coefficients.get(i),r=Math.hypot(a,b),c=a/r,s=b/r;
    if(!Number.isFinite(r)||r===0)return false;
    const keys=new Set([...previous.coefficients.keys(),...coefficients.keys()]);
    previous.coefficients.set(i,r);coefficients.delete(i);
    for(const j of keys){if(j===i)continue;const x=previous.coefficients.get(j)??0,y=coefficients.get(j)??0;
      const upper=c*x+s*y,lower=c*y-s*x;if(!Number.isFinite(upper)||!Number.isFinite(lower))return false;
      if(upper===0)previous.coefficients.delete(j);else previous.coefficients.set(j,upper);
      if(lower===0)coefficients.delete(j);else coefficients.set(j,lower);
    }
    for(let axis=0;axis<3;axis++){const x=previous.rhs[axis],y=rhs[axis];previous.rhs[axis]=c*x+s*y;rhs[axis]=c*y-s*x;
      if(!Number.isFinite(previous.rhs[axis])||!Number.isFinite(rhs[axis]))return false;}
  }
  return true;
}

export function solveSparseQr(rows) {
  const count=rows.length,solved=Array(count);
  for(let i=count-1;i>=0;i--){
    const row=rows[i];if(!row)return null;const diagonal=row.coefficients.get(i),h=[...row.rhs];
    if(!Number.isFinite(diagonal)||diagonal===0)return null;
    for(const [j,value] of row.coefficients){if(j===i)continue;if(j<i||!solved[j])return null;for(let axis=0;axis<3;axis++)h[axis]-=value*solved[j][axis];}
    solved[i]=h.map(v=>v/diagonal);if(!solved[i].every(Number.isFinite))return null;
  }
  return solved;
}
