class PresetImportDialog {
  constructor(){
    this.token=0;this.rows=[];this.revision=0;
    const dialog=this.dialog=document.createElement('dialog');dialog.dataset.presetImport='';dialog.style.cssText='width:min(800px,90vw);max-height:85vh;box-sizing:border-box';
    const title=document.createElement('h3');title.textContent='別SVGから記録を取り込む';dialog.append(title);
    const note=document.createElement('p');note.textContent='入力・方式・作図セットを選んで現在の図面へ追加します。同名は末尾に番号を付けます。図形は読み込まず、入力や方式も適用しません。';dialog.append(note);
    const file=this.file=document.createElement('input');file.type='file';file.accept='.svg,image/svg+xml';file.dataset.presetImportFile='';file.setAttribute('aria-label','記録の取込元SVG');dialog.append(file);
    const status=this.status=document.createElement('p');status.dataset.presetImportStatus='';status.setAttribute('role','status');dialog.append(status);
    const list=this.list=document.createElement('div');list.dataset.presetImportList='';list.style.cssText='max-height:45vh;overflow:auto';dialog.append(list);
    const button=(label,id,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.presetImportAction=id;b.style.margin='4px';b.onclick=action;dialog.append(b);return b;};
    button('全件選択','all',()=>{for(const el of list.querySelectorAll('[data-import-check]'))el.checked=true;this.updateApply();});
    button('選択解除','none',()=>{for(const el of list.querySelectorAll('[data-import-check]'))el.checked=false;this.updateApply();});
    this.applyButton=button('選択した記録を追加','apply',()=>this.apply());button('閉じる','close',()=>this.close());
    file.onchange=()=>this.load(file.files[0]);
    dialog.addEventListener('keydown',e=>e.stopPropagation());
    dialog.addEventListener('cancel',e=>{e.preventDefault();this.close();});
    document.body.append(dialog);
  }
  message(text,warning=false){this.status.textContent=text;this.status.style.color=warning?'#a22':'';}
  clear(){this.rows=[];this.list.replaceChildren();this.updateApply();}
  open(){this.token++;this.revision=DrawingDocument.revision;this.file.value='';this.clear();this.message('取込元のSVGを選択してください。');this.dialog.showModal();}
  close(){this.token++;this.clear();this.file.value='';this.dialog.close();}
  updateApply(){this.applyButton.disabled=!this.rows.length||!this.list.querySelector('[data-import-check]:checked');}
  async load(file){
    const token=++this.token,revision=this.revision;this.clear();if(!file)return;
    this.message('記録を読み込んでいます。');
    try{
      if(file.size>33554432)throw Error('SVGファイルは32MiBまでです。');
      const text=await file.text();if(token!==this.token)return;
      if(revision!==DrawingDocument.revision)throw Error('図面が切り替わりました。閉じてから取込操作をやり直してください。');
      this.rows=window.VectorUtils.readPresetSVG(text);this.render();
      this.message(file.name+': '+this.rows.length+'件。追加する記録を選択してください。');
    }catch(error){if(token===this.token){this.clear();this.message('記録を読み込めません。'+error.message,true);}}
    finally{if(token===this.token)this.file.value='';}
  }
  render(){
    this.list.replaceChildren();
    for(const row of this.rows){
      const box=document.createElement('fieldset');box.dataset.importRow=row.key;box.dataset.importKind=row.kind;box.style.margin='8px 0';
      const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.importCheck=row.key;check.onchange=()=>this.updateApply();label.append(check,document.createTextNode(row.origin+(row.tool?' / '+(window.toolManager.tools[row.tool]?.getTitle()??row.tool):'')));box.append(label);
      const name=document.createElement('input');name.type='text';name.maxLength=100;name.value=row.name;name.dataset.importName='';name.setAttribute('aria-label','取り込む記録名');name.style.cssText='display:block;width:95%;margin:6px 0';box.append(name);
      const description=document.createElement('p');description.style.cssText='font-size:12px;overflow-wrap:anywhere';
      const input=row.payload.entry??row.payload.input,methods=row.payload.preset??row.payload.methods;
      description.textContent=(input?window.toolPropertiesPanel.describeConstructionInputRecord(row.tool,input,window.VectorUtils.supportsConstructionInput(window.toolManager.tools[row.tool],input)):'')+(methods?' / 計算 '+Object.keys(methods.calculation).length+'項目、描画 '+Object.keys(methods.rendering).length+'項目':'');box.append(description);this.list.append(box);
    }
    this.updateApply();
  }
  apply(){
    try{
      if(this.revision!==DrawingDocument.revision)throw Error('図面が切り替わりました。閉じてから取込操作をやり直してください。');
      const selection=Array.from(this.list.querySelectorAll('[data-import-check]:checked'),check=>({key:check.dataset.importCheck,name:check.closest('fieldset').querySelector('[data-import-name]').value}));
      const manager=window.toolManager,stores={inputs:manager.namedInputPresets,methods:manager.namedImplementationPresets,sets:manager.constructionSets};
      const current=Object.fromEntries(Object.entries(stores).map(([kind,store])=>[kind,store.snapshot()]));
      const plan=window.VectorUtils.planPresetImport(this.rows,selection,current);
      window.VectorUtils.commitPresetImport(plan,stores);manager.host.save();window.toolPropertiesPanel.updatePanel();
      this.clear();this.message(plan.added.length+'件を追加しました。'+plan.added.map(e=>e.name).join('、')+'。一括で元に戻せます。');
    }catch(error){this.message('記録を追加できません。'+error.message,true);}
  }
}
window.PresetImportDialog=PresetImportDialog;
