// Transactional reconstruction of one selected spline. The source stays untouched until Apply.
class SplineEditor {
  constructor(manager, refresh) {this.manager=manager;this.refresh=refresh;this.element=null;this.draft=null;this.preview=null;this.message='';this.controls=new SplineControlHandles(this);}
  select(element) {
    if(this.element!==element){this.cancel(false);this.element=element;}
  }
  cancel(refresh=true) {this.controls.close();this.preview?.remove();this.preview=null;this.draft=null;this.message='';if(this.manager.activeToolName==='select')this.manager.tools.select.refreshHandles();if(refresh)this.refresh();}
  assertTarget() {
    if(!this.element?.isConnected || this.element.tagName!=='path' || !this.manager.tools.select.canSelect(this.element)) throw Error('編集対象が削除されたか、非表示・ロック中です。');
    if(this.draft && (this.manager.activeToolName!=='select' || window.selectedObjects?.length!==1 || window.selectedObjects[0]!==this.element))throw Error('編集対象の選択が変更されました。');
    if(this.draft && (this.element.getAttribute('d')!==this.originalPath || this.element.getAttribute('data-vector-spline')!==this.originalSource)) throw Error('編集中に元図形が変更されました。取消してから読み直してください。');
  }
  begin() {
    try {
      this.assertTarget();
      const source=window.VectorUtils.readSplineSource(this.element.getAttribute('data-vector-spline'),this.element.getAttribute('data-vector-implementation'),this.element.getAttribute('d'));
      this.originalPath=this.element.getAttribute('d');this.originalSource=this.element.getAttribute('data-vector-spline');
      const {input,options}=source;
      this.draft={...source,pointsText:input.points.map(p=>p.x+', '+p.y).join('\n'),degree:input.degree,periodic:!!input.periodic,
        knotsText:input.knots?.join(', ') ?? '',periodicKnotsText:input.periodicKnots?.join(', ') ?? '',weightsText:input.weights?.join(', ') ?? '',options:{...options}};
      this.message='座標は図形のローカル座標です。移動・回転・色・線幅・レイヤーは保持します。';
    } catch(error){this.message=error.message;}
    this.refresh();
    if(this.draft)this.controls.open();
  }
  input() {
    const d=this.draft;
    if(d.pointsText.length>200000)throw Error('制御点の入力が大きすぎます。');
    const rows=d.pointsText.split(/\r?\n/).filter(line=>line.trim());
    if(rows.length>1000)throw Error('制御点は1000個までです。');
    const numbers=text=>text.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    const points=rows.map((line,i)=>{
      const values=numbers(line);
      if(values.length!==2 || !values.every(Number.isFinite))throw Error(`制御点の${i+1}行目は有限な x, y の2数で指定してください。`);
      return {x:values[0],y:values[1]};
    });
    return {points,degree:Number(d.degree),periodic:d.periodic,
      ...(!d.periodic && d.knotsText.trim() ? {knots:numbers(d.knotsText)} : {}),
      ...(d.periodic && d.periodicKnotsText.trim() ? {periodicKnots:numbers(d.periodicKnotsText)} : {}),
      ...(d.method==='nurbsCurve' && d.weightsText.trim() ? {weights:numbers(d.weightsText)} : {})};
  }
  build() {
    this.assertTarget();
    const host=this.manager.host,d=this.draft;
    if(!host.implementations(d.method).some(v=>v.id===d.implementation))throw Error('記録された計算実装がありません。使用する実装を選び直してください。');
    if(!host.renderers(d.method).some(v=>v.id===d.renderer))throw Error('記録された描画実装がありません。使用する実装を選び直してください。');
    const previous=host.describe(d.method).id;
    try {
      host.selectImplementation(d.method,d.implementation);
      const shape=host.execute(d.method,this.input());
      if(!shape || shape.kind!=='splineCurve')throw Error('制御点数・次数・ノット・重みを確認してください。');
      const result=host.render(shape,null,{...d.options,toolName:d.method,renderer:d.renderer});
      if(!result || result.tagName!=='path' || !result.hasAttribute('data-vector-spline'))throw Error('現在の条件では再編集できるパスを作成できません。分母検査の上限・重み・実装を確認してください。');
      return result;
    } finally {host.selectImplementation(d.method,previous);}
  }
  showPreview(refresh=true) {
    this.preview?.remove();this.preview=null;
    try {
      const result=this.build(),canvas=this.manager.canvas;
      const matrix=canvas.getScreenCTM().inverse().multiply(this.element.getScreenCTM());
      const coefficients=[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f];
      if(!coefficients.every(Number.isFinite))throw Error('プレビューの座標変換を計算できません。');
      // getScreenCTM may return an SVGMatrix whose toString is not an SVG transform.
      result.setAttribute('transform','matrix('+coefficients.join(' ')+')');
      result.setAttribute('data-vector-preview','spline-edit');result.setAttribute('pointer-events','none');
      const style=getComputedStyle(this.element);
      result.setAttribute('fill','none');result.setAttribute('stroke','#1265d6');result.setAttribute('stroke-width',style.strokeWidth || '2');
      result.setAttribute('stroke-dasharray','6 3');result.setAttribute('vector-effect','non-scaling-stroke');
      canvas.append(result);this.preview=result;
      const record=JSON.parse(result.getAttribute('data-vector-implementation'));
      this.message=record.warning ?? '青い破線が再計算結果です。「適用」で元図形を更新します。';
    } catch(error){this.message=error.message;}
    this.controls.sync();
    if(refresh)this.refresh();else this.updateStatus();
  }
  apply() {
    try {
      const result=this.build(),target=this.element;
      const record=JSON.parse(result.getAttribute('data-vector-implementation'));
      if(record?.version!==1)throw Error('再計算結果の記録が不正です。');
      const warning=record.warning;
      // Only generated geometry and provenance are changed; element identity and all appearance stay.
      for(const name of ['d','data-vector-spline','data-vector-implementation','data-vector-partial']) {
        if(result.hasAttribute(name))target.setAttribute(name,result.getAttribute(name));else target.removeAttribute(name);
      }
      target.setAttribute('data-construction-tool',this.draft.method);
      if(result.hasAttribute('data-vector-partial')){target.setAttribute('fill','none');target.style.fill='none';}
      this.cancel(false);this.message=warning ? '適用しました。'+warning : '曲線を再計算して適用しました。';
      this.manager.host.save();this.manager.tools.select.refreshHandles();
    } catch(error){this.message=error.message;}
    this.refresh();
  }
  changed() {
    this.preview?.remove();this.preview=null;
    this.message='入力を変更しました。プレビューまたは適用で再計算します。';
    this.controls.sync();
  }
  updateStatus() {const el=document.querySelector('[data-spline-edit-status]');if(el)el.textContent=this.message;}
  updatePointsField() {const el=document.querySelector('[aria-label="編集する制御点（1行に x, y）"]');if(el&&this.draft)el.value=this.draft.pointsText;}
  render(container) {
    const message=document.createElement('p');message.dataset.splineEditStatus='';message.textContent=this.message;message.style.cssText='font-size:12px;line-height:1.6';
    const button=(text,action,id)=>{
      const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.splineAction=id;
      b.addEventListener('click',action);b.style.margin='4px 4px 4px 0';container.append(b);return b;
    };
    if(!this.draft){button('曲線を再編集',()=>this.begin(),'begin');container.append(message);return;}
    const d=this.draft;
    const hint=document.createElement('p');hint.textContent='番号付きの制御点をドラッグできます。灰色の破線は制御多角形、青い破線は変更後の曲線です。Shiftまたは直交モードで縦横に移動します。Escはドラッグ中ならその移動、移動中でなければ再編集全体を取り消します。';hint.style.fontSize='12px';container.append(hint);
    const field=(label,value,change,{multiline=false,type='text',min,max,step}={})=>{
      const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.style.cssText='display:block;font-size:12px;margin:10px 0';
      const input=document.createElement(multiline?'textarea':'input');if(!multiline)input.type=type;else input.rows=6;
      input.value=value;input.setAttribute('aria-label',label);input.style.cssText='width:100%;box-sizing:border-box;display:block';
      if(min!==undefined)input.min=min;if(max!==undefined)input.max=max;if(step!==undefined)input.step=step;
      input.addEventListener('input',()=>{change(type==='number'?Number(input.value):input.value);this.changed();message.textContent=this.message;});
      wrapper.append(input);container.append(wrapper);return input;
    };
    field('編集する制御点（1行に x, y）',d.pointsText,v=>d.pointsText=v,{multiline:true});
    field('編集する次数',d.degree,v=>d.degree=v,{type:'number',min:1,max:12,step:1});
    const periodic=document.createElement('label');periodic.textContent='周期曲線';
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=d.periodic;checkbox.setAttribute('aria-label','編集する周期指定');
    checkbox.addEventListener('change',()=>{d.periodic=checkbox.checked;this.changed();this.refresh();});periodic.prepend(checkbox);container.append(periodic);
    if(d.periodic){
      field('編集する周期ノット（制御点数+1個、空欄で一様）',d.periodicKnotsText,v=>d.periodicKnotsText=v);
      const note=document.createElement('p');note.textContent='減少しない値を指定します。同じ値は次数回まで。継ぎ目は先頭の同値数＋末尾の同値数−1で数えます。';note.dataset.periodicKnotHint='';note.style.fontSize='12px';container.append(note);
    }
    else field('編集するノット列（空欄で自動）',d.knotsText,v=>d.knotsText=v);
    button('ノットを自動生成',()=>{d[d.periodic?'periodicKnotsText':'knotsText']='';this.changed();this.refresh();},'auto-knots');
    if(d.method==='nurbsCurve')field('編集する重み（空欄で全て1）',d.weightsText,v=>d.weightsText=v);
    field('再描画の分割数',d.options.sampleCount,v=>d.options.sampleCount=v,{type:'number',min:2,max:10000,step:1});
    if(d.method==='nurbsCurve'){
      field('再描画の分母除外幅',d.options.poleTolerance,v=>d.options.poleTolerance=v,{type:'number',min:1e-14,max:0.1,step:'any'});
      field('再描画の検査深さ',d.options.maxDepth,v=>d.options.maxDepth=v,{type:'number',min:0,max:24,step:1});
      field('再描画の処理上限',d.options.maxNodes,v=>d.options.maxNodes=v,{type:'number',min:1,max:200000,step:1});
    }
    const choice=(label,key,items)=>{
      const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.style.cssText='display:block;font-size:12px;margin:10px 0';
      const select=document.createElement('select');select.setAttribute('aria-label',label);select.style.width='100%';
      if(!items.some(v=>v.id===d[key]))select.append(new Option('未登録: '+d[key],d[key]));
      for(const item of items)select.append(new Option(item.label,item.id));
      select.value=d[key];
      const info=document.createElement('p');info.style.fontSize='11px';
      const explain=()=>{info.textContent=items.find(v=>v.id===d[key])?.algorithm ?? 'この実装は現在登録されていません。';};
      select.addEventListener('change',()=>{d[key]=select.value;this.changed();message.textContent=this.message;explain();});explain();
      wrapper.append(select,info);container.append(wrapper);
    };
    choice('再計算の実装','implementation',this.manager.host.implementations(d.method));
    choice('再描画の実装','renderer',this.manager.host.renderers(d.method));
    container.append(message);
    button('プレビュー',()=>this.showPreview(),'preview');button('適用',()=>this.apply(),'apply');button('取消',()=>this.cancel(),'cancel');
  }
}
window.SplineEditor=SplineEditor;
