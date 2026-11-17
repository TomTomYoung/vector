// ArcTool.js
// 円弧描画ツール（3点指定：始点、通過点、終点）
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createElement(), createCircle(): SVG要素作成
// - GeometryUtils.distance(): 2点間距離
// - GeometryUtils.normalizeAngle(): 角度正規化

class ArcTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.points = []; // 始点、通過点、終点
    this.currentArc = null;
    this.previewCircle = null;
    this.draftHandles = null;
    this.implementationError = '';
    this.inputPresetVersion = 1;
    this.inputPresetInstructions = '3点目のクリックで確定します。3点を復元した場合はEnterで確定し、クリックで終点を変更できます。Backspaceで末尾点を削除、Escで取消できます。';
  }

  exportInputPreset() {return window.VectorUtils.parseShapeDraft('arc',{version:1,input:{points:this.points}});}
  restoreInputPreset(entry) {
    const {input}=window.VectorUtils.parseShapeDraft('arc',entry);
    if(!this.isActive)throw Error('復元する作図ツールを先に選択してください。');
    this.cancelArc();this.points=input.points;this.redrawDraft();
  }
  onImplementationChanged() {this.redrawDraft();}
  cancel() {this.cancelArc();}

  redrawDraft() {
    this.currentArc?.remove();this.previewCircle?.remove();this.draftHandles?.remove();
    this.currentArc=this.previewCircle=this.draftHandles=null;this.implementationError='';
    if(!this.points.length)return;
    this.draftHandles=window.SvgUtils.createElement('g',{'data-tool-layer':'construction-handles','pointer-events':'none'});
    this.points.forEach(p=>this.draftHandles.appendChild(window.SvgUtils.createCircle(p.x,p.y,3,{fill:'#fff',stroke:'#2673c7'})));
    this.canvas.appendChild(this.draftHandles);
    if(this.points.length===1)this.createPreviewCircle(this.points[0]);
    if(this.points.length===3)this.updateArcPreview(this.points[2]);
  }

  getTitle() {
    return "円弧";
  }

  getInstructions() {
    const stepPrompts = [
      "左クリック: 円弧の始点を指定",
      "左クリック: 円弧が通過する2点目を指定",
      "左クリック: 円弧の終点を指定して確定",
    ];

    const instructions = ["3点を順番にクリックして円弧を作成"];
    instructions.push(stepPrompts[Math.min(this.points.length, 2)]);

    if (this.points.length === 1) {
      instructions.push("マウス移動: 半径プレビューを確認");
    }
    if (this.points.length === 2) {
      instructions.push("マウス移動: 3点目に応じた円弧をプレビュー");
    }

    instructions.push("Esc: 入力中の円弧をキャンセル");
    instructions.push('Backspace: 最後の入力点を削除、3点がそろったらEnterでも確定');

    return instructions;
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
    this.cancelArc();
  }

  cancelArc() {
    if (this.currentArc) {
      this.canvas.removeChild(this.currentArc);
      this.currentArc = null;
    }
    if (this.previewCircle) {
      this.canvas.removeChild(this.previewCircle);
      this.previewCircle = null;
    }
    this.points = [];
    this.draftHandles?.remove();this.draftHandles=null;this.implementationError='';
    this.updatePanel();
  }

  handleMouseDown(event) {
    if(!this.isActive||event.button!==0)return;
    super.handleMouseDown(event);
    const point = this.getMousePosition(event);
    if(this.points.length===3)this.points[2]=point;else this.points.push(point);
    this.redrawDraft();
    if(this.points.length===3)this.finishArc();

    this.updatePanel();
  }

  handleMouseMove(event) {
    if(!this.isActive)return;
    super.handleMouseMove(event);
    const point = this.getMousePosition(event);

    if (this.points.length === 1) {
      if (this.previewCircle) {
        try {const drawn=this.draw("circle", {center: this.points[0], point}, this.previewCircle);if(!drawn)throw Error('補助円を描画できません。');this.previewCircle=drawn;drawn.removeAttribute('visibility');this.implementationError='';}
        catch(error){this.implementationError=error.message;this.previewCircle.setAttribute('visibility','hidden');}
      }
    } else if (this.points.length === 2) {
      // 3点から円弧を計算してプレビュー
      this.updateArcPreview(point);
    }
  }

  createPreviewCircle(center) {
    // SvgUtils.createCircle を使用
    this.previewCircle = window.SvgUtils.createCircle(center.x, center.y, 0, {
      stroke: "#999",
      "stroke-width": "1",
      "stroke-dasharray": "5,5",
      fill: "none"
    });
    this.canvas.appendChild(this.previewCircle);
  }

  updatePreview() {
    if (this.previewCircle) {
      this.canvas.removeChild(this.previewCircle);
      this.previewCircle = null;
    }
  }

  updateArcPreview(endPoint) {
    if (this.currentArc) {
      this.currentArc.remove();
      this.currentArc = null;
    }

    this.implementationError='';
    try {this.currentArc = this.draw("arc", {start: this.points[0], through: this.points[1], end: endPoint});}
    catch(error){this.implementationError=error.message;return;}
    if (!this.currentArc) {this.implementationError='この3点では円弧を作成できません。入力点を修正してください。';return;}
    window.SvgUtils.setAttributes(this.currentArc, {
      stroke: this.currentStyle.stroke,
      "stroke-width": this.currentStyle.strokeWidth,
      fill: "none",
      opacity: this.currentStyle.opacity
    });
    this.canvas.appendChild(this.currentArc);
  }

  finishArc() {
    if (this.points.length !== 3) {this.implementationError='確定には始点・通過点・終点の3点が必要です。';this.updatePanel();return;}

    const [start, through, end] = this.points;
    this.currentArc?.remove();this.currentArc=null;this.implementationError='';
    let arc;
    try {arc = this.draw("arc", {start, through, end});}
    catch(error){this.implementationError=error.message;this.updatePanel();return;}
    if (!arc) {
      this.implementationError='この3点では円弧を作成できません。入力点を修正してください。';this.updatePanel();
      return;
    }

    // 状態を保存
    this.saveState();

    this.currentArc?.remove();
    this.applyDefaultAttributes(arc);
    arc.setAttribute("fill", "none");
    arc.setAttribute("data-arc-tool", "true");
    this.canvas.appendChild(arc);
    this.currentArc = null;

    this.points = [];
    this.draftHandles?.remove();this.draftHandles=null;
    if (this.previewCircle) {
      this.canvas.removeChild(this.previewCircle);
      this.previewCircle = null;
    }

    this.updatePanel();
  }

  handleKeyDown(event) {
    if(!this.isActive)return;
    if (event.key === "Escape" && this.points.length > 0) {
      this.cancelArc();
    }
    if(event.key==='Backspace'){event.preventDefault();this.points.pop();this.redrawDraft();this.updatePanel();}
    if(event.key==='Enter'){event.preventDefault();this.finishArc();}
  }
}

window.ArcTool = ArcTool;
