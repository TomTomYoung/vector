/**
 * ============================================================
 * SVG要素操作ユーティリティ
 * ============================================================
 *
 * 【目的】
 * SVG要素の作成・操作の共通処理を提供
 *
 * 【依存関係】
 * - 外部依存: なし
 * - グローバル変数: 使用しない（svgNS定数は内部定義）
 *
 * 【入力】
 * - tagName: string (SVG要素名: 'line', 'circle', 'rect', etc.)
 * - attributes: Object (属性の key-value ペア)
 * - element: SVGElement
 *
 * 【出力】
 * - SVGElement
 * - 変換行列
 * - パス情報
 *
 * 【エクスポート関数】
 * - createElement(tagName, attributes): SVG要素作成
 * - setAttributes(element, attributes): 属性一括設定
 * - getAttributes(element, attributeNames): 属性一括取得
 * - getTransformMatrix(element): 変換行列取得
 * - applyTransform(element, matrix): 変換行列適用
 * - getBBox(element): バウンディングボックス取得
 * - cloneElement(element): 要素のクローン
 * - parsePathData(pathString): パスデータの解析
 * - createPath(commands): パス文字列の生成
 *
 * 【使用例】
 * import { createElement, setAttributes } from './svg.js';
 *
 * const line = createElement('line', {
 *   x1: 0, y1: 0, x2: 100, y2: 100,
 *   stroke: 'black', 'stroke-width': 2
 * });
 *
 * document.getElementById('canvas').appendChild(line);
 *
 * 【変更履歴】
 * - 2025-11-16: 初版作成（各ツールファイルから重複コードを抽出）
 */

/** SVG名前空間 */
export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * SVG要素を作成
 * @param {string} tagName - 要素名 ('line', 'circle', 'rect', 'path', など)
 * @param {Object} attributes - 属性のオブジェクト（省略可）
 * @returns {SVGElement} 作成されたSVG要素
 */
export function createElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  setAttributes(element, attributes);
  return element;
}

/**
 * 要素に属性を一括設定
 * @param {SVGElement} element - SVG要素
 * @param {Object} attributes - 属性のオブジェクト
 * @returns {SVGElement} 属性が設定された要素（チェーン可能）
 */
export function setAttributes(element, attributes) {
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== null && value !== undefined) {
      element.setAttribute(key, String(value));
    }
  }
  return element;
}

/**
 * 要素から属性を一括取得
 * @param {SVGElement} element - SVG要素
 * @param {string[]} attributeNames - 取得する属性名の配列
 * @returns {Object} 属性のオブジェクト
 */
export function getAttributes(element, attributeNames) {
  const attributes = {};
  for (const name of attributeNames) {
    const value = element.getAttribute(name);
    if (value !== null) {
      attributes[name] = value;
    }
  }
  return attributes;
}

/**
 * 要素の変換行列を取得
 * @param {SVGElement} element - SVG要素
 * @returns {SVGMatrix} 変換行列
 */
export function getTransformMatrix(element) {
  if (!element.transform || !element.transform.baseVal) {
    // transformプロパティがない要素の場合は単位行列
    return element.ownerSVGElement.createSVGMatrix();
  }

  const transform = element.transform.baseVal.consolidate();
  return transform ? transform.matrix : element.ownerSVGElement.createSVGMatrix();
}

/**
 * 要素に変換行列を適用
 * @param {SVGElement} element - SVG要素
 * @param {SVGMatrix} matrix - 変換行列
 * @returns {SVGElement} 変換が適用された要素（チェーン可能）
 */
export function applyTransform(element, matrix) {
  const svg = element.ownerSVGElement;
  const transform = svg.createSVGTransform();
  transform.setMatrix(matrix);
  element.transform.baseVal.initialize(transform);
  return element;
}

/**
 * 要素のバウンディングボックスを取得
 * @param {SVGElement} element - SVG要素
 * @returns {Object} バウンディングボックス {x, y, width, height}
 */
export function getBBox(element) {
  try {
    const bbox = element.getBBox();
    return {
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height
    };
  } catch (e) {
    // getBBoxが失敗した場合（非表示要素など）
    return { x: 0, y: 0, width: 0, height: 0 };
  }
}

/**
 * 要素を複製
 * @param {SVGElement} element - SVG要素
 * @param {boolean} deep - 子要素も複製するか（デフォルト: true）
 * @returns {SVGElement} 複製された要素
 */
export function cloneElement(element, deep = true) {
  return element.cloneNode(deep);
}

/**
 * パスデータを解析
 * パス文字列 (d属性) をコマンドと座標の配列に変換
 * @param {string} pathString - パス文字列 (例: "M 10 10 L 20 20")
 * @returns {Array} コマンドオブジェクトの配列 [{command: 'M', params: [10, 10]}, ...]
 */
export function parsePathData(pathString) {
  if (!pathString) return [];

  const commands = [];
  // SVGパスコマンド: M, L, H, V, C, S, Q, T, A, Z
  const regex = /([MLHVCSQTAZ])([^MLHVCSQTAZ]*)/gi;
  let match;

  while ((match = regex.exec(pathString)) !== null) {
    const command = match[1];
    const paramString = match[2].trim();

    if (paramString === '' && command.toUpperCase() === 'Z') {
      // Zコマンドはパラメータなし
      commands.push({ command, params: [] });
    } else if (paramString !== '') {
      const params = paramString
        .split(/[\s,]+/)
        .filter(p => p !== '')
        .map(parseFloat);
      commands.push({ command, params });
    }
  }

  return commands;
}

/**
 * パスコマンドからパス文字列を生成
 * @param {Array} commands - コマンドオブジェクトの配列
 * @returns {string} パス文字列
 */
export function createPath(commands) {
  return commands
    .map(cmd => `${cmd.command} ${cmd.params.join(' ')}`)
    .join(' ');
}

/**
 * 線分要素を作成（便利メソッド）
 * @param {number} x1 - 始点X
 * @param {number} y1 - 始点Y
 * @param {number} x2 - 終点X
 * @param {number} y2 - 終点Y
 * @param {Object} attributes - 追加属性
 * @returns {SVGLineElement} 線分要素
 */
export function createLine(x1, y1, x2, y2, attributes = {}) {
  return createElement('line', {
    x1, y1, x2, y2,
    ...attributes
  });
}

/**
 * 円要素を作成（便利メソッド）
 * @param {number} cx - 中心X
 * @param {number} cy - 中心Y
 * @param {number} r - 半径
 * @param {Object} attributes - 追加属性
 * @returns {SVGCircleElement} 円要素
 */
export function createCircle(cx, cy, r, attributes = {}) {
  return createElement('circle', {
    cx, cy, r,
    ...attributes
  });
}

/**
 * 矩形要素を作成（便利メソッド）
 * @param {number} x - 左上X
 * @param {number} y - 左上Y
 * @param {number} width - 幅
 * @param {number} height - 高さ
 * @param {Object} attributes - 追加属性
 * @returns {SVGRectElement} 矩形要素
 */
export function createRect(x, y, width, height, attributes = {}) {
  return createElement('rect', {
    x, y, width, height,
    ...attributes
  });
}

/**
 * テキスト要素を作成（便利メソッド）
 * @param {number} x - X座標
 * @param {number} y - Y座標
 * @param {string} text - テキスト内容
 * @param {Object} attributes - 追加属性
 * @returns {SVGTextElement} テキスト要素
 */
export function createText(x, y, text, attributes = {}) {
  const element = createElement('text', { x, y, ...attributes });
  element.textContent = text;
  return element;
}

/**
 * グループ要素を作成（便利メソッド）
 * @param {SVGElement[]} children - 子要素の配列
 * @param {Object} attributes - 追加属性
 * @returns {SVGGElement} グループ要素
 */
export function createGroup(children = [], attributes = {}) {
  const group = createElement('g', attributes);
  children.forEach(child => group.appendChild(child));
  return group;
}

/**
 * 要素を削除
 * @param {SVGElement} element - 削除する要素
 */
export function removeElement(element) {
  if (element && element.parentNode) {
    element.parentNode.removeChild(element);
  }
}

/**
 * 要素のスタイルプロパティを取得
 * @param {SVGElement} element - SVG要素
 * @returns {Object} スタイル情報
 */
export function getElementStyle(element) {
  return {
    fill: element.getAttribute('fill') || 'none',
    stroke: element.getAttribute('stroke') || 'none',
    strokeWidth: parseFloat(element.getAttribute('stroke-width') || '1'),
    strokeDasharray: element.getAttribute('stroke-dasharray') || 'none',
    opacity: parseFloat(element.getAttribute('opacity') || '1')
  };
}
