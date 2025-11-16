// PolylineTool.js
// ポリライン（連続線分）描画ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - CoordinatesUtils (window.CoordinatesUtils): 座標スナップ
//
// 【使用する外部関数】
// - SvgUtils.createElement(), createLine(): SVG要素作成
// - CoordinatesUtils.snapToOrtho(): 直交スナップ

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

    // SvgUtils.createElement を使用
    this.currentPolyline = window.SvgUtils.createElement("polyline", {
      stroke: this.currentStyle.stroke,
      "stroke-width": this.currentStyle.strokeWidth,
      fill: "none",
      opacity: this.currentStyle.opacity
    });
    this.canvas.appendChild(this.currentPolyline);
  }

  updatePolyline() {
    if (!this.currentPolyline) return;

    const pointsStr = this.points.map((p) => `${p.x},${p.y}`).join(" ");
    this.currentPolyline.setAttribute("points", pointsStr);
  }

  updatePreview(previewPoint) {
    if (this.points.length === 0) return;

    // プレビュー線を更新（SvgUtils.createLine を使用）
    if (!this.previewLine) {
      this.previewLine = window.SvgUtils.createLine(0, 0, 0, 0, {
        stroke: "#999",
        "stroke-width": "1",
        "stroke-dasharray": "5,5"
      });
      this.canvas.appendChild(this.previewLine);
    }

    const lastPoint = this.points[this.points.length - 1];

    // 直交モード対応（CoordinatesUtils.snapToOrtho を使用）
    let endPoint = previewPoint;
    if (window.orthoMode) {
      endPoint = window.CoordinatesUtils.snapToOrtho(lastPoint, previewPoint);
    }

    this.previewLine.setAttribute("x1", lastPoint.x);
    this.previewLine.setAttribute("y1", lastPoint.y);
    this.previewLine.setAttribute("x2", endPoint.x);
    this.previewLine.setAttribute("y2", endPoint.y);
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
