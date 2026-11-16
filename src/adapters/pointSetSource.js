import {circleModel, circleGeometrySnapshot} from './circleSource.js';
import {meshTriangles,meshGeometrySnapshot,validateMeshSnapshot} from './meshSource.js';
export {meshReplacementChildren} from './meshSource.js';

export const pointSetMethods=['fitLine','fitCircle','minimumEnclosingCircle','convexHull','delaunayTriangles'];
const finitePoint=p=>p && Number.isFinite(p.x) && Number.isFinite(p.y);
const copy=p=>({x:p.x,y:p.y});
export function pointSetInput(method,input) {
  const points=input?.points,min=method==='minimumEnclosingCircle'?1:method==='fitLine'?2:3;
  if(!pointSetMethods.includes(method) || !Array.isArray(points) || points.length<min || points.length>1000 || !points.every(finitePoint))
    throw Error(`点群は有限な x, y の組を${min}〜1000点で指定してください。`);
  return {points:points.map(copy)};
}
export function pointSetExecutionInput(method,input) {
  const value=pointSetInput(method,input);
  // Index results refer to this exact order; reordering in a plugin would corrupt the mesh.
  if(method==='delaunayTriangles'){
    value.points.forEach(Object.freeze);Object.freeze(value.points);Object.freeze(value);
  }
  return value;
}
export function pointSetResult(method,result,input) {
  if(method==='delaunayTriangles')return meshTriangles(input,result);
  if(method==='convexHull') {
    if(!Array.isArray(result)||result.length<3||result.length>1000||!result.every(finitePoint))throw Error('凸包を多角形として描くには、有限な外周頂点が3点以上必要です。点の重複・一直線の配置を確認してください。');
    return result.map(copy);
  }
  let model;
  if(method==='fitLine') {
    const length=Math.hypot(result?.direction?.x,result?.direction?.y);
    if(result?.kind!=='line' || !finitePoint(result.point) || !Number.isFinite(length) || !length)throw Error('有限な基準点と零でない方向を持つ直線が必要です。');
    model={kind:'line',point:copy(result.point),direction:copy(result.direction)};
  } else if(pointSetMethods.includes(method))model=circleModel(result);
  else throw Error('対応していない点群の計算です。');
  if(result.rms!==undefined) {
    if(!Number.isFinite(result.rms) || result.rms<0)throw Error('RMSは有限な非負数で指定してください。');
    model.rms=result.rms;
  }
  return model;
}
export function pointSetGeometry(method,input,result) {
  const {points}=pointSetInput(method,input),model=pointSetResult(method,result,{points});
  if(method==='delaunayTriangles')return {kind:'group',children:model.map(triangle=>({kind:'polygon',points:triangle.map(i=>copy(points[i]))}))};
  if(method==='convexHull')return {kind:'polygon',points:model};
  if(method!=='fitLine')return model;
  const p=model.point,n=Math.hypot(model.direction.x,model.direction.y),d={x:model.direction.x/n,y:model.direction.y/n};
  const projections=points.map(q=>(q.x-p.x)*d.x+(q.y-p.y)*d.y);
  const at=t=>({x:p.x+t*d.x,y:p.y+t*d.y});
  const start=at(Math.min(...projections)),end=at(Math.max(...projections));
  if(!finitePoint(start) || !finitePoint(end))throw Error('直線の描画範囲を有限な座標で計算できません。');
  return {kind:'segment',start,end};
}
export function pointSetGeometrySnapshot(element) {
  if(element?.tagName?.toLowerCase()==='g')return meshGeometrySnapshot(element);
  if(element?.tagName?.toLowerCase()==='polygon')return {tag:'polygon',points:element.getAttribute('points')};
  if(element?.tagName?.toLowerCase()==='line')return {tag:'line',...Object.fromEntries(['x1','y1','x2','y2'].map(key=>[key,element.getAttribute(key)]))};
  return circleGeometrySnapshot(element);
}
export function pointSetOrigin(record) {
  const origin=record?.pointSetEdit && Object.hasOwn(record.pointSetEdit,'origin')?record.pointSetEdit.origin:record;
  return origin?.tool?Object.fromEntries(['tool','calculation','rendering','dependencies','note'].filter(key=>origin[key]!==undefined).map(key=>[key,origin[key]])):null;
}
export function readPointSetSource(sourceText,recordText,geometry) {
  if(typeof sourceText!=='string' || sourceText.length>4000000)throw Error('この図形には元の点群が保存されていません。');
  const source=JSON.parse(sourceText);
  if(source?.version!==1)throw Error('対応していない点群データです。');
  const method=source.method,input=pointSetInput(method,source.input),result=pointSetResult(method,source.result,input);
  if(method==='delaunayTriangles')validateMeshSnapshot(source.geometry,geometry,result.length);
  else {
  const keys=geometry?.tag==='line'?['tag','x1','y1','x2','y2']:geometry?.tag==='circle'?['tag','cx','cy','r']:geometry?.tag==='path'?['tag','d']:geometry?.tag==='polygon'?['tag','points']:[];
  const coordinates=typeof geometry?.points==='string'?geometry.points.trim().split(/[\s,]+/).map(Number):[];
  const allowed=method==='convexHull'?['polygon','path']:method==='fitLine'?['line','path']:['circle','path'];
  if(!keys.length || !keys.every(key=>source.geometry?.[key]===geometry[key]) ||
      (geometry.tag==='path' ? !geometry.d || /NaN|Infinity/.test(geometry.d) || (method==='convexHull'&&!/[zZ]\s*$/.test(geometry.d)) :
        geometry.tag==='polygon' ? coordinates.length<6 || coordinates.length%2!==0 || !coordinates.every(Number.isFinite) :
        !keys.slice(1).every(key=>typeof geometry[key]==='string' && geometry[key].trim() && Number.isFinite(Number(geometry[key])))) ||
      !allowed.includes(geometry.tag))throw Error('現在の形状と点群の元データが一致しません。');
  }
  if(typeof recordText!=='string' || recordText.length>2000000)throw Error('点群の計算方式を読めません。');
  const record=JSON.parse(recordText);
  if(record?.version!==1 || record.tool!==method)throw Error('点群と計算方式の記録が一致しません。');
  const options={...record.rendering?.options};if(!['convexHull','delaunayTriangles'].includes(method))options.sampleCount??=80;
  if(options.sampleCount!==undefined&&(!Number.isInteger(options.sampleCount) || options.sampleCount<2 || options.sampleCount>10000))throw Error('再描画の分割数は2〜10000の整数で指定してください。');
  return {method,input,result,options,implementation:record.calculation?.id??'default',renderer:record.rendering?.id??'default',origin:pointSetOrigin(record)};
}
