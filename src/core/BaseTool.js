// BaseTool.js
// 全ツールの基底クラス
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

  // 現在のスタイルを取得
  get currentStyle() {
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

    const fillColor = document.getElementById("fill-color")?.value || "#ffffff";
    const strokeColor =
      document.getElementById("stroke-color")?.value || "#000000";
    const strokeWidth = document.getElementById("stroke-width")?.value || "2";
    const opacity = document.getElementById("opacity-input")?.value || "1";

    element.setAttribute("fill", fillColor);
    element.setAttribute("stroke", strokeColor);
    element.setAttribute("stroke-width", strokeWidth);
    element.setAttribute("opacity", opacity);

    // レイヤー情報を設定
    if (window.currentLayerId) {
      element.setAttribute("data-layer", window.currentLayerId);
    }
  }
}

// グローバルに公開
window.BaseTool = BaseTool;
