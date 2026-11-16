import {copyPoint,finitePoint,finiteSegment,samePoint,cornerMatrix,cornerLineGeometry,cornerRelativeMatrix,
  readCornerBindings,resolveCornerLines,prepareCornerLines,applyCornerLines,localCornerSegments} from './cornerLineBindings.js';
export function chamferInput(input){
  if(!finiteSegment(input?.first)||!finiteSegment(input?.second)||[input.first,input.second].some(s=>s[0].x===s[1].x&&s[0].y===s[1].y)||
    ![input.distance1,input.distance2].every(d=>Number.isFinite(d)&&d>=0)||!(input.distance1>0||input.distance2>0))throw Error('長さのある2線分と有限な非負の距離を指定し、少なくとも一方の距離を正にしてください。');
  return {first:input.first.map(copyPoint),second:input.second.map(copyPoint),distance1:input.distance1,distance2:input.distance2};
}
export function chamferResult(result){
  const b=result?.bridge;
  if(b?.kind!=='segment'||!finitePoint(b.start)||!finitePoint(b.end)||(b.start.x===b.end.x&&b.start.y===b.end.y)||
    !Array.isArray(result.segments)||result.segments.length!==2||!result.segments.every(finiteSegment)||
    !result.segments.every((s,i)=>s.some(p=>samePoint(p,i===0?b.start:b.end))))throw Error('面取り線と両側の線分の接続点が一致しません。');
  return {bridge:{kind:'segment',start:copyPoint(b.start),end:copyPoint(b.end)},segments:result.segments.map(s=>s.map(copyPoint))};
}
export const chamferGeometry=cornerLineGeometry;
export const chamferRelativeMatrix=cornerRelativeMatrix;
export const chamferLocalSegments=(result,matrices)=>localCornerSegments(chamferResult(result).segments,matrices);
export function chamferOrigin(record){
  const origin=record?.chamferEdit&&Object.hasOwn(record.chamferEdit,'origin')?record.chamferEdit.origin:record;
  return origin?.tool?Object.fromEntries(['tool','calculation','rendering','dependencies','note'].filter(k=>origin[k]!==undefined).map(k=>[k,origin[k]])):null;
}
export function readChamferSource(sourceText,recordText,geometry){
  if(typeof sourceText!=='string'||sourceText.length>4000000)throw Error('この図形には面取りの元データが保存されていません。');
  const source=JSON.parse(sourceText);if(source?.version!==1)throw Error('対応していない面取りデータです。');
  const input=chamferInput(source.input),result=chamferResult(source.result),bindings=readCornerBindings(source.bindings);
  if(!['x1','y1','x2','y2'].every(k=>typeof geometry?.[k]==='string'&&geometry[k].trim()&&Number.isFinite(Number(geometry[k]))&&geometry[k]===source.geometry?.[k]))throw Error('現在の面取り線と元データが一致しません。');
  if(typeof recordText!=='string'||recordText.length>2000000)throw Error('面取りの計算方式を読めません。');
  const record=JSON.parse(recordText);if(record?.version!==1||record.tool!=='chamfer')throw Error('面取りと計算方式の記録が一致しません。');
  return {input,result,bindings,options:{...record.rendering?.options},implementation:record.calculation?.id??'default',renderer:record.rendering?.id??'default',origin:chamferOrigin(record)};
}
export const resolveChamferLines=(canvas,bridge,source,canSelect)=>resolveCornerLines(canvas,bridge,source,canSelect,'data-vector-chamfer-line-id');
export function prepareChamferOutput(host,input,result,lines,matrices,ids,options={},origin){
  input=chamferInput(input);result=chamferResult(result);
  const bridge=host.render(result.bridge,null,{...options,toolName:'chamfer'});
  if(bridge?.tagName!=='line')throw Error('面取りの再編集にはSVG線分を返す描画実装が必要です。');
  const parameters={distance1:input.distance1,distance2:input.distance2},outputs=prepareCornerLines(host,'chamfer',parameters,result.segments,lines,matrices,ids,'data-vector-chamfer-line-id');
  const bindings=outputs.map((el,i)=>({id:ids[i],geometry:cornerLineGeometry(el),matrix:cornerMatrix(matrices[i]),record:el.getAttribute('data-vector-implementation')}));
  bridge.setAttribute('data-vector-chamfer',JSON.stringify({version:1,input,result,bindings,geometry:chamferGeometry(bridge)}));
  const record=JSON.parse(bridge.getAttribute('data-vector-implementation'));record.parameters={...parameters,first:input.first,second:input.second};
  if(origin!==undefined)record.chamferEdit={mode:'distances',origin};bridge.setAttribute('data-vector-implementation',JSON.stringify(record));
  readChamferSource(bridge.getAttribute('data-vector-chamfer'),bridge.getAttribute('data-vector-implementation'),chamferGeometry(bridge));
  return {bridge,lines:outputs};
}
export const applyChamferLines=(lines,outputs)=>applyCornerLines(lines,outputs,'data-vector-chamfer-line-id');
