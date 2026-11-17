// DimensionTool.js — resumable linear/angular annotations.
class DimensionTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.points=[];this.dimensionType='linear';this.currentDimension=null;this.draftHandles=null;
    this.implementationError='';this.inputPresetVersion=1;
    this.inputPresetInstructions='不足する点をクリックして続けられます。必要な点がそろった下書きはEnterで確定し、クリックで最後の点を変更できます。Backspaceで末尾点を削除、Escで取消できます。';
  }
  getTitle() {return '寸法';}
  get requiredPoints() {return this.dimensionType==='linear'?2:3;}
  getInstructions() {
    return ['左パネルの寸法タイプで長さ寸法と角度寸法を切り替え',
      this.dimensionType==='linear'?'始点・終点の2点をクリックして長さ寸法を作成':'第一辺の端点・頂点・第二辺の端点の3点をクリックして角度寸法を作成',
      this.inputPresetInstructions];
  }
  updatePanel() {window.toolPropertiesPanel?.updatePanel();}
  activate() {super.activate();this.canvas.style.cursor='crosshair';this.createDimensionTypeSelector();this.updatePanel();}
  deactivate() {this.cancel();this.removeDimensionTypeSelector();super.deactivate();}
  cancel() {
    this.currentDimension?.remove();this.draftHandles?.remove();
    this.currentDimension=this.draftHandles=null;this.points=[];this.implementationError='';
  }
  exportInputPreset() {return window.VectorUtils.parseAnnotationDraft('dimension',{version:1,input:{points:this.points,dimensionType:this.dimensionType}});}
  restoreInputPreset(entry) {
    const {input}=window.VectorUtils.parseAnnotationDraft('dimension',entry);
    if(!this.isActive)throw Error('復元する作図ツールを先に選択してください。');
    this.cancel();this.points=input.points;this.dimensionType=input.dimensionType;
    const selector=document.getElementById('dimension-type-selector');if(selector)selector.value=this.dimensionType;
    this.redrawDraft();
  }
  onImplementationChanged() {this.redrawDraft();}
  createDimensionTypeSelector() {
    if (document.getElementById("dimension-type-controls")) return;

    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    const controls = document.createElement("div");
    controls.id = "dimension-type-controls";
    controls.className = "style-control-group";

    const heading = document.createElement("h4");
    heading.textContent = "寸法タイプ";
    controls.appendChild(heading);

    const selector = document.createElement("select");
    selector.id = "dimension-type-selector";

    const linearOption = document.createElement("option");
    linearOption.value = "linear";
    linearOption.textContent = "長さ寸法";
    selector.appendChild(linearOption);

    const angularOption = document.createElement("option");
    angularOption.value = "angular";
    angularOption.textContent = "角度寸法";
    selector.appendChild(angularOption);

    selector.addEventListener("change", (e) => {
      this.dimensionType = e.target.value;
      this.cancel();
      this.updatePanel();
    });

    selector.value = this.dimensionType;

    controls.appendChild(selector);
    container.appendChild(controls);
  }

  removeDimensionTypeSelector() {
    const controls = document.getElementById("dimension-type-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    if(!this.isActive||event.button!==0)return;
    const point=this.getMousePosition(event);
    if(this.points.length===this.requiredPoints)this.points[this.points.length-1]={...point};else this.points.push({...point});
    this.redrawDraft();
    if(this.points.length===this.requiredPoints)this.finishDimension();else this.updatePanel();
  }
  handleMouseMove(event) {
    if(!this.isActive||!this.points.length||this.points.length>=this.requiredPoints)return;
    this.currentDimension?.remove();
    this.currentDimension=window.SvgUtils.createElement('polyline',{points:[...this.points,this.getMousePosition(event)].map(p=>p.x+','+p.y).join(' '),stroke:'#ff0000','stroke-width':1,'stroke-dasharray':'5,5',fill:'none','pointer-events':'none'});
    this.canvas.append(this.currentDimension);
  }
  redrawDraft() {
    this.currentDimension?.remove();this.draftHandles?.remove();this.currentDimension=this.draftHandles=null;this.implementationError='';
    if(!this.points.length)return;
    this.draftHandles=window.SvgUtils.createElement('g',{'data-tool-layer':'construction-handles','pointer-events':'none'});
    this.points.forEach(p=>this.draftHandles.append(window.SvgUtils.createCircle(p.x,p.y,3,{fill:'#fff',stroke:'#2673c7'})));
    this.canvas.append(this.draftHandles);
    if(this.points.length===this.requiredPoints){
      try {this.currentDimension=this.renderCurrentDimension();this.canvas.append(this.currentDimension);}
      catch(error){this.implementationError=error.message;}
    }
  }
  renderCurrentDimension() {
    const {input}=this.exportInputPreset();
    if(input.points.length!==this.requiredPoints)throw Error('確定には'+this.requiredPoints+'点が必要です。');
    if(input.dimensionType==='angular'&&[input.points[0],input.points[2]].some(p=>p.x===input.points[1].x&&p.y===input.points[1].y))throw Error('角度の頂点と辺の端点は異なる位置を指定してください。');
    const result=this.run('dimension',{points:input.points,mode:input.dimensionType});
    const group=this.toolManager.host.render({kind:'dimension',mode:input.dimensionType,result},null,{toolName:'dimension'});
    if(!group)throw Error('選択した実装では寸法を描画できません。');
    window.SvgUtils.setAttributes(group,{'data-layer':window.currentLayerId,'data-dimension-tool':'true'});group.classList.add('dimension');
    return group;
  }
  finishDimension() {
    this.currentDimension?.remove();this.currentDimension=null;this.implementationError='';
    try {
      const group=this.renderCurrentDimension();this.canvas.append(group);
      this.points=[];this.draftHandles?.remove();this.draftHandles=null;this.saveState();this.updatePanel();return group;
    } catch(error){this.implementationError=error.message;this.updatePanel();return null;}
  }
  handleKeyDown(event) {
    if(!this.isActive)return;
    if(event.key==='Escape'){event.preventDefault();this.cancel();this.updatePanel();}
    if(event.key==='Backspace'){event.preventDefault();this.points.pop();this.redrawDraft();this.updatePanel();}
    if(event.key==='Enter'){event.preventDefault();this.finishDimension();}
  }
}
window.DimensionTool=DimensionTool;
