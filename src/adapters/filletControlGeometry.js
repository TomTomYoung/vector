import {filletInput} from './filletSource.js';
import {infiniteIntersection} from '../model/construction.js';
import {moveSplineControl,splineControlFrame} from './splineControlGeometry.js';
export const filletControlFrame=splineControlFrame;
const finite=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

// The first contact moves along a fixed ray, by radius * cot(halfAngle).
// The circle center also moves, so measuring against the old center is incorrect.
export function filletRadiusControl(input,contact) {
  const {first,second,radius}=filletInput(input),vertex=infiniteIntersection(...first,...second);
  if(!finite(vertex))throw Error('半径ハンドルの基準となる交点を計算できません。');
  const axes=[first,second].map(([a,b])=>{
    const forward=Math.hypot(a.x-vertex.x,a.y-vertex.y)<=Math.hypot(b.x-vertex.x,b.y-vertex.y);
    const dx=forward?b.x-a.x:a.x-b.x,dy=forward?b.y-a.y:a.y-b.y,length=Math.hypot(dx,dy);
    if(!Number.isFinite(length)||!length)throw Error('半径ハンドルの線分方向を計算できません。');
    return {x:dx/length,y:dy/length};
  });
  const [axis,other]=axes,angle=Math.atan2(Math.abs(axis.x*other.y-axis.y*other.x),axis.x*other.x+axis.y*other.y);
  const factor=1/Math.tan(angle/2),travel=radius*factor,handle={x:vertex.x+axis.x*travel,y:vertex.y+axis.y*travel};
  if(!Number.isFinite(factor)||factor<=0||!finite(handle)||(handle.x===vertex.x&&handle.y===vertex.y))throw Error('半径ハンドルの位置を有限な精度で表せません。数値欄で編集してください。');
  const tolerance=Math.abs(travel)*1e-8+64*Number.EPSILON*Math.max(1,Math.abs(vertex.x),Math.abs(vertex.y),Math.abs(handle.x),Math.abs(handle.y));
  if(contact!==undefined && (!finite(contact)||Math.hypot(contact.x-handle.x,contact.y-handle.y)>tolerance))throw Error('選択した実装の接点が半径ハンドルの構成と一致しません。数値欄で編集してください。');
  return {vertex,axis,factor,handle};
}
export function moveFilletRadius(frame,input,pointer,offset,options={}) {
  const control=filletRadiusControl(input),point=moveSplineControl(frame,pointer,offset,options);
  const travel=(point.x-control.vertex.x)*control.axis.x+(point.y-control.vertex.y)*control.axis.y,radius=travel/control.factor;
  if(!Number.isFinite(radius)||radius<=0)throw Error('半径は0より大きい有限値にしてください。');
  filletRadiusControl({...input,radius});
  return radius;
}
