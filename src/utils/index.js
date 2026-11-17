/**
 * ============================================================
 * ユーティリティモジュール統合ローダー
 * ============================================================
 *
 * 【目的】
 * 全てのユーティリティモジュールをグローバルオブジェクトとして公開
 * script-tag方式のプロジェクトでES6モジュールを使用可能にする
 *
 * 【使用方法】
 * HTML:
 * <script type="module" src="src/utils/index.js"></script>
 *
 * JavaScript:
 * const dist = window.VectorUtils.geometry.distance(p1, p2);
 * const snapped = window.VectorUtils.coordinates.snapToGrid(point, 20);
 *
 * 【変更履歴】
 * - 2025-11-16: 初版作成
 */

import {createEditorHost} from "../adapters/editorHost.js";
import {readSplineSource} from '../adapters/splineSource.js';
import {insertEditableSplineKnot} from '../adapters/splineRefinement.js';
import {reduceEditableSplineDegree} from '../adapters/splineReduction.js';
import {elevateEditableSplineDegree} from '../adapters/splineElevation.js';
import {removeEditableSplineKnot} from '../adapters/splineRemoval.js';
import * as circleSource from '../adapters/circleSource.js';
import * as arcSource from '../adapters/arcSource.js';
import * as pointSetSource from '../adapters/pointSetSource.js';
import * as filletSource from '../adapters/filletSource.js';
import * as chamferSource from '../adapters/chamferSource.js';
import * as chamferControlGeometry from '../adapters/chamferControlGeometry.js';
import * as filletControlGeometry from '../adapters/filletControlGeometry.js';
import {createImplementationPreferences} from '../adapters/implementationPreferences.js';
import {createDocumentImplementationPreset,parseDocumentImplementationPreset} from '../adapters/documentImplementationPreset.js';
import {createNamedImplementationPresets,parseNamedImplementationPresets} from '../adapters/namedImplementationPresets.js';
import {filterPresets} from '../adapters/presetOrder.js';
import {readPresetSVG,presetImportRecords,planPresetImport,commitPresetImport} from '../adapters/presetImport.js';
import {createConstructionSets,parseConstructionSets} from '../adapters/constructionSets.js';
import {createNamedConstructionInputs,parseNamedConstructionInputs} from '../adapters/namedConstructionInputs.js';
import {createConstructionInputPresets,parseConstructionInputPresets,parseConstructionInput,parseConstructionDraft,parseCurveDraft,parseShapeDraft,parseAnnotationDraft,supportsConstructionInput,constructionInputMode,constructionParameterFields,exportConstructionParameters,restoreConstructionParameters} from '../adapters/constructionInputPresets.js';
import * as splineControlGeometry from '../adapters/splineControlGeometry.js';
import * as circleControlGeometry from '../adapters/circleControlGeometry.js';
import * as geometry from './geometry.js';
import * as coordinates from './coordinates.js';
import * as svg from './svg.js';
import * as style from './style.js';
import * as linearEditing from './linearEditing.js';
import * as bezier from './bezier.js';
import { TransformLayer, TransformManager } from './transformManager.js';

// グローバルオブジェクトとして公開
window.VectorUtils = {
  createEditorHost,
  readSplineSource,
  insertEditableSplineKnot,
  removeEditableSplineKnot,
  elevateEditableSplineDegree,
  reduceEditableSplineDegree,
  circleSource,
  arcSource,
  pointSetSource,
  filletSource,
  chamferSource,
  chamferControlGeometry,
  filletControlGeometry,
  createImplementationPreferences,
  createDocumentImplementationPreset,
  parseDocumentImplementationPreset,
  createNamedImplementationPresets,
  parseNamedImplementationPresets,
  createConstructionInputPresets,
  createNamedConstructionInputs,
  filterPresets,
  readPresetSVG,
  presetImportRecords,
  planPresetImport,
  commitPresetImport,
  createConstructionSets,
  parseConstructionSets,
  parseNamedConstructionInputs,
  parseConstructionInputPresets,
  parseConstructionInput,
  constructionParameterFields,
  parseConstructionDraft,
  parseCurveDraft,
  parseShapeDraft,
  parseAnnotationDraft,
  supportsConstructionInput,
  constructionInputMode,
  exportConstructionParameters,
  restoreConstructionParameters,
  splineControlGeometry,
  circleControlGeometry,
  geometry,
  linearEditing,
  coordinates,
  svg,
  style,
  bezier,
  TransformLayer,
  TransformManager,
};

// 個別にもアクセス可能にする（下位互換性のため）
window.GeometryUtils = geometry;
window.CoordinatesUtils = coordinates;
window.SvgUtils = svg;
window.StyleUtils = style;
window.BezierUtils = bezier;

console.log('VectorUtils loaded:', Object.keys(window.VectorUtils));
