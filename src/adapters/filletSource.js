import {arcModel} from './arcSource.js';
import {applyToPoint,invertAffine} from '../model/affine.js';
import {splineControlFrame} from './splineControlGeometry.js';
const keys=['a','b','c','d','e','f'];
const finite=p=>p && Number.isFinite(p.x) && Number.isFinite(p.y);
const point=p=>({x:p.x,y:p.y});
const close=(a,b)=>Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
const samePoint=(a,b)=>close(a.x,b.x)&&close(a.y,b.y);
const segment=s=>Array.isArray(s)&&s.length===2&&s.every(finite);
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
function matrix(value) {
  if(!value || !keys.every(k=>Number.isFinite(value[k])) || !invertAffine({matrix:value}))throw Error('フィレットの座標変換を復元できません。');
  const inverse=invertAffine({matrix:value});
  if(!keys.every(k=>Number.isFinite(inverse[k])))throw Error('つぶれた変換ではフィレットを再編集できません。');
  return Object.fromEntries(keys.map(k=>[k,value[k]]));
}
export function filletLocalSegments(result,matrices) {
  if(matrices?.length!==2)throw Error('線分の座標変換が不足しています。');
  return filletResult(result).segments.map((s,i)=>{
    const inverse=invertAffine({matrix:matrix(matrices[i])}),points=s.map(p=>applyToPoint({point:p,matrix:inverse}));
    if(!points.every(finite))throw Error('線分の座標が有限範囲を超えました。');
    return points;
  });
}
export function filletLineGeometry(el) {
  if(el?.tagName!=='line')throw Error('対応する線分がありません。');
  return Object.fromEntries(['x1','y1','x2','y2'].map(k=>[k,el.getAttribute(k)]));
}
export const filletRelativeMatrix=(frame,line)=>matrix(splineControlFrame(frame.getScreenCTM(),line.getScreenCTM()).localCanvas);
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
  if(!Array.isArray(source.bindings)||source.bindings.length!==2||source.bindings[0]?.id===source.bindings[1]?.id)throw Error('フィレットの線分参照が不正です。');
  const bindings=source.bindings.map(b=>{
    if(typeof b.id!=='string'||!b.id||b.id.length>200||!['x1','y1','x2','y2'].every(k=>typeof b.geometry?.[k]==='string'&&b.geometry[k].trim()&&Number.isFinite(Number(b.geometry[k]))) ||
      !(b.record===null||typeof b.record==='string'&&b.record.length<=2000000))throw Error('フィレットの線分記録が不正です。');
    return {id:b.id,geometry:{...b.geometry},matrix:matrix(b.matrix),record:b.record};
  });
  if(typeof recordText!=='string'||recordText.length>2000000)throw Error('フィレットの計算方式を読めません。');
  const record=JSON.parse(recordText);
  if(record?.version!==1||record.tool!=='fillet')throw Error('フィレットと計算方式の記録が一致しません。');
  const options={...record.rendering?.options};options.sampleCount??=80;
  if(!Number.isInteger(options.sampleCount)||options.sampleCount<2||options.sampleCount>10000)throw Error('分割数は2〜10000の整数で指定してください。');
  return {input,result,bindings,options,implementation:record.calculation?.id??'default',renderer:record.rendering?.id??'default',origin:filletOrigin(record)};
}
export function resolveFilletLines(canvas,bridge,source,canSelect) {
  return source.bindings.map(b=>{
    const candidates=[...canvas.querySelectorAll('[data-vector-fillet-line-id]')].filter(el=>el.getAttribute('data-vector-fillet-line-id')===b.id);
    if(candidates.length!==1||candidates[0].tagName!=='line')throw Error('対応する線分が削除されたか、参照が重複しています。');
    const line=candidates[0];
    if(!canSelect(line))throw Error('対応する線分が非表示・ロック中です。');
    const geometry=filletLineGeometry(line),current=filletRelativeMatrix(bridge,line);
    if(!Object.keys(geometry).every(k=>geometry[k]===b.geometry[k])||line.getAttribute('data-vector-implementation')!==b.record||!keys.every(k=>close(current[k],b.matrix[k])))
      throw Error('対応する線分の形状・方式・相対変形が変更されています。');
    return line;
  });
}
// Prepare all three replacement geometries before touching the drawing.
export function prepareFilletOutput(host,input,result,lines,matrices,ids,options={},origin) {
  input=filletInput(input);result=filletResult(result);
  if(!close(input.radius,result.bridge.radius))throw Error('指定半径と計算結果が一致しません。');
  const local=filletLocalSegments(result,matrices),bridge=host.render(result.bridge,null,{...options,toolName:'fillet'});
  if(bridge?.tagName!=='path'||!bridge.getAttribute('d')||/NaN|Infinity/.test(bridge.getAttribute('d')))throw Error('有限なフィレットのパスを描画できません。');
  const outputs=lines.map((line,i)=>{
    const output=line.cloneNode(false);
    for(const name of ['spline','circle','arc','pointset','fillet','partial'])output.removeAttribute('data-vector-'+name);
    local[i].forEach((p,j)=>{output.setAttribute('x'+(j+1),p.x);output.setAttribute('y'+(j+1),p.y);});
    output.setAttribute('data-vector-fillet-line-id',ids[i]);
    host.annotate(output,'fillet',{note:'フィレットの接点へ線分端点を更新',parameters:{radius:input.radius},
      rendering:{id:'native-segment',label:'SVG線分',algorithm:'SVG lineの端点座標を更新',source:'src/adapters/filletSource.js',options:{}}});
    return output;
  });
  const bindings=outputs.map((el,i)=>({id:ids[i],geometry:filletLineGeometry(el),matrix:matrix(matrices[i]),record:el.getAttribute('data-vector-implementation')}));
  bridge.setAttribute('data-vector-fillet',JSON.stringify({version:1,input,result,bindings,path:bridge.getAttribute('d')}));
  const record=JSON.parse(bridge.getAttribute('data-vector-implementation'));record.parameters={radius:input.radius,first:input.first,second:input.second};
  if(origin!==undefined)record.filletEdit={mode:'radius',origin};
  bridge.setAttribute('data-vector-implementation',JSON.stringify(record));
  readFilletSource(bridge.getAttribute('data-vector-fillet'),bridge.getAttribute('data-vector-implementation'),bridge.getAttribute('d'));
  return {bridge,lines:outputs};
}
export function applyFilletLines(lines,outputs) {
  const names=['x1','y1','x2','y2','data-vector-fillet-line-id','data-vector-implementation',...['spline','circle','arc','pointset','fillet','partial'].map(n=>'data-vector-'+n)];
  lines.forEach((line,i)=>names.forEach(name=>{const value=outputs[i].getAttribute(name);if(value===null)line.removeAttribute(name);else line.setAttribute(name,value);}));
}
