// Shared incident-line storage for fillet and chamfer. Existing fillet IDs stay compatible.
import {applyToPoint,invertAffine} from '../model/affine.js';
import {splineControlFrame} from './splineControlGeometry.js';
const keys=['a','b','c','d','e','f'];
export const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
export const copyPoint=p=>({x:p.x,y:p.y});
export const closeNumber=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
export const samePoint=(a,b)=>closeNumber(a.x,b.x)&&closeNumber(a.y,b.y);
export const finiteSegment=s=>Array.isArray(s)&&s.length===2&&s.every(finitePoint);
export function cornerMatrix(value){
  if(!value||!keys.every(k=>Number.isFinite(value[k])))throw Error('線分の座標変換を復元できません。');
  const inverse=invertAffine({matrix:value});
  if(!inverse||!keys.every(k=>Number.isFinite(inverse[k])))throw Error('つぶれた変換では再編集できません。');
  return Object.fromEntries(keys.map(k=>[k,value[k]]));
}
export function localCornerSegments(segments,matrices){
  if(segments?.length!==2||!segments.every(finiteSegment)||matrices?.length!==2)throw Error('2線分と座標変換が必要です。');
  return segments.map((s,i)=>{
    const inverse=invertAffine({matrix:cornerMatrix(matrices[i])}),points=s.map(p=>applyToPoint({point:p,matrix:inverse}));
    if(!points.every(finitePoint))throw Error('線分の座標が有限範囲を超えました。');return points;
  });
}
export function cornerLineGeometry(el){
  if(el?.tagName!=='line')throw Error('対応する線分がありません。');
  return Object.fromEntries(['x1','y1','x2','y2'].map(k=>[k,el.getAttribute(k)]));
}
export const cornerRelativeMatrix=(frame,line)=>cornerMatrix(splineControlFrame(frame.getScreenCTM(),line.getScreenCTM()).localCanvas);
export function readCornerBindings(bindings){
  if(!Array.isArray(bindings)||bindings.length!==2||bindings[0]?.id===bindings[1]?.id)throw Error('線分参照が不正です。');
  return bindings.map(b=>{
    if(typeof b?.id!=='string'||!b.id||b.id.length>200||!['x1','y1','x2','y2'].every(k=>typeof b.geometry?.[k]==='string'&&b.geometry[k].trim()&&Number.isFinite(Number(b.geometry[k])))||
      !(b.record===null||typeof b.record==='string'&&b.record.length<=2000000))throw Error('線分記録が不正です。');
    return {id:b.id,geometry:{...b.geometry},matrix:cornerMatrix(b.matrix),record:b.record};
  });
}
export function resolveCornerLines(canvas,bridge,source,canSelect,idAttribute){
  return source.bindings.map(b=>{
    const candidates=[...canvas.querySelectorAll('['+idAttribute+']')].filter(el=>el.getAttribute(idAttribute)===b.id);
    if(candidates.length!==1||candidates[0].tagName!=='line')throw Error('対応する線分が削除されたか、参照が重複しています。');
    const line=candidates[0];if(line===bridge)throw Error('面取り線や円弧自身を参照することはできません。');
    if(!canSelect(line))throw Error('対応する線分が非表示・ロック中です。');
    const geometry=cornerLineGeometry(line),current=cornerRelativeMatrix(bridge,line);
    if(!Object.keys(geometry).every(k=>geometry[k]===b.geometry[k])||line.getAttribute('data-vector-implementation')!==b.record||!keys.every(k=>closeNumber(current[k],b.matrix[k])))throw Error('対応する線分の形状・方式・相対変形が変更されています。');
    return line;
  });
}
const sources=['spline','circle','arc','pointset','fillet','chamfer','partial'].map(n=>'data-vector-'+n);
export function prepareCornerLines(host,method,parameters,segments,lines,matrices,ids,idAttribute){
  const local=localCornerSegments(segments,matrices);
  if(lines?.length!==2||ids?.length!==2)throw Error('2線分と参照IDが必要です。');
  return lines.map((line,i)=>{
    const output=line.cloneNode(false);for(const name of sources)output.removeAttribute(name);
    local[i].forEach((p,j)=>{output.setAttribute('x'+(j+1),p.x);output.setAttribute('y'+(j+1),p.y);});
    output.setAttribute(idAttribute,ids[i]);
    host.annotate(output,method,{note:method==='fillet'?'フィレットの接点へ線分端点を更新':'面取りの接続点へ線分端点を更新',parameters,
      rendering:{id:'native-segment',label:'SVG線分',algorithm:'SVG lineの端点座標を更新',source:'src/adapters/cornerLineBindings.js',options:{}}});return output;
  });
}
export function applyCornerLines(lines,outputs,idAttribute){
  const names=['x1','y1','x2','y2',idAttribute,'data-vector-implementation',...sources];
  lines.forEach((line,i)=>names.forEach(name=>{const value=outputs[i].getAttribute(name);if(value===null)line.removeAttribute(name);else line.setAttribute(name,value);}));
}
