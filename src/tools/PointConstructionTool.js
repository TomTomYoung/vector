// Point-input controllers for algorithms whose input differs from the original drawing tools.
class PointConstructionTool extends BaseTool {
  constructor(canvas, manager, method, title) {
    super(canvas, manager);
    this.method = method; this.title = title; this.points = [];
    this.degree = 3; this.sampleCount = 80; this.weightsText = ''; this.knotsText = '';
    this.periodic = false; this.poleTolerance = 1e-8; this.poleMaxDepth = 18;
    this.previewElement = null; this.handles = null; this.implementationError = '';
  }
  getTitle() { return this.title; }
  getInstructions() {
    return ['クリックで点を追加', 'Enterで確定、Backspaceで最後の点を削除、Escで取り消し',
      this.isSpline() ? `次数${this.degree}には制御点${this.degree + 1}個以上が必要です（現在${this.points.length}個）` : `入力順の点列を使用します（現在${this.points.length}個）`,
      ...(this.isSpline() ? [this.periodic ? '周期曲線：先頭の制御点と重みを循環させ、一様ノットで閉じます' : '内部ノットを次数+1回重ねると、そこで別の枝に分かれます'] : []),
      ...(this.method === 'nurbsCurve' ? ['零・負の重みも使用できます。分母零付近と検査未完了の区間は省略します'] : []),
      ...(this.method === 'voronoiCells' ? ['Voronoiの切り取り範囲は図面全体です'] : [])];
  }
  isSpline() { return ['bSplineCurve', 'nurbsCurve'].includes(this.method); }
  getToolProperties() {
    if (!this.isSpline()) return [];
    const text = (label, key) => ({type: 'custom', label, render: group => {
      const input = document.createElement('input'); input.type = 'text'; input.value = this[key]; input.setAttribute('aria-label', label);
      input.placeholder = '空欄で自動'; input.style.width = '100%'; input.style.boxSizing = 'border-box';
      input.addEventListener('change', () => {this[key] = input.value; this.redraw(); this.refreshPanel();}); group.append(input);
    }});
    return [
      {type: 'checkbox', label: '周期曲線', checkLabel: '一様ノットで閉じる', value: this.periodic, onChange: value => {
        this.periodic = value; this.redraw(); this.refreshPanel();
      }},
      {type: 'number', label: '次数', value: this.degree, min: 1, max: 12, step: 1, onChange: value => {
        if (Number.isInteger(value) && value >= 1 && value <= 12) {this.degree = value; this.redraw(); this.refreshPanel();}
      }},
      {type: 'number', label: '描画の分割数', value: this.sampleCount, min: 2, max: 10000, step: 1, onChange: value => {
        if (Number.isInteger(value) && value >= 2 && value <= 10000) {this.sampleCount = value; this.redraw(); this.refreshPanel();}
      }},
      ...(!this.periodic ? [text('ノット列（カンマ区切り、空欄で一様）', 'knotsText')] : []),
      ...(this.method === 'nurbsCurve' ? [text('重み（各制御点に1個、零・負も可）', 'weightsText'),
        {type: 'number', label: '分母の除外幅（最大重みで正規化）', value: this.poleTolerance, min: 1e-14, max: 0.1, step: 'any', onChange: value => {
          if (Number.isFinite(value) && value >= 1e-14 && value <= 0.1) {this.poleTolerance = value; this.redraw(); this.refreshPanel();}
        }},
        {type: 'number', label: '分母検査の最大深さ', value: this.poleMaxDepth, min: 0, max: 24, step: 1, onChange: value => {
          if (Number.isInteger(value) && value >= 0 && value <= 24) {this.poleMaxDepth = value; this.redraw(); this.refreshPanel();}
        }},
      ] : []),
    ];
  }
  refreshPanel() { window.toolPropertiesPanel?.updatePanel(); }
  activate() { super.activate(); this.canvas.style.cursor = 'crosshair'; }
  deactivate() { this.reset(); super.deactivate(); }
  cancel() { this.reset(); this.refreshPanel(); }
  reset() {
    this.previewElement?.remove(); this.handles?.remove();
    this.previewElement = this.handles = null; this.points = []; this.implementationError = '';
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
        ...(this.method === 'nurbsCurve' && this.weightsText.trim() ? {weights: parse(this.weightsText)} : {})};
    }
    if (this.method === 'voronoiCells') {
      const box = this.canvas.viewBox.baseVal;
      return {sites: points, box: box.width > 0 ? {x: box.x, y: box.y, width: box.width, height: box.height} :
        {x: 0, y: 0, width: this.canvas.width.baseVal.value, height: this.canvas.height.baseVal.value}};
    }
    return {points};
  }
  geometry(result) {
    const polygon = points => ({kind: 'polygon', points});
    if (this.method === 'convexHull') return result.length >= 3 ? polygon(result) : null;
    if (this.method === 'triangulatePolygon') return result.length ? {kind: 'group', children: result.map(polygon)} : null;
    if (this.method === 'delaunayTriangles') return result.length ? {kind: 'group', children: result.map(ids => polygon(ids.map(i => this.points[i])))} : null;
    if (this.method === 'voronoiCells') return {kind: 'group', children: result.filter(c => c.points.length > 2).map(c => polygon(c.points))};
    if (this.method === 'fitLine') {
      const p = result.point, d = result.direction;
      const t = this.points.map(q => (q.x - p.x) * d.x + (q.y - p.y) * d.y);
      const point = t => ({x: p.x + t * d.x, y: p.y + t * d.y});
      return {kind: 'segment', start: point(Math.min(...t)), end: point(Math.max(...t))};
    }
    return result;
  }
  build() {
    if (this.points.length < (this.isSpline() ? this.degree + 1 : this.method === 'fitLine' ? 2 : 3)) return null;
    const result = this.run(this.method, this.input());
    if (!result) {this.implementationError = '入力条件を満たしません。点の配置・次数・ノット・重みを確認してください。'; return null;}
    const shape = this.geometry(result);
    if (!shape) {this.implementationError = 'この配置では図形を作成できません。'; return null;}
    const element = this.toolManager.host.render(shape, null, {toolName: this.method, sampleCount: this.sampleCount,
      ...(this.isSpline() ? {poleTolerance: this.poleTolerance, maxDepth: this.poleMaxDepth} : {})});
    if (!element) {this.implementationError = '指定した検査条件では描画できる区間がありません。分母の除外幅・最大深さ・重みを確認してください。'; return null;}
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
