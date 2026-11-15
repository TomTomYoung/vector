const finitePoint=p=>p && Number.isFinite(p.x) && Number.isFinite(p.y);
const point=p=>({x:p.x,y:p.y});
export function arcInput(input) {
  if(!['start','through','end'].every(key=>finitePoint(input?.[key])))throw Error('始点・通過点・終点を有限な座標で指定してください。');
  return Object.fromEntries(['start','through','end'].map(key=>[key,point(input[key])]));
}
export function arcModel(shape) {
  if(shape?.kind!=='arc' || !['center','start','end'].every(key=>finitePoint(shape[key])) ||
      !Number.isFinite(shape.radius) || shape.radius<=0 || !Number.isFinite(shape.turn) || !shape.turn || Math.abs(shape.turn)>=2*Math.PI ||
      ![shape.center.x-shape.radius,shape.center.x+shape.radius,shape.center.y-shape.radius,shape.center.y+shape.radius].every(Number.isFinite))
    throw Error('有限な中心・端点・正の半径と、絶対値が0より大きく1周未満の回転角を持つ円弧が必要です。');
  const {center,start,end,radius,turn}=shape;
  const tolerance=radius*1e-8+Number.EPSILON*64*Math.max(1,...[center,start,end].flatMap(p=>[Math.abs(p.x),Math.abs(p.y)]));
  const angle=Math.atan2(start.y-center.y,start.x-center.x)+turn;
  if(Math.abs(Math.hypot(start.x-center.x,start.y-center.y)-radius)>tolerance ||
      Math.abs(Math.hypot(end.x-center.x,end.y-center.y)-radius)>tolerance ||
      Math.hypot(end.x-(center.x+radius*Math.cos(angle)),end.y-(center.y+radius*Math.sin(angle)))>tolerance)
    throw Error('円弧の中心・半径・端点・回転角が一致しません。');
  return {kind:'arc',center:point(shape.center),start:point(shape.start),end:point(shape.end),radius:shape.radius,turn:shape.turn};
}
export function arcOrigin(record) {
  const origin=record?.arcEdit && Object.hasOwn(record.arcEdit,'origin') ? record.arcEdit.origin : record;
  return origin?.tool ? Object.fromEntries(['tool','calculation','rendering','dependencies','note']
    .filter(key=>origin[key]!==undefined).map(key=>[key,origin[key]])) : null;
}
export function readArcSource(sourceText,implementationText,currentPath) {
  if(typeof sourceText!=='string' || sourceText.length>4000000)throw Error('このパスには円弧の元データが保存されていません。');
  const source=JSON.parse(sourceText);
  if(source?.version!==1)throw Error('対応していない円弧データです。');
  const input=arcInput(source.input),model=arcModel(source.model);
  if(typeof source.path!=='string' || !source.path || source.path!==currentPath)throw Error('現在の形状と円弧の元データが一致しません。');
  let record={};
  if(implementationText){
    if(typeof implementationText!=='string' || implementationText.length>2000000)throw Error('方式の記録が大きすぎます。');
    record=JSON.parse(implementationText);
    if(record?.version!==1 || record.tool!=='arc')throw Error('円弧と計算方式の記録が一致しません。');
  }
  const options={...record.rendering?.options};
  options.sampleCount ??= 80;
  if(!Number.isInteger(options.sampleCount) || options.sampleCount<2 || options.sampleCount>10000)throw Error('円弧の分割数は2〜10000の整数で指定してください。');
  return {input,model,options,implementation:record.calculation?.id??'default',renderer:record.rendering?.id??'default',origin:arcOrigin(record)};
}
