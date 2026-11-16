import {sampleBezierPoints} from '../model/bezier.js';
import {flattenBezier, arcToCubics} from '../model/curveAnalysis.js';
import {sampleSplineBranches} from '../model/splineCurves.js';

export function bernsteinPoint(points, t) {
  const n = points.length - 1;
  if (n > 64) throw new RangeError('Bernstein直接評価は64次までです。');
  if (t === 0) return {...points[0]};
  if (t === 1) return {...points[n]};
  let coefficient = 1, x = 0, y = 0;
  for (let i = 0; i <= n; i++) {
    if (i) coefficient *= (n - i + 1) / i;
    const weight = coefficient * t ** i * (1 - t) ** (n - i);
    x += weight * points[i].x; y += weight * points[i].y;
  }
  return {x, y};
}
function intervals(options) {
  const n = options.sampleCount ?? 80;
  if (!Number.isInteger(n) || n < 2 || n > 10000) throw new RangeError('分割数は2〜10000です。');
  return n;
}
const chain = (points, extra = {}) => ({kind: 'path', start: points[0], segments: points.slice(1).map(end => ({kind: 'segment', end})), ...extra});

export function prepareGeometry(shape, mode = 'default', options = {}) {
  if (!shape) return shape;
  if (shape.kind === 'group') return {...shape, children: shape.children.map(s => prepareGeometry(s, mode, options))};
  if (shape.kind === 'splineCurve') {
    const result = sampleSplineBranches(shape, {...options, sampleCount: intervals(options)});
    if (!result.branches.length) return null;
    const path = chain(result.branches[0].points, {closed: result.closed});
    for (const branch of result.branches.slice(1)) path.segments.push({kind: 'move', end: branch.points[0]}, ...chain(branch.points).segments);
    path.sampling = {complete: result.complete, branches: result.branches.length, omitted: result.omitted, ...result.settings, nodes: result.nodes};
    if (!result.complete) path.warning = `分母零付近・未確定の${result.omitted.length}区間を省略し、枝を分離しました。省略範囲は記録のsampling.omittedで確認できます。`;
    return path;
  }
  if (mode === 'default') return shape;
  if (shape.kind === 'circle' || shape.kind === 'arc') {
    const arc = shape.kind === 'arc' ? shape : {kind: 'arc', center: shape.center, radius: shape.radius,
      start: {x: shape.center.x + shape.radius, y: shape.center.y}, turn: 2 * Math.PI};
    if (mode === 'cubic') return {...arcToCubics({arc}), closed: shape.kind === 'circle'};
    const n = intervals(options), start = Math.atan2(arc.start.y - arc.center.y, arc.start.x - arc.center.x);
    const points = Array.from({length: n + 1}, (_, i) => ({x: arc.center.x + arc.radius * Math.cos(start + arc.turn * i / n), y: arc.center.y + arc.radius * Math.sin(start + arc.turn * i / n)}));
    points[0] = arc.start;
    if (shape.kind === 'circle') points[n] = points[0];
    else if (shape.end) points[n] = shape.end;
    return chain(points, {closed: shape.kind === 'circle'});
  }
  if (shape.kind === 'bezier') {
    if (mode === 'adaptive') {
      const result = flattenBezier({points: shape.points, tolerance: options.tolerance ?? 0.25, maxDepth: options.maxDepth ?? 12});
      if (!result) throw new RangeError('適応分割の許容差・最大深さを確認してください。');
      return chain(result.points, {withinTolerance: result.withinTolerance});
    }
    const n = intervals(options);
    const points = mode === 'bernstein' ? Array.from({length: n + 1}, (_, i) => bernsteinPoint(shape.points, i / n)) : sampleBezierPoints(shape.points, n);
    return chain(points);
  }
  if (shape.kind === 'path') {
    let start = shape.start, segments = [], withinTolerance = true;
    for (const segment of shape.segments) {
      if (segment.kind === 'cubic') {
        const part = prepareGeometry({kind: 'bezier', points: [start, segment.control1, segment.control2, segment.end]}, mode, options);
        segments.push(...part.segments);
        if (part.withinTolerance === false) withinTolerance = false;
      } else segments.push(segment);
      start = segment.end;
    }
    return {...shape, segments, withinTolerance};
  }
  return shape;
}

const curveTools = ['path', 'spline', 'quadraticBezier', 'cubicBezier', 'nthBezier', 'vertices'];
const arcTools = ['arc', 'circle', 'fillet', 'fitCircle', 'minimumEnclosingCircle'];
const source = 'src/adapters/renderStrategies.js';
export function defaultRenderDescription(name) {
  if (name === 'nthBezier') return 'de Casteljau等間隔評価 → SVG M/L（既定80区間）';
  if (name === 'bSplineCurve' || name === 'nurbsCurve') return '同次de Boorの極形式で区間ベジェ化・分母のBernstein係数範囲で再分割 → SVG M/L（不連続・分母零付近で枝を分離）';
  if (name === 'quadraticBezier') return 'SVG Q（二次ベジェ）';
  if (name === 'cubicBezier' || name === 'spline') return 'SVG C（三次ベジェ）';
  if (name === 'chamfer') return 'SVG line（面取りの接続線分）';
  if (name === 'arc' || name === 'fillet') return 'SVG A（円弧）';
  if (name === 'vertices') return '指定方式に対応するSVG要素・Q/C、任意次数はde Casteljau → M/L';
  if (name === 'dimension') return 'DimensionToolのSVG線・円弧・矢印・文字';
  if (name === 'select') return 'SelectToolのSVG選択枠・ハンドル';
  return '図形に対応するSVG要素・パス。画素化はブラウザー';
}
export function createRenderRegistry({renderers = [], rendering = {}} = {}) {
  const registry = new Map([
    ['default', {id: 'default', label: '標準SVG', algorithm: '図形ごとの標準SVG表現', source: 'src/adapters/svgGeometry.js', supports: () => true, prepare: (shape, options) => prepareGeometry(shape, 'default', options)}],
    ['sampled', {id: 'sampled', label: '等分割・de Casteljau / 円の媒介変数', algorithm: 'パラメータ等分割 → SVG M/L', source, supports: name => curveTools.includes(name) || arcTools.includes(name), prepare: (shape, options) => prepareGeometry(shape, 'sampled', options)}],
    ['bernstein', {id: 'bernstein', label: '等分割・Bernstein直接評価', algorithm: 'Bernstein基底の加重和 → SVG M/L（64次まで）', source, supports: name => curveTools.includes(name), prepare: (shape, options) => prepareGeometry(shape, 'bernstein', options)}],
    ['adaptive', {id: 'adaptive', label: '適応分割・de Casteljau', algorithm: '弦からの距離を判定して再分割 → SVG M/L', source, supports: name => curveTools.includes(name), prepare: (shape, options) => prepareGeometry(shape, 'adaptive', options)}],
    ['cubic', {id: 'cubic', label: '円弧を三次ベジェ近似', algorithm: '90度以下に分割・4/3 tan(Δθ/4) → SVG C', source, supports: name => arcTools.includes(name), prepare: (shape, options) => prepareGeometry(shape, 'cubic', options)}],
  ]);
  const chosen = new Map(), settings = new Map();
  function register(entry) {
    if (!entry?.id || registry.has(entry.id) || !entry.label || !entry.algorithm || typeof entry.prepare !== 'function' || typeof entry.supports !== 'function')
      throw new TypeError('描画実装には重複しないid・label・algorithm・prepare・supportsが必要です。');
    registry.set(entry.id, {...entry});
  }
  renderers.forEach(register);
  function validate(name, id, options = {}) {
    if (!registry.get(id)?.supports(name)) throw new RangeError('対象ツールに対応しない描画実装です。');
    if (options.sampleCount !== undefined) intervals(options);
    if (options.tolerance !== undefined && !(Number.isFinite(options.tolerance) && options.tolerance > 0)) throw new RangeError('許容差は正の有限数です。');
    const spline = ['bSplineCurve', 'nurbsCurve'].includes(name), depthLimit = spline ? 24 : 18;
    if (options.maxDepth !== undefined && (!Number.isInteger(options.maxDepth) || options.maxDepth < 0 || options.maxDepth > depthLimit)) throw new RangeError('最大深さは0〜' + depthLimit + 'です。');
    if (spline && options.poleTolerance !== undefined && (!Number.isFinite(options.poleTolerance) || options.poleTolerance < 1e-14 || options.poleTolerance > 0.1)) throw new RangeError('分母の除外幅は1e-14〜0.1です。');
    if (spline && options.maxNodes !== undefined && (!Number.isInteger(options.maxNodes) || options.maxNodes < 1 || options.maxNodes > 200000)) throw new RangeError('処理上限は1〜200000です。');
  }
  function replace(name, id, options = {}) {
    validate(name,id,options);chosen.set(name,id);settings.set(name,{...options});
  }
  function select(name, id, options = {}) {
    replace(name,id,{...settings.get(name),...options});
  }
  for (const [name, value] of Object.entries(rendering)) select(name, typeof value === 'string' ? value : value.id, typeof value === 'string' ? {} : value.options);
  const info = (entry, name) => {
    const {prepare, supports, ...rest} = entry;
    return {...rest, ...(entry.id === 'default' && ['bSplineCurve', 'nurbsCurve'].includes(name) ? {source: 'src/model/splineCurves.js'} : {}),
      algorithm: entry.id === 'default' ? defaultRenderDescription(name) : entry.algorithm};
  };
  return {register, select, replace, validate,
    selection: names => Object.fromEntries(names.map(name => [name,{id:chosen.get(name) ?? 'default',options:{...settings.get(name)}}])),
    list: name => [...registry.values()].filter(e => e.supports(name)).map(e => info(e, name)),
    describe: (name, id) => {
      const entry = registry.get(id ?? chosen.get(name) ?? 'default');
      if (!entry?.supports(name)) throw new RangeError('対象ツールに対応しない描画実装です。');
      return {...info(entry, name), options: id ? {} : {...settings.get(name)}};
    },
    prepare(name, shape, options = {}, id) {
      const entry = registry.get(id ?? chosen.get(name) ?? 'default');
      if (!entry?.supports(name)) throw new RangeError('対象ツールに対応しない描画実装です。');
      return entry.prepare(shape, id ? options : {...options, ...settings.get(name)});
    },
  };
}
