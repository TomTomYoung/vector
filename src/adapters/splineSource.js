import {bSplineCurve, nurbsCurve} from '../model/splineCurves.js';
import {prepareGeometry} from './renderStrategies.js';
import {pathData} from './svgGeometry.js';

const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const point = p => ({x:p.x,y:p.y});
export function readSplineSource(sourceText, implementationText, currentPath) {
  if (typeof sourceText !== 'string' || sourceText.length > 4000000) throw Error('曲線の元データを読めません。');
  const source = JSON.parse(sourceText), m = source?.model;
  if (source?.version !== 1 || m?.kind !== 'splineCurve' || !Array.isArray(m.points) || m.points.length > 1012) throw Error('対応していない曲線データです。');
  if (m.periodic !== undefined && typeof m.periodic !== 'boolean') throw Error('周期指定が不正です。');
  const method = m.weights !== undefined ? 'nurbsCurve' : 'bSplineCurve';
  const create = method === 'nurbsCurve' ? nurbsCurve : bSplineCurve;
  const count = m.periodic ? m.controlCount : m.points.length;
  if (!Number.isInteger(count) || count < 2 || count > 1000 || (m.periodic && m.points.length !== count + m.degree)) throw Error('周期曲線の制御点数が不正です。');
  const input = {points:m.points.slice(0,count).map(p=>p && point(p)),degree:m.degree,
    ...(m.periodic ? {periodic:true,periodicKnots:Array.isArray(m.knots) ? m.knots.slice(m.degree,m.degree+count+1) : null} : {knots:m.knots}),
    ...(m.weights !== undefined ? {weights:Array.isArray(m.weights) ? m.weights.slice(0,count) : null} : {})};
  const validated = create(input);
  if (!validated || !same(validated.points,m.points.map(p=>p && point(p))) || !same(validated.knots,m.knots) || !same(validated.weights,m.weights)) throw Error('曲線の制御点・次数・ノット・重みが不正です。');
  let record = {};
  if (implementationText) {
    if (implementationText.length > 2000000) throw Error('方式の記録が大きすぎます。');
    record = JSON.parse(implementationText);
    if (record?.version !== 1 || record.tool !== method) throw Error('曲線と計算方式の記録が一致しません。');
  }
  const settings = {...record.rendering?.options, ...record.sampling};
  const options = {...record.rendering?.options, sampleCount:settings.sampleCount ?? 80, poleTolerance:settings.poleTolerance ?? 1e-8,
    maxDepth:settings.maxDepth ?? 18,maxNodes:settings.maxNodes ?? 32768};
  // Validate limits even if the original renderer was external.
  if (!Number.isInteger(options.sampleCount) || options.sampleCount<2 || options.sampleCount>10000 ||
    !Number.isFinite(options.poleTolerance) || options.poleTolerance<1e-14 || options.poleTolerance>0.1 ||
    !Number.isInteger(options.maxDepth) || options.maxDepth<0 || options.maxDepth>24 ||
    !Number.isInteger(options.maxNodes) || options.maxNodes<1 || options.maxNodes>200000) throw Error('保存された描画設定が不正です。');
  if (source.path !== undefined) {
    if (typeof source.path !== 'string' || source.path !== currentPath) throw Error('現在の形状と生成元データが一致しません。元データからの編集はできません。');
  } else {
    // PR #53 exports had no path snapshot. Verify standard output before offering editing.
    if ((record.rendering?.id ?? 'default') !== 'default') throw Error('旧形式の外部描画には形状照合情報がありません。');
    const geometry = prepareGeometry(validated,'default',options);
    if (!geometry || pathData(geometry) !== currentPath) throw Error('現在の形状と生成元データが一致しません。元データからの編集はできません。');
  }
  const automatic = create({...input,knots:undefined,periodicKnots:undefined});
  if (!m.periodic && automatic && same(automatic.knots,input.knots)) delete input.knots;
  if (m.periodic && automatic && same(automatic.knots,m.knots)) delete input.periodicKnots;
  return {method,input,options,implementation:record.calculation?.id ?? 'default',renderer:record.rendering?.id ?? 'default'};
}
