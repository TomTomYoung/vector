import {createToolset} from "../model/tools.js";
import {getMousePositionInSVG} from "../utils/coordinates.js";
import {edit} from "../utils/linearEditing.js";
import {renderGeometry, pathData, readOffsetShape} from "./svgGeometry.js";

function snapPoint(point, {geometry, exclude, anchor, manager}) {
  if (geometry && window.snapManager) return window.snapManager.snapPoint(point, exclude, anchor);
  return manager.snapToGrid(point);
}

export function createEditorHost({
  tools, operations, execute = createToolset({tools, operations}),
  readPoint = getMousePositionInSVG, snap = snapPoint, readShape = readOffsetShape,
  encodePath = pathData, render = (shape, target, options) => renderGeometry(shape, target, options, encodePath),
  editOutline = edit, save = () => window.saveState?.(),
} = {}) {
  return {execute, readPoint, snap, readShape, encodePath, render, editOutline, save};
}
