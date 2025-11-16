// SplineTool.js
// スプライン曲線描画ツール（Catmull-Rom スプライン）
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
//
// 【使用する外部関数】
// - SvgUtils.createElement(): SVG要素作成

class SplineTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.points = [];
    this.currentSpline = null;
    this.isDrawing = false;
    this.previewPoints = [];
  }

  getTitle() {
    return "スプライン";
  }

  getInstructions() {
    if (!this.isDrawing || this.points.length === 0) {
      return [
        "左クリック: スプラインの制御点を追加",
        "点を2つ以上置いたらマウス移動でプレビュー",
        "Enterまたはダブルクリック: スプラインを確定",
        "Esc: 描画中のスプラインをキャンセル",
      ];
    }

    return [
      `現在の制御点数: ${this.points.length}`,
      "マウス移動: 次の制御点位置をプレビュー",
      "左クリック: 制御点を追加",
      "Enterまたはダブルクリック: スプラインを確定",
      "Esc: 描画中のスプラインをキャンセル",
    ];
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.updatePanel();
  }

  deactivate() {
    super.deactivate();
    this.finishSpline();
    this.updatePanel();
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);
    const point = this.getMousePosition(event);

    if (!this.isDrawing) {
      this.isDrawing = true;
    }

    this.points.push(point);
    this.updateSpline();
    this.updatePanel();
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
    this.finishSpline();
    this.updatePanel();
  }

  updatePreview(previewPoint) {
    if (this.currentSpline) {
      this.canvas.removeChild(this.currentSpline);
    }

    const allPoints = [...this.points, previewPoint];
    if (allPoints.length < 2) return;

    const pathData = this.generateSplinePath(allPoints);
    if (!pathData) return;

    // プレビュー用パス作成（SvgUtils.createElement を使用）
    this.currentSpline = window.SvgUtils.createElement("path", {
      d: pathData,
      stroke: this.currentStyle.stroke,
      "stroke-width": this.currentStyle.strokeWidth,
      fill: "none",
      opacity: this.currentStyle.opacity,
      "stroke-dasharray": "3,3"
    });
    this.canvas.appendChild(this.currentSpline);
  }

  updateSpline() {
    if (this.currentSpline) {
      this.canvas.removeChild(this.currentSpline);
    }

    if (this.points.length < 2) return;

    const pathData = this.generateSplinePath(this.points);
    if (!pathData) return;

    // スプラインパス作成（SvgUtils.createElement を使用）
    this.currentSpline = window.SvgUtils.createElement("path", {
      d: pathData,
      stroke: this.currentStyle.stroke,
      "stroke-width": this.currentStyle.strokeWidth,
      fill: "none",
      opacity: this.currentStyle.opacity
    });
    this.canvas.appendChild(this.currentSpline);
  }

  finishSpline() {
    if (this.points.length < 2) {
      if (this.currentSpline) {
        this.canvas.removeChild(this.currentSpline);
      }
      this.points = [];
      this.currentSpline = null;
      this.isDrawing = false;
      return;
    }

    // 状態を保存
    this.saveState();

    // スプラインを確定
    if (this.currentSpline) {
      this.currentSpline.setAttribute("data-layer", window.currentLayerId);
      this.currentSpline.setAttribute("data-spline-tool", "true");
      this.currentSpline.removeAttribute("stroke-dasharray");
    }

    this.points = [];
    this.currentSpline = null;
    this.isDrawing = false;

    this.updatePanel();
  }

  generateSplinePath(points) {
    if (points.length < 2) return null;

    if (points.length === 2) {
      // 2点の場合は直線
      return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
    }

    // Catmull-Rom スプライン
    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1] : points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = i < points.length - 2 ? points[i + 2] : points[i + 1];

      // Catmull-Rom スプラインの制御点を計算
      const tension = 0.5; // 張力（0.5が標準的）

      const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
      const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
      const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
      const cp2y = p2.y - (p3.y - p1.y) * tension / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return path;
  }

  handleKeyDown(event) {
    // Escapeキーでキャンセル
    if (event.key === "Escape") {
      if (this.currentSpline) {
        this.canvas.removeChild(this.currentSpline);
      }
      this.points = [];
      this.currentSpline = null;
      this.isDrawing = false;
      this.updatePanel();
    }

    // Enterキーで完成
    if (event.key === "Enter" && this.isDrawing) {
      this.finishSpline();
      this.updatePanel();
    }
  }
}

window.SplineTool = SplineTool;
