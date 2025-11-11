// LineTool.js
// 直線描画ツール
class LineTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.startPoint = null;
    this.currentLine = null;
    this.isDrawing = false;
  }

  getTitle() {
    return "直線";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
  }

  deactivate() {
    super.deactivate();
    if (this.currentLine) {
      this.canvas.removeChild(this.currentLine);
      this.currentLine = null;
    }
    this.startPoint = null;
    this.isDrawing = false;
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (!this.isDrawing) {
      // 開始点を設定
      this.startPoint = this.getMousePosition(event);
      this.isDrawing = true;

      // プレビュー用の線を作成
      this.currentLine = document.createElementNS(this.svgNS, "line");
      this.currentLine.setAttribute("x1", this.startPoint.x);
      this.currentLine.setAttribute("y1", this.startPoint.y);
      this.currentLine.setAttribute("x2", this.startPoint.x);
      this.currentLine.setAttribute("y2", this.startPoint.y);
      this.currentLine.setAttribute("stroke", this.currentStyle.stroke);
      this.currentLine.setAttribute("stroke-width", this.currentStyle.strokeWidth);
      this.currentLine.setAttribute("fill", "none");
      this.currentLine.setAttribute("opacity", this.currentStyle.opacity);
      this.currentLine.setAttribute("data-layer", window.currentLayerId);

      this.canvas.appendChild(this.currentLine);
    } else {
      // 終了点を設定して確定
      this.finishLine();
    }
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    if (this.isDrawing && this.currentLine) {
      const currentPoint = this.getMousePosition(event);

      // 直交モードの処理
      let endX = currentPoint.x;
      let endY = currentPoint.y;

      if (window.orthoMode) {
        const dx = Math.abs(endX - this.startPoint.x);
        const dy = Math.abs(endY - this.startPoint.y);

        // 水平または垂直に拘束
        if (dx > dy) {
          endY = this.startPoint.y; // 水平
        } else {
          endX = this.startPoint.x; // 垂直
        }
      }

      this.currentLine.setAttribute("x2", endX);
      this.currentLine.setAttribute("y2", endY);
    }
  }

  finishLine() {
    if (!this.currentLine) return;

    // 状態を保存
    this.saveState();

    // 線を確定（既にキャンバスに追加されている）
    this.currentLine = null;
    this.startPoint = null;
    this.isDrawing = false;
  }

  handleKeyDown(event) {
    // Escapeキーでキャンセル
    if (event.key === "Escape" && this.isDrawing) {
      if (this.currentLine) {
        this.canvas.removeChild(this.currentLine);
        this.currentLine = null;
      }
      this.startPoint = null;
      this.isDrawing = false;
    }
  }
}

window.LineTool = LineTool;
