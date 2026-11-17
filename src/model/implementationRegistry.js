import {reduceSplineDegreeContinuity} from './compactSplineReduction.js';
import {elevateSplineDegreeContinuity} from './compactSplineElevation.js';
import {toolMetadata} from './toolMetadata.js';
import {uniformCatmullRom, parameterizedCatmullRom, miterOffset, jarvisHull, cohenSutherland} from './alternatives.js';
import {orientationSign, exactInsideCircle} from './exactPredicates.js';
import {convexHull} from './polygons.js';
import {delaunayTriangles} from './mesh.js';

const alternative = (id, label, algorithm, run, source = 'src/model/alternatives.js') => ({id, label, algorithm, source, run});
export const builtinImplementations = {
  reduceSplineDegree: [alternative('continuity', '元の連続性を保つ次数下げ', '元の重複度−1のノット列・単純周期継ぎ目の始端移動・同次Bernstein係数の全体最小二乗・Givens疎QR・全区間偏差検証', reduceSplineDegreeContinuity, 'src/model/compactSplineReduction.js')],
  elevateSplineDegree: [alternative('continuity', '元の連続性を保つ次数上げ', '区間ベジェ次数上げ・元の重複度+1のノット列へGivens回転による疎QR基底変換・全区間偏差検証', elevateSplineDegreeContinuity, 'src/model/compactSplineElevation.js')],
  spline: [
    alternative('uniform', '一様 Catmull–Rom', '標準接線・三次ベジェへの変換（tension=1）', uniformCatmullRom),
    alternative('centripetal', '求心 Catmull–Rom', '距離の平方根によるノット間隔（α=0.5）・三次ベジェへの変換', input => parameterizedCatmullRom(input, 0.5)),
    alternative('chordal', '弦長 Catmull–Rom', '距離によるノット間隔（α=1）・三次ベジェへの変換', input => parameterizedCatmullRom(input, 1)),
  ],
  offset: [alternative('miter', 'Miter オフセット', '隣接辺の法線によるmiter交点。既定上限比10。円・矩形は標準方式', miterOffset)],
  convexHull: [
    alternative('jarvis', 'Jarvis march', '最外周への向きを順に選ぶgift wrapping', jarvisHull),
    alternative('exact', 'Andrew + 厳密符号', 'Andrew monotone chain・BigIntでbinary64入力の行列式の符号を厳密判定', (input, ops) => convexHull(input, {...ops, orientation: orientationSign}), 'src/model/exactPredicates.js'),
  ],
  clipSegmentToBox: [alternative('cohen-sutherland', 'Cohen–Sutherland', '領域コードの論理和・論理積と境界交点によるクリッピング', cohenSutherland)],
  delaunayTriangles: [alternative('exact', 'Lawson + 厳密符号', '辺反転・BigIntによる向きと外接円の厳密符号判定。交点座標の厳密構成は含まない',
    (input, ops) => delaunayTriangles(input, {...ops, orientation: orientationSign, insideCircle: exactInsideCircle}), 'src/model/exactPredicates.js')],
};

// Keeps the original callable dispatcher contract. Selection is per-instance, never global.
export function createImplementationRegistry(defaults, {tools = {}, operations = {}, implementations = {}, selection = {}, metadata = {}} = {}) {
  const registry = new Map(), chosen = new Map(), ops = {...operations};
  const describe = entry => {
    const {run, ...info} = entry;
    return {...info, operations: Object.keys(ops)};
  };
  function register(name, entry) {
    if (!registry.has(name) || !entry || !/^[a-zA-Z0-9_-]+$/.test(entry.id) || typeof entry.run !== 'function' || !entry.label || !entry.algorithm)
      throw new TypeError('実装には対象名・id・label・algorithm・runが必要です。');
    const variants = registry.get(name);
    if (variants.has(entry.id)) throw new RangeError('実装IDが重複しています: ' + entry.id);
    variants.set(entry.id, {...entry});
  }
  for (const [name, fn] of Object.entries({...defaults, ...tools})) {
    if (typeof fn !== 'function') throw new TypeError('ツールは関数で指定します: ' + name);
    registry.set(name, new Map());
    const info = Object.hasOwn(tools, name) ? {label: '外部実装', algorithm: 'toolsで差し替え（アルゴリズム情報未指定）', source: null, ...(Object.hasOwn(metadata, name) ? metadata[name] : {})} : toolMetadata[name];
    register(name, {...info, id: 'default', run: fn});
    for (const entry of Object.hasOwn(builtinImplementations, name) ? builtinImplementations[name] : []) register(name, entry);
    for (const entry of Object.hasOwn(implementations, name) ? implementations[name] : []) register(name, entry);
    chosen.set(name, 'default');
  }
  function choose(name, id) {
    if (!registry.get(name)?.has(id)) throw new RangeError('未知の実装: ' + name + '/' + id);
    chosen.set(name, id);
  }
  for (const [name, id] of Object.entries(selection)) choose(name, id);
  let depth = 0, trace = [], previousTrace = [];
  function execute(name, input, options = {}) {
    const entry = registry.get(name)?.get(options.implementation ?? chosen.get(name));
    if (!entry) throw new RangeError('Unknown tool or implementation: ' + name);
    if (depth === 0) trace = [];
    trace.push({tool: name, ...describe(entry)}); depth++;
    try { return entry.run(input, ops, execute); }
    finally { if (--depth === 0) previousTrace = trace; }
  }
  execute.register = register;
  execute.select = choose;
  execute.list = name => [...(registry.get(name)?.values() ?? [])].map(describe);
  execute.describe = name => {
    const entry = registry.get(name)?.get(chosen.get(name));
    return entry ? describe(entry) : null;
  };
  execute.selection = () => Object.fromEntries(chosen);
  execute.trace = () => previousTrace.map(info => ({...info}));
  return execute;
}
