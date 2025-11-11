// PolylineTool.js
// ポリライン（連続線分）描画ツール
class PolylineTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.points = [];
    this.currentPolyline = null;
    this.previewLine = null;
    this.isDrawing = false;
  }

  getTitle() {
    return "ポリライン";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
  }

  deactivate() {
    super.deactivate();
    this.finishPolyline();
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);
    const point = this.getMousePosition(event);

    if (!this.isDrawing) {
      // 開始
      this.isDrawing = true;
      this.points = [point];
      this.createPolyline();
    } else {
      // 頂点を追加
      this.points.push(point);
      this.updatePolyline();
    }
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    if (this.isDrawing && this.points.length > 0) {
      const point = this.getMousePosition(event);
      this.updatePreview(point);
    }
  }

  handleDoubleClick(event) {
    // ダブルクリックで完成
    event.preventDefault();
    if (this.isDrawing && this.points.length > 1) {
      // 最後の点（ダブルクリックで追加された点）を削除
      this.points.pop();
      this.finishPolyline();
    }
  }

  createPolyline() {
    if (this.currentPolyline) {
      this.canvas.removeChild(this.currentPolyline);
    }

    this.currentPolyline = document.createElementNS(this.svgNS, "polyline");
    this.currentPolyline.setAttribute("stroke", this.currentStyle.stroke);
    this.currentPolyline.setAttribute(
      "stroke-width",
      this.currentStyle.strokeWidth
    );
    this.currentPolyline.setAttribute("fill", "none");
    this.currentPolyline.setAttribute("opacity", this.currentStyle.opacity);
    this.canvas.appendChild(this.currentPolyline);
  }

  updatePolyline() {
    if (!this.currentPolyline) return;

    const pointsStr = this.points.map((p) => `${p.x},${p.y}`).join(" ");
    this.currentPolyline.setAttribute("points", pointsStr);
  }

  updatePreview(previewPoint) {
    if (this.points.length === 0) return;

    // プレビュー線を更新
    if (!this.previewLine) {
      this.previewLine = document.createElementNS(this.svgNS, "line");
      this.previewLine.setAttribute("stroke", "#999");
      this.previewLine.setAttribute("stroke-width", "1");
      this.previewLine.setAttribute("stroke-dasharray", "5,5");
      this.canvas.appendChild(this.previewLine);
    }

    const lastPoint = this.points[this.points.length - 1];

    // 直交モード対応
    let endX = previewPoint.x;
    let endY = previewPoint.y;

    if (window.orthoMode) {
      const dx = Math.abs(endX - lastPoint.x);
      const dy = Math.abs(endY - lastPoint.y);

      if (dx > dy) {
        endY = lastPoint.y; // 水平
      } else {
        endX = lastPoint.x; // 垂直
      }
    }

    this.previewLine.setAttribute("x1", lastPoint.x);
    this.previewLine.setAttribute("y1", lastPoint.y);
    this.previewLine.setAttribute("x2", endX);
    this.previewLine.setAttribute("y2", endY);
  }

  finishPolyline() {
    if (this.points.length < 2) {
      // 点が1つ以下の場合はキャンセル
      if (this.currentPolyline) {
        this.canvas.removeChild(this.currentPolyline);
      }
    } else {
      // 状態を保存
      this.saveState();

      // ポリラインを確定
      if (this.currentPolyline) {
        this.currentPolyline.setAttribute("data-layer", window.currentLayerId);
      }
    }

    // プレビュー線を削除
    if (this.previewLine) {
      this.canvas.removeChild(this.previewLine);
      this.previewLine = null;
    }

    this.points = [];
    this.currentPolyline = null;
    this.isDrawing = false;
  }

  handleKeyDown(event) {
    // Escapeキーでキャンセル
    if (event.key === "Escape") {
      if (this.currentPolyline) {
        this.canvas.removeChild(this.currentPolyline);
      }
      if (this.previewLine) {
        this.canvas.removeChild(this.previewLine);
        this.previewLine = null;
      }
      this.points = [];
      this.currentPolyline = null;
      this.isDrawing = false;
    }

    // Enterキーで完成
    if (event.key === "Enter" && this.isDrawing) {
      this.finishPolyline();
    }

    // Backspaceで最後の点を削除
    if (event.key === "Backspace" && this.isDrawing && this.points.length > 1) {
      event.preventDefault();
      this.points.pop();
      this.updatePolyline();
    }
  }
}

window.PolylineTool = PolylineTool;
