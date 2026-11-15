import {applyToPoint,composeAffine,invertAffine} from '../model/affine.js';
import {snapToOrtho} from '../utils/geometry.js';
const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const finiteMatrix = m => m && ['a','b','c','d','e','f'].every(k=>Number.isFinite(m[k]));
function inverse(matrix) {
  if (!finiteMatrix(matrix)) throw Error('制御点の座標変換を取得できません。');
  const result=invertAffine({matrix});
  if (!finiteMatrix(result)) throw Error('つぶれた変換では制御点をドラッグできません。');
  return result;
}
const apply = (matrix,point) => {
  if (!finitePoint(point)) throw Error('制御点の座標が不正です。');
  const result=applyToPoint({matrix,point});
  if (!finitePoint(result)) throw Error('制御点の座標が有限範囲を超えました。');
  return result;
};
export const splineMatrixText = m => 'matrix('+['a','b','c','d','e','f'].map(k=>m[k]).join(' ')+')';

export function splineControlFrame(canvasScreen,elementScreen) {
  const screenCanvas=inverse(canvasScreen),screenLocal=inverse(elementScreen);
  const localCanvas=composeAffine({first:elementScreen,then:screenCanvas}),canvasLocal=inverse(localCanvas);
  return {
    localCanvas,
    toCanvas: p=>apply(localCanvas,p),
    toLocal: p=>apply(canvasLocal,p),
    fromScreen: p=>apply(screenLocal,p),
    // Keep handles circular and constant in screen pixels under zoom and nonuniform transforms.
    handleMatrix: p=>({...screenCanvas,e:p.x,f:p.y}),
  };
}

export function moveSplineControl(frame,pointer,offset,{snap=p=>p,anchor,ortho=false}={}) {
  const local=frame.fromScreen(pointer);
  if (!finitePoint(offset)) throw Error('制御点の移動量が不正です。');
  let canvas=frame.toCanvas({x:local.x+offset.x,y:local.y+offset.y});
  canvas=snap(canvas);
  if (!finitePoint(canvas)) throw Error('スナップ結果が不正です。');
  if (ortho) {
    if (!finitePoint(anchor)) throw Error('直交基準が不正です。');
    canvas=snapToOrtho(anchor,canvas);
  }
  return frame.toLocal(canvas);
}
