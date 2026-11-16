import {createToolset} from "../model/tools.js";
import {getMousePositionInSVG} from "../utils/coordinates.js";
import {edit} from "../utils/linearEditing.js";
import {renderGeometry, pathData, readOffsetShape} from "./svgGeometry.js";
import {createRenderRegistry} from './renderStrategies.js';
import {parseImplementationPreferences} from './implementationPreferences.js';
import {circleModel, circleGeometrySnapshot} from './circleSource.js';
import {arcInput, arcModel} from './arcSource.js';
import {pointSetMethods,pointSetInput,pointSetResult,pointSetGeometrySnapshot} from './pointSetSource.js';

function snapPoint(point, {geometry, exclude, anchor, manager}) {
  if (geometry && window.snapManager) return window.snapManager.snapPoint(point, exclude, anchor);
  return manager.snapToGrid(point);
}

export function createEditorHost({
  tools, operations, implementations, selection, metadata, renderers, rendering, execute,
  readPoint = getMousePositionInSVG, snap = snapPoint, readShape = readOffsetShape,
  encodePath = pathData, render,
  editOutline = edit, save = () => window.saveState?.(),
} = {}) {
  const run = execute ?? createToolset({tools, operations, implementations, selection, metadata});
  const drawing = createRenderRegistry({renderers, rendering});
  const describe = name => run.describe?.(name) ?? {id: 'custom', label: '外部execute', algorithm: '実行関数を差し替え（アルゴリズム情報未指定）', source: null};
  const describeRendering = (name, id) => render ? {id: 'custom', label: '外部render', algorithm: '描画関数を差し替え（アルゴリズム情報未指定）', source: null, options: {}} :
    {...drawing.describe(name, id), ...(encodePath !== pathData ? {algorithm: drawing.describe(name, id).algorithm + ' / encodePathは外部実装', source: null} : {})};
  function annotate(element, name, extra = {}) {
    if (element && name) element.setAttribute('data-vector-implementation', JSON.stringify({version: 1, tool: name,
      calculation: describe(name), rendering: describeRendering(name), dependencies: run.trace?.() ?? [], ...extra}));
    return element;
  }
  function exportPreferences() {
    const calculation = run.selection?.() ?? {};
    return parseImplementationPreferences({version:1,calculation,rendering:render ? {} : drawing.selection(Object.keys(calculation))});
  }
  function restorePreferences(value) {
    const data = parseImplementationPreferences(value),pending = [],skipped = [];
    // Validate all entries before applying any of them. Unavailable plugins stay inactive.
    for (const type of ['calculation','rendering']) for (const [name,entry] of Object.entries(data[type])) {
      const id = type === 'calculation' ? entry : entry.id;
      try {
        if (!run.list?.(name)?.length) throw Error('対象ツールが未登録です');
        if (type === 'calculation') {
          if (!run.select || !run.list(name).some(v=>v.id===id)) throw Error('計算実装が未登録です');
        } else {
          if (render) throw Error('外部renderの設定復元には対応していません');
          drawing.validate(name,id,entry.options);
        }
        pending.push({type,name,id,options:entry.options});
      } catch (error) {skipped.push({type,name,id,reason:error.message});}
    }
    for (const item of pending) {
      if (item.type === 'calculation') run.select(item.name,item.id);
      else drawing.replace(item.name,item.id,item.options);
    }
    return {applied:pending.map(({type,name,id})=>({type,name,id})),skipped};
  }
  return {operations, execute: run, readPoint, snap, readShape, encodePath, editOutline, save,
    exportPreferences, restorePreferences, renderingConfigurable: !render,
    describe, implementations: name => run.list?.(name) ?? [describe(name)],
    selectImplementation: (name, id) => {if (!run.select) throw Error('外部executeは方式選択に対応していません。'); run.select(name, id);},
    registerImplementation: (name, implementation) => run.register(name, implementation),
    renderers: name => render ? [describeRendering(name)] : drawing.list(name),
    selectRenderer: drawing.select, registerRenderer: drawing.register, describeRendering, annotate,
    render(shape, target, {sourceInput, sourceResult, ...options} = {}) {
      const arcSource = shape?.kind === 'arc' && options.toolName === 'arc' && (sourceInput || shape.through) ?
        {version:1,input:arcInput(sourceInput ?? shape),model:arcModel(shape)} : null;
      const pointSource=pointSetMethods.includes(options.toolName) && sourceInput && sourceResult ?
        {version:1,method:options.toolName,input:pointSetInput(options.toolName,sourceInput),result:pointSetResult(options.toolName,sourceResult,sourceInput)} : null;
      const prepared = render ? shape : drawing.prepare(options.toolName, shape, options, options.renderer);
      const element = render ? render(prepared, target, options) : renderGeometry(prepared, target, options, encodePath);
      if(pointSource && element && ['line','circle','path','polygon','g'].includes(element.tagName.toLowerCase()))
        element.setAttribute('data-vector-pointset',JSON.stringify({...pointSource,geometry:pointSetGeometrySnapshot(element)}));
      if (arcSource && element?.tagName === 'path') {
        element.setAttribute('data-vector-arc',JSON.stringify({...arcSource,path:element.getAttribute('d')}));
      }
      if (element && shape?.kind === 'circle' && ['circle','path'].includes(element.tagName.toLowerCase())) {
        element.setAttribute('data-vector-circle', JSON.stringify({version:1,model:circleModel(shape),geometry:circleGeometrySnapshot(element)}));
      }
      if (element && shape?.kind === 'splineCurve') {
        element.setAttribute('data-vector-spline', JSON.stringify({version: 1, model: shape, path: element.getAttribute('d')}));
        if (prepared?.sampling?.complete === false) element.setAttribute('data-vector-partial', 'true');
        else element.removeAttribute('data-vector-partial');
      }
      return annotate(element, options.toolName, {
        rendering: {...describeRendering(options.toolName, options.renderer), options: {
          ...Object.fromEntries(Object.entries(options).filter(([key]) => !['toolName','renderer'].includes(key))),
          ...describeRendering(options.toolName, options.renderer).options,
        }},
        ...(prepared?.withinTolerance === false ? {warning: '最大深さに達し、許容差を満たしていません。'} : {}),
        ...(prepared?.warning ? {warning: prepared.warning} : {}),
        ...(prepared?.sampling ? {sampling: prepared.sampling} : {}),
        ...(pointSource ? {parameters:{pointCount:(pointSource.input.sites??pointSource.input.points).length,...(pointSource.method==='convexHull'?{hullVertexCount:pointSource.result.length}:{}),...(pointSource.method==='delaunayTriangles'?{triangleCount:pointSource.result.length}:{}),...(pointSource.method==='voronoiCells'?{cellCount:pointSource.result.length,visibleCellCount:pointSource.result.filter(c=>c.points.length).length,box:pointSource.input.box}:{}),...(pointSource.result.rms!==undefined?{rms:pointSource.result.rms}:{})}} : {}),
        ...(shape?.kind === 'splineCurve' ? {parameters: {degree: shape.degree, periodic: !!shape.periodic, controlCount: shape.controlCount ?? shape.points.length}} : {}),
      });
    },
  };
}
