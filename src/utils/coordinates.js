/**
 * ============================================================
 * 座標変換・スナップユーティリティ
 * ============================================================
 *
 * 【目的】
 * スクリーン座標とSVG座標の変換、グリッドスナップ、直交スナップなど
 * 座標に関する共通処理を提供
 *
 * 【依存関係】
 * - 外部依存: なし（SVG要素は引数で受け取る）
 * - グローバル変数: 使用しない
 *
 * 【入力】
 * - svgElement: SVGSVGElement（SVG座標系の基準）
 * - event: MouseEvent
 * - point: {x: number, y: number}
 * - gridSize: number
 * - angle: number（ラジアン）
 *
 * 【出力】
 * - 変換後の座標 {x: number, y: number}
 * - スナップされた座標 {x: number, y: number}
 *
 * 【エクスポート関数】
 * - screenToSVG(svgElement, screenX, screenY): スクリーン→SVG座標
 * - svgToScreen(svgElement, svgX, svgY): SVG→スクリーン座標
 * - getMousePositionInSVG(svgElement, event): マウスイベント→SVG座標
 * - snapToGrid(point, gridSize): グリッドスナップ
 * - snapToOrtho(startPoint, currentPoint): 直交スナップ
 * - snapAngle(angle, snapDegrees): 角度スナップ
 * - constrainToAngle(startPoint, currentPoint, angleDegrees): 角度拘束
 *
 * 【使用例】
 * import { getMousePositionInSVG, snapToGrid } from './coordinates.js';
 *
 * const svg = document.getElementById('canvas');
 * const point = getMousePositionInSVG(svg, event);
 * const snapped = snapToGrid(point, 20);
 *
 * 【変更履歴】
 * - 2025-11-16: 初版作成（ToolManager.js, SnapManager.jsから抽出）
 */

/**
 * スクリーン座標をSVG座標に変換
 * @param {SVGSVGElement} svgElement - SVG要素
 * @param {number} screenX - スクリーンX座標
 * @param {number} screenY - スクリーンY座標
 * @returns {Object} SVG座標 {x, y}
 */
export function screenToSVG(svgElement, screenX, screenY) {
  const pt = svgElement.createSVGPoint();
  pt.x = screenX;
  pt.y = screenY;

  // SVGの変換行列の逆行列を適用
  const ctm = svgElement.getScreenCTM();
  if (ctm) {
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  // フォールバック: 単純な相対座標
  const rect = svgElement.getBoundingClientRect();
  return {
    x: screenX - rect.left,
    y: screenY - rect.top
  };
}

/**
 * SVG座標をスクリーン座標に変換
 * @param {SVGSVGElement} svgElement - SVG要素
 * @param {number} svgX - SVGX座標
 * @param {number} svgY - SVGY座標
 * @returns {Object} スクリーン座標 {x, y}
 */
export function svgToScreen(svgElement, svgX, svgY) {
  const pt = svgElement.createSVGPoint();
  pt.x = svgX;
  pt.y = svgY;

  const ctm = svgElement.getScreenCTM();
  if (ctm) {
    const screenPt = pt.matrixTransform(ctm);
    return { x: screenPt.x, y: screenPt.y };
  }

  // フォールバック
  const rect = svgElement.getBoundingClientRect();
  return {
    x: svgX + rect.left,
    y: svgY + rect.top
  };
}

/**
 * マウスイベントからSVG座標を取得
 * @param {SVGSVGElement} svgElement - SVG要素
 * @param {MouseEvent} event - マウスイベント
 * @returns {Object} SVG座標 {x, y}
 */
export function getMousePositionInSVG(svgElement, event) {
  return screenToSVG(svgElement, event.clientX, event.clientY);
}

/**
 * 座標をグリッドにスナップ
 * @param {Object} point - 座標 {x, y}
 * @param {number} gridSize - グリッドサイズ
 * @returns {Object} スナップされた座標 {x, y}
 */
export function snapToGrid(point, gridSize) {
  if (gridSize <= 0) return { ...point };

  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize
  };
}

/**
 * 座標を直交（水平・垂直）にスナップ
 * 開始点から現在点への方向が水平か垂直かを判定し、
 * より近い方向に拘束する
 * @param {Object} startPoint - 開始点 {x, y}
 * @param {Object} currentPoint - 現在点 {x, y}
 * @returns {Object} 直交スナップされた座標 {x, y}
 */
export function snapToOrtho(startPoint, currentPoint) {
  const dx = Math.abs(currentPoint.x - startPoint.x);
  const dy = Math.abs(currentPoint.y - startPoint.y);

  if (dx > dy) {
    // 水平方向に拘束
    return { x: currentPoint.x, y: startPoint.y };
  } else {
    // 垂直方向に拘束
    return { x: startPoint.x, y: currentPoint.y };
  }
}

/**
 * 角度を指定度数でスナップ
 * @param {number} angle - 角度（ラジアン）
 * @param {number} snapDegrees - スナップする角度（度）デフォルト: 15度
 * @returns {number} スナップされた角度（ラジアン）
 */
export function snapAngle(angle, snapDegrees = 15) {
  const snapRadians = snapDegrees * Math.PI / 180;
  return Math.round(angle / snapRadians) * snapRadians;
}

/**
 * 座標を指定角度に拘束
 * 開始点から指定角度の方向に現在点を拘束する
 * @param {Object} startPoint - 開始点 {x, y}
 * @param {Object} currentPoint - 現在点 {x, y}
 * @param {number} angleDegrees - 拘束する角度（度）
 * @returns {Object} 拘束された座標 {x, y}
 */
export function constrainToAngle(startPoint, currentPoint, angleDegrees) {
  const angleRad = angleDegrees * Math.PI / 180;

  const dx = currentPoint.x - startPoint.x;
  const dy = currentPoint.y - startPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  return {
    x: startPoint.x + distance * Math.cos(angleRad),
    y: startPoint.y + distance * Math.sin(angleRad)
  };
}

/**
 * 座標を45度刻みの角度に拘束
 * 開始点からの角度を最も近い45度の倍数に丸める
 * @param {Object} startPoint - 開始点 {x, y}
 * @param {Object} currentPoint - 現在点 {x, y}
 * @returns {Object} 拘束された座標 {x, y}
 */
export function snapTo45Degrees(startPoint, currentPoint) {
  const dx = currentPoint.x - startPoint.x;
  const dy = currentPoint.y - startPoint.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance === 0) return { ...startPoint };

  // 現在の角度を計算
  const currentAngle = Math.atan2(dy, dx);

  // 45度刻みでスナップ
  const snappedAngle = snapAngle(currentAngle, 45);

  return {
    x: startPoint.x + distance * Math.cos(snappedAngle),
    y: startPoint.y + distance * Math.sin(snappedAngle)
  };
}

/**
 * 相対座標からSVG座標を取得（シンプル版）
 * SVGに変換行列がない場合に使用
 * @param {SVGSVGElement} svgElement - SVG要素
 * @param {number} clientX - クライアントX座標
 * @param {number} clientY - クライアントY座標
 * @returns {Object} SVG座標 {x, y}
 */
export function getRelativePosition(svgElement, clientX, clientY) {
  const rect = svgElement.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

/**
 * 座標を矩形範囲内に制限
 * @param {Object} point - 座標 {x, y}
 * @param {Object} bounds - 範囲 {x, y, width, height}
 * @returns {Object} 制限された座標 {x, y}
 */
export function clampToBounds(point, bounds) {
  return {
    x: Math.max(bounds.x, Math.min(point.x, bounds.x + bounds.width)),
    y: Math.max(bounds.y, Math.min(point.y, bounds.y + bounds.height))
  };
}
