// Edit the exact circle model while allowing its SVG representation to change.
class CircleEditor {
  constructor(manager, refresh) {
    this.manager=manager;this.refresh=refresh;this.element=null;this.draft=null;this.preview=null;this.message='';
    this.controls=new CircleControlHandles(this);
  }
  select(element) {if(this.element!==element){this.cancel(false);this.element=element;}}
  cancel(refresh=true) {
    this.controls.close();this.preview?.remove();this.preview=null;this.draft=null;this.message='';
    if(this.manager.activeToolName==='select')this.manager.tools.select.refreshHandles();
    if(refresh)this.refresh();
  }
  snapshot() {return JSON.stringify(window.VectorUtils.circleSource.circleGeometrySnapshot(this.element));}
  assertTarget() {
    if(!this.element?.isConnected || !this.manager.tools.select.canSelect(this.element))throw Error('編集対象が削除されたか、非表示・ロック中です。');
    if(this.manager.activeToolName!=='select' || window.selectedObjects?.length!==1 || window.selectedObjects[0]!==this.element)throw Error('編集対象の選択が変更されました。');
    if(this.draft && (this.snapshot()!==this.originalGeometry || this.element.getAttribute('data-vector-circle')!==this.originalSource ||
        this.element.getAttribute('data-vector-implementation')!==this.originalRecord))throw Error('編集中に元図形が変更されました。取消してから読み直してください。');
  }
  begin() {
    try {
      this.assertTarget();
      const source=window.VectorUtils.circleSource.readCircleSource(this.element.getAttribute('data-vector-circle'),
        this.element.getAttribute('data-vector-implementation'),window.VectorUtils.circleSource.circleGeometrySnapshot(this.element));
      this.originalGeometry=this.snapshot();this.originalSource=this.element.getAttribute('data-vector-circle');
      this.originalRecord=this.element.getAttribute('data-vector-implementation');
      this.draft={...source,cx:String(source.model.center.x),cy:String(source.model.center.y),radius:String(source.model.radius)};
      this.message='図形のローカル座標で中心・半径を編集します。色・変形・レイヤーは保持します。';
    } catch(error){this.message=error.message;}
    this.refresh();
    if(this.draft)this.controls.open();
  }
  input() {
    const d=this.draft;
    const number=value=>String(value).trim() ? Number(value) : NaN;
    const input={center:{x:number(d.cx),y:number(d.cy)},radius:number(d.radius)};
    window.VectorUtils.circleSource.circleModel({kind:'circle',...input});
    if(input.radius<=0)throw Error('半径は0より大きくしてください。');
    return input;
  }
  build() {
    this.assertTarget();
    const host=this.manager.host,d=this.draft,input=this.input();
    if(!host.implementations('circle').some(v=>v.id===d.implementation))throw Error('記録された計算実装がありません。使用する実装を選び直してください。');
    if(!host.renderers('circle').some(v=>v.id===d.renderer))throw Error('記録された描画実装がありません。使用する実装を選び直してください。');
    const previous=host.describe('circle').id;
    try {
      host.selectImplementation('circle',d.implementation);
      // Explicit radius is the editing contract; a point is also supplied for older plugins.
      const shape=host.execute('circle',{...input,point:{x:input.center.x+input.radius,y:input.center.y}});
      const model=window.VectorUtils.circleSource.circleModel(shape);
      if(model.radius<=0)throw Error('計算実装が正の半径を返しませんでした。');
      const result=host.render(shape,null,{...d.options,toolName:'circle',renderer:d.renderer});
      const geometry=window.VectorUtils.circleSource.circleGeometrySnapshot(result);
      if(geometry.tag==='path' && (!geometry.d || /NaN|Infinity/.test(geometry.d)))throw Error('描画結果の座標が不正です。');
      window.VectorUtils.circleSource.readCircleSource(result.getAttribute('data-vector-circle'),result.getAttribute('data-vector-implementation'),geometry);
      const record=JSON.parse(result.getAttribute('data-vector-implementation'));
      record.parameters={center:model.center,radius:model.radius};
      record.circleEdit={mode:'center-radius',origin:d.origin};
      result.setAttribute('data-vector-implementation',JSON.stringify(record));
      return result;
    } finally {host.selectImplementation('circle',previous);}
  }
  changed() {this.controls.stop(false);this.preview?.remove();this.preview=null;this.message='入力を変更しました。プレビューまたは適用で再計算します。';this.controls.sync();}
  updateStatus() {const status=document.querySelector('[data-circle-edit-status]');if(status)status.textContent=this.message;}
  updateFields() {
    if(!this.draft)return;
    for(const [key,label] of [['cx','円の中心X'],['cy','円の中心Y'],['radius','円の半径']]){
      const input=document.querySelector(`[aria-label="${label}"]`);if(input)input.value=this.draft[key];
    }
  }
  showPreview(refresh=true) {
    this.preview?.remove();this.preview=null;
    try {
      const result=this.build(),canvas=this.manager.canvas;
      const matrix=canvas.getScreenCTM().inverse().multiply(this.element.getScreenCTM());
      const values=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f];
      if(!values.every(Number.isFinite))throw Error('プレビューの座標変換を計算できません。');
      result.setAttribute('transform','matrix('+values.join(' ')+')');
      result.setAttribute('data-vector-preview','circle-edit');result.setAttribute('pointer-events','none');
      result.setAttribute('fill','none');result.setAttribute('stroke','#1265d6');result.setAttribute('stroke-width','2');
      result.setAttribute('stroke-dasharray','6 3');result.setAttribute('vector-effect','non-scaling-stroke');
      canvas.append(result);this.preview=result;this.message='青い破線が再計算結果です。「適用」で元図形を更新します。';
    } catch(error){this.message=error.message;}
    this.controls.sync();
    if(refresh)this.refresh();else this.updateStatus();
  }
  apply() {
    try {
      const result=this.build(),old=this.element;
      const generated=['cx','cy','r','d','data-vector-circle','data-vector-implementation'];
      let target=old;
      if(result.tagName!==old.tagName) {
        target=result;
        for(const attr of old.attributes)if(!generated.includes(attr.name))target.setAttribute(attr.name,attr.value);
        for(const child of old.childNodes)target.append(child.cloneNode(true));
      }
      const circleTool=this.manager.tools.circle;
      // Preparation is complete. Commit geometry and replace the selected node only if required.
      this.cancel(false);circleTool.disconnectSelectedCircleObserver();
      if(target===old)for(const name of generated){
        if(result.hasAttribute(name))target.setAttribute(name,result.getAttribute(name));else target.removeAttribute(name);
      }
      else old.replaceWith(target);
      if(target.tagName==='circle') {
        target.setAttribute('data-circle-tool','true');circleTool.initializeCircleMetadata(target);
        circleTool.selectedCircleId=target.dataset.circleId;circleTool.observeSelectedCircle(target);
      } else {target.removeAttribute('data-circle-tool');circleTool.selectedCircleId=null;}
      target.setAttribute('data-construction-tool','circle');
      this.element=target;
      this.manager.tools.select.selectObject(target,false);
      this.message='中心・半径と描画方式を更新しました。';this.manager.host.save();
    } catch(error){this.message=error.message;}
    this.refresh();
  }
  render(container) {
    const status=document.createElement('p');status.dataset.circleEditStatus='';status.setAttribute('role','status');
    status.textContent=this.message;status.style.cssText='font-size:12px;line-height:1.6';
    const button=(label,id,action)=>{
      const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.circleAction=id;
      b.style.cssText='margin:4px';b.addEventListener('click',action);container.append(b);
    };
    if(!this.draft){button('円を再編集','begin',()=>this.begin());container.append(status);return;}
    const d=this.draft;
    const hint=document.createElement('p');hint.style.fontSize='12px';
    hint.textContent='中心と半径のハンドルをドラッグできます。Shift・直交モードでは図面の縦横方向へ拘束します。Escはドラッグ中ならその移動、それ以外は編集全体を取り消します。点群への当てはめ等の元の作図入力は再実行しません。';container.append(hint);
    const field=(label,value,change,min,max,step='any')=>{
      const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.style.cssText='display:block;font-size:12px;margin:10px 0';
      const input=document.createElement('input');input.type='number';input.value=value;input.step=step;
      if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;
      input.setAttribute('aria-label',label);input.style.cssText='width:100%;box-sizing:border-box;display:block';
      input.addEventListener('input',()=>{change(input.value);this.changed();status.textContent=this.message;});
      wrapper.append(input);container.append(wrapper);
    };
    field('円の中心X',d.cx,v=>d.cx=v);field('円の中心Y',d.cy,v=>d.cy=v);field('円の半径',d.radius,v=>d.radius=v,0);
    field('円の再描画分割数',d.options.sampleCount,v=>d.options.sampleCount=v.trim()?Number(v):NaN,2,10000,1);
    const choice=(label,key,items)=>{
      const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.style.cssText='display:block;font-size:12px;margin:10px 0';
      const select=document.createElement('select');select.setAttribute('aria-label',label);select.style.width='100%';
      if(!items.some(v=>v.id===d[key]))select.append(new Option('未登録: '+d[key],d[key]));
      for(const item of items)select.append(new Option(item.label,item.id));select.value=d[key];
      const info=document.createElement('p');info.style.fontSize='11px';
      const explain=()=>{info.textContent=items.find(v=>v.id===d[key])?.algorithm ?? 'この実装は現在登録されていません。';};
      select.addEventListener('change',()=>{d[key]=select.value;this.changed();status.textContent=this.message;explain();});explain();
      wrapper.append(select,info);container.append(wrapper);
    };
    choice('円の再計算実装','implementation',this.manager.host.implementations('circle'));
    choice('円の再描画実装','renderer',this.manager.host.renderers('circle'));
    container.append(status);button('プレビュー','preview',()=>this.showPreview());button('適用','apply',()=>this.apply());button('取消','cancel',()=>this.cancel());
  }
}
window.CircleEditor=CircleEditor;
