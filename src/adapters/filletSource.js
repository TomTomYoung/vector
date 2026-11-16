import {arcModel} from './arcSource.js';
import {copyPoint as point,closeNumber as close,samePoint,finiteSegment as segment,cornerMatrix as matrix,
  localCornerSegments,cornerLineGeometry,cornerRelativeMatrix,readCornerBindings,resolveCornerLines,prepareCornerLines,applyCornerLines} from './cornerLineBindings.js';
export function filletInput(input) {
  if(!segment(input?.first)||!segment(input?.second)||!Number.isFinite(input.radius)||input.radius<=0||
    [input.first,input.second].some(s=>s[0].x===s[1].x&&s[0].y===s[1].y))throw Error('長さのある2線分と有限な正の半径が必要です。');
  return {first:input.first.map(point),second:input.second.map(point),radius:input.radius};
}
export function filletResult(result) {
  const bridge=arcModel(result?.bridge);
  if(!Array.isArray(result?.segments)||result.segments.length!==2||!result.segments.every(segment)||
    !result.segments.every((s,i)=>s.some(p=>samePoint(p,i===0?bridge.start:bridge.end))))throw Error('フィレットの線分と円弧の接点が一致しません。');
  return {bridge,segments:result.segments.map(s=>s.map(point))};
}
export const filletLocalSegments=(result,matrices)=>localCornerSegments(filletResult(result).segments,matrices);
export const filletLineGeometry=cornerLineGeometry;
export const filletRelativeMatrix=cornerRelativeMatrix;
export function filletOrigin(record) {
  const origin=record?.filletEdit && Object.hasOwn(record.filletEdit,'origin')?record.filletEdit.origin:record;
  return origin?.tool?Object.fromEntries(['tool','calculation','rendering','dependencies','note'].filter(k=>origin[k]!==undefined).map(k=>[k,origin[k]])):null;
}
export function readFilletSource(sourceText,recordText,path) {
  if(typeof sourceText!=='string'||sourceText.length>4000000)throw Error('この図形にはフィレットの元データが保存されていません。');
  const source=JSON.parse(sourceText);
  if(source?.version!==1)throw Error('対応していないフィレットデータです。');
  const input=filletInput(source.input),result=filletResult(source.result);
  if(typeof source.path!=='string'||!source.path||source.path!==path||/NaN|Infinity/.test(path)||!close(input.radius,result.bridge.radius))throw Error('現在の円弧とフィレットの元データが一致しません。');
  const bindings=readCornerBindings(source.bindings);
  if(typeof recordText!=='string'||recordText.length>2000000)throw Error('フィレットの計算方式を読めません。');
  const record=JSON.parse(recordText);
  if(record?.version!==1||record.tool!=='fillet')throw Error('フィレットと計算方式の記録が一致しません。');
  const options={...record.rendering?.options};options.sampleCount??=80;
  if(!Number.isInteger(options.sampleCount)||options.sampleCount<2||options.sampleCount>10000)throw Error('分割数は2〜10000の整数で指定してください。');
  return {input,result,bindings,options,implementation:record.calculation?.id??'default',renderer:record.rendering?.id??'default',origin:filletOrigin(record)};
}
export const resolveFilletLines=(canvas,bridge,source,canSelect)=>resolveCornerLines(canvas,bridge,source,canSelect,'data-vector-fillet-line-id');
// Prepare all three replacement geometries before touching the drawing.
export function prepareFilletOutput(host,input,result,lines,matrices,ids,options={},origin) {
  input=filletInput(input);result=filletResult(result);
  if(!close(input.radius,result.bridge.radius))throw Error('指定半径と計算結果が一致しません。');
  const bridge=host.render(result.bridge,null,{...options,toolName:'fillet'});
  if(bridge?.tagName!=='path'||!bridge.getAttribute('d')||/NaN|Infinity/.test(bridge.getAttribute('d')))throw Error('有限なフィレットのパスを描画できません。');
  const outputs=prepareCornerLines(host,'fillet',{radius:input.radius},result.segments,lines,matrices,ids,'data-vector-fillet-line-id');
  const bindings=outputs.map((el,i)=>({id:ids[i],geometry:filletLineGeometry(el),matrix:matrix(matrices[i]),record:el.getAttribute('data-vector-implementation')}));
  bridge.setAttribute('data-vector-fillet',JSON.stringify({version:1,input,result,bindings,path:bridge.getAttribute('d')}));
  const record=JSON.parse(bridge.getAttribute('data-vector-implementation'));record.parameters={radius:input.radius,first:input.first,second:input.second};
  if(origin!==undefined)record.filletEdit={mode:'radius',origin};
  bridge.setAttribute('data-vector-implementation',JSON.stringify(record));
  readFilletSource(bridge.getAttribute('data-vector-fillet'),bridge.getAttribute('data-vector-implementation'),bridge.getAttribute('d'));
  return {bridge,lines:outputs};
}
export const applyFilletLines=(lines,outputs)=>applyCornerLines(lines,outputs,'data-vector-fillet-line-id');
