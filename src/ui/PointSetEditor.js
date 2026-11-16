// Refit the saved observations independently of the SVG representation.
class PointSetEditor {
  constructor(manager,refresh) {
    this.manager=manager;this.refresh=refresh;this.element=null;this.draft=null;this.preview=null;this.message='';
    this.controls=new SplineControlHandles(this,{namespace:'pointset',escapeInFields:true});
  }
  select(element) {if(this.element!==element){this.cancel(false);this.element=element;}}
  cancel(refresh=true) {
    this.controls.close();this.preview?.remove();this.preview=null;this.draft=null;this.message='';
    if(this.manager.activeToolName==='select')this.manager.tools.select.refreshHandles();
    if(refresh)this.refresh();
  }
  snapshot() {return JSON.stringify(window.VectorUtils.pointSetSource.pointSetGeometrySnapshot(this.element));}
  assertTarget() {
    if(!this.element?.isConnected || !this.manager.tools.select.canSelect(this.element))throw Error('編集対象が削除されたか、非表示・ロック中です。');
    if(this.manager.activeToolName!=='select' || window.selectedObjects?.length!==1 || window.selectedObjects[0]!==this.element)throw Error('編集対象の選択が変更されました。');
    if(this.draft && (this.snapshot()!==this.originalGeometry || this.element.getAttribute('data-vector-pointset')!==this.originalSource ||
      this.element.getAttribute('data-vector-implementation')!==this.originalRecord))throw Error('編集中に元図形が変更されました。取消してから読み直してください。');
  }
  begin() {
    window.toolPropertiesPanel?.circleEditor?.cancel(false);
    try {
      this.assertTarget();const api=window.VectorUtils.pointSetSource;
      const source=api.readPointSetSource(this.element.getAttribute('data-vector-pointset'),this.element.getAttribute('data-vector-implementation'),api.pointSetGeometrySnapshot(this.element));
      this.originalGeometry=this.snapshot();this.originalSource=this.element.getAttribute('data-vector-pointset');this.originalRecord=this.element.getAttribute('data-vector-implementation');
      this.draft={...source,pointsText:source.input.points.map(p=>p.x+', '+p.y).join('\n')};
      this.message='元の点群を図形のローカル座標で編集します。外観・変形・レイヤーを保持します。';
    } catch(error){this.message=error.message;}
    this.refresh();if(this.draft)this.controls.open();
  }
  input() {
    const text=this.draft.pointsText;
    if(text.length>200000)throw Error('点群の入力が大きすぎます。');
    const rows=text.split(/\r?\n/).filter(row=>row.trim());
    const points=rows.map((row,i)=>{
      const values=row.trim().split(/[\s,]+/).map(Number);
      if(values.length!==2 || !values.every(Number.isFinite))throw Error(`点群の${i+1}行目は有限な x, y の2数で指定してください。`);
      return {x:values[0],y:values[1]};
    });
    return window.VectorUtils.pointSetSource.pointSetInput(this.draft.method,{points});
  }
  build() {
    this.assertTarget();const host=this.manager.host,d=this.draft,input=this.input(),method=d.method,api=window.VectorUtils.pointSetSource;
    if(!host.implementations(method).some(v=>v.id===d.implementation))throw Error('記録された計算実装がありません。使用する実装を選び直してください。');
    if(!host.renderers(method).some(v=>v.id===d.renderer))throw Error('記録された描画実装がありません。使用する実装を選び直してください。');
    if(d.options.sampleCount!==undefined&&(!Number.isInteger(d.options.sampleCount) || d.options.sampleCount<2 || d.options.sampleCount>10000))throw Error('再描画の分割数は2〜10000の整数で指定してください。');
    const previous=host.describe(method).id;
    try {
      host.selectImplementation(method,d.implementation);const computed=host.execute(method,api.pointSetInput(method,input));
      if(!computed)throw Error('この点群では計算できません。重複・一直線・方向が定まらない配置を確認してください。');
      const shape=api.pointSetGeometry(method,input,computed);
      const result=host.render(shape,null,{...d.options,toolName:method,renderer:d.renderer,sourceInput:input,sourceResult:computed});
      api.readPointSetSource(result?.getAttribute('data-vector-pointset'),result?.getAttribute('data-vector-implementation'),api.pointSetGeometrySnapshot(result));
      const record=JSON.parse(result.getAttribute('data-vector-implementation'));record.pointSetEdit={mode:'points',origin:d.origin};
      result.setAttribute('data-vector-implementation',JSON.stringify(record));return result;
    } finally {host.selectImplementation(method,previous);}
  }
  showPreview(refresh=true) {
    this.preview?.remove();this.preview=null;
    try {
      const result=this.build(),frame=window.VectorUtils.splineControlGeometry.splineControlFrame(this.manager.canvas.getScreenCTM(),this.element.getScreenCTM());
      result.setAttribute('transform',window.VectorUtils.splineControlGeometry.splineMatrixText(frame.localCanvas));
      result.setAttribute('data-vector-preview','pointset-edit');result.setAttribute('pointer-events','none');result.setAttribute('fill','none');
      result.setAttribute('stroke','#1265d6');result.setAttribute('stroke-width','2');result.setAttribute('stroke-dasharray','6 3');result.setAttribute('vector-effect','non-scaling-stroke');
      this.manager.canvas.append(result);this.preview=result;this.message='青い破線が再計算結果です。「適用」で元図形を更新します。';
    } catch(error){this.message=error.message;}
    this.controls.sync();if(refresh)this.refresh();else this.updateStatus();
  }
  apply() {
    try {
      const result=this.build(),old=this.element,method=this.draft.method;
      const generated=['x1','y1','x2','y2','cx','cy','r','d','points','data-vector-circle','data-vector-pointset','data-vector-implementation'];
      let target=old;
      if(result.tagName!==old.tagName) {
        target=result;
        for(const attr of old.attributes)if(!generated.includes(attr.name))target.setAttribute(attr.name,attr.value);
        for(const child of old.childNodes)target.append(child.cloneNode(true));
      }
      const circleTool=this.manager.tools.circle;
      this.cancel(false);circleTool.disconnectSelectedCircleObserver();
      if(target===old)for(const name of generated){
        if(result.hasAttribute(name))target.setAttribute(name,result.getAttribute(name));else target.removeAttribute(name);
      }
      else old.replaceWith(target);
      if(target.tagName==='circle') {
        target.setAttribute('data-circle-tool','true');circleTool.initializeCircleMetadata(target);
        circleTool.selectedCircleId=target.dataset.circleId;circleTool.observeSelectedCircle(target);
      } else {target.removeAttribute('data-circle-tool');circleTool.selectedCircleId=null;}
      target.setAttribute('data-construction-tool',method);this.element=target;
      this.manager.tools.select.selectObject(target,false);
      this.message='元の点群から再計算して適用しました。';this.manager.host.save();
    } catch(error){this.message=error.message;}
    this.refresh();
  }
  changed() {this.controls.stop(false);this.preview?.remove();this.preview=null;this.message='入力を変更しました。プレビューまたは適用で再計算します。';this.controls.sync();}
  updateStatus() {const el=document.querySelector('[data-pointset-edit-status]');if(el)el.textContent=this.message;}
  updatePointsField() {const el=document.querySelector('[aria-label="元の点群（1行に x, y）"]');if(el&&this.draft)el.value=this.draft.pointsText;}
  render(container) {
    const status=document.createElement('p');status.dataset.pointsetEditStatus='';status.setAttribute('role','status');status.textContent=this.message;status.style.cssText='font-size:12px;line-height:1.6';
    const button=(text,id,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.pointsetAction=id;b.style.margin='4px';b.addEventListener('click',action);container.append(b);};
    if(!this.draft){button('点群を再編集','begin',()=>this.begin());container.append(status);return;}
    const d=this.draft,hint=document.createElement('p');hint.style.fontSize='12px';
    hint.textContent='番号付きの点をドラッグできます。座標欄の行を増減すると点を追加・削除できます。Shift・直交モードは図面の縦横方向へ拘束します。Escはドラッグ中ならその移動、それ以外は再編集を取り消します。';container.append(hint);
    const wrapper=document.createElement('label');wrapper.textContent='元の点群（1行に x, y）';wrapper.style.cssText='display:block;font-size:12px';
    const textarea=document.createElement('textarea');textarea.rows=6;textarea.value=d.pointsText;textarea.setAttribute('aria-label',wrapper.textContent);textarea.style.cssText='display:block;width:100%;box-sizing:border-box';
    textarea.addEventListener('input',()=>{d.pointsText=textarea.value;this.changed();status.textContent=this.message;});wrapper.append(textarea);container.append(wrapper);
    if(d.method!=='convexHull'){
    const label=document.createElement('label');label.textContent='点群の再描画分割数';label.style.cssText='display:block;font-size:12px;margin:10px 0';
    const number=document.createElement('input');number.type='number';number.min=2;number.max=10000;number.step=1;number.value=d.options.sampleCount;number.setAttribute('aria-label',label.textContent);number.style.width='100%';
    number.addEventListener('input',()=>{d.options.sampleCount=number.value.trim()?Number(number.value):NaN;this.changed();status.textContent=this.message;});label.append(number);container.append(label);
    }
    const choice=(caption,key,items)=>{
      const label=document.createElement('label');label.textContent=caption;label.style.cssText='display:block;font-size:12px;margin:10px 0';
      const select=document.createElement('select');select.setAttribute('aria-label',caption);select.style.width='100%';
      if(!items.some(item=>item.id===d[key]))select.append(new Option('未登録: '+d[key],d[key]));
      for(const item of items)select.append(new Option(item.label,item.id));select.value=d[key];
      const info=document.createElement('p');info.style.fontSize='11px';const describe=()=>{info.textContent=items.find(item=>item.id===d[key])?.algorithm??'この実装は現在登録されていません。';};
      select.addEventListener('change',()=>{d[key]=select.value;this.changed();status.textContent=this.message;describe();});describe();label.append(select,info);container.append(label);
    };
    choice('点群の再計算実装','implementation',this.manager.host.implementations(d.method));choice('点群の再描画実装','renderer',this.manager.host.renderers(d.method));
    container.append(status);button('プレビュー','preview',()=>this.showPreview());button('適用','apply',()=>this.apply());button('取消','cancel',()=>this.cancel());
  }
}
window.PointSetEditor=PointSetEditor;
