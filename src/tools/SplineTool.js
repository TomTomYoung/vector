// SplineTool.js
// スプライン曲線描画ツール（Cardinal / Catmull-Rom系の接線倍率調整版）
// 係数の規約・計算とSVG描画・参照資料: ../../doc/algorithms.md#spline-convention
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
    this.tension = 0.5;
    this.inputPresetVersion = 1; this.inputPresetMode = 'parameters';
    this.inputPresetVersions = [1,2];
    this.restoredDraft = false;
    this.draftHandles = null;
    this.implementationError = '';
  }

  exportInputPreset() {return window.VectorUtils.exportConstructionParameters('spline',this);}
  exportInputDraftPreset() {return window.VectorUtils.parseCurveDraft('spline',{version:2,input:{points:this.points,tension:this.tension}});}
  inputPresetModeForEntry(entry) {return entry?.version===2?'draft':'parameters';}
  restoreInputPreset(entry) {
    if(entry?.version===2){
      const {input}=window.VectorUtils.parseCurveDraft('spline',entry);
      if(!this.isActive)throw Error('復元する作図ツールを先に選択してください。');
      this.cancelSpline();this.points=input.points;this.tension=input.tension;
      this.isDrawing=this.points.length>0;this.restoredDraft=this.isDrawing;
    } else window.VectorUtils.restoreConstructionParameters('spline',entry,this);
    this.implementationError = '';
    try {if(this.points.length)this.updateSpline();}
    catch(error) {this.implementationError=error.message;this.currentSpline=null;}
  }

  getToolProperties() {
    return [{type: 'number', label: '標準実装の接線倍率', value: this.tension, min: 0, max: 4, step: 0.1, onChange: value => {
      if (Number.isFinite(value) && value >= 0 && value <= 4) {this.tension = value; this.updateSpline();}
    }}];
  }
  onImplementationChanged() { this.updateSpline(); }

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
        "Backspace: 最後の通過点を削除",
      ];
    }

    return [
      `現在の制御点数: ${this.points.length}`,
      "マウス移動: 次の制御点位置をプレビュー",
      "左クリック: 制御点を追加",
      "Enterまたはダブルクリック: スプラインを確定",
      "Esc: 描画中のスプラインをキャンセル",
      "Backspace: 最後の通過点を削除",
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
    if(!this.restoredDraft)this.finishSpline();
    this.cancelSpline();
    this.updatePanel();
  }

  cancel() {this.cancelSpline();this.updatePanel();}

  cancelSpline() {
    this.currentSpline?.remove();this.draftHandles?.remove();
    this.currentSpline=this.drawingObject=this.draftHandles=null;
    this.points=[];this.isDrawing=false;this.restoredDraft=false;this.implementationError='';
  }

  handleMouseDown(event) {
    if(!this.isActive||event.button!==0)return;
    if(this.points.length>=1000){this.implementationError='一度に入力できる点は1000個までです。';this.updatePanel();return;}
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
    this.draftHandles?.remove();this.draftHandles=null;
    if(this.points.length){
      this.draftHandles=window.SvgUtils.createElement('g',{'data-tool-layer':'construction-handles','pointer-events':'none'});
      this.points.forEach(p=>this.draftHandles.appendChild(window.SvgUtils.createCircle(p.x,p.y,3,{fill:'#fff',stroke:'#2673c7'})));
      this.canvas.appendChild(this.draftHandles);
    }
    this.drawSpline(this.points, false);
  }

  drawSpline(points, preview) {
    this.currentSpline?.remove();
    this.currentSpline=this.drawingObject=null;this.implementationError='';
    try {this.currentSpline = this.draw("spline", {points, tension: this.tension});}
    catch(error){this.implementationError=error.message;return;}
    if (!this.currentSpline) {if(points.length>=2)this.implementationError='選択した実装ではスプラインを作図できません。';return;}
    this.drawingObject=this.currentSpline;
    window.SvgUtils.setAttributes(this.currentSpline, {
      stroke: this.currentStyle.stroke, "stroke-width": this.currentStyle.strokeWidth,
      fill: "none", opacity: this.currentStyle.opacity, "stroke-dasharray": preview ? "3,3" : null,
    });
    this.canvas.appendChild(this.currentSpline);
  }

  finishSpline() {
    if (this.points.length < 2) {
      this.implementationError='確定には通過点が2点以上必要です。';this.updatePanel();
      return;
    }

    // Commit the clicked points, even if the last move drew a rubber-band preview.
    this.updateSpline();
    if(!this.currentSpline){this.updatePanel();return;}
    this.saveState();

    // スプラインを確定
    if (this.currentSpline) {
      this.currentSpline.setAttribute("data-layer", window.currentLayerId);
      this.currentSpline.setAttribute("data-spline-tool", "true");
      this.currentSpline.removeAttribute("stroke-dasharray");
    }

    this.points = [];
    this.currentSpline = null;
    this.drawingObject = null;
    this.draftHandles?.remove();this.draftHandles=null;
    this.isDrawing = false;
    this.restoredDraft = false;

    this.updatePanel();
  }

  handleKeyDown(event) {
    if(!this.isActive)return;
    // Escapeキーでキャンセル
    if (event.key === "Escape") {
      event.preventDefault();this.cancelSpline();
      this.updatePanel();
    }

    // Enterキーで完成
    if (event.key === "Enter" && this.isDrawing) {
      event.preventDefault();
      this.finishSpline();
      this.updatePanel();
    }
    if(event.key==='Backspace'){
      event.preventDefault();this.points.pop();
      if(this.points.length)this.updateSpline();else this.cancelSpline();
      this.updatePanel();
    }
  }
}

window.SplineTool = SplineTool;
