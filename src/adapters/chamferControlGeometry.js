import {chamferInput} from './chamferSource.js';
import {infiniteIntersection} from '../model/construction.js';
import {moveSplineControl,splineControlFrame} from './splineControlGeometry.js';
export const chamferControlFrame=splineControlFrame;
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

// Each setback is the signed projection from the original corner onto its own ray.
export function chamferDistanceControls(input,contacts) {
  const {first,second,distance1,distance2}=chamferInput(input),vertex=infiniteIntersection(...first,...second);
  if(!finite(vertex))throw Error('距離ハンドルの基準となる交点を計算できません。');
  const axes=[first,second].map(([a,b])=>{
    const forward=Math.hypot(a.x-vertex.x,a.y-vertex.y)<=Math.hypot(b.x-vertex.x,b.y-vertex.y);
    const dx=forward?b.x-a.x:a.x-b.x,dy=forward?b.y-a.y:a.y-b.y,length=Math.hypot(dx,dy);
    if(!Number.isFinite(length)||!length)throw Error('距離ハンドルの線分方向を計算できません。');
    return {x:dx/length,y:dy/length};
  });
  const distances=[distance1,distance2],handles=axes.map((axis,i)=>({x:vertex.x+axis.x*distances[i],y:vertex.y+axis.y*distances[i]}));
  handles.forEach((handle,i)=>{
    if(!finite(handle)||(distances[i]>0&&handle.x===vertex.x&&handle.y===vertex.y))throw Error('距離ハンドルの位置を有限な精度で表せません。数値欄で編集してください。');
    const tolerance=distances[i]*1e-8+64*Number.EPSILON*Math.max(1,Math.abs(vertex.x),Math.abs(vertex.y),Math.abs(handle.x),Math.abs(handle.y));
    if(contacts!==undefined&&(!Array.isArray(contacts)||contacts.length!==2||!finite(contacts[i])||Math.hypot(contacts[i].x-handle.x,contacts[i].y-handle.y)>tolerance))throw Error('選択した実装の接続点が距離ハンドルの構成と一致しません。数値欄で編集してください。');
  });
  return {vertex,axes,handles};
}
export function moveChamferDistance(frame,input,index,pointer,offset,options={}) {
  if(index!==0&&index!==1)throw Error('距離ハンドルの番号が不正です。');
  const control=chamferDistanceControls(input),point=moveSplineControl(frame,pointer,offset,options),axis=control.axes[index];
  let distance=(point.x-control.vertex.x)*axis.x+(point.y-control.vertex.y)*axis.y;
  const tolerance=64*Number.EPSILON*Math.max(1,Math.abs(point.x),Math.abs(point.y),Math.abs(control.vertex.x),Math.abs(control.vertex.y));
  // Affine roundoff can place a pointer at the vertex a few ulps behind its ray.
  if(distance<0&&distance>=-tolerance)distance=0;
  if(!Number.isFinite(distance)||distance<0)throw Error('距離は0以上の有限値にしてください。');
  chamferDistanceControls({...input,['distance'+(index+1)]:distance});
  return distance;
}
