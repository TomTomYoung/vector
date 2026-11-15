// A circle's model is independent of its SVG circle / sampled / cubic representation.
export function circleModel(shape) {
  const {center, radius} = shape ?? {};
  if (shape?.kind !== 'circle' || !Number.isFinite(center?.x) || !Number.isFinite(center?.y) ||
      !Number.isFinite(radius) || radius < 0 || ![center.x-radius,center.x+radius,center.y-radius,center.y+radius].every(Number.isFinite))
    throw Error('円の中心・半径は有限な数、半径は0以上で指定してください。');
  return {kind:'circle',center:{x:center.x,y:center.y},radius};
}

export function circleGeometrySnapshot(element) {
  const tag = element?.tagName?.toLowerCase();
  if (tag === 'circle') return {tag,cx:element.getAttribute('cx'),cy:element.getAttribute('cy'),r:element.getAttribute('r')};
  if (tag === 'path') return {tag,d:element.getAttribute('d')};
  throw Error('この円のSVG表現は再編集に対応していません。');
}

export function circleOrigin(record) {
  const origin = record?.circleEdit && Object.hasOwn(record.circleEdit,'origin') ? record.circleEdit.origin : record;
  if (origin?.tool) return Object.fromEntries(['tool','calculation','rendering','dependencies','note']
    .filter(key=>origin[key] !== undefined).map(key=>[key,origin[key]]));
  return null;
}

function readRecord(text) {
  if (!text) return {};
  if (typeof text !== 'string' || text.length > 2000000) throw Error('方式の記録が大きすぎます。');
  const record = JSON.parse(text);
  if (record?.version !== 1 || typeof record.tool !== 'string') throw Error('円の方式記録が不正です。');
  return record;
}

export function readCircleSource(sourceText, implementationText, geometry) {
  const record = readRecord(implementationText);
  let model;
  if (sourceText !== null && sourceText !== undefined) {
    if (typeof sourceText !== 'string' || sourceText.length > 4000000) throw Error('円の元データを読めません。');
    const source = JSON.parse(sourceText);
    if (source?.version !== 1) throw Error('対応していない円データです。');
    model = circleModel(source.model);
    const keys = geometry?.tag === 'circle' ? ['tag','cx','cy','r'] : geometry?.tag === 'path' ? ['tag','d'] : [];
    if (!keys.length || !keys.every(key=>source.geometry?.[key] === geometry[key]))
      throw Error('現在の形状と円の元データが一致しません。元データからの編集はできません。');
  } else {
    // Older native circles have an exact model. Arbitrary paths do not.
    if (geometry?.tag !== 'circle') throw Error('このパスには円の元データが保存されていません。');
    const number = (text, fallback) => text === null || text === undefined ? fallback :
      typeof text === 'string' && text.trim() !== '' ? Number(text) : NaN;
    model = circleModel({kind:'circle',center:{x:number(geometry.cx,0),y:number(geometry.cy,0)},radius:number(geometry.r,0)});
  }
  if (model.radius <= 0) throw Error('再編集する円の半径は0より大きくしてください。');
  const options = sourceText ? {...record.rendering?.options} : {};
  if (options.sampleCount === undefined) options.sampleCount = 80;
  if (!Number.isInteger(options.sampleCount) || options.sampleCount < 2 || options.sampleCount > 10000)
    throw Error('保存された円の分割数が不正です。');
  return {model,options,implementation:sourceText && record.tool === 'circle' ? record.calculation?.id ?? 'default' : 'default',
    renderer:sourceText ? record.rendering?.id ?? 'default' : 'default',origin:circleOrigin(record)};
}

// Existing native-circle controls change the attributes directly, not via the calculation registry.
export function recordCircleAttributeEdit(element, note = '中心・半径のSVG属性を直接編集') {
  let origin = null;
  try { origin = circleOrigin(readRecord(element.getAttribute('data-vector-implementation'))); } catch { /* keep the direct edit usable */ }
  element.removeAttribute('data-vector-circle');
  element.setAttribute('data-vector-implementation', JSON.stringify({version:1,tool:'circle',
    calculation:{id:'direct-attributes',label:'円の属性編集',algorithm:note,source:'src/tools/CircleTool.js'},
    rendering:{id:'default',label:'標準SVG',algorithm:'SVG circleのcx・cy・r',source:'src/tools/CircleTool.js',options:{}},
    circleEdit:{mode:'attributes',origin}}));
}
