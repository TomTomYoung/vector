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

  handleDblClick(event) {
    // ダブルクリックで完成
    event.preventDefault();
    this.finishSpline();
    this.updatePanel();
  }

  updatePreview(previewPoint) {
    this.drawSpline([...this.points, previewPoint], true);
  }

  updateSpline() {
    this.drawSpline(this.points, false);
  }

  drawSpline(points, preview) {
    this.currentSpline?.remove();
    this.currentSpline = this.draw("spline", {points});
    if (!this.currentSpline) return;
    window.SvgUtils.setAttributes(this.currentSpline, {
      stroke: this.currentStyle.stroke, "stroke-width": this.currentStyle.strokeWidth,
      fill: "none", opacity: this.currentStyle.opacity, "stroke-dasharray": preview ? "3,3" : null,
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

    // Commit the clicked points, even if the last move drew a rubber-band preview.
    this.updateSpline();
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
