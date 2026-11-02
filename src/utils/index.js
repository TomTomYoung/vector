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
