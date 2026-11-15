import {circleModel} from './circleSource.js';
// Reuse the tested, model-independent affine frame and grid/orthogonal point movement.
import {splineControlFrame,moveSplineControl} from './splineControlGeometry.js';
export const circleControlFrame = splineControlFrame;

export function circleControlPoints(model,direction={x:1,y:0}) {
  circleModel(model);
  if (model.radius <= 0) throw Error('半径は0より大きくしてください。');
  const length=Math.hypot(direction?.x,direction?.y);
  if (!Number.isFinite(length) || !length) throw Error('半径ハンドルの方向が不正です。');
  const unit={x:direction.x/length,y:direction.y/length},center={...model.center};
  const radius={x:center.x+model.radius*unit.x,y:center.y+model.radius*unit.y};
  if (!Number.isFinite(radius.x) || !Number.isFinite(radius.y) || (radius.x===center.x && radius.y===center.y))
    throw Error('座標の精度で半径ハンドルの位置を表せません。数値欄で編集してください。');
  return {center,radius};
}

export function moveCircleControl(frame,model,kind,pointer,offset,options={}) {
  circleModel(model);
  if (!['center','radius'].includes(kind)) throw Error('不明な円ハンドルです。');
  const point=moveSplineControl(frame,pointer,offset,options);
  if (kind==='center') return {model:circleModel({...model,center:point})};
  const dx=point.x-model.center.x,dy=point.y-model.center.y,radius=Math.hypot(dx,dy);
  if (!Number.isFinite(radius) || radius<=0) throw Error('半径は0より大きい有限値にしてください。');
  return {model:circleModel({...model,radius}),direction:{x:dx/radius,y:dy/radius}};
}
