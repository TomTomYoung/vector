// BaseTool.js
// 全ツールの基底クラス
//
// 【依存関係】
// - StyleUtils (window.StyleUtils): スタイル管理ユーティリティ（推奨）
// - SvgUtils (window.SvgUtils): SVG要素操作ユーティリティ（推奨）
//
// 【使用する外部関数】
// - StyleUtils.applyStyle(element, style): 要素にスタイル適用（推奨）
// - SvgUtils.createElement(tagName, attributes): SVG要素作成（推奨）

class BaseTool {
  constructor(canvas, toolManager) {
    this.canvas = canvas;
    this.toolManager = toolManager;
    this.svgNS = "http://www.w3.org/2000/svg";
    this.isActive = false;
    this.startPoint = { x: 0, y: 0 };
    this.currentPoint = { x: 0, y: 0 };
    this.isDrawing = false;
    this.drawingObject = null;
  }

  // ツール名（オーバーライド用）
  getTitle() {
    return "基本ツール";
  }

  // 操作説明（オーバーライド用）
  // 配列で複数の操作を返す。動的に変更される場合は都度計算
  getInstructions() {
    return [];
  }

  // ツール固有のプロパティ定義（オーバーライド用）
  // 各プロパティは { type, label, value, onChange, ... } の形式
  getToolProperties() {
    return [];
  }

  // 共通プロパティが変更された時のコールバック（オーバーライド用）
  onCommonPropertiesChanged(properties) {
    // サブクラスで必要に応じて実装
  }

  // ツール有効化
  activate() {
    this.isActive = true;
    console.log(`${this.getTitle()} activated`);
  }

  // ツール無効化
  deactivate() {
    this.isActive = false;
    this.isDrawing = false;
    this.drawingObject = null;
    console.log(`${this.getTitle()} deactivated`);
  }

  // キャンセル操作
  cancel() {
    if (this.drawingObject && this.drawingObject.parentNode) {
      this.drawingObject.parentNode.removeChild(this.drawingObject);
    }
    this.drawingObject = null;
    this.isDrawing = false;
  }

  // 共通の状態保存
  saveState() {
    if (window.saveState) {
      window.saveState();
    }
  }

  // マウス位置をSVG座標で取得（スナップ対応）
  getMousePosition(event, enableSnap = true) {
    const point = this.toolManager.getMousePosition(event);

    // スナップマネージャーが有効な場合はスナップ処理
    if (enableSnap && window.snapManager) {
      return window.snapManager.snapPoint(point, this.drawingObject);
    }

    // グリッドスナップ
    if (window.snapToGrid) {
      return this.toolManager.snapToGrid(point);
    }

    return point;
  }

  // 現在のスタイルを取得（ToolPropertiesPanel から）
  get currentStyle() {
    if (window.toolPropertiesPanel) {
      const props = window.toolPropertiesPanel.getCommonProperties();
      return {
        fill: props.fillEnabled ? props.fillColor : "none",
        stroke: props.strokeColor,
        strokeWidth: props.strokeWidth,
        strokeStyle: props.strokeStyle,
        opacity: "1",
      };
    }

    // フォールバック（旧UIコンポーネント）
    return {
      fill: document.getElementById("fill-color")?.value || "#ffffff",
      stroke: document.getElementById("stroke-color")?.value || "#000000",
      strokeWidth: document.getElementById("stroke-width")?.value || "2",
      opacity: document.getElementById("opacity-input")?.value || "1",
    };
  }

  // 共通のマウスイベントハンドラー（サブクラスでオーバーライド）
  handleMouseDown(event) {
    if (!this.isActive) return;

    // マウス位置を取得
    const point = this.toolManager.getMousePosition(event);
    this.startPoint = { ...point };
    this.currentPoint = { ...point };
  }

  handleMouseMove(event) {
    if (!this.isActive) return;

    // マウス位置を更新
    this.currentPoint = this.toolManager.getMousePosition(event);

    // スナップ有効時はグリッドに合わせる
    if (window.snapToGrid) {
      this.currentPoint = this.toolManager.snapToGrid(this.currentPoint);
    }
  }

  handleMouseUp(event) {
    if (!this.isActive) return;

    this.isDrawing = false;
    this.drawingObject = null;
  }

  handleMouseLeave(event) {
    this.handleMouseUp(event);
  }

  handleDblClick(event) {
    // サブクラスでオーバーライド
  }

  handleKeyDown(event) {
    // サブクラスでオーバーライド
  }

  // 共通のスタイル属性設定
  applyDefaultAttributes(element) {
    if (!element) return;

    const style = this.currentStyle;

    element.setAttribute("fill", style.fill);
    element.setAttribute("stroke", style.stroke);
    element.setAttribute("stroke-width", style.strokeWidth);
    element.setAttribute("opacity", style.opacity || "1");

    // 線スタイル（破線など）
    if (style.strokeStyle) {
      const dashArrays = {
        solid: "none",
        dashed: "10,5",
        dotted: "2,3",
      };
      element.setAttribute(
        "stroke-dasharray",
        dashArrays[style.strokeStyle] || "none"
      );
    }

    // レイヤー情報を設定
    if (window.currentLayerId) {
      element.setAttribute("data-layer", window.currentLayerId);
    }
  }
}

// グローバルに公開
window.BaseTool = BaseTool;
