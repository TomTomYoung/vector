/**
 * ============================================================
 * 幾何計算ユーティリティ（純粋関数モジュール）
 * ============================================================
 *
 * 【目的】
 * 2D幾何計算の再利用可能な純粋関数を提供
 *
 * 【依存関係】
 * - 外部依存: なし
 * - グローバル変数: 使用しない
 *
 * 【入力】
 * - 座標オブジェクト {x: number, y: number}
 * - 線分オブジェクト {x1, y1, x2, y2}
 *
 * 【出力】
 * - 計算結果（数値、座標、真偽値）
 *
 * 【エクスポート関数】
 * - distance(p1, p2): 2点間の距離
 * - lineIntersection(line1, line2): 線分交点
 * - pointToLineDistance(point, line): 点と線分の距離
 * - midpoint(p1, p2): 中点
 * - rotate(point, center, angle): 点の回転
 * - normalizeAngle(angle): 角度正規化 [0, 2π)
 * - dotProduct(v1, v2): ベクトルの内積
 * - crossProduct(v1, v2): ベクトルの外積（2D）
 * - vectorLength(v): ベクトルの長さ
 * - normalizeVector(v): ベクトルの正規化
 *
 * 【使用例】
 * import { distance, midpoint, lineIntersection } from './geometry.js';
 *
 * const p1 = {x: 0, y: 0};
 * const p2 = {x: 3, y: 4};
 * const dist = distance(p1, p2); // => 5
 * const mid = midpoint(p1, p2);  // => {x: 1.5, y: 2}
 *
 * 【変更履歴】
 * - 2025-11-16: 初版作成（SnapManager.jsから抽出）
 */

/**
 * 2点間の距離を計算
 * @param {Object} p1 - 点1 {x: number, y: number}
 * @param {Object} p2 - 点2 {x: number, y: number}
 * @returns {number} 距離
 */
export function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 2つの線分の交点を計算
 * @param {Object} line1 - 線分1 {x1, y1, x2, y2}
 * @param {Object} line2 - 線分2 {x1, y1, x2, y2}
 * @returns {Object|null} 交点 {x, y} または null（交わらない場合）
 */
export function lineIntersection(line1, line2) {
  const { x1, y1, x2, y2 } = line1;
  const { x1: x3, y1: y3, x2: x4, y2: y4 } = line2;

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null; // 平行または一致

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // 線分の範囲内にある交点のみ返す
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  }

  return null;
}

/**
 * 点と線分の最短距離を計算
 * @param {Object} point - 点 {x, y}
 * @param {Object} line - 線分 {x1, y1, x2, y2}
 * @returns {number} 最短距離
 */
export function pointToLineDistance(point, line) {
  const { x, y } = point;
  const { x1, y1, x2, y2 } = line;

  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;
  if (param < 0) {
    // 線分の始点に最も近い
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    // 線分の終点に最も近い
    xx = x2;
    yy = y2;
  } else {
    // 線分上の点に最も近い
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * 2点の中点を計算
 * @param {Object} p1 - 点1 {x, y}
 * @param {Object} p2 - 点2 {x, y}
 * @returns {Object} 中点 {x, y}
 */
export function midpoint(p1, p2) {
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
}

/**
 * 点を中心の周りに回転
 * @param {Object} point - 回転する点 {x, y}
 * @param {Object} center - 回転の中心 {x, y}
 * @param {number} angle - 回転角度（ラジアン）
 * @returns {Object} 回転後の点 {x, y}
 */
export function rotate(point, center, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

/**
 * 角度を [0, 2π) の範囲に正規化
 * @param {number} angle - 角度（ラジアン）
 * @returns {number} 正規化された角度
 */
export function normalizeAngle(angle) {
  const TWO_PI = 2 * Math.PI;
  angle = angle % TWO_PI;
  return angle < 0 ? angle + TWO_PI : angle;
}

/**
 * ベクトルの内積を計算
 * @param {Object} v1 - ベクトル1 {x, y}
 * @param {Object} v2 - ベクトル2 {x, y}
 * @returns {number} 内積
 */
export function dotProduct(v1, v2) {
  return v1.x * v2.x + v1.y * v2.y;
}

/**
 * 2Dベクトルの外積を計算（z成分のみ）
 * @param {Object} v1 - ベクトル1 {x, y}
 * @param {Object} v2 - ベクトル2 {x, y}
 * @returns {number} 外積のz成分
 */
export function crossProduct(v1, v2) {
  return v1.x * v2.y - v1.y * v2.x;
}

/**
 * ベクトルの長さを計算
 * @param {Object} v - ベクトル {x, y}
 * @returns {number} ベクトルの長さ
 */
export function vectorLength(v) {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/**
 * ベクトルを正規化（単位ベクトル化）
 * @param {Object} v - ベクトル {x, y}
 * @returns {Object} 正規化されたベクトル {x, y}
 */
export function normalizeVector(v) {
  const len = vectorLength(v);
  if (len === 0) return { x: 0, y: 0 };
  return {
    x: v.x / len,
    y: v.y / len
  };
}

/**
 * 2つのベクトルの角度を計算
 * @param {Object} v1 - ベクトル1 {x, y}
 * @param {Object} v2 - ベクトル2 {x, y}
 * @returns {number} 角度（ラジアン、0 から π）
 */
export function angleBetweenVectors(v1, v2) {
  const dot = dotProduct(v1, v2);
  const len1 = vectorLength(v1);
  const len2 = vectorLength(v2);
  if (len1 === 0 || len2 === 0) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / (len1 * len2))));
}

/**
 * 点が線分に対してどちら側にあるかを判定
 * @param {Object} point - 判定する点 {x, y}
 * @param {Object} line - 線分 {x1, y1, x2, y2}
 * @returns {number} 正: 左側, 負: 右側, 0: 線上
 */
export function pointSide(point, line) {
  const { x1, y1, x2, y2 } = line;
  return (x2 - x1) * (point.y - y1) - (y2 - y1) * (point.x - x1);
}
