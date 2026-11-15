import {createToolset} from "../model/tools.js";
import {getMousePositionInSVG} from "../utils/coordinates.js";
import {edit} from "../utils/linearEditing.js";
import {renderGeometry, pathData, readOffsetShape} from "./svgGeometry.js";
import {createRenderRegistry} from './renderStrategies.js';

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
  const describeRendering = name => render ? {id: 'custom', label: '外部render', algorithm: '描画関数を差し替え（アルゴリズム情報未指定）', source: null, options: {}} :
    {...drawing.describe(name), ...(encodePath !== pathData ? {algorithm: drawing.describe(name).algorithm + ' / encodePathは外部実装', source: null} : {})};
  function annotate(element, name, extra = {}) {
    if (element && name) element.setAttribute('data-vector-implementation', JSON.stringify({version: 1, tool: name,
      calculation: describe(name), rendering: describeRendering(name), dependencies: run.trace?.() ?? [], ...extra}));
    return element;
  }
  return {operations, execute: run, readPoint, snap, readShape, encodePath, editOutline, save,
    describe, implementations: name => run.list?.(name) ?? [describe(name)],
    selectImplementation: (name, id) => {if (!run.select) throw Error('外部executeは方式選択に対応していません。'); run.select(name, id);},
    registerImplementation: (name, implementation) => run.register(name, implementation),
    renderers: name => render ? [describeRendering(name)] : drawing.list(name),
    selectRenderer: drawing.select, registerRenderer: drawing.register, describeRendering, annotate,
    render(shape, target, options = {}) {
      const prepared = render ? shape : drawing.prepare(options.toolName, shape, options);
      const element = render ? render(prepared, target, options) : renderGeometry(prepared, target, options, encodePath);
      if (element && shape?.kind === 'splineCurve') {
        element.setAttribute('data-vector-spline', JSON.stringify({version: 1, model: shape}));
        if (prepared?.sampling?.complete === false) element.setAttribute('data-vector-partial', 'true');
        else element.removeAttribute('data-vector-partial');
      }
      return annotate(element, options.toolName, {
        rendering: {...describeRendering(options.toolName), options: {
          ...Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'toolName')),
          ...describeRendering(options.toolName).options,
        }},
        ...(prepared?.withinTolerance === false ? {warning: '最大深さに達し、許容差を満たしていません。'} : {}),
        ...(prepared?.warning ? {warning: prepared.warning} : {}),
        ...(prepared?.sampling ? {sampling: prepared.sampling} : {}),
        ...(shape?.kind === 'splineCurve' ? {parameters: {degree: shape.degree, periodic: !!shape.periodic, controlCount: shape.controlCount ?? shape.points.length}} : {}),
      });
    },
  };
}
