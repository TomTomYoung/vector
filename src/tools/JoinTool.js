class JoinTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedElements = [];
    this.inputPresetVersion = 2;
    this.inputPresetInstructions = '線分・ポリラインをクリックして選択を追加・解除できます。端点がつながる線を2本以上選び、Enterで結合してください。';
    this.implementationError = '';
  }

  getTitle() {
    return "結合";
  }

  joinOutline(element) {
    if (!['line', 'polyline'].includes(element?.localName)) return null;
    return window.VectorUtils.linearEditing.editableOutline(element, this.canvas, this.selectTool);
  }

  prepareInputPreset() {
    if (!this.isActive) throw Error('記録する結合ツールを先に選択してください。');
    const {references, commit} = window.VectorUtils.prepareOutlineReferences(
      this.canvas, this.selectedElements, element => this.joinOutline(element)
    );
    return {entry: {version: 2, input: {elements: references}}, commit};
  }

  restoreInputPreset(entry) {
    if (!this.isActive || entry?.version !== this.inputPresetVersion) throw Error('このツール・版では結合する線を復元できません。');
    const utils = window.VectorUtils;
    const checked = utils.parseConstructionInputPresets({version: 1, entries: {join: entry}});
    const elements = utils.resolveOutlineReferences(
      this.canvas, checked.entries.join.input.elements, element => this.joinOutline(element)
    );
    this.replaceSelection(elements);
  }

  captureInputRollback() {
    const elements = this.selectedElements.slice(), message = this.implementationError;
    return () => this.replaceSelection(elements, message);
  }

  getInstructions() {
    const count = this.selectedElements.length;
    const instructions = [
      "左クリック: 線またはポリラインを選択/解除",
      "Enter: 選択した要素をつないで1本のポリラインにする",
      "Esc: 選択をすべてクリア",
    ];

    if (count === 0) {
      instructions.unshift("結合したい線を2本以上選択");
    } else {
      instructions.unshift(`現在${count}本選択中`);
    }

    return instructions;
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.createJoinControls();
    this.updatePanel();
  }

  deactivate() {
    super.deactivate();
    this.removeJoinControls();
    this.clearSelection();
  }

  createJoinControls() {
    if (document.getElementById("join-controls")) return;

    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    const controls = document.createElement("div");
    controls.id = "join-controls";
    controls.className = "style-control-group";

    const heading = document.createElement("h4");
    heading.textContent = "結合操作";
    controls.appendChild(heading);

    const info = document.createElement("p");
    info.className = "control-info";
    info.textContent = "線を選択 (Enterで結合、Escでクリア)";
    controls.appendChild(info);

    container.appendChild(controls);
  }

  removeJoinControls() {
    const controls = document.getElementById("join-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    if (!this.isActive || event.button !== 0 || event.target === this.canvas) return;
    super.handleMouseDown(event);

    if (event.target.tagName === "line" || event.target.tagName === "polyline") {
      this.toggleSelection(event.target);
    }
  }

  toggleSelection(element) {
    if (this.selectedElements.includes(element)) {
      this.deselectElement(element);
    } else {
      this.selectElement(element);
    }
  }

  selectElement(element) {
    if (this.selectedElements.includes(element) || !this.joinOutline(element)) return;
    this.implementationError = '';
    this.selectedElements.push(element);
    element.setAttribute("data-vector-highlight", "join");

    this.updateInfo();
    this.updatePanel();
  }

  deselectElement(element) {
    const index = this.selectedElements.indexOf(element);
    if (index > -1) {
      this.implementationError = '';
      this.selectedElements.splice(index, 1);
      element.removeAttribute("data-vector-highlight");
    }

    this.updateInfo();
    this.updatePanel();
  }

  replaceSelection(elements, message = '') {
    this.selectedElements.forEach(element => element.removeAttribute('data-vector-highlight'));
    this.selectedElements = elements;
    this.implementationError = message;
    elements.forEach(element => element.setAttribute('data-vector-highlight', 'join'));
    this.updateInfo();
    if (this.isActive) this.updatePanel();
  }

  clearSelection() { this.replaceSelection([]); }

  updateInfo() {
    const info = document.querySelector("#join-controls .control-info");
    if (info) {
      info.textContent = `線を選択 (${this.selectedElements.length}個選択中、Enterで結合、Escでクリア)`;
    }
  }

  joinElements() {
    if (this.selectedElements.length < 2) {
      this.implementationError = '端点がつながる線を2本以上選んでください。';
      this.updatePanel();
      return;
    }

    const segments = this.selectedElements.map(element => this.joinOutline(element)?.points);
    if (segments.some(points => !points)) {
      this.implementationError = '使用できない線があります。表示・ロック・形状を確認するか、Escで選び直してください。';
      this.updatePanel();
      return;
    }
    try {
      const points = this.run("join", {segments});
      const dependencies = this.toolManager.host.execute.trace?.();
      if (!points.length) throw Error('選択した線の端点がつながっていません。選択または線の位置を確認してください。');
      if (points.length < 2 || !points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) {
        throw Error('結合後の点列が不正です。');
      }
      const first = this.selectedElements[0];
      const polyline = this.draw("polyline", {points});
      this.toolManager.host.annotate?.(polyline, 'join', {dependencies});
      window.SvgUtils.setAttributes(polyline, {
        stroke: first.getAttribute("stroke"), "stroke-width": first.getAttribute("stroke-width"),
        fill: "none", "data-layer": first.getAttribute("data-layer"),
      });
      this.canvas.appendChild(polyline);
    } catch (error) {
      this.implementationError = '結合できません。' + error.message;
      this.updatePanel();
      return;
    }
    this.selectedElements.forEach(el => el.remove());
    this.saveState();
    this.clearSelection();
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      this.joinElements();
    }

    if (event.key === "Escape") {
      this.clearSelection();
    }
  }
}

window.JoinTool = JoinTool;
