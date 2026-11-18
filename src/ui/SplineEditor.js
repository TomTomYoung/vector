// Transactional reconstruction of one selected spline. The source stays untouched until Apply.
class SplineEditor {
  constructor(manager, refresh) {this.manager=manager;this.refresh=refresh;this.element=null;this.draft=null;this.preview=null;this.message='';this.controls=new SplineControlHandles(this);}
  select(element) {
    if(this.element!==element){this.cancel(false);this.element=element;}
  }
  cancel(refresh=true) {this.controls.close();this.preview?.remove();this.preview=null;this.draft=null;this.referenceCheck=null;this.message='';if(this.manager.activeToolName==='select')this.manager.tools.select.refreshHandles();if(refresh)this.refresh();}
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
      this.draft={...source,countAppliedChanges:!!source.referenceBudget?.checkpoints,referenceToleranceText:String(source.referenceBudget?.tolerance??0.1),insertKnotText:'',knotImplementation:this.manager.host.describe('insertSplineKnot').id,
        simplificationToleranceText:'0.0000001',simplificationImplementation:this.manager.host.describe('simplifySplineKnots').id,
        planTargetText:String(Math.max(1,input.degree-2)),planToleranceText:'0.001',planImplementation:this.manager.host.describe('reduceSplineToDegree').id,
        reductionToleranceText:'0.0000001',reduceImplementation:this.manager.host.describe('reduceSplineDegree').id,
        elevationToleranceText:'0.0000001',elevateImplementation:this.manager.host.describe('elevateSplineDegree').id,
        removeKnotText:'',removalToleranceText:'0.0000001',removeImplementation:this.manager.host.describe('removeSplineKnot').id,
        pointsText:input.points.map(p=>p.x+', '+p.y).join('\n'),degree:input.degree,periodic:!!input.periodic,
        knotsText:input.knots?.join(', ') ?? '',periodicKnotsText:input.periodicKnots?.join(', ') ?? '',weightsText:input.weights?.join(', ') ?? '',options:{...options}};
      this.message='座標は図形のローカル座標です。移動・回転・色・線幅・レイヤーは保持します。';
      if(source.referenceReport)this.message+=' '+this.referenceText(source.referenceReport);
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
  referenceText(report) {
    return '基準曲線からの推定偏差上限 '+report.errorBound+(report.cumulative===undefined?'':'、適用ごとの累積偏差上限 '+report.cumulative)+'、残りの許容差 '+report.remaining+'。';
  }
  checkReference(input,budget=this.draft.referenceBudget) {
    if(!budget)return null;
    const d=this.draft,host=this.manager.host;
    if(d.implementation!=='default'||host.implementations(d.method).find(v=>v.id==='default')?.source!=='src/model/splineCurves.js')
      throw Error('基準曲線との比較には標準の曲線計算を選択してください。');
    if(this.referenceCheck?.budget!==budget){
      this.referenceCheck={budget,compare:window.VectorUtils.prepareSplineReferenceBudget(d.method,budget)};
    }
    return this.referenceCheck.compare(input);
  }
  setReference() {
    try {
      this.assertTarget();
      const d=this.draft,input=this.input();
      if(!d.referenceToleranceText.trim())throw Error('基準曲線からの許容差を入力してください。');
      const budget={version:1,reference:d.referenceBudget?.reference??input,tolerance:Number(d.referenceToleranceText),
        ...(d.countAppliedChanges?{checkpoints:d.referenceBudget?.checkpoints??[]}: {})};
      const report=this.checkReference(input,budget);
      d.referenceBudget=budget;
      this.message='基準曲線と許容差を下書きに設定しました。「適用」で保存します。 '+this.referenceText(report);
    } catch(error){this.message=error.message;}
    this.refresh();
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
      this.checkReference(next);
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
      this.checkReference(next);
      d.refinement={tool:'removeSplineKnot',id:info.id,label:info.label,algorithm:info.algorithm,source:info.source??null,...next.removal,
        verification:next.removal.denominator?{algorithm:(next.periodic?'周期再構成・標準再挿入後の':'')+'Bernstein分母範囲と区間別偏差上限を検証',source:'src/model/splineDeviation.js'}:next.periodic?{algorithm:'周期再構成・標準再挿入後の1周期全体の偏差上限を推定',source:'src/adapters/periodicSplineRemoval.js'}:
          {algorithm:'共通ノット列の制御点から偏差上限を推定',source:'src/model/splineKnotRemoval.js'}};
      d.pointsText=next.points.map(p=>p.x+', '+p.y).join('\n');
      if(next.periodic)d.periodicKnotsText=next.periodicKnots.join(', ');else d.knotsText=next.knots.join(', ');
      if(next.weights)d.weightsText=next.weights.join(', ');
      this.changed();this.showPreview(false);
      const moved=next.removal.periodic?.domainShift;
      this.message=`ノットを下書きから1個削除しました。${moved?`パラメータ区間 ${moved.from.join('〜')} → ${moved.to.join('〜')}（周期 ${moved.period}）。`:''}推定偏差上限 ${next.removal.errorBound}、許容差 ${next.removal.tolerance}。「適用」で反映します。 `+this.message;
    }catch(error){this.message=error.message;}
    this.refresh();
  }
  simplifyKnots() {
    try {
      this.assertTarget();const d=this.draft,host=this.manager.host;
      if(d.implementation!=='default'||host.implementations(d.method).find(v=>v.id==='default')?.source!=='src/model/splineCurves.js')throw Error('ノット一括簡約は標準の曲線計算を選択してください。');
      if(!d.simplificationToleranceText.trim())throw Error('ノット一括簡約の全体許容差を入力してください。');
      const info=host.implementations('simplifySplineKnots').find(v=>v.id===d.simplificationImplementation);if(!info)throw Error('選択したノット一括簡約実装がありません。');
      const next=window.VectorUtils.simplifyEditableSplineKnots(d.method,this.input(),Number(d.simplificationToleranceText),input=>host.execute('simplifySplineKnots',input,{implementation:d.simplificationImplementation}));
      if(!next.simplification.removedKnots){this.message='現在の方式と全体許容差では削除できるノットがありません。下書きは保持しています。';this.refresh();return;}
      this.checkReference(next);
      d.refinement={tool:'simplifySplineKnots',id:info.id,label:info.label,algorithm:info.algorithm,source:info.source??null,...next.simplification};
      d.pointsText=next.points.map(p=>p.x+', '+p.y).join('\n');
      if(next.periodic)d.periodicKnotsText=next.periodicKnots.join(', ');else d.knotsText=next.knots.join(', ');
      if(next.weights)d.weightsText=next.weights.join(', ');
      this.changed();this.showPreview(false);
      this.message=`ノットを${next.simplification.removedKnots}個削除、制御点 ${next.simplification.originalControlCount} → ${next.simplification.controlCount}個。処理時の累積偏差上限 ${next.simplification.errorBound}、全体許容差 ${next.simplification.tolerance}。「適用」で図形へ反映します。 `+this.message;
    }catch(error){this.message=error.message;}this.refresh();
  }
  elevateDegree() {
    try {
      this.assertTarget();
      const d=this.draft,host=this.manager.host;
      if(d.implementation!=='default'||host.implementations(d.method).find(v=>v.id==='default')?.source!=='src/model/splineCurves.js')
        throw Error('形状を保つ次数上げは標準の曲線計算を選択してください。');
      if(!d.elevationToleranceText.trim())throw Error('次数上げの検証許容差を入力してください。');
      const info=host.implementations('elevateSplineDegree').find(v=>v.id===d.elevateImplementation);
      if(!info)throw Error('選択した次数上げ実装がありません。');
      const next=window.VectorUtils.elevateEditableSplineDegree(d.method,this.input(),Number(d.elevationToleranceText),
        input=>host.execute('elevateSplineDegree',input,{implementation:d.elevateImplementation}));
      this.checkReference(next);
      d.refinement={tool:'elevateSplineDegree',id:info.id,label:info.label,algorithm:info.algorithm,source:info.source??null,...next.elevation};
      d.degree=next.degree;d.pointsText=next.points.map(p=>p.x+', '+p.y).join('\n');
      if(next.periodic)d.periodicKnotsText=next.periodicKnots.join(', ');else d.knotsText=next.knots.join(', ');
      if(next.weights)d.weightsText=next.weights.join(', ');
      this.changed();this.showPreview(false);
      this.message=`次数 ${next.elevation.fromDegree} → ${next.degree}。${next.elevation.representation.label}、制御点 ${next.points.length}個。推定偏差上限 ${next.elevation.errorBound}、許容差 ${next.elevation.tolerance}。「適用」で図形へ反映します。 `+this.message;
    }catch(error){this.message=error.message;}
    this.refresh();
  }
  reduceDegree() {
    try {
      this.assertTarget();
      const d=this.draft,host=this.manager.host;
      if(d.implementation!=='default'||host.implementations(d.method).find(v=>v.id==='default')?.source!=='src/model/splineCurves.js')
        throw Error('次数下げは標準の曲線計算を選択してください。');
      if(!d.reductionToleranceText.trim())throw Error('次数下げの許容差を入力してください。');
      const info=host.implementations('reduceSplineDegree').find(v=>v.id===d.reduceImplementation);
      if(!info)throw Error('選択した次数下げ実装がありません。');
      const next=window.VectorUtils.reduceEditableSplineDegree(d.method,this.input(),Number(d.reductionToleranceText),
        input=>host.execute('reduceSplineDegree',input,{implementation:d.reduceImplementation}));
      this.checkReference(next);
      d.refinement={tool:'reduceSplineDegree',id:info.id,label:info.label,algorithm:info.algorithm,source:info.source??null,...next.reduction};
      d.degree=next.degree;d.pointsText=next.points.map(p=>p.x+', '+p.y).join('\n');
      if(next.periodic)d.periodicKnotsText=next.periodicKnots.join(', ');else d.knotsText=next.knots.join(', ');
      if(next.weights)d.weightsText=next.weights.join(', ');
      this.changed();this.showPreview(false);
      const moved=next.reduction.periodic?.domainShift,subdivision=next.reduction.subdivision;
      this.message=`次数 ${next.reduction.fromDegree} → ${next.degree}、${next.reduction.representation.label}、制御点 ${next.points.length}個。`+
        (subdivision?`区間 ${subdivision.originalSpans} → ${subdivision.resultSpans}、自動分割 ${subdivision.splits}回、深さ ${subdivision.depth}。`:'')+
        (moved?`パラメータ区間 ${moved.from.join('〜')} → ${moved.to.join('〜')}、周期 ${moved.period}。`:'')+
        `推定偏差上限 ${next.reduction.errorBound}、許容差 ${next.reduction.tolerance}。「適用」で図形へ反映します。 `+this.message;
    }catch(error){this.message=error.message;}
    this.refresh();
  }
  reduceToDegree() {
    try {
      this.assertTarget();const d=this.draft,host=this.manager.host;
      if(d.implementation!=='default'||host.implementations(d.method).find(v=>v.id==='default')?.source!=='src/model/splineCurves.js')throw Error('一括次数下げは標準の曲線計算を選択してください。');
      if(!d.planTargetText.trim()||!d.planToleranceText.trim())throw Error('目標次数と全体許容差を入力してください。');
      const info=host.implementations('reduceSplineToDegree').find(v=>v.id===d.planImplementation);if(!info)throw Error('選択した一括次数下げ実装がありません。');
      const next=window.VectorUtils.reduceEditableSplineToDegree(d.method,this.input(),Number(d.planTargetText),Number(d.planToleranceText),input=>host.execute('reduceSplineToDegree',input,{implementation:d.planImplementation}));
      this.checkReference(next);
      d.refinement={tool:'reduceSplineToDegree',id:info.id,label:info.label,algorithm:info.algorithm,source:info.source??null,...next.reductionPlan};
      d.degree=next.degree;d.pointsText=next.points.map(p=>p.x+', '+p.y).join('\n');
      if(next.periodic)d.periodicKnotsText=next.periodicKnots.join(', ');else d.knotsText=next.knots.join(', ');
      if(next.weights)d.weightsText=next.weights.join(', ');
      this.changed();this.showPreview(false);
      this.message=`次数 ${next.reductionPlan.fromDegree} → ${next.degree}、${next.reductionPlan.stepCount}段階。処理時の累積偏差上限 ${next.reductionPlan.errorBound}、全体許容差 ${next.reductionPlan.tolerance}、残予算 ${next.reductionPlan.remainingBudget}。「適用」で図形へ反映します。 `+this.message;
    }catch(error){this.message=error.message;}this.refresh();
  }
  build() {
    this.assertTarget();
    const host=this.manager.host,d=this.draft;
    if(!host.implementations(d.method).some(v=>v.id===d.implementation))throw Error('記録された計算実装がありません。使用する実装を選び直してください。');
    if(!host.renderers(d.method).some(v=>v.id===d.renderer))throw Error('記録された描画実装がありません。使用する実装を選び直してください。');
    const previous=host.describe(d.method).id;
    try {
      host.selectImplementation(d.method,d.implementation);
      const input=this.input();
      const shape=host.execute(d.method,input);
      if(!shape || shape.kind!=='splineCurve')throw Error('制御点数・次数・ノット・重みを確認してください。');
      const result=host.render(shape,null,{...d.options,toolName:d.method,renderer:d.renderer});
      if(!result || result.tagName!=='path' || !result.hasAttribute('data-vector-spline'))throw Error('現在の条件では再編集できるパスを作成できません。分母検査の上限・重み・実装を確認してください。');
      let report=null;
      if(d.referenceBudget){
        const raw=result.getAttribute('data-vector-spline');
        const actual=window.VectorUtils.readSplineSource(raw,result.getAttribute('data-vector-implementation'),result.getAttribute('d'));
        report=this.checkReference(actual.input);
        const source=JSON.parse(raw);
        const budget=d.referenceBudget;
        source.referenceBudget=report.step>0?{...budget,checkpoints:[...budget.checkpoints,actual.input]}:budget;
        const encoded=JSON.stringify(source);
        if(encoded.length>4000000)throw Error('基準曲線を含むSVG編集データが保存上限を超えます。');
        result.setAttribute('data-vector-spline',encoded);
      }
      if(d.refinement){const record=JSON.parse(result.getAttribute('data-vector-implementation'));record.refinement=d.refinement;result.setAttribute('data-vector-implementation',JSON.stringify(record));}
      return {result,report};
    } finally {host.selectImplementation(d.method,previous);}
  }
  showPreview(refresh=true) {
    this.preview?.remove();this.preview=null;
    try {
      const {result,report}=this.build(),canvas=this.manager.canvas;
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
      if(report)this.message+=' '+this.referenceText(report);
    } catch(error){this.message=error.message;}
    this.controls.sync();
    if(refresh)this.refresh();else this.updateStatus();
  }
  apply() {
    try {
      const {result,report}=this.build(),target=this.element;
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
      if(report)this.message+=' '+this.referenceText(report);
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
    const button=(text,action,id,parent=container)=>{
      const b=document.createElement('button');b.type='button';b.textContent=text;b.dataset.splineAction=id;
      b.addEventListener('click',action);b.style.margin='4px 4px 4px 0';parent.append(b);return b;
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
    const group=document.createElement('fieldset'),legend=document.createElement('legend');
    legend.textContent='基準曲線からの許容差';group.append(legend);container.append(group);
    const label=document.createElement('label');label.textContent='許容差（図形のローカル座標）';
    const tolerance=document.createElement('input');tolerance.type='text';tolerance.setAttribute('aria-label','基準曲線からの許容差');tolerance.value=d.referenceToleranceText;
    tolerance.addEventListener('input',()=>{d.referenceToleranceText=tolerance.value;});label.append(tolerance);group.append(label);
    const countLabel=document.createElement('label'),count=document.createElement('input');
    count.type='checkbox';count.checked=d.countAppliedChanges;count.disabled=!!d.referenceBudget;
    count.addEventListener('change',()=>{d.countAppliedChanges=count.checked;});
    countLabel.append(count,'適用ごとの変化も累積する');group.append(countLabel);
    button(d.referenceBudget?'許容差を更新':'現在の下書きを基準にする',()=>this.setReference(),'set-reference',group);
    if(d.referenceBudget){
      const note=document.createElement('p');note.textContent='設定中の許容差 '+d.referenceBudget.tolerance+'。プレビュー・適用時に保存した基準から曲線全体を検査します。';group.append(note);
      button('基準を解除',()=>{delete d.referenceBudget;this.changed();this.refresh();},'clear-reference',group);
    }
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
    removalInfo.textContent=(d.periodic?'3周期展開・1周期抽出・再挿入照合でノットを削除します。両端は同じ継ぎ目として扱います。継ぎ目の最後のノットを削除すると、周期を保ってパラメータ区間の始端を次のノットへ移します。':'内部ノットを1個削除し、制御点から推定した偏差上限が許容差以下の場合に下書きを更新します。')+'零・正負混在のNURBS重みも、全区間の分母を零から分離して検証できる場合に対応します。極や未検証区間を含む曲線は削除しません。許容差は図形のローカル座標で指定し、各削除の直前の曲線と比較します。';container.append(removalInfo);
    {
      for(const [labelText,key] of [['削除するノット値','removeKnotText'],['ノット削除の許容差','removalToleranceText']]){
        const label=document.createElement('label');label.textContent=labelText;label.style.cssText='display:block;font-size:12px;margin:10px 0';
        const value=document.createElement('input');value.type='text';value.value=d[key];value.setAttribute('aria-label',labelText);value.style.width='100%';
        value.addEventListener('input',()=>{d[key]=value.value;});label.append(value);container.append(label);
      }
      choice('ノット削除の実装','removeImplementation',this.manager.host.implementations('removeSplineKnot'));
      button('許容差内でノットを削除',()=>this.removeKnot(),'remove-knot');
    }

    const simplificationInfo=document.createElement('p');simplificationInfo.dataset.splineSimplificationInfo='';simplificationInfo.style.fontSize='12px';
    simplificationInfo.textContent='曲線全体を順に走査し、削除ごとの偏差上限の合計を全体許容差内に収めます。許容差は実行直前の曲線を基準とするローカル座標の距離です。周期継ぎ目が消える場合は区間始端を移します。走査順で結果が変わり、最少制御点数は保証しません。';container.append(simplificationInfo);
    {
      const label=document.createElement('label');label.textContent='ノット一括簡約の全体許容差';label.style.cssText='display:block;font-size:12px;margin:10px 0';
      const value=document.createElement('input');value.type='text';value.value=d.simplificationToleranceText;value.setAttribute('aria-label',label.textContent);value.style.width='100%';
      value.addEventListener('input',()=>{d.simplificationToleranceText=value.value;});label.append(value);container.append(label);
      choice('ノット一括簡約の実装','simplificationImplementation',this.manager.host.implementations('simplifySplineKnots'));
      button('全体許容差内でノットを一括簡約',()=>this.simplifyKnots(),'simplify-knots');
    }

    const elevationInfo=document.createElement('p');elevationInfo.dataset.splineElevationInfo='';elevationInfo.style.fontSize='12px';
    elevationInfo.textContent='標準は区間ベジェ接続、連続性を保つ方式は元の内部ノットの重複度を1つ増やします。次数は11まで、結果は1000制御点までです。方式によって制御点とノットの数が変わります。検証許容差はローカル座標の各操作直前との偏差に用います。上の次数欄の直接変更は形状を保持しません。';container.append(elevationInfo);
    {
      const label=document.createElement('label');label.textContent='次数上げの検証許容差';label.style.cssText='display:block;font-size:12px;margin:10px 0';
      const value=document.createElement('input');value.type='text';value.value=d.elevationToleranceText;value.setAttribute('aria-label','次数上げの検証許容差');value.style.width='100%';
      value.addEventListener('input',()=>{d.elevationToleranceText=value.value;});label.append(value);container.append(label);
      choice('次数上げの実装','elevateImplementation',this.manager.host.implementations('elevateSplineDegree'));
      button('形状を保って次数を1上げる',()=>this.elevateDegree(),'elevate-degree');
    }

    const reductionInfo=document.createElement('p');reductionInfo.dataset.splineReductionInfo='';reductionInfo.style.fontSize='12px';
    reductionInfo.textContent='標準方式は全区間の端点を固定し、接線以上の連続性は保証しません。自動分割方式は許容差を満たさない区間だけ二分割し、全区間を再検証します。分割点も固定し、最大深さ12・結果1000制御点まで。分割で制御点が増える場合があり、接線以上の連続性は保証しません。処理上限や極のため確認できない場合は下書きを保持します。連続性保持方式はノットを減らして元のノット列が定める滑らかさを保ち、通常の接続点と周期の継ぎ目は許容差内で移動します。非周期の両端と不連続点の片側端点は固定します。単純な周期継ぎ目が消える場合は、残る最初のノットへ始端を移し、周期を保ちます。変更区間を結果に表示します。残る基底が不足する入力や、区間を有限精度で保持できない場合は実行できません。次数2〜12、結果1000制御点まで。許容差はローカル座標で各操作直前の曲線と比較します。';container.append(reductionInfo);
    {
      const label=document.createElement('label');label.textContent='次数下げの許容差';label.style.cssText='display:block;font-size:12px;margin:10px 0';
      const value=document.createElement('input');value.type='text';value.value=d.reductionToleranceText;value.setAttribute('aria-label','次数下げの許容差');value.style.width='100%';
      value.addEventListener('input',()=>{d.reductionToleranceText=value.value;});label.append(value);container.append(label);
      choice('次数下げの実装','reduceImplementation',this.manager.host.implementations('reduceSplineDegree'));
      button('許容差内で次数を1下げる',()=>this.reduceDegree(),'reduce-degree');
    }

    const planInfo=document.createElement('p');planInfo.dataset.splineReductionPlanInfo='';planInfo.style.fontSize='12px';
    planInfo.textContent='一括次数下げは、この実行直前の曲線から目標次数までの累積偏差を制限します。残予算を残段階へ分配し、各段階の全区間偏差上限を加算します。全段階が成功した場合だけ下書きへ反映します。過去や後続の別操作の誤差は含みません。適応分割は接線以上の連続性を保証せず、制御点数が増える場合があります。';container.append(planInfo);
    for(const [label,key] of [['一括次数下げの目標次数','planTargetText'],['一括次数下げの全体許容差','planToleranceText']]){
      const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.style.cssText='display:block;font-size:12px;margin:10px 0';
      const value=document.createElement('input');value.type='text';value.value=d[key];value.setAttribute('aria-label',label);value.style.width='100%';value.addEventListener('input',()=>{d[key]=value.value;});wrapper.append(value);container.append(wrapper);
    }
    choice('一括次数下げの実装','planImplementation',this.manager.host.implementations('reduceSplineToDegree'));
    button('全体許容差内で目標次数まで下げる',()=>this.reduceToDegree(),'reduce-to-degree');

    container.append(message);
    button('プレビュー',()=>this.showPreview(),'preview');button('適用',()=>this.apply(),'apply');button('取消',()=>this.cancel(),'cancel');
  }
}
window.SplineEditor=SplineEditor;
