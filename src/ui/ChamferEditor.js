// Edit both setbacks and all three segments together from the original corner.
class ChamferEditor {
  constructor(manager,refresh){this.manager=manager;this.refresh=refresh;this.element=null;this.draft=null;this.preview=null;this.message='';}
  get api(){return window.VectorUtils.chamferSource;}
  snapshot(){return JSON.stringify(this.api.chamferGeometry(this.element));}
  select(element){if(this.element!==element){this.cancel(false);this.element=element;}}
  cancel(refresh=true){
    this.events?.abort();this.observer?.disconnect();this.layerObserver?.disconnect();this.resizeObserver?.disconnect();cancelAnimationFrame(this.frame);
    this.preview?.remove();this.preview=null;this.draft=null;this.message='';
    if(this.manager.activeToolName==='select')this.manager.tools.select.refreshHandles();if(refresh)this.refresh();
  }
  assertTarget(){
    if(!this.element?.isConnected||this.element.tagName!=='line'||!this.manager.tools.select.canSelect(this.element))throw Error('編集対象が削除されたか、非表示・ロック中です。');
    if(this.manager.activeToolName!=='select'||window.selectedObjects?.length!==1||window.selectedObjects[0]!==this.element)throw Error('編集対象の選択が変更されました。');
    if(this.draft){
      if(this.snapshot()!==this.originalGeometry||this.element.getAttribute('data-vector-chamfer')!==this.originalSource||this.element.getAttribute('data-vector-implementation')!==this.originalRecord)throw Error('編集中に元の面取りが変更されました。取消してから読み直してください。');
      const lines=this.api.resolveChamferLines(this.manager.canvas,this.element,this.draft,el=>this.manager.tools.select.canSelect(el));
      if(lines.some((line,i)=>line!==this.lines[i]))throw Error('対応する線分が置き換えられました。取消してから読み直してください。');
    }
  }
  begin(){
    try{
      this.assertTarget();const source=this.api.readChamferSource(this.element.getAttribute('data-vector-chamfer'),this.element.getAttribute('data-vector-implementation'),this.api.chamferGeometry(this.element));
      const lines=this.api.resolveChamferLines(this.manager.canvas,this.element,source,el=>this.manager.tools.select.canSelect(el));
      this.originalGeometry=this.snapshot();this.originalSource=this.element.getAttribute('data-vector-chamfer');this.originalRecord=this.element.getAttribute('data-vector-implementation');
      this.lines=lines;this.draft={...source,distance1:String(source.input.distance1),distance2:String(source.input.distance2)};
      this.message='距離は面取り線のローカル座標です。元の2線分から再計算し、3要素を一緒に更新します。';
      this.events=new AbortController();document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.cancel();}},{capture:true,signal:this.events.signal});
      const schedule=()=>{cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.sync());};
      this.observer=new MutationObserver(records=>{const nodes=[this.element,...this.lines];if(nodes.some(el=>!el.isConnected)||records.some(r=>nodes.some(el=>r.target===el||r.target.contains(el))))schedule();});
      this.observer.observe(this.manager.canvas,{subtree:true,childList:true,attributes:true,attributeFilter:['transform','style','viewBox','width','height','x1','y1','x2','y2','data-layer','data-vector-chamfer','data-vector-chamfer-line-id','data-vector-implementation']});
      this.layerObserver=new MutationObserver(schedule);const layers=document.getElementById('layer-list');if(layers)this.layerObserver.observe(layers,{subtree:true,childList:true});
      this.resizeObserver=new ResizeObserver(schedule);this.resizeObserver.observe(this.manager.canvas);window.addEventListener('resize',schedule,{signal:this.events.signal});this.manager.tools.select.removeControlPoints();
    }catch(error){this.message=error.message;}
    this.refresh();
  }
  sync(){
    if(!this.draft)return;
    try{this.assertTarget();if(this.preview)this.preview.setAttribute('transform',this.previewTransform());}
    catch(error){this.preview?.remove();this.preview=null;this.message=error.message;this.updateStatus();}
  }
  input(){const d=this.draft,number=s=>s.trim()?Number(s):NaN;return this.api.chamferInput({...d.input,distance1:number(d.distance1),distance2:number(d.distance2)});}
  previewTransform(){const frame=window.VectorUtils.splineControlGeometry.splineControlFrame(this.manager.canvas.getScreenCTM(),this.element.getScreenCTM());return window.VectorUtils.splineControlGeometry.splineMatrixText(frame.localCanvas);}
  build(){
    this.assertTarget();const host=this.manager.host,d=this.draft,input=this.input();
    if(!host.implementations('chamfer').some(v=>v.id===d.implementation))throw Error('記録された計算実装がありません。使用する実装を選び直してください。');
    if(!host.renderers('chamfer').some(v=>v.id===d.renderer))throw Error('記録された描画実装がありません。使用する実装を選び直してください。');
    const previous=host.describe('chamfer').id;
    try{
      host.selectImplementation('chamfer',d.implementation);const result=host.execute('chamfer',input);if(!result)throw Error('この2線分と距離では面取りを作れません。');
      return this.api.prepareChamferOutput(host,input,result,this.lines,d.bindings.map(b=>b.matrix),d.bindings.map(b=>b.id),{...d.options,renderer:d.renderer},d.origin);
    }finally{host.selectImplementation('chamfer',previous);}
  }
  showPreview(){
    this.preview?.remove();this.preview=null;
    try{
      const prepared=this.build(),group=window.SvgUtils.createElement('g',{'data-vector-preview':'chamfer-edit',transform:this.previewTransform(),'pointer-events':'none',fill:'none',stroke:'#1265d6','stroke-width':2,'stroke-dasharray':'6 3'});
      const result=JSON.parse(prepared.bridge.getAttribute('data-vector-chamfer')).result;group.append(prepared.bridge);
      for(const [start,end] of result.segments)group.append(window.SvgUtils.createElement('line',{x1:start.x,y1:start.y,x2:end.x,y2:end.y}));
      for(const el of group.children)el.setAttribute('vector-effect','non-scaling-stroke');this.manager.canvas.append(group);this.preview=group;this.message='青い破線が3線分の再計算結果です。「適用」で元図形を更新します。';
    }catch(error){this.message=error.message;}
    this.refresh();
  }
  apply(){
    try{
      const prepared=this.build(),target=this.element,lines=this.lines;this.cancel(false);this.api.applyChamferLines(lines,prepared.lines);
      for(const name of ['x1','y1','x2','y2','data-vector-chamfer','data-vector-implementation'])target.setAttribute(name,prepared.bridge.getAttribute(name));
      this.message='面取り線と両側の線分を更新しました。';this.manager.host.save();this.manager.tools.select.refreshHandles();
    }catch(error){this.message=error.message;}
    this.refresh();
  }
  changed(){this.preview?.remove();this.preview=null;this.message='入力を変更しました。プレビューまたは適用で再計算します。';this.updateStatus();}
  updateStatus(){const el=document.querySelector('[data-chamfer-edit-status]');if(el)el.textContent=this.message;}
  render(container){
    const status=document.createElement('p');status.dataset.chamferEditStatus='';status.setAttribute('role','status');status.style.cssText='font-size:12px;line-height:1.6';status.textContent=this.message;
    const button=(label,id,action)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.chamferAction=id;b.style.margin='4px';b.addEventListener('click',action);container.append(b);};
    if(!this.draft){button('面取りを再編集','begin',()=>this.begin());container.append(status);return;}
    const d=this.draft,hint=document.createElement('p');hint.style.fontSize='12px';hint.textContent='元の角の交点から第一線分・第二線分に沿った距離を指定します。一方の距離は0にできます。各要素を別々に変更した場合は停止します。Escで取消します。';container.append(hint);
    const original=document.createElement('p');original.style.fontSize='11px';original.textContent='元の線分: '+JSON.stringify({first:d.input.first,second:d.input.second});container.append(original);
    for(const [label,key] of [['面取りの距離1','distance1'],['面取りの距離2','distance2']]){
      const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.style.cssText='display:block;font-size:12px;margin:10px 0';
      const el=document.createElement('input');el.type='number';el.value=d[key];el.min=0;el.step='any';el.setAttribute('aria-label',label);el.style.width='100%';el.addEventListener('input',()=>{d[key]=el.value;this.changed();});wrapper.append(el);container.append(wrapper);
    }
    const choice=(label,key,items)=>{
      const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.style.cssText='display:block;font-size:12px;margin:10px 0';
      const select=document.createElement('select');select.setAttribute('aria-label',label);select.style.width='100%';if(!items.some(v=>v.id===d[key]))select.append(new Option('未登録: '+d[key],d[key]));
      for(const item of items)select.append(new Option(item.label,item.id));select.value=d[key];const info=document.createElement('p');info.style.fontSize='11px';
      const describe=()=>info.textContent=items.find(v=>v.id===d[key])?.algorithm??'この実装は現在登録されていません。';describe();select.addEventListener('change',()=>{d[key]=select.value;this.changed();describe();});wrapper.append(select,info);container.append(wrapper);
    };
    choice('面取りの再計算実装','implementation',this.manager.host.implementations('chamfer'));choice('面取りの再描画実装','renderer',this.manager.host.renderers('chamfer'));
    container.append(status);button('プレビュー','preview',()=>this.showPreview());button('適用','apply',()=>this.apply());button('取消','cancel',()=>this.cancel());
  }
}
window.ChamferEditor=ChamferEditor;
