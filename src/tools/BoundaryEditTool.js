// Shared selection and SVG draft for editing outlines against one or more boundaries.
class BoundaryEditTool extends BaseTool {
  static draftAttribute = 'data-vector-boundary-draft-id';

  constructor(canvas, toolManager, operation) {
    super(canvas, toolManager);
    this.operation = operation;
    this.boundaryEdges = [];
    this.mode = 'select';
    this.inputPresetVersion = 2;
    this.inputPresetInstructions = '境界線を選択中ならEnterで確定し、加工対象のクリック待ちならそのまま対象をクリックしてください。';
  }

  canUseEdge(element) {
    if (element?.namespaceURI !== this.svgNS || !this.canvas.contains(element) ||
        !['line', 'polyline', 'path'].includes(element.localName) || !this.selectTool.canSelect(element)) return false;
    const points = window.VectorUtils.linearEditing.outline(element, this.canvas)?.points;
    return !!points && points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) &&
      points.some(p => p.x !== points[0].x || p.y !== points[0].y);
  }

  prepareInputPreset() {
    if (!this.isActive) throw Error('記録するツールを先に選択してください。');
    const utils = window.VectorUtils, attr = BoundaryEditTool.draftAttribute;
    const index = utils.indexDraftReferences(this.canvas, attr);
    const pending = [], edges = [];
    for (const edge of this.boundaryEdges) {
      if (!this.canUseEdge(edge)) throw Error('記録する境界線に加工できない図形があります。');
      const {id, commit} = utils.prepareDraftReference(this.canvas, attr, edge, index);
      index.set(id, edge);
      edges.push({id, tag: edge.localName});
      if (commit) pending.push(commit);
    }
    return {entry: {version: 2, input: {mode: this.mode, edges}}, commit: () => pending.forEach(bind => bind())};
  }

  restoreInputPreset(entry) {
    if (!this.isActive || entry?.version !== this.inputPresetVersion) throw Error('このツール・版では境界線を復元できません。');
    const utils = window.VectorUtils, attr = BoundaryEditTool.draftAttribute;
    const checked = utils.parseConstructionInputPresets({version: 1, entries: {[this.operation]: entry}});
    const {mode, edges} = checked.entries[this.operation].input;
    const index = utils.indexDraftReferences(this.canvas, attr);
    const resolved = edges.map(({id, tag}) => {
      const edge = utils.resolveDraftReference(this.canvas, attr, id, index);
      if (edge.localName !== tag || !this.canUseEdge(edge)) throw Error('記録した境界線の種類・形状、表示状態、レイヤーのロックを確認してください。');
      return edge;
    });
    this.replaceBoundaries(resolved, mode);
  }

  captureInputRollback() {
    const edges = this.boundaryEdges.slice(), mode = this.mode, message = this.implementationError;
    return () => this.replaceBoundaries(edges, mode, message);
  }

  replaceBoundaries(edges, mode, message = '') {
    this.boundaryEdges.forEach(edge => edge.removeAttribute('data-vector-highlight'));
    this.boundaryEdges = edges;
    this.mode = mode;
    this.implementationError = message;
    edges.forEach(edge => edge.setAttribute('data-vector-highlight', this.operation));
    this.refreshControls();
  }

  addBoundaryEdge(edge) {
    if (!this.canUseEdge(edge) || this.boundaryEdges.includes(edge)) return;
    this.boundaryEdges.push(edge);
    edge.setAttribute('data-vector-highlight', this.operation);
    this.implementationError = '';
    this.refreshControls();
  }

  removeBoundaryEdge(edge) {
    const index = this.boundaryEdges.indexOf(edge);
    if (index < 0) return;
    this.boundaryEdges.splice(index, 1);
    edge.removeAttribute('data-vector-highlight');
    this.implementationError = '';
    this.refreshControls();
  }

  clearBoundaryEdges() { this.replaceBoundaries([], 'select'); }

  getInstructions() {
    if (this.mode === 'select') return [
      '境界線に使う線分・ポリライン・直線だけの開いたパスをクリックしてください。再クリックで選択を外します。',
      '選択中の境界線は' + this.boundaryEdges.length + '本です。Enterで境界線を確定します。',
      'Escで選び直します。',
    ];
    return [this.editInstruction, 'Escで境界線を選び直します。'];
  }

  refreshControls() {
    if (this.info) this.info.textContent = this.mode === 'select' ? '境界線を選び、Enterで確定してください。' : this.editInstruction;
    if (this.isActive) window.toolPropertiesPanel?.updatePanel();
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = 'crosshair';
    const container = document.getElementById('style-controls-container') || document.querySelector('.toolbar');
    if (container) {
      this.controls = document.createElement('div');
      this.controls.id = this.operation + '-controls';
      this.controls.className = 'style-control-group';
      const heading = document.createElement('h4');
      heading.textContent = this.getTitle() + '操作';
      this.info = document.createElement('p');
      this.info.className = 'control-info';
      this.controls.append(heading, this.info);
      container.append(this.controls);
    }
    this.refreshControls();
  }

  deactivate() {
    super.deactivate();
    this.controls?.remove();
    this.controls = this.info = null;
    this.clearBoundaryEdges();
  }

  handleMouseDown(event) {
    if (!this.isActive || event.button !== 0 || event.target === this.canvas) return;
    super.handleMouseDown(event);
    const edge = event.target;
    if (this.mode === 'select') {
      if (this.boundaryEdges.includes(edge)) this.removeBoundaryEdge(edge);
      else this.addBoundaryEdge(edge);
    } else {
      const point = this.operation === 'trim' ? this.getMousePosition(event) : undefined;
      this.editAgainstBoundaries(edge, point);
    }
  }

  handleKeyDown(event) {
    if (event.key === 'Escape') this.clearBoundaryEdges();
    if (event.key === 'Enter' && this.mode === 'select' && this.boundaryEdges.length) {
      this.mode = this.operation;
      this.refreshControls();
    }
  }

  editAgainstBoundaries(element, point) {
    if (!this.boundaryEdges.every(edge => this.canUseEdge(edge))) {
      this.implementationError = '使用できない境界線があります。表示・ロック・形状を確認するか、Escで境界線を選び直してください。';
      this.refreshControls();
      return;
    }
    if (!this.canUseEdge(element)) return;
    if (this.implementationError) {
      this.implementationError = '';
      this.refreshControls();
    }
    return this.editOutline(this.operation, element, this.boundaryEdges, point);
  }
}
