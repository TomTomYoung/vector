// BezierToolBase.js
// ベジェ曲線ツールの共通処理

class BezierToolBase extends BaseTool {
  constructor(canvas, toolManager, options = {}) {
    super(canvas, toolManager);
    this.points = [];
    this.previewElement = null;
    this.method = options.method || 'quadraticBezier';
    this.title = options.title || 'ベジェ';
    this.instructions = options.instructions || null;
    this.options = options;
    this.toolAttribute = options.toolAttribute || 'data-bezier-tool';
  }

  getTitle() {
    return this.title;
  }

  getInstructions() {
    if (Array.isArray(this.instructions)) {
      return this.instructions;
    }
    return [
      'クリックで制御点を追加',
      `必要制御点: ${this.getRequiredPoints()}個`,
      '必要数の点を配置すると確定',
      'Escでキャンセル',
    ];
  }

  getRequiredPoints() {
    return this.options.requiredPoints || 3;
  }

  getBezierParams() {
    if (typeof this.options.getBezierParams === 'function') {
      return this.options.getBezierParams();
    }
    return this.options.bezierParams || {};
  }

  requestToolPanelRefresh() {
    if (
      window.toolPropertiesPanel &&
      window.toolPropertiesPanel.currentTool === this
    ) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = 'crosshair';
  }

  deactivate() {
    super.deactivate();
    this.resetDrawing();
    this.canvas.style.cursor = '';
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);
    const point = this.getMousePosition(event);
    this.points.push(point);

    if (this.points.length >= this.getRequiredPoints()) {
      this.commitCurve();
    } else {
      this.updatePreview(point);
    }
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);
    if (!this.isActive || this.points.length === 0) {
      return;
    }
    const point = this.getMousePosition(event);
    this.updatePreview(point);
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') {
      this.cancelDrawing();
    }
  }

  handleDblClick(event) {
    event.preventDefault();
    if (this.points.length > 1) {
      this.commitCurve();
    }
  }

  drawCurve(points, allowPartial = false) {
    if (!allowPartial && points.length < this.getRequiredPoints()) return null;
    const name = this.method === "bezierN" ? "nthBezier" : this.method;
    const params = this.getBezierParams();
    const degree = allowPartial && params.degree ? Math.min(params.degree, points.length - 1) : params.degree;
    return this.draw(name, {points, degree}, null, params);
  }

  updatePreview(pointerPoint = null) {
    if (this.previewElement) {
      window.SvgUtils.removeElement(this.previewElement);
      this.previewElement = null;
    }

    const targetPoints = pointerPoint
      ? [...this.points, pointerPoint]
      : [...this.points];

    if (targetPoints.length < 2) {
      return;
    }

    this.previewElement = this.drawCurve(targetPoints, true);
    if (!this.previewElement) return;
    window.SvgUtils.setAttributes(this.previewElement, {
      stroke: this.currentStyle.stroke,
      'stroke-width': this.currentStyle.strokeWidth,
      fill: 'none',
      'stroke-dasharray': '4,4',
      opacity: this.currentStyle.opacity,
    });
    this.canvas.appendChild(this.previewElement);
  }

  commitCurve() {
    const element = this.drawCurve(this.points);
    if (!element) {
      this.resetDrawing();
      return;
    }

    this.applyDefaultAttributes(element);
    if (this.toolAttribute) {
      element.setAttribute(this.toolAttribute, 'true');
    }
    this.canvas.appendChild(element);
    this.saveState();
    this.resetDrawing();
  }

  cancelDrawing() {
    this.resetDrawing();
  }

  resetDrawing() {
    this.points = [];
    if (this.previewElement) {
      window.SvgUtils.removeElement(this.previewElement);
      this.previewElement = null;
    }
  }
}

window.BezierToolBase = BezierToolBase;
