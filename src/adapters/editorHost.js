import {createToolset} from "../model/tools.js";
import {getMousePositionInSVG} from "../utils/coordinates.js";
import {edit} from "../utils/linearEditing.js";
import {renderGeometry, pathData, readOffsetShape} from "./svgGeometry.js";

export function createEditorHost({tools, operations, execute = createToolset({tools, operations}),
  readPoint = getMousePositionInSVG, render = renderGeometry, encodePath = pathData, editOutline = edit, readShape = readOffsetShape} = {}) {
  return {execute, readPoint, render, encodePath, editOutline, readShape};
}
