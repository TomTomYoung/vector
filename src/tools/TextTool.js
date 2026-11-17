// TextTool.js — immediate prompt input and an explicitly committed text draft.
class TextTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.draftPoint=null;this.draftContent='';this.draftMode=false;this.previewElement=null;
    this.implementationError='';this.inputPresetVersion=1;
    this.inputPresetInstructions='プロパティで文字を編集し、キャンバスのクリックで配置位置を指定します。「下書きを確定」または文字欄の外でEnterを押すと確定します。Escで取消できます。';
  }
  getTitle() {return 'テキスト';}
  getInstructions() {
    return this.draftMode?[this.inputPresetInstructions]:[
      '左クリック: 配置位置を指定し、ダイアログへ文字を入力して確定',
      '保存したい下書きはプロパティの文字欄へ入力するか「下書きを開始」を押してください',
      'ダイアログをキャンセルするとテキストは作成されません'];
  }
  updatePanel() {window.toolPropertiesPanel?.updatePanel();}
  activate() {super.activate();this.canvas.style.cursor='text';this.updatePanel();}
  deactivate() {this.cancel();super.deactivate();}
  cancel() {
    this.previewElement?.remove();this.previewElement=null;this.draftPoint=null;this.draftContent='';this.draftMode=false;this.implementationError='';
  }
  exportInputPreset() {return window.VectorUtils.parseAnnotationDraft('text',{version:1,input:{point:this.draftPoint,content:this.draftContent}});}
  restoreInputPreset(entry) {
    const {input}=window.VectorUtils.parseAnnotationDraft('text',entry);
    if(!this.isActive)throw Error('復元する作図ツールを先に選択してください。');
    this.cancel();this.draftPoint=input.point;this.draftContent=input.content;this.draftMode=true;this.redrawDraft();
  }
  onImplementationChanged() {this.redrawDraft();}
  getToolProperties() {
    return [{type:'custom',label:'文字の下書き',render:container=>{
      const area=document.createElement('textarea');area.dataset.textDraftContent='';area.setAttribute('aria-label','下書きの文字');area.rows=4;area.maxLength=20000;
      area.style.cssText='width:100%;box-sizing:border-box';area.value=this.draftContent;area.placeholder='下書きとして保存する文字を入力';container.append(area);
      const status=document.createElement('p');status.dataset.textDraftStatus='';status.setAttribute('role','status');container.append(status);
      const refresh=()=>{status.textContent=this.implementationError||(this.draftMode?(this.draftPoint?'配置位置: '+this.draftPoint.x+', '+this.draftPoint.y:'キャンバスをクリックして配置位置を指定してください。'):'キャンバスを直接クリックすると、従来のダイアログ入力になります。');};refresh();
      area.addEventListener('input',()=>{this.draftContent=area.value;this.draftMode=true;this.redrawDraft();refresh();});
      const button=(label,id,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.textDraftAction=id;b.onclick=()=>{action();this.updatePanel();};container.append(b);};
      button('下書きを開始','begin',()=>{this.draftMode=true;});
      button('下書きを確定','apply',()=>this.finishText());
      button('下書きを取消','cancel',()=>this.cancel());
    }}];
  }
  handleMouseDown(event) {
    if(!this.isActive||event.button!==0)return;
    const point=this.getMousePosition(event);
    if(this.draftMode){this.draftPoint={...point};this.redrawDraft();this.updatePanel();return;}
    const content=prompt('テキストを入力してください:');
    if(content!==null){
      this.draftPoint={...point};this.draftContent=content;this.draftMode=true;
      if(content.trim())this.finishText();else this.redrawDraft();
    }
    this.updatePanel();
  }
  createTextElement(point, content) {
    const text=this.draw('text',{point,content});
    if(!text)throw Error('選択した実装では文字を描画できません。');
    window.SvgUtils.setAttributes(text,{fill:this.currentStyle.fill==='none'?this.currentStyle.stroke:this.currentStyle.fill,
      'font-family':'Arial','font-size':'16px','data-layer':window.currentLayerId,'data-text-tool':'true'});
    return text;
  }
  redrawDraft() {
    this.previewElement?.remove();this.previewElement=null;this.implementationError='';
    try {
      const {input}=this.exportInputPreset();
      if(!input.point||!input.content.trim())return;
      this.previewElement=this.createTextElement(input.point,input.content);this.canvas.append(this.previewElement);
    } catch(error){this.implementationError=error.message;}
  }
  finishText() {
    this.previewElement?.remove();this.previewElement=null;this.implementationError='';
    try {
      const {input}=this.exportInputPreset();
      if(!input.point)throw Error('文字の配置位置を指定してください。');
      if(!input.content.trim())throw Error('空白以外の文字を入力してください。');
      const text=this.createTextElement(input.point,input.content);this.canvas.append(text);
      this.cancel();this.selectTool?.selectObject(text);this.saveState();this.updatePanel();return text;
    } catch(error){this.implementationError=error.message;this.updatePanel();return null;}
  }
  handleKeyDown(event) {
    if(!this.isActive)return;
    if(event.key==='Escape'){event.preventDefault();this.cancel();this.updatePanel();}
    if(event.key==='Enter'&&this.draftMode){event.preventDefault();this.finishText();}
  }
}
window.TextTool=TextTool;
