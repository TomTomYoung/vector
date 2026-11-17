// Point-input controllers for algorithms whose input differs from the original drawing tools.
class PointConstructionTool extends BaseTool {
  constructor(canvas, manager, method, title) {
    super(canvas, manager);
    this.method = method; this.title = title; this.points = [];
    this.degree = 3; this.sampleCount = 80; this.weightsText = ''; this.knotsText = ''; this.periodicKnotsText = '';
    this.periodic = false; this.poleTolerance = 1e-8; this.poleMaxDepth = 18;
    this.inputPresetVersion = 1; this.inputPresetVersions = this.isSpline() ? [1,2] : [1]; this.voronoiBox = null;
    this.previewElement = null; this.handles = null; this.implementationError = '';
  }
  getTitle() { return this.title; }
  getInstructions() {
    return ['クリックで点を追加', 'Enterで確定、Backspaceで最後の点を削除、Escで取り消し',
      this.isSpline() ? `次数${this.degree}には制御点${this.degree + 1}個以上が必要です（現在${this.points.length}個）` : `入力順の点列を使用します（現在${this.points.length}個）`,
      ...(this.isSpline() ? [this.periodic ? '周期曲線：制御点数+1個の減少しない周期ノットを指定できます。同じ値は次数回まで、空欄は一様です' : '内部ノットを次数+1回重ねると、そこで別の枝に分かれます'] : []),
      ...(this.isSpline() && this.periodic ? ['継ぎ目の重複度は、先頭の同値数＋末尾の同値数−1です。次数を超える重複は使えません'] : []),
      ...(this.method === 'nurbsCurve' ? ['零・負の重みも使用できます。分母零付近と検査未完了の区間は省略します'] : []),
      ...(this.method === 'triangulatePolygon' ? ['境界順に頂点を指定します。末尾から先頭へ閉じ、自己交差や辺の重なりは扱いません'] : []),
      ...(this.method === 'voronoiCells' ? [this.voronoiBox?'Voronoiは復元した切り取り範囲を使用します':'Voronoiの切り取り範囲は図面全体です'] : [])];
  }
  isSpline() { return ['bSplineCurve', 'nurbsCurve'].includes(this.method); }
  getToolProperties() {
    if(this.method==='voronoiCells')return [{type:'custom',label:'Voronoiの切り取り範囲',render:group=>{
      const box=this.input().box,p=document.createElement('p');p.textContent=(this.voronoiBox?'復元した範囲: ':'図面全体: ')+`x=${box.x}, y=${box.y}, 幅=${box.width}, 高さ=${box.height}`;group.append(p);
      if(this.voronoiBox){const b=document.createElement('button');b.type='button';b.textContent='切り取り範囲を図面全体に戻す';b.dataset.constructionBoxReset='';b.onclick=()=>{this.voronoiBox=null;this.redraw();this.refreshPanel();};group.append(b);}
    }}];
    if (!this.isSpline()) return [];
    const rendering=this.toolManager.host.describeRendering?.(this.method)?.options ?? {};
    const text = (label, key) => ({type: 'custom', label, render: group => {
      const input = document.createElement('input'); input.type = 'text'; input.value = this[key]; input.setAttribute('aria-label', label);
      input.placeholder = '空欄で自動'; input.style.width = '100%'; input.style.boxSizing = 'border-box';
      input.addEventListener('change', () => {this[key] = input.value; this.redraw(); this.refreshPanel();}); group.append(input);
    }});
    return [
      {type: 'checkbox', label: '周期曲線', checkLabel: '制御点とノットを循環して閉じる', value: this.periodic, onChange: value => {
        this.periodic = value; this.redraw(); this.refreshPanel();
      }},
      {type: 'number', label: '次数', value: this.degree, min: 1, max: 12, step: 1, onChange: value => {
        if (Number.isInteger(value) && value >= 1 && value <= 12) {this.degree = value; this.redraw(); this.refreshPanel();}
      }},
      {type: 'number', label: '描画の分割数', value: rendering.sampleCount ?? this.sampleCount, min: 2, max: 10000, step: 1, onChange: value => {
        if (Number.isInteger(value) && value >= 2 && value <= 10000) this.setRenderingPreference('sampleCount',value);
      }},
      ...(this.periodic ? [text('周期ノット（制御点数+1個、空欄で一様）', 'periodicKnotsText')] : [text('ノット列（カンマ区切り、空欄で一様）', 'knotsText')]),
      ...(this.method === 'nurbsCurve' ? [text('重み（各制御点に1個、零・負も可）', 'weightsText'),
        {type: 'number', label: '分母の除外幅（最大重みで正規化）', value: rendering.poleTolerance ?? this.poleTolerance, min: 1e-14, max: 0.1, step: 'any', onChange: value => {
          if (Number.isFinite(value) && value >= 1e-14 && value <= 0.1) this.setRenderingPreference('poleTolerance',value);
        }},
        {type: 'number', label: '分母検査の最大深さ', value: rendering.maxDepth ?? this.poleMaxDepth, min: 0, max: 24, step: 1, onChange: value => {
          if (Number.isInteger(value) && value >= 0 && value <= 24) this.setRenderingPreference('maxDepth',value);
        }},
      ] : []),
    ];
  }
  setRenderingPreference(key,value) {
    const host=this.toolManager.host;
    if(host.renderingConfigurable===false || !host.selectRenderer || !host.describeRendering) {
      this[key==='maxDepth'?'poleMaxDepth':key]=value;this.redraw();this.refreshPanel();return;
    }
    host.selectRenderer(this.method,host.describeRendering(this.method).id,{[key]:value});
    this.toolManager.preferences?.save();this.redraw();this.refreshPanel();
  }
  refreshPanel() { window.toolPropertiesPanel?.updatePanel(); }
  exportInputPreset() {
    return window.VectorUtils.parseConstructionInput(this.method,{version:this.isSpline() && this.periodicKnotsText ? 2 : 1,input:{points:this.points,
      ...(this.isSpline() && this.periodicKnotsText ? {periodicKnotsText:this.periodicKnotsText} : {}),
      ...(this.isSpline()?{degree:this.degree,periodic:this.periodic,knotsText:this.knotsText}:{}),
      ...(this.method==='nurbsCurve'?{weightsText:this.weightsText}:{}),
      ...(this.method==='voronoiCells'?{box:this.input().box}:{})}});
  }
  restoreInputPreset(entry) {
    const {input}=window.VectorUtils.parseConstructionInput(this.method,entry);
    if(!this.isActive)throw Error('復元する作図ツールを先に選択してください。');
    this.reset();this.points=input.points;
    if(this.isSpline()){this.degree=input.degree;this.periodic=input.periodic;this.knotsText=input.knotsText;this.periodicKnotsText=input.periodicKnotsText ?? '';}
    if(this.method==='nurbsCurve')this.weightsText=input.weightsText;
    if(this.method==='voronoiCells')this.voronoiBox=input.box;
    this.redraw();
  }
  activate() { super.activate(); this.canvas.style.cursor = 'crosshair'; }
  deactivate() { this.reset(); super.deactivate(); }
  cancel() { this.reset(); this.refreshPanel(); }
  reset() {
    this.previewElement?.remove(); this.handles?.remove();
    this.previewElement = this.handles = null; this.points = []; this.voronoiBox = null; this.implementationError = '';
  }
  handleMouseDown(event) {
    if (!this.isActive || event.button !== 0) return;
    if (this.points.length >= 1000) {this.implementationError = '一度に入力できる点は1000個までです。'; this.refreshPanel(); return;}
    this.points.push(this.getMousePosition(event)); this.redraw(); this.refreshPanel();
  }
  handleMouseMove() {}
  handleDblClick(event) { event.preventDefault(); }
  handleKeyDown(event) {
    if (event.key === 'Escape') {event.preventDefault(); this.cancel();}
    if (event.key === 'Backspace') {event.preventDefault(); this.points.pop(); this.redraw(); this.refreshPanel();}
    if (event.key === 'Enter') {event.preventDefault(); this.commit();}
  }
  onImplementationChanged() { this.redraw(); }
  onCommonPropertiesChanged() { this.redraw(); }
  input() {
    const points = this.points;
    if (this.isSpline()) {
      const parse = text => text.trim().split(/[\s,]+/).map(Number);
      return {points, degree: this.degree, periodic: this.periodic, ...(!this.periodic && this.knotsText.trim() ? {knots: parse(this.knotsText)} : {}),
        ...(this.periodic && this.periodicKnotsText.trim() ? {periodicKnots: parse(this.periodicKnotsText)} : {}),
        ...(this.method === 'nurbsCurve' && this.weightsText.trim() ? {weights: parse(this.weightsText)} : {})};
    }
    if (this.method === 'voronoiCells') {
      const box = this.canvas.viewBox.baseVal;
      return {sites: points, box: this.voronoiBox ? {...this.voronoiBox} : box.width > 0 ? {x: box.x, y: box.y, width: box.width, height: box.height} :
        {x: 0, y: 0, width: this.canvas.width.baseVal.value, height: this.canvas.height.baseVal.value}};
    }
    return {points};
  }
  geometry(result) {
    if (window.VectorUtils.pointSetSource.pointSetMethods.includes(this.method))
      return window.VectorUtils.pointSetSource.pointSetGeometry(this.method,this.input(),result);
    return result;
  }
  build() {
    if (this.points.length < (this.isSpline() ? this.degree + 1 : this.method === 'fitLine' ? 2 : ['minimumEnclosingCircle','voronoiCells'].includes(this.method) ? 1 : 3)) return null;
    const source=window.VectorUtils.pointSetSource;
    const input=source.pointSetMethods.includes(this.method)?source.pointSetInput(this.method,this.input()):this.input();
    const result = this.run(this.method, source.pointSetMethods.includes(this.method)?source.pointSetExecutionInput(this.method,input):input);
    if (!result) {this.implementationError = '入力条件を満たしません。点の配置・次数・ノット・重みを確認してください。'; return null;}
    const shape = this.geometry(result);
    if (!shape) {this.implementationError = 'この配置では図形を作成できません。'; return null;}
    const element = this.toolManager.host.render(shape, null, {toolName: this.method,...(['convexHull','delaunayTriangles','voronoiCells','triangulatePolygon'].includes(this.method)?{}:{sampleCount:this.sampleCount}),
      ...(source.pointSetMethods.includes(this.method) ? {sourceInput:input,sourceResult:result} : {}),
      ...(this.isSpline() ? {poleTolerance: this.poleTolerance, maxDepth: this.poleMaxDepth} : {})});
    if (!element) {this.implementationError = '指定した検査条件では描画できる区間がありません。分母の除外幅・最大深さ・重みを確認してください。'; return null;}
    if(['convexHull','delaunayTriangles','voronoiCells','triangulatePolygon'].includes(this.method))source.readPointSetSource(element.getAttribute('data-vector-pointset'),element.getAttribute('data-vector-implementation'),source.pointSetGeometrySnapshot(element));
    this.applyDefaultAttributes(element);
    if (element.hasAttribute('data-vector-partial')) element.setAttribute('fill', 'none');
    const record = element.getAttribute('data-vector-implementation');
    if (record) this.implementationError = JSON.parse(record).warning ?? '';
    return element;
  }
  redraw() {
    this.previewElement?.remove(); this.handles?.remove(); this.previewElement = null; this.implementationError = '';
    try {
      this.previewElement = this.build();
      if (this.previewElement) {this.previewElement.setAttribute('data-vector-preview', 'true'); this.previewElement.setAttribute('opacity', '0.65'); this.canvas.append(this.previewElement);}
    } catch (error) {this.implementationError = error.message;}
    this.handles = window.SvgUtils.createElement('g', {'data-tool-layer': 'construction-handles', 'pointer-events': 'none'});
    this.points.forEach(p => this.handles.append(window.SvgUtils.createCircle(p.x, p.y, 3, {fill: '#fff', stroke: '#2673c7'})));
    this.canvas.append(this.handles);
  }
  commit() {
    let element;
    try {element = this.build();} catch (error) {this.implementationError = error.message;}
    if (!element) {
      this.implementationError ||= '確定に必要な点が不足しています。'; this.refreshPanel(); return;
    }
    element.setAttribute('data-construction-tool', this.method);
    this.reset(); this.canvas.append(element); this.saveState(); this.refreshPanel();
  }
}
window.pointConstructionController = (method, title) => class extends PointConstructionTool {
  constructor(canvas, manager) {super(canvas, manager, method, title);}
};
