// OffsetTool.js
// オフセット（平行線）ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createElement(), createLine(), createCircle(), createRect(): SVG要素作成
// - GeometryUtils.vectorLength(): ベクトルの長さ
// - GeometryUtils.distance(): 2点間距離

class OffsetTool extends BaseTool {
  static draftAttribute = 'data-vector-offset-draft-id';

  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedElement = null;
    this.offsetDistance = 10;
    this.miterLimit = 10;
    this.inputPresetVersion = 1; this.inputPresetMode = 'parameters';
    this.inputPresetVersions = [1,3];
    this.inputDraftLabel = '対象図形と数値設定を下書きとして記録';
    this.inputDraftNote = '距離とMiter上限比を保存できます。下書きには選択した対象図形も記録されます。';
    this.inputPresetInstructions = '対象が選択済みなら、平行な図形を作る側をクリックしてください。未選択の場合は対象図形から選びます。';
    this.implementationError = '';
  }

  getTitle() {
    return "オフセット";
  }

  exportInputPreset() {return window.VectorUtils.exportConstructionParameters('offset',this);}
  inputPresetModeForEntry(entry) {return entry?.version===3?'draft':'parameters';}

  canUseTarget(element) {
    return element?.namespaceURI===this.svgNS && Object.hasOwn(window.VectorUtils.offsetTargetLabels,element.localName) &&
      this.canvas.contains(element) && this.selectTool.canSelect(element);
  }

  setTarget(element) {
    this.selectedElement?.removeAttribute('data-vector-highlight');
    this.selectedElement=element;
    element?.setAttribute('data-vector-highlight','offset');
  }

  prepareInputDraftPreset() {
    if(!this.isActive)throw Error('記録するオフセットツールを先に選択してください。');
    const input=this.exportInputPreset().input,source=this.selectedElement;
    if(!source)return {entry:{version:3,input:{...input,target:null}}};
    if(!this.canUseTarget(source))throw Error('記録する対象図形が削除されたか、非表示・ロック中です。');
    const {id,commit}=window.VectorUtils.prepareDraftReference(this.canvas,OffsetTool.draftAttribute,source);
    return {entry:{version:3,input:{...input,target:{id,tag:source.localName}}},commit};
  }

  captureInputRollback() {
    const {offsetDistance,miterLimit,selectedElement,implementationError}=this;
    return ()=>{
      Object.assign(this,{offsetDistance,miterLimit,implementationError});
      this.setTarget(selectedElement);
    };
  }

  restoreInputPreset(entry) {
    if(entry?.version===3){
      if(!this.isActive)throw Error('復元するオフセットツールを先に選択してください。');
      const utils=window.VectorUtils;
      const {target,offsetDistance,miterLimit}=utils.parseConstructionInputPresets({version:1,entries:{offset:entry}}).entries.offset.input;
      const source=target?utils.resolveDraftReference(this.canvas,OffsetTool.draftAttribute,target.id):null;
      if(target&&(source.localName!==target.tag||!this.canUseTarget(source))){
        throw Error('記録した対象の種類が変わったか、対象が非表示・ロック中です。');
      }
      Object.assign(this,{offsetDistance,miterLimit});
      this.setTarget(source);
    }else window.VectorUtils.restoreConstructionParameters('offset',entry,this);
    this.implementationError = '';
  }

  getInstructions() {
    const instructions = ["ツールプロパティの『オフセット距離』で離れ幅を設定"];

    if (!this.selectedElement) {
      instructions.push("左クリック: オフセットする線分・図形を選択");
      instructions.push("対応図形: 線分 / ポリライン / 矩形 / 円");
    } else {
      instructions.push("左クリック: 選択図形の外側/内側をクリックして方向を決定");
      instructions.push("指定した側に複製を作成し、次の図形を選択");
    }

    instructions.push("Esc: 選択解除");

    return instructions;
  }

  getToolProperties() {
    return [
      {type: 'number', label: 'Miter実装の上限比', value: this.miterLimit, min: 1, max: 1000, step: 1,
        onChange: value => {if (Number.isFinite(value) && value >= 1) this.miterLimit = value;}},
      {
        type: "number",
        label: "オフセット距離",
        value: this.offsetDistance,
        min: 0.5,
        max: 1000,
        step: 0.5,
        onChange: (value) => {
          this.offsetDistance = value;
        },
      },
    ];
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
  }

  deactivate() {
    super.deactivate();
    this.setTarget(null);
    this.implementationError='';
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    // The second click is normally on empty canvas, on the desired side.
    if (!this.selectedElement) {
      if (!this.canUseTarget(event.target)) return;
      this.setTarget(event.target);
      this.implementationError='';
    } else {
      try {
        if(!this.canUseTarget(this.selectedElement))throw Error('対象図形が削除されたか、非表示・ロック中です。');
        this.createOffset(this.getMousePosition(event));
      } catch(error){this.implementationError=error.message;}
      this.setTarget(null);
    }
    this.updatePanel();
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  createOffset(point) {
    const source = this.selectedElement;
    const host = this.toolManager.host;
    const toLocal = source.getScreenCTM().inverse().multiply(this.canvas.getScreenCTM());
    const local = new DOMPoint(point.x, point.y).matrixTransform(toLocal);
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) return;
    const shape = host.readShape(source);
    const copy = shape && this.draw("offset", {shape, point: local, amount: this.offsetDistance, miterLimit: this.miterLimit});
    if (!copy) return;
    window.SvgUtils.setAttributes(copy, {
      stroke: source.getAttribute("stroke"), "stroke-width": source.getAttribute("stroke-width"),
      fill: ["circle", "rectangle"].includes(shape.kind) ? source.getAttribute("fill") || "none" : "none",
      transform: source.getAttribute("transform"), "data-layer": window.currentLayerId,
    });
    this.saveState();
    source.parentNode.appendChild(copy);
  }

  handleKeyDown(event) {
    if (event.key === "Escape" && this.selectedElement) {
      this.setTarget(null);
      this.implementationError='';
      this.updatePanel();
    }
  }
}

window.OffsetTool = OffsetTool;
