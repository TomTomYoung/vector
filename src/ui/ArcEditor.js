// Reconstruct an arc from its original three input points, independently of the SVG renderer.
class ArcEditor {
  constructor(manager,refresh) {
    this.manager=manager;this.refresh=refresh;this.element=null;this.draft=null;this.preview=null;this.message='';
    this.controls=new SplineControlHandles(this,{namespace:'arc',labels:['始点','通過点','終点'],escapeInFields:true});
  }
  select(element) {if(this.element!==element){this.cancel(false);this.element=element;}}
  cancel(refresh=true) {
    this.controls.close();this.preview?.remove();this.preview=null;this.draft=null;this.message='';
    if(this.manager.activeToolName==='select')this.manager.tools.select.refreshHandles();
    if(refresh)this.refresh();
  }
  assertTarget() {
    if(!this.element?.isConnected || this.element.tagName!=='path' || !this.manager.tools.select.canSelect(this.element))throw Error('編集対象が削除されたか、非表示・ロック中です。');
    if(this.manager.activeToolName!=='select' || window.selectedObjects?.length!==1 || window.selectedObjects[0]!==this.element)throw Error('編集対象の選択が変更されました。');
    if(this.draft && (this.element.getAttribute('d')!==this.originalPath || this.element.getAttribute('data-vector-arc')!==this.originalSource ||
      this.element.getAttribute('data-vector-implementation')!==this.originalRecord))throw Error('編集中に元図形が変更されました。取消してから読み直してください。');
  }
  begin() {
    try {
      this.assertTarget();
      const source=window.VectorUtils.arcSource.readArcSource(this.element.getAttribute('data-vector-arc'),this.element.getAttribute('data-vector-implementation'),this.element.getAttribute('d'));
      this.originalPath=this.element.getAttribute('d');this.originalSource=this.element.getAttribute('data-vector-arc');this.originalRecord=this.element.getAttribute('data-vector-implementation');
      this.draft={...source,pointsText:['start','through','end'].map(key=>source.input[key].x+', '+source.input[key].y).join('\n')};
      this.message='始点・通過点・終点は図形のローカル座標です。外観・変形・レイヤーを保持します。';
    } catch(error){this.message=error.message;}
    this.refresh();if(this.draft)this.controls.open();
  }
  input() {
    const text=this.draft.pointsText;
    if(text.length>2000)throw Error('円弧の入力が大きすぎます。');
    const rows=text.split(/\r?\n/).filter(row=>row.trim());
    if(rows.length!==3)throw Error('始点・通過点・終点の3行を入力してください。');
    const points=rows.map((row,i)=>{
      const values=row.trim().split(/[\s,]+/).map(Number);
      if(values.length!==2 || !values.every(Number.isFinite))throw Error(`円弧の${i+1}行目は有限な x, y の2数で指定してください。`);
      return {x:values[0],y:values[1]};
    });
    return {points};
  }
  build() {
    this.assertTarget();const host=this.manager.host,d=this.draft,[start,through,end]=this.input().points,input={start,through,end};
    if(!host.implementations('arc').some(v=>v.id===d.implementation))throw Error('記録された計算実装がありません。使用する実装を選び直してください。');
    if(!host.renderers('arc').some(v=>v.id===d.renderer))throw Error('記録された描画実装がありません。使用する実装を選び直してください。');
    if(!Number.isInteger(d.options.sampleCount) || d.options.sampleCount<2 || d.options.sampleCount>10000)throw Error('円弧の分割数は2〜10000の整数で指定してください。');
    const previous=host.describe('arc').id;
    try {
      host.selectImplementation('arc',d.implementation);const shape=host.execute('arc',input);
      if(!shape)throw Error('この3点では円弧を作れません。重複・一直線・近すぎる点を確認してください。');
      const model=window.VectorUtils.arcSource.arcModel(shape);
      const result=host.render(shape,null,{...d.options,toolName:'arc',renderer:d.renderer,sourceInput:input});
      if(result?.tagName!=='path' || !result.getAttribute('d') || /NaN|Infinity/.test(result.getAttribute('d')))throw Error('再編集に対応する有限な円弧パスを描画できません。');
      window.VectorUtils.arcSource.readArcSource(result.getAttribute('data-vector-arc'),result.getAttribute('data-vector-implementation'),result.getAttribute('d'));
      const record=JSON.parse(result.getAttribute('data-vector-implementation'));
      record.parameters={...input,center:model.center,radius:model.radius,turn:model.turn};record.arcEdit={mode:'three-points',origin:d.origin};
      result.setAttribute('data-vector-implementation',JSON.stringify(record));return result;
    } finally {host.selectImplementation('arc',previous);}
  }
  showPreview(refresh=true) {
    this.preview?.remove();this.preview=null;
    try {
      const result=this.build(),frame=window.VectorUtils.splineControlGeometry.splineControlFrame(this.manager.canvas.getScreenCTM(),this.element.getScreenCTM());
      result.setAttribute('transform',window.VectorUtils.splineControlGeometry.splineMatrixText(frame.localCanvas));
      result.setAttribute('data-vector-preview','arc-edit');result.setAttribute('pointer-events','none');result.setAttribute('fill','none');
      result.setAttribute('stroke','#1265d6');result.setAttribute('stroke-width','2');result.setAttribute('stroke-dasharray','6 3');result.setAttribute('vector-effect','non-scaling-stroke');
      this.manager.canvas.append(result);this.preview=result;this.message='青い破線が再計算結果です。「適用」で元図形を更新します。';
    } catch(error){this.message=error.message;}
    this.controls.sync();if(refresh)this.refresh();else this.updateStatus();
  }
  apply() {
    try {
      const result=this.build(),target=this.element;
      for(const name of ['d','data-vector-arc','data-vector-implementation'])target.setAttribute(name,result.getAttribute(name));
      target.setAttribute('data-arc-tool','true');target.setAttribute('data-construction-tool','arc');
      this.cancel(false);this.message='3点から円弧を再計算して適用しました。';this.manager.host.save();this.manager.tools.select.refreshHandles();
    } catch(error){this.message=error.message;}
    this.refresh();
  }
  changed() {this.controls.stop(false);this.preview?.remove();this.preview=null;this.message='入力を変更しました。プレビューまたは適用で再計算します。';this.controls.sync();}
  updateStatus() {const el=document.querySelector('[data-arc-edit-status]');if(el)el.textContent=this.message;}
  updatePointsField() {const el=document.querySelector('[aria-label="円弧の3点（始点・通過点・終点）"]');if(el&&this.draft)el.value=this.draft.pointsText;}
  render(container) {
    const status=document.createElement('p');status.dataset.arcEditStatus='';status.setAttribute('role','status');status.textContent=this.message;status.style.cssText='font-size:12px;line-height:1.6';
    const button=(text,id,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.arcAction=id;b.style.margin='4px';b.addEventListener('click',action);container.append(b);};
    if(!this.draft){button('円弧を再編集','begin',()=>this.begin());container.append(status);return;}
    const d=this.draft,hint=document.createElement('p');hint.style.fontSize='12px';
    hint.textContent='始点・通過点・終点をドラッグできます。通過点に応じて円弧の向きと大きい弧・小さい弧を再計算します。Shift・直交モードは図面の縦横方向へ拘束します。Escはドラッグ中ならその移動、それ以外は再編集を取り消します。';container.append(hint);
    const wrapper=document.createElement('label');wrapper.textContent='円弧の3点（始点・通過点・終点）';wrapper.style.cssText='display:block;font-size:12px';
    const textarea=document.createElement('textarea');textarea.rows=3;textarea.value=d.pointsText;textarea.setAttribute('aria-label',wrapper.textContent);textarea.style.cssText='display:block;width:100%;box-sizing:border-box';
    textarea.addEventListener('input',()=>{d.pointsText=textarea.value;this.changed();status.textContent=this.message;});wrapper.append(textarea);container.append(wrapper);
    const label=document.createElement('label');label.textContent='円弧の再描画分割数';label.style.cssText='display:block;font-size:12px;margin:10px 0';
    const number=document.createElement('input');number.type='number';number.min=2;number.max=10000;number.step=1;number.value=d.options.sampleCount;number.setAttribute('aria-label',label.textContent);number.style.width='100%';
    number.addEventListener('input',()=>{d.options.sampleCount=number.value.trim()?Number(number.value):NaN;this.changed();status.textContent=this.message;});label.append(number);container.append(label);
    const choice=(caption,key,items)=>{
      const label=document.createElement('label');label.textContent=caption;label.style.cssText='display:block;font-size:12px;margin:10px 0';
      const select=document.createElement('select');select.setAttribute('aria-label',caption);select.style.width='100%';
      if(!items.some(item=>item.id===d[key]))select.append(new Option('未登録: '+d[key],d[key]));
      for(const item of items)select.append(new Option(item.label,item.id));select.value=d[key];
      const info=document.createElement('p');info.style.fontSize='11px';const describe=()=>{info.textContent=items.find(item=>item.id===d[key])?.algorithm??'この実装は現在登録されていません。';};
      select.addEventListener('change',()=>{d[key]=select.value;this.changed();status.textContent=this.message;describe();});describe();label.append(select,info);container.append(label);
    };
    choice('円弧の再計算実装','implementation',this.manager.host.implementations('arc'));choice('円弧の再描画実装','renderer',this.manager.host.renderers('arc'));
    container.append(status);button('プレビュー','preview',()=>this.showPreview());button('適用','apply',()=>this.apply());button('取消','cancel',()=>this.cancel());
  }
}
window.ArcEditor=ArcEditor;
