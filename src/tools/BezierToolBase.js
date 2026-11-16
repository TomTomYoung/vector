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
    this.inputPresetVersion = 1;
    this.inputPresetInstructions = '必要数までクリックして確定します。点数がそろった下書きはEnterで確定、Backspaceで末尾点を削除、Escで取消できます。';
    this.implementationError = '';
    this.draftHandles = null;
  }

  get inputPresetName() { return this.method === 'bezierN' ? 'nthBezier' : this.method; }

  exportInputPreset() {
    return window.VectorUtils.parseConstructionDraft(this.inputPresetName,{version:1,input:{points:this.points,
      ...(this.inputPresetName==='nthBezier'?{degree:this.degree}:{})}});
  }

  restoreInputPreset(entry) {
    const {input}=window.VectorUtils.parseConstructionDraft(this.inputPresetName,entry);
    if(!this.isActive)throw Error('復元する作図ツールを先に選択してください。');
    this.resetDrawing();this.points=input.points;
    if(this.inputPresetName==='nthBezier')this.degree=input.degree;
    this.updatePreview();
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

  onImplementationChanged() { this.updatePreview(); }

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
    if(!this.isActive || event.button!==0)return;
    if(this.points.length>=this.getRequiredPoints()){this.commitCurve();return;}
    super.handleMouseDown(event);
    const point = this.getMousePosition(event);
    this.points.push(point);

    if (this.points.length >= this.getRequiredPoints()) {
      this.commitCurve();
    } else {
      this.updatePreview(point);
    }
    this.requestToolPanelRefresh();
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
    if(!this.isActive)return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelDrawing();
    }
    if(event.key==='Backspace'){event.preventDefault();this.points.pop();this.updatePreview();}
    if(event.key==='Enter'){event.preventDefault();this.commitCurve();}
    this.requestToolPanelRefresh();
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
    this.implementationError = '';
    this.draftHandles?.remove();
    this.draftHandles = window.SvgUtils.createElement('g',{'data-tool-layer':'construction-handles','pointer-events':'none'});
    this.points.forEach(p=>this.draftHandles.appendChild(window.SvgUtils.createCircle(p.x,p.y,3,{fill:'#fff',stroke:'#2673c7'})));
    this.canvas.appendChild(this.draftHandles);

    const targetPoints = pointerPoint
      ? [...this.points, pointerPoint]
      : [...this.points];

    if (targetPoints.length < 2) {
      return;
    }

    try { this.previewElement = this.drawCurve(targetPoints, true); }
    catch(error){this.implementationError=error.message;return;}
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
    let element;
    this.implementationError='';
    try { element = this.drawCurve(this.points); }
    catch(error){this.implementationError=error.message;this.requestToolPanelRefresh();return;}
    if (!element) {
      this.implementationError='確定に必要な点が不足しているか、選択した実装では作図できません。';
      this.requestToolPanelRefresh();
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
    this.implementationError = '';
    this.draftHandles?.remove();this.draftHandles=null;
    if (this.previewElement) {
      window.SvgUtils.removeElement(this.previewElement);
      this.previewElement = null;
    }
  }
}

window.BezierToolBase = BezierToolBase;
