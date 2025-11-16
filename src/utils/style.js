/**
 * ============================================================
 * スタイル管理ユーティリティ
 * ============================================================
 *
 * 【目的】
 * 描画スタイルの正規化、適用、管理を行う純粋関数を提供
 *
 * 【依存関係】
 * - 外部依存: なし
 * - グローバル変数: 使用しない
 *
 * 【入力】
 * - element: SVGElement
 * - style: StyleObject {stroke, fill, strokeWidth, etc.}
 *
 * 【出力】
 * - 正規化されたスタイルオブジェクト
 * - スタイルが適用されたSVGElement
 *
 * 【型定義】
 * type StyleObject = {
 *   stroke?: string,          // 線の色 (例: '#000000', 'red')
 *   fill?: string,            // 塗りの色 (例: '#ffffff', 'none')
 *   strokeWidth?: number,     // 線の幅
 *   strokeDasharray?: string, // 破線パターン (例: '5,5', 'none')
 *   strokeLinecap?: string,   // 線の端の形状 ('butt', 'round', 'square')
 *   strokeLinejoin?: string,  // 線の接合形状 ('miter', 'round', 'bevel')
 *   opacity?: number          // 不透明度 (0-1)
 * }
 *
 * 【エクスポート関数】
 * - normalizeStyle(style): スタイルの正規化
 * - applyStyle(element, style): 要素にスタイル適用
 * - getDefaultStyle(): デフォルトスタイル取得
 * - mergeStyles(...styles): 複数スタイルのマージ
 * - parseColor(colorString): 色文字列の解析
 * - rgbToHex(r, g, b): RGB→16進数変換
 * - hexToRgb(hex): 16進数→RGB変換
 *
 * 【使用例】
 * import { normalizeStyle, applyStyle, LINE_STYLES } from './style.js';
 *
 * const style = normalizeStyle({
 *   stroke: '#ff0000',
 *   strokeWidth: 2,
 *   strokeDasharray: LINE_STYLES.dashed
 * });
 *
 * applyStyle(lineElement, style);
 *
 * 【変更履歴】
 * - 2025-11-16: 初版作成（BaseTool.jsから抽出）
 */

/** デフォルトスタイル定義 */
const DEFAULT_STYLE = {
  stroke: '#000000',
  fill: 'none',
  strokeWidth: 2,
  strokeDasharray: 'none',
  strokeLinecap: 'butt',
  strokeLinejoin: 'miter',
  opacity: 1
};

/**
 * 線スタイルのプリセット
 * よく使用される破線パターンを定義
 */
export const LINE_STYLES = {
  solid: 'none',
  dashed: '10,5',
  dotted: '2,3',
  dashDot: '10,5,2,5',
  dashDotDot: '10,5,2,5,2,5'
};

/**
 * 線の端の形状プリセット
 */
export const LINE_CAPS = {
  butt: 'butt',     // 端がぴったり
  round: 'round',   // 丸い
  square: 'square'  // 四角（線幅の半分延長）
};

/**
 * 線の接合形状プリセット
 */
export const LINE_JOINS = {
  miter: 'miter',  // 尖った接合
  round: 'round',  // 丸い接合
  bevel: 'bevel'   // 面取り接合
};

/**
 * スタイルを正規化（デフォルト値で補完）
 * @param {Object} style - スタイルオブジェクト
 * @returns {Object} 正規化されたスタイルオブジェクト
 */
export function normalizeStyle(style = {}) {
  return { ...DEFAULT_STYLE, ...style };
}

/**
 * 要素にスタイルを適用
 * @param {SVGElement} element - SVG要素
 * @param {Object} style - スタイルオブジェクト
 * @returns {SVGElement} スタイルが適用された要素（チェーン可能）
 */
export function applyStyle(element, style) {
  const normalized = normalizeStyle(style);

  // 基本スタイル
  element.setAttribute('stroke', normalized.stroke);
  element.setAttribute('fill', normalized.fill);
  element.setAttribute('stroke-width', normalized.strokeWidth);

  // 破線パターン
  if (normalized.strokeDasharray && normalized.strokeDasharray !== 'none') {
    element.setAttribute('stroke-dasharray', normalized.strokeDasharray);
  } else {
    element.removeAttribute('stroke-dasharray');
  }

  // 線の端の形状
  if (normalized.strokeLinecap && normalized.strokeLinecap !== 'butt') {
    element.setAttribute('stroke-linecap', normalized.strokeLinecap);
  }

  // 線の接合形状
  if (normalized.strokeLinejoin && normalized.strokeLinejoin !== 'miter') {
    element.setAttribute('stroke-linejoin', normalized.strokeLinejoin);
  }

  // 不透明度
  if (normalized.opacity !== 1) {
    element.setAttribute('opacity', normalized.opacity);
  }

  return element;
}

/**
 * デフォルトスタイルを取得
 * @returns {Object} デフォルトスタイルのコピー
 */
export function getDefaultStyle() {
  return { ...DEFAULT_STYLE };
}

/**
 * 複数のスタイルをマージ
 * 後のスタイルが前のスタイルを上書き
 * @param {...Object} styles - スタイルオブジェクト（可変長引数）
 * @returns {Object} マージされたスタイル
 */
export function mergeStyles(...styles) {
  return styles.reduce((merged, style) => ({ ...merged, ...style }), {});
}

/**
 * 要素からスタイルを抽出
 * @param {SVGElement} element - SVG要素
 * @returns {Object} スタイルオブジェクト
 */
export function extractStyle(element) {
  return {
    stroke: element.getAttribute('stroke') || DEFAULT_STYLE.stroke,
    fill: element.getAttribute('fill') || DEFAULT_STYLE.fill,
    strokeWidth: parseFloat(element.getAttribute('stroke-width') || DEFAULT_STYLE.strokeWidth),
    strokeDasharray: element.getAttribute('stroke-dasharray') || DEFAULT_STYLE.strokeDasharray,
    strokeLinecap: element.getAttribute('stroke-linecap') || DEFAULT_STYLE.strokeLinecap,
    strokeLinejoin: element.getAttribute('stroke-linejoin') || DEFAULT_STYLE.strokeLinejoin,
    opacity: parseFloat(element.getAttribute('opacity') || DEFAULT_STYLE.opacity)
  };
}

/**
 * 16進数カラーコードをRGBに変換
 * @param {string} hex - 16進数カラーコード (例: '#ff0000' or 'ff0000')
 * @returns {Object|null} RGB {r, g, b} (0-255) または null（不正な値の場合）
 */
export function hexToRgb(hex) {
  // #を除去
  hex = hex.replace(/^#/, '');

  // 3桁の短縮形を6桁に展開 (例: 'f00' -> 'ff0000')
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }

  if (hex.length !== 6) {
    return null;
  }

  const num = parseInt(hex, 16);
  if (isNaN(num)) {
    return null;
  }

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

/**
 * RGBを16進数カラーコードに変換
 * @param {number} r - 赤 (0-255)
 * @param {number} g - 緑 (0-255)
 * @param {number} b - 青 (0-255)
 * @returns {string} 16進数カラーコード (例: '#ff0000')
 */
export function rgbToHex(r, g, b) {
  const toHex = (n) => {
    n = Math.max(0, Math.min(255, Math.round(n)));
    return n.toString(16).padStart(2, '0');
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 色文字列を解析してRGBオブジェクトを返す
 * @param {string} colorString - 色文字列 ('#ff0000', 'rgb(255,0,0)', 'red', など)
 * @returns {Object|null} RGB {r, g, b} または null
 */
export function parseColor(colorString) {
  if (!colorString) return null;

  // 16進数形式
  if (colorString.startsWith('#')) {
    return hexToRgb(colorString);
  }

  // rgb() または rgba() 形式
  const rgbMatch = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3])
    };
  }

  // 色名を16進数に変換するためのヘルパー
  // ブラウザのcanvasを使って色名を解決
  if (typeof document !== 'undefined') {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = colorString;
    return hexToRgb(ctx.fillStyle);
  }

  return null;
}

/**
 * 2つの色をブレンド
 * @param {string} color1 - 色1（16進数）
 * @param {string} color2 - 色2（16進数）
 * @param {number} ratio - ブレンド比率（0-1、0=color1のみ、1=color2のみ）
 * @returns {string} ブレンドされた色（16進数）
 */
export function blendColors(color1, color2, ratio = 0.5) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) return color1;

  const r = rgb1.r + (rgb2.r - rgb1.r) * ratio;
  const g = rgb1.g + (rgb2.g - rgb1.g) * ratio;
  const b = rgb1.b + (rgb2.b - rgb1.b) * ratio;

  return rgbToHex(r, g, b);
}

/**
 * 色を明るく/暗くする
 * @param {string} color - 色（16進数）
 * @param {number} amount - 変更量（-100 to 100、正=明るく、負=暗く）
 * @returns {string} 調整された色（16進数）
 */
export function adjustBrightness(color, amount) {
  const rgb = hexToRgb(color);
  if (!rgb) return color;

  return rgbToHex(
    rgb.r + amount,
    rgb.g + amount,
    rgb.b + amount
  );
}

/**
 * スタイルが等しいかチェック
 * @param {Object} style1 - スタイル1
 * @param {Object} style2 - スタイル2
 * @returns {boolean} 等しい場合 true
 */
export function areStylesEqual(style1, style2) {
  const normalized1 = normalizeStyle(style1);
  const normalized2 = normalizeStyle(style2);

  return (
    normalized1.stroke === normalized2.stroke &&
    normalized1.fill === normalized2.fill &&
    normalized1.strokeWidth === normalized2.strokeWidth &&
    normalized1.strokeDasharray === normalized2.strokeDasharray &&
    normalized1.opacity === normalized2.opacity
  );
}
