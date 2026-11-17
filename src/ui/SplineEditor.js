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
      this.draft={...source,insertKnotText:'',knotImplementation:this.manager.host.describe('insertSplineKnot').id,
        removeKnotText:'',removalToleranceText:'0.0000001',removeImplementation:this.manager.host.describe('removeSplineKnot').id,
        pointsText:input.points.map(p=>p.x+', '+p.y).join('\n'),degree:input.degree,periodic:!!input.periodic,
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
  insertKnot() {
    try {
      this.assertTarget();
      const d=this.draft,host=this.manager.host;
      if(d.implementation!=='default' || host.implementations(d.method).find(v=>v.id==='default')?.source!=='src/model/splineCurves.js')
        throw Error('形状を保つノット挿入は標準の曲線計算を選択してください。');
      if(!d.insertKnotText.trim())throw Error('挿入するノット値を入力してください。');
      const info=host.implementations('insertSplineKnot').find(v=>v.id===d.knotImplementation);
      if(!info)throw Error('選択したノット挿入実装がありません。');
      const refinement={tool:'insertSplineKnot',id:info.id,label:info.label,algorithm:info.algorithm,source:info.source ?? null,t:Number(d.insertKnotText)};
      const next=window.VectorUtils.insertEditableSplineKnot(d.method,this.input(),Number(d.insertKnotText),
        input=>host.execute('insertSplineKnot',input,{implementation:d.knotImplementation}));
      if(next.periodic){const start=next.periodicKnots[0],t=refinement.t===next.periodicKnots.at(-1)?start:refinement.t;
        refinement.periodic={algorithm:'3周期展開・同値ノット挿入・中央周期抽出',source:'src/adapters/periodicSplineRefinement.js',t,copies:t===start?2:3};}
      d.refinement=refinement;
      d.pointsText=next.points.map(p=>p.x+', '+p.y).join('\n');
      if(next.periodic)d.periodicKnotsText=next.periodicKnots.join(', ');else d.knotsText=next.knots.join(', ');
      if(next.weights)d.weightsText=next.weights.join(', ');
      this.changed();this.showPreview(false);
      this.message='ノットを下書きへ1個挿入しました。「適用」で図形へ反映します。 '+this.message;
    } catch(error){this.message=error.message;}
    this.refresh();
  }
  removeKnot() {
    try {
      this.assertTarget();
      const d=this.draft,host=this.manager.host;
      if(d.implementation!=='default'||host.implementations(d.method).find(v=>v.id==='default')?.source!=='src/model/splineCurves.js')
        throw Error('ノット削除は標準の曲線計算を選択してください。');
      if(!d.removeKnotText.trim()||!d.removalToleranceText.trim())throw Error('削除するノット値と許容差を入力してください。');
      const info=host.implementations('removeSplineKnot').find(v=>v.id===d.removeImplementation);
      if(!info)throw Error('選択したノット削除実装がありません。');
      const next=window.VectorUtils.removeEditableSplineKnot(d.method,this.input(),Number(d.removeKnotText),Number(d.removalToleranceText),
        input=>host.execute('removeSplineKnot',input,{implementation:d.removeImplementation}));
      d.refinement={tool:'removeSplineKnot',id:info.id,label:info.label,algorithm:info.algorithm,source:info.source??null,...next.removal,
        verification:next.periodic?{algorithm:'周期再構成・標準再挿入後の1周期全体の偏差上限を推定',source:'src/adapters/periodicSplineRemoval.js'}:
          {algorithm:'共通ノット列の制御点から偏差上限を推定',source:'src/model/splineKnotRemoval.js'}};
      d.pointsText=next.points.map(p=>p.x+', '+p.y).join('\n');
      if(next.periodic)d.periodicKnotsText=next.periodicKnots.join(', ');else d.knotsText=next.knots.join(', ');
      if(next.weights)d.weightsText=next.weights.join(', ');
      this.changed();this.showPreview(false);
      this.message=`ノットを下書きから1個削除しました。推定偏差上限 ${next.removal.errorBound}、許容差 ${next.removal.tolerance}。「適用」で反映します。 `+this.message;
    }catch(error){this.message=error.message;}
    this.refresh();
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
      if(d.refinement){const record=JSON.parse(result.getAttribute('data-vector-implementation'));record.refinement=d.refinement;result.setAttribute('data-vector-implementation',JSON.stringify(record));}
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
    const knotInfo=document.createElement('p');knotInfo.dataset.splineKnotInfo='';knotInfo.style.fontSize='12px';
    knotInfo.textContent=(d.periodic?'周期展開と中央周期の抽出で形状を保ち、周期ノットと制御点を1個増やします。両端の値は同じ継ぎ目として扱い、循環重複度は次数までです。':'標準B-spline・NURBSの形状を保ちながら、内部ノットと制御点を1個増やします。')+'複数回挿入も「適用」までは下書きです。';container.append(knotInfo);
    {
      const label=document.createElement('label');label.textContent='挿入するノット値';label.style.cssText='display:block;font-size:12px;margin:10px 0';
      const knot=document.createElement('input');knot.type='text';knot.value=d.insertKnotText;knot.setAttribute('aria-label','挿入するノット値');knot.style.width='100%';
      knot.addEventListener('input',()=>{d.insertKnotText=knot.value;});label.append(knot);container.append(label);
      choice('ノット挿入の実装','knotImplementation',this.manager.host.implementations('insertSplineKnot'));
      button('形状を保ってノットを挿入',()=>this.insertKnot(),'insert-knot');
    }

    const removalInfo=document.createElement('p');removalInfo.dataset.splineRemovalInfo='';removalInfo.style.fontSize='12px';
    removalInfo.textContent=(d.periodic?'3周期展開・中央周期抽出・再挿入照合で、内部ノットと重複した継ぎ目を削除します。両端は同じ継ぎ目として扱い、継ぎ目の最後のノットは保持します。':'内部ノットを1個削除し、制御点から推定した偏差上限が許容差以下の場合に下書きを更新します。')+'NURBSの重みは全て正、または全て負が対象です。許容差は図形のローカル座標で指定し、各削除の直前の曲線と比較します。';container.append(removalInfo);
    {
      for(const [labelText,key] of [['削除するノット値','removeKnotText'],['ノット削除の許容差','removalToleranceText']]){
        const label=document.createElement('label');label.textContent=labelText;label.style.cssText='display:block;font-size:12px;margin:10px 0';
        const value=document.createElement('input');value.type='text';value.value=d[key];value.setAttribute('aria-label',labelText);value.style.width='100%';
        value.addEventListener('input',()=>{d[key]=value.value;});label.append(value);container.append(label);
      }
      choice('ノット削除の実装','removeImplementation',this.manager.host.implementations('removeSplineKnot'));
      button('許容差内でノットを削除',()=>this.removeKnot(),'remove-knot');
    }

    container.append(message);
    button('プレビュー',()=>this.showPreview(),'preview');button('適用',()=>this.apply(),'apply');button('取消',()=>this.cancel(),'cancel');
  }
}
window.SplineEditor=SplineEditor;
