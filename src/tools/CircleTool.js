// CircleTool.js
// 円描画ツール
class CircleTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
  }

  getTitle() {
    return "円";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (!this.isActive) return;

    // 状態を保存
    this.saveState();

    // 描画開始
    this.isDrawing = true;

    // 円を作成
    this.drawingObject = document.createElementNS(this.svgNS, "circle");
    this.drawingObject.setAttribute("cx", this.startPoint.x);
    this.drawingObject.setAttribute("cy", this.startPoint.y);
    this.drawingObject.setAttribute("r", 0);

    // スタイルを適用
    this.applyDefaultAttributes(this.drawingObject);

    this.canvas.appendChild(this.drawingObject);
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    if (!this.isActive || !this.isDrawing || !this.drawingObject) return;

    // 円の半径を計算
    const dx = this.currentPoint.x - this.startPoint.x;
    const dy = this.currentPoint.y - this.startPoint.y;
    const radius = Math.sqrt(dx * dx + dy * dy);

    this.drawingObject.setAttribute("r", radius);
  }

  handleMouseUp(event) {
    if (!this.isActive || !this.isDrawing) return;

    // 極端に小さい円は作成しない
    const r = parseFloat(this.drawingObject.getAttribute("r"));

    if (r < 2) {
      this.canvas.removeChild(this.drawingObject);
    } else if (window.selectTool) {
      // 作成したオブジェクトを選択状態にする
      window.selectTool.selectObject(this.drawingObject);
    }

    this.isDrawing = false;
    this.drawingObject = null;
  }
}

// グローバルに公開
window.CircleTool = CircleTool;
