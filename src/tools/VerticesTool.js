// VerticesTool.js
// 頂点（vertices）とindicesの管理ツール
//
// ・頂点座標の追加/編集/削除
// ・indice（indexのまとまり）ごとに描画メソッドとパラメータを保持
// ・Ctrl+クリックでアクティブなindiceにindexを割り当て/解除
// ・ツールプロパティからindiceの追加・削除・順序変更・メソッド設定が可能

class VerticesTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);

    this.verticesObject = {
      vectors: [],
      indices: [],
    };

    this.nextIndiceId = 1;
    this.selectedIndiceId = null;

    this.handleElements = [];
    this.geometryElements = [];

    this.handleRadius = 8;

    this.methodOptions = [
      { value: "line", label: "線分 (line)" },
      { value: "polyline", label: "連続線 (polyline)" },
      { value: "polygon", label: "面 (polygon)" },
      { value: "quadraticBezier", label: "2次ベジェ" },
      { value: "cubicBezier", label: "3次ベジェ" },
      { value: "bezierN", label: "n次ベジェ" },
    ];

    this.isDraggingHandle = false;
    this.draggingHandleIndex = null;

    this.handleLayer = window.SvgUtils.createElement("g", {
      class: "vertices-tool-handles",
      "data-tool-layer": "vertices-handles",
    });

    this.createIndice({ method: "polyline" });
  }

  static isValidModel(model) {
    if (!model || !Array.isArray(model.vectors) || !Array.isArray(model.indices)) return false;
    const ids = new Set();
    return model.vectors.every(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)) &&
      model.indices.every(item => {
        if (!Number.isSafeInteger(item?.id) || item.id < 1 || ids.has(item.id) ||
            !Array.isArray(item.points) || !item.points.every(i => Number.isInteger(i) && i >= 0 && i < model.vectors.length)) return false;
        ids.add(item.id);
        return ["line", "polyline", "polygon", "quadraticBezier", "cubicBezier", "bezierN"].includes(item.method);
      });
  }

  restoreModel(model) {
    this.verticesObject = model || {vectors: [], indices: []};
    if (!this.verticesObject.indices.length) {
      this.verticesObject.indices.push({id: 1, label: "Indice 1", method: "polyline", points: [], params: {closed: false}});
    }
    this.nextIndiceId = this.verticesObject.indices.reduce((max, item) => Math.max(max, item.id), 0) + 1;
    this.selectedIndiceId = this.verticesObject.indices[0].id;
    this.isDraggingHandle = false;
    this.draggingHandleIndex = null;
    this.handleElements = this.verticesObject.vectors.map((point, index) => this.createHandleElement(point, index));
    this.handleLayer.replaceChildren(...this.handleElements);
    this.geometryElements = Array.from(this.canvas.querySelectorAll("[data-vector-indice]"));
    this.updateHandleSelectionStyles();
  }

  getTitle() {
    return "Vertices";
  }

  getInstructions() {
    return [
      "クリックで頂点を追加",
      "ハンドルをドラッグして座標を編集",
      "Ctrl+クリックでアクティブindiceへのindex追加/解除",
      "右パネルでindiceの順序・メソッド・パラメータを編集",
      "ダブルクリックで頂点とindiceの割り当てをリセット",
    ];
  }

  getToolProperties() {
    this.ensureActiveIndice();
    const activeIndice = this.getActiveIndice();
    const props = [
      {
        type: "custom",
        label: "Indice一覧",
        render: (container) => this.renderIndiceList(container),
      },
      {
        type: "custom",
        label: "Indiceのindex管理",
        render: (container) => this.renderIndicePointsEditor(container),
      },
    ];

    if (activeIndice) {
      props.push({
        type: "select",
        label: "メソッド選択",
        options: this.methodOptions,
        value: activeIndice.method,
        onChange: (value) => this.handleMethodChange(activeIndice.id, value),
      });
      props.push(...this.getMethodPropertyControls(activeIndice));
    }

    props.push({
      type: "number",
      label: "ハンドル半径",
      value: this.handleRadius,
      min: 2,
      max: 40,
      step: 1,
      onChange: (value) => {
        this.handleRadius = Math.max(2, value || 2);
        this.updateHandleRadii();
      },
    });

    return props;
  }

  ensureActiveIndice() {
    if (!this.getActiveIndice()) {
      if (this.verticesObject.indices.length === 0) {
        this.createIndice({ method: "polyline" });
      } else {
        this.selectedIndiceId = this.verticesObject.indices[0].id;
      }
    }
    return this.getActiveIndice();
  }

  getActiveIndice() {
    return this.verticesObject.indices.find((indice) => indice.id === this.selectedIndiceId) || null;
  }

  createIndice(options = {}) {
    const method = options.method || "polyline";
    const indice = {
      id: this.nextIndiceId++,
      label: options.label || `Indice ${this.verticesObject.indices.length + 1}`,
      method,
      points: [],
      params: this.getDefaultMethodParams(method),
    };
    this.verticesObject.indices.push(indice);
    this.selectedIndiceId = indice.id;
    this.renderGeometry();
    this.updateHandleSelectionStyles();
    this.saveState();
    this.requestToolPanelRefresh();
    return indice;
  }

  setActiveIndice(indiceId) {
    if (this.selectedIndiceId === indiceId) {
      return;
    }
    this.selectedIndiceId = indiceId;
    this.updateHandleSelectionStyles();
    this.requestToolPanelRefresh();
  }

  removeIndice(indiceId) {
    if (this.verticesObject.indices.length <= 1) {
      return;
    }
    const index = this.verticesObject.indices.findIndex((indice) => indice.id === indiceId);
    if (index === -1) {
      return;
    }
    this.verticesObject.indices.splice(index, 1);
    if (this.selectedIndiceId === indiceId) {
      const fallback = this.verticesObject.indices[index] || this.verticesObject.indices[index - 1];
      this.selectedIndiceId = fallback ? fallback.id : null;
    }
    this.renderGeometry();
    this.updateHandleSelectionStyles();
    this.saveState();
    this.requestToolPanelRefresh();
  }

  getDefaultMethodParams(method) {
    switch (method) {
      case "polyline":
        return { closed: false };
      case "polygon":
        return { fillEnabled: false };
      case "bezierN":
        return { degree: 4, sampleCount: 80 };
      default:
        return {};
    }
  }

  handleMethodChange(indiceId, method) {
    const indice = this.verticesObject.indices.find((item) => item.id === indiceId);
    if (!indice) {
      return;
    }
    indice.method = method;
    indice.params = this.getDefaultMethodParams(method);
    this.renderGeometry();
    this.saveState();
    this.requestToolPanelRefresh();
  }

  getMethodPropertyControls(indice) {
    const params = indice.params || {};
    const controls = [];

    switch (indice.method) {
      case "polyline":
        controls.push({
          type: "checkbox",
          label: "ポリライン設定",
          checkLabel: "始点と終点を接続",
          value: Boolean(params.closed),
          onChange: (checked) => {
            params.closed = checked;
            this.renderGeometry();
            this.saveState();
          },
        });
        break;
      case "polygon":
        controls.push({
          type: "checkbox",
          label: "ポリゴン設定",
          checkLabel: "塗りつぶし", 
          value: Boolean(params.fillEnabled),
          onChange: (checked) => {
            params.fillEnabled = checked;
            this.renderGeometry();
            this.saveState();
          },
        });
        break;
      case "bezierN":
        controls.push({
          type: "number",
          label: "次数 (n)",
          value: params.degree,
          min: 2,
          max: 12,
          step: 1,
          onChange: (value) => {
            params.degree = Math.max(2, Math.round(value || 2));
            this.renderGeometry();
            this.saveState();
          },
        });
        controls.push({
          type: "number",
          label: "サンプル数",
          value: params.sampleCount,
          min: 10,
          max: 400,
          step: 5,
          onChange: (value) => {
            params.sampleCount = Math.max(10, Math.round(value || 10));
            this.renderGeometry();
            this.saveState();
          },
        });
        break;
      default:
        break;
    }

    return controls;
  }

  renderIndiceList(container) {
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "8px";

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "6px";

    this.verticesObject.indices.forEach((indice, idx) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "6px";
      row.style.alignItems = "center";

      const isActive = indice.id === this.selectedIndiceId;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = indice.label || `Indice ${idx + 1}`;
      button.style.cssText = `
        flex: 1;
        padding: 6px 8px;
        border: 1px solid ${isActive ? "#2f80ed" : "#ccc"};
        border-radius: 4px;
        background: ${isActive ? "#e9f2ff" : "#fff"};
        color: ${isActive ? "#1a73e8" : "#333"};
        text-align: left;
        cursor: pointer;
        font-size: 12px;
      `;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        this.setActiveIndice(indice.id);
      });
      row.appendChild(button);

      if (this.verticesObject.indices.length > 1) {
        const removeBtn = this.createMiniButton("削除", "このindiceを削除", () => this.removeIndice(indice.id));
        row.appendChild(removeBtn);
      }

      list.appendChild(row);
    });

    container.appendChild(list);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "Indiceを追加";
    addBtn.style.cssText = `
      padding: 6px 10px;
      border: 1px dashed #888;
      border-radius: 4px;
      background: #fafafa;
      cursor: pointer;
      font-size: 12px;
    `;
    addBtn.addEventListener("click", (event) => {
      event.preventDefault();
      this.createIndice({ method: "polyline" });
    });

    container.appendChild(addBtn);
  }

  renderIndicePointsEditor(container) {
    const activeIndice = this.getActiveIndice();
    if (!activeIndice) {
      const empty = document.createElement("div");
      empty.textContent = "Indiceがありません";
      empty.style.fontSize = "12px";
      container.appendChild(empty);
      return;
    }

    const hint = document.createElement("div");
    hint.textContent = "Ctrl+クリックでもindexを追加/解除できます";
    hint.style.fontSize = "11px";
    hint.style.color = "#666";
    hint.style.marginBottom = "6px";
    container.appendChild(hint);

    const selectRow = document.createElement("div");
    selectRow.style.display = "flex";
    selectRow.style.gap = "6px";
    selectRow.style.alignItems = "center";
    selectRow.style.marginBottom = "6px";

    const select = document.createElement("select");
    select.style.cssText = `
      flex: 1;
      padding: 6px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 12px;
    `;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "indexを選択";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    this.verticesObject.vectors.forEach((vector, idx) => {
      const option = document.createElement("option");
      option.value = idx;
      option.textContent = `#${idx} (${Math.round(vector.x)}, ${Math.round(vector.y)})`;
      select.appendChild(option);
    });

    select.addEventListener("change", (event) => {
      const value = Number(event.target.value);
      if (!Number.isNaN(value)) {
        this.addIndexToIndice(activeIndice, value);
      }
      event.target.selectedIndex = 0;
    });

    selectRow.appendChild(select);

    const clearBtn = this.createMiniButton("全削除", "indice内のindexをクリア", () => this.clearIndicePoints(activeIndice));
    selectRow.appendChild(clearBtn);

    container.appendChild(selectRow);

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "4px";

    if (activeIndice.points.length === 0) {
      const emptyRow = document.createElement("div");
      emptyRow.textContent = "indexが未選択です";
      emptyRow.style.fontSize = "12px";
      emptyRow.style.color = "#888";
      list.appendChild(emptyRow);
    } else {
      activeIndice.points.forEach((pointIndex, order) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "6px";

        const label = document.createElement("div");
        label.textContent = `${order + 1}. index #${pointIndex}`;
        label.style.flex = "1";
        label.style.fontSize = "12px";
        row.appendChild(label);

        const upBtn = this.createMiniButton("▲", "1つ上へ", () => this.moveIndicePoint(activeIndice, order, -1));
        upBtn.disabled = order === 0;
        row.appendChild(upBtn);

        const downBtn = this.createMiniButton("▼", "1つ下へ", () => this.moveIndicePoint(activeIndice, order, 1));
        downBtn.disabled = order === activeIndice.points.length - 1;
        row.appendChild(downBtn);

        const removeBtn = this.createMiniButton("×", "このindexを削除", () => this.removeIndexFromIndice(activeIndice, pointIndex));
        row.appendChild(removeBtn);

        list.appendChild(row);
      });
    }

    container.appendChild(list);
  }

  createMiniButton(label, title, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title || "";
    button.style.cssText = `
      padding: 2px 6px;
      border: 1px solid #bbb;
      border-radius: 3px;
      background: #fff;
      font-size: 11px;
      cursor: pointer;
    `;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) {
        return;
      }
      if (typeof onClick === "function") {
        onClick(event);
      }
    });
    return button;
  }

  addIndexToIndice(indice, vertexIndex) {
    if (!indice || Number.isNaN(vertexIndex)) {
      return;
    }
    if (indice.points.includes(vertexIndex)) {
      return;
    }
    indice.points.push(vertexIndex);
    this.onIndicePointsChanged(indice);
  }

  removeIndexFromIndice(indice, vertexIndex) {
    if (!indice) {
      return;
    }
    const idx = indice.points.indexOf(vertexIndex);
    if (idx === -1) {
      return;
    }
    indice.points.splice(idx, 1);
    this.onIndicePointsChanged(indice);
  }

  moveIndicePoint(indice, position, delta) {
    if (!indice) {
      return;
    }
    const targetIndex = position + delta;
    if (targetIndex < 0 || targetIndex >= indice.points.length) {
      return;
    }
    const [value] = indice.points.splice(position, 1);
    indice.points.splice(targetIndex, 0, value);
    this.onIndicePointsChanged(indice);
  }

  clearIndicePoints(indice) {
    if (!indice || indice.points.length === 0) {
      return;
    }
    indice.points = [];
    this.onIndicePointsChanged(indice);
  }

  toggleIndexSelection(vertexIndex) {
    const activeIndice = this.ensureActiveIndice();
    if (!activeIndice) {
      return;
    }
    if (activeIndice.points.includes(vertexIndex)) {
      this.removeIndexFromIndice(activeIndice, vertexIndex);
    } else {
      this.addIndexToIndice(activeIndice, vertexIndex);
    }
  }

  onIndicePointsChanged() {
    this.updateHandleSelectionStyles();
    this.renderGeometry();
    this.saveState();
    this.requestToolPanelRefresh();
  }

  requestToolPanelRefresh() {
    if (window.toolPropertiesPanel && window.toolPropertiesPanel.currentTool === this) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  updateHandleSelectionStyles() {
    const activeIndice = this.getActiveIndice();
    const selectedSet = new Set(activeIndice ? activeIndice.points : []);
    this.handleElements.forEach((handle, idx) => {
      if (!handle) {
        return;
      }
      if (selectedSet.has(idx)) {
        handle.setAttribute("fill", "#ffeacc");
        handle.setAttribute("stroke", "#d47f00");
      } else {
        handle.setAttribute("fill", "#ffffff");
        handle.setAttribute("stroke", "#0078d4");
      }
    });
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.canvas.appendChild(this.handleLayer);
    this.handleLayer.style.display = "block";
    this.updateHandleSelectionStyles();
  }

  deactivate() {
    super.deactivate();
    this.canvas.style.cursor = "";
    this.isDraggingHandle = false;
    this.draggingHandleIndex = null;
    this.handleLayer.style.display = "none";
  }

  handleMouseDown(event) {
    if (!this.isActive) return;

    super.handleMouseDown(event);

    const targetIndex = this.getHandleIndexFromEvent(event);
    if (event.ctrlKey && targetIndex !== null) {
      event.preventDefault();
      this.toggleIndexSelection(targetIndex);
      return;
    }

    if (targetIndex !== null) {
      event.preventDefault();
      this.startHandleDrag(targetIndex);
      return;
    }

    const point = this.getMousePosition(event);
    this.addVertex(point);
    this.renderGeometry();
    this.saveState();
  }

  handleMouseMove(event) {
    if (!this.isActive) return;

    super.handleMouseMove(event);

    if (this.isDraggingHandle && this.draggingHandleIndex !== null) {
      const point = this.getMousePosition(event);
      this.updateVertex(this.draggingHandleIndex, point);
      this.renderGeometry();
    }
  }

  handleMouseUp(event) {
    if (!this.isActive) return;

    super.handleMouseUp(event);

    if (this.isDraggingHandle) {
      this.isDraggingHandle = false;
      this.draggingHandleIndex = null;
      this.saveState();
    }
  }

  handleMouseLeave(event) {
    super.handleMouseLeave(event);
    if (this.isDraggingHandle) {
      this.isDraggingHandle = false;
      this.draggingHandleIndex = null;
      this.saveState();
    }
  }

  handleDblClick(event) {
    event.preventDefault();
    this.resetVertices();
  }

  handleKeyDown(event) {
    if (!this.isActive) return;

    if (event.key === "Escape") {
      event.preventDefault();
      this.resetVertices();
    } else if (event.key === "Backspace") {
      event.preventDefault();
      this.removeLastVertex();
    }
  }

  onCommonPropertiesChanged() {
    this.renderGeometry();
  }

  getHandleIndexFromEvent(event) {
    const target = event.target;
    if (target && target.hasAttribute && target.hasAttribute("data-vertex-index")) {
      return Number(target.getAttribute("data-vertex-index"));
    }
    return null;
  }

  startHandleDrag(index) {
    this.draggingHandleIndex = index;
    this.isDraggingHandle = true;
  }

  addVertex(point) {
    const vector = { x: point.x, y: point.y };
    const index = this.verticesObject.vectors.length;
    this.verticesObject.vectors.push(vector);

    const handle = this.createHandleElement(vector, index);
    this.handleLayer.appendChild(handle);
    this.handleElements.push(handle);
    this.updateHandleSelectionStyles();
    this.requestToolPanelRefresh();
  }

  updateVertex(index, point) {
    if (!this.verticesObject.vectors[index]) return;
    this.verticesObject.vectors[index] = { x: point.x, y: point.y };

    const handle = this.handleElements[index];
    if (handle) {
      handle.setAttribute("cx", point.x);
      handle.setAttribute("cy", point.y);
    }
  }

  removeLastVertex() {
    if (this.verticesObject.vectors.length === 0) return;

    const removedIndex = this.verticesObject.vectors.length - 1;
    this.verticesObject.vectors.pop();
    const handle = this.handleElements.pop();
    if (handle) {
      window.SvgUtils.removeElement(handle);
    }
    this.updateHandleIndices();

    this.verticesObject.indices.forEach((indice) => {
      indice.points = indice.points.filter((pointIndex) => pointIndex !== removedIndex);
    });

    this.updateHandleSelectionStyles();
    this.renderGeometry();
    this.saveState();
    this.requestToolPanelRefresh();
  }

  resetVertices() {
    this.verticesObject.vectors = [];
    this.handleElements.forEach((handle) => window.SvgUtils.removeElement(handle));
    this.handleElements = [];

    this.verticesObject.indices.forEach((indice) => {
      indice.points = [];
    });

    this.clearGeometryElements();
    this.updateHandleSelectionStyles();
    this.saveState();
    this.requestToolPanelRefresh();
  }

  updateHandleRadii() {
    this.handleElements.forEach((handle) => {
      if (handle) {
        handle.setAttribute("r", this.handleRadius);
      }
    });
  }

  updateHandleIndices() {
    this.handleElements.forEach((handle, idx) => {
      if (handle) {
        handle.setAttribute("data-vertex-index", idx);
      }
    });
  }

  renderGeometry() {
    this.clearGeometryElements();

    this.verticesObject.indices.forEach((indice) => {
      const element = this.createGeometryElement(indice);
      if (element) {
        element.setAttribute("data-vector-indice", indice.id);
        this.canvas.appendChild(element);
        this.geometryElements.push(element);
      }
    });

    if (this.handleLayer && this.handleLayer.parentNode === this.canvas) {
      this.canvas.appendChild(this.handleLayer);
    }
  }

  clearGeometryElements() {
    this.geometryElements.forEach((element) => {
      window.SvgUtils.removeElement(element);
    });
    this.geometryElements = [];
  }

  createGeometryElement(indice) {
    if (!indice || !indice.points || indice.points.length === 0) {
      return null;
    }

    const points = indice.points
      .map((idx) => this.verticesObject.vectors[idx])
      .filter((pt) => pt);

    if (points.length === 0) {
      return null;
    }

    let element = null;

    switch (indice.method) {
      case "line": {
        if (points.length < 2) {
          return null;
        }
        const [p1, p2] = points;
        element = window.SvgUtils.createLine(p1.x, p1.y, p2.x, p2.y);
        break;
      }
      case "polyline": {
        if (points.length < 2) {
          return null;
        }
        const polyPoints = [...points];
        if (indice.params?.closed && points.length > 0) {
          polyPoints.push(points[0]);
        }
        element = window.SvgUtils.createElement("polyline", {
          points: polyPoints.map((p) => `${p.x},${p.y}`).join(" "),
        });
        break;
      }
      case "polygon": {
        if (points.length < 3) {
          return null;
        }
        element = window.SvgUtils.createElement("polygon", {
          points: points.map((p) => `${p.x},${p.y}`).join(" "),
        });
        break;
      }
      case "quadraticBezier":
      case "cubicBezier": {
        const required = indice.method === "quadraticBezier" ? 3 : 4;
        if (points.length < required) {
          return null;
        }
        const bezierPoints = points.slice(0, required);
        const bezier = window.VectorUtils?.bezier;
        if (!bezier) {
          return null;
        }
        const pathData = bezier.buildPathData(indice.method, bezierPoints, {});
        if (!pathData) {
          return null;
        }
        element = window.SvgUtils.createElement("path", { d: pathData });
        break;
      }
      case "bezierN": {
        const bezier = window.VectorUtils?.bezier;
        if (!bezier) {
          return null;
        }
        const params = indice.params || {};
        const degree = Math.max(2, Math.round(params.degree || points.length - 1));
        const required = degree + 1;
        if (points.length < required) {
          return null;
        }
        const bezierPoints = points.slice(0, required);
        const pathData = bezier.buildPathData("bezierN", bezierPoints, {
          degree,
          sampleCount: Math.max(10, Math.round(params.sampleCount || 80)),
        });
        if (!pathData) {
          return null;
        }
        element = window.SvgUtils.createElement("path", { d: pathData });
        break;
      }
      default:
        return null;
    }

    if (element) {
      this.applyDefaultAttributes(element);
      if (indice.method === "polygon") {
        if (indice.params?.fillEnabled) {
          element.setAttribute("fill", this.currentStyle.fill);
        } else {
          element.setAttribute("fill", "none");
        }
      } else {
        element.setAttribute("fill", "none");
      }
    }

    return element;
  }

  createHandleElement(point, index) {
    const handle = window.SvgUtils.createCircle(point.x, point.y, this.handleRadius, {
      fill: "#ffffff",
      stroke: "#0078d4",
      "stroke-width": 1.5,
    });
    handle.setAttribute("data-vertex-index", index);
    handle.style.cursor = "move";
    handle.style.pointerEvents = "all";
    return handle;
  }
}

window.VerticesTool = VerticesTool;
