// PolylineTool.js
// ポリライン（連続線分）描画ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - CoordinatesUtils (window.CoordinatesUtils): 座標スナップ
//
// 【使用する外部関数】
// - SvgUtils.createElement(), createLine(): SVG要素作成
// - CoordinatesUtils.snapToOrtho(): 直交スナップ

class PolylineTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.points = [];
    this.currentPolyline = null;
    this.drawingObject = null;
    this.previewLine = null;
    this.isDrawing = false;
    this.autoSelectAfterDraw = true;
    this.selectedPolylineId = null;
    this.polylineIdCounter = 1;
    this.selectionInteractionInProgress = false;
    this.selectedPolylineObserver = null;
    this.selectedPolylineObserverTarget = null;
    this.selectedPolylineMutationHandle = null;
  }

  getTitle() {
    return "ポリライン";
  }

  getInstructions() {
    if (!this.isDrawing || this.points.length === 0) {
      return [
        "左クリック: 始点を配置",
        "続けてクリック: 頂点を追加",
        "Enterまたはダブルクリック: ポリラインを確定",
        "Esc: 作成中のポリラインをキャンセル",
        "Backspace: 最後の頂点を削除",
      ];
    }

    return [
      `現在の頂点数: ${this.points.length}`,
      "マウス移動: 次の辺をプレビュー",
      "左クリック: 頂点を追加",
      "Enterまたはダブルクリック: ポリラインを確定",
      "Esc: 作成中のポリラインをキャンセル",
      "Backspace: 最後の頂点を削除",
    ];
  }

  getToolProperties() {
    return [
      {
        type: "custom",
        label: "選択状態",
        render: (container) => this.renderSelectionControls(container),
      },
      {
        type: "custom",
        label: "ポリライン一覧",
        render: (container) => this.renderPolylineList(container),
      },
      {
        type: "custom",
        label: "オブジェクトプロパティ",
        render: (container) => this.renderSelectedPolylineProperties(container),
      },
    ];
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.updatePanel();
  }

  deactivate() {
    super.deactivate();
    this.finishPolyline();
    this.disconnectSelectedPolylineObserver();
    this.updatePanel();
  }

  getSnapAnchor() {
    return this.points.at(-1) || null;
  }

  handleMouseDown(event) {
    this.selectionInteractionInProgress = false;
    if (this.tryBeginSelectionDelegation(event)) {
      return;
    }

    super.handleMouseDown(event);
    const point = this.getMousePosition(event);

    if (!this.isDrawing) {
      this.isDrawing = true;
      this.points = [point];
      this.createPolyline();
    } else {
      this.points.push(point);
      this.updatePolyline();
    }

    this.updatePanel();
  }

  handleMouseMove(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseMove", event);
      return;
    }

    super.handleMouseMove(event);

    if (this.isDrawing && this.points.length > 0) {
      const point = this.getMousePosition(event);
      this.updatePreview(point);
    }
  }

  handleMouseUp(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseUp", event);
      this.selectionInteractionInProgress = false;
      return;
    }

    super.handleMouseUp(event);
  }

  handleMouseLeave(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseUp", event);
      this.selectionInteractionInProgress = false;
      return;
    }

    super.handleMouseLeave(event);
  }

  handleDoubleClick(event) {
    event.preventDefault();
    if (this.isDrawing && this.points.length > 1) {
      this.points.pop();
      this.finishPolyline();
    }

    this.updatePanel();
  }

  handleDblClick(event) {
    this.handleDoubleClick(event);
  }

  createPolyline() {
    if (this.currentPolyline) {
      this.canvas.removeChild(this.currentPolyline);
    }

    this.currentPolyline = window.SvgUtils.createElement("polyline", {
      stroke: this.currentStyle.stroke,
      "stroke-width": this.currentStyle.strokeWidth,
      fill: "none",
      opacity: this.currentStyle.opacity,
    });
    this.applyDefaultAttributes(this.currentPolyline);
    this.currentPolyline.setAttribute("fill", "none");
    this.currentPolyline.setAttribute("data-polyline-tool", "true");
    this.drawingObject = this.currentPolyline;
    this.canvas.appendChild(this.currentPolyline);
  }

  updatePolyline() {
    if (!this.currentPolyline) return;

    this.draw("polyline", {points: this.points}, this.currentPolyline);
  }

  updatePreview(previewPoint) {
    if (this.points.length === 0) return;

    if (!this.previewLine) {
      this.previewLine = window.SvgUtils.createLine(0, 0, 0, 0, {
        stroke: "#999",
        "stroke-width": "1",
        "stroke-dasharray": "5,5",
      });
      this.canvas.appendChild(this.previewLine);
    }

    const lastPoint = this.points[this.points.length - 1];

    this.draw("line", {start: lastPoint, end: previewPoint, ortho: window.orthoMode}, this.previewLine);
  }

  finishPolyline() {
    let finishedPolyline = null;

    if (this.points.length < 2) {
      if (this.currentPolyline) {
        this.canvas.removeChild(this.currentPolyline);
      }
    } else {
      this.saveState();
      if (this.currentPolyline) {
        this.currentPolyline.setAttribute("data-layer", window.currentLayerId);
        this.initializePolylineMetadata(this.currentPolyline);
        finishedPolyline = this.currentPolyline;
      }
    }

    if (this.previewLine) {
      this.canvas.removeChild(this.previewLine);
      this.previewLine = null;
    }

    this.points = [];
    this.currentPolyline = null;
    this.drawingObject = null;
    this.isDrawing = false;

    if (finishedPolyline && this.autoSelectAfterDraw) {
      if (
        this.toolManager &&
        typeof this.toolManager.activateTemporaryTool === "function"
      ) {
        this.toolManager.activateTemporaryTool("select", {
          restoreTriggers: ["deselect", "cancel"],
        });
      }

      this.selectPolyline(finishedPolyline);
      if (this.selectTool) {
        this.selectTool.selectObject(finishedPolyline);
      }
    }

    this.requestToolPanelRefresh();
    this.updatePanel();

    return finishedPolyline;
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      if (this.currentPolyline) {
        this.canvas.removeChild(this.currentPolyline);
      }
      if (this.previewLine) {
        this.canvas.removeChild(this.previewLine);
        this.previewLine = null;
      }
      this.points = [];
      this.currentPolyline = null;
      this.drawingObject = null;
      this.isDrawing = false;
      this.updatePanel();
      return;
    }

    if (event.key === "Enter" && this.isDrawing) {
      this.finishPolyline();
      this.updatePanel();
      return;
    }

    if (event.key === "Backspace" && this.isDrawing && this.points.length > 1) {
      event.preventDefault();
      this.points.pop();
      this.updatePolyline();
      this.updatePanel();
    }
  }

  requestToolPanelRefresh() {
    if (
      window.toolPropertiesPanel &&
      window.toolPropertiesPanel.currentTool === this
    ) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  renderSelectionControls(container) {
    const selected = this.getSelectedPolylineElement();
    const polylines = this.getPolylineElements();
    const index = selected ? polylines.indexOf(selected) : -1;

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    const info = document.createElement("div");
    info.textContent = selected
      ? this.getPolylineSummary(selected, index >= 0 ? index : 0)
      : "現在選択されていません";
    info.style.fontSize = "12px";
    info.style.color = selected ? "#1a73e8" : "#666";
    container.appendChild(info);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "選択解除";
    button.disabled = !selected;
    button.style.cssText = `
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background: ${selected ? "#fff" : "#f5f5f5"};
      color: ${selected ? "#333" : "#999"};
      font-size: 12px;
      cursor: ${selected ? "pointer" : "not-allowed"};
    `;
    button.addEventListener("click", () => {
      this.selectPolyline(null);
    });
    container.appendChild(button);
  }

  renderPolylineList(container) {
    const polylines = this.getPolylineElements();

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    if (polylines.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "ポリラインがありません";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "4px";

    polylines.forEach((polyline, index) => {
      const polylineId = this.ensurePolylineId(polyline);
      const isSelected = polylineId === this.selectedPolylineId;
      const summary = this.getPolylineSummary(polyline, index);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = summary;
      button.style.cssText = `
        text-align: left;
        padding: 6px 8px;
        border-radius: 4px;
        border: 1px solid ${isSelected ? "#2f80ed" : "#ccc"};
        background: ${isSelected ? "#e8f0fe" : "#fff"};
        color: ${isSelected ? "#1a73e8" : "#333"};
        font-size: 12px;
        cursor: pointer;
      `;
      button.addEventListener("click", () => {
        this.selectPolyline(polyline);
      });

      list.appendChild(button);
    });

    container.appendChild(list);
  }

  renderSelectedPolylineProperties(container) {
    const polyline = this.getSelectedPolylineElement();

    if (!polyline) {
      const empty = document.createElement("div");
      empty.textContent = "一覧からポリラインを選択すると編集できます";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const idLabel = document.createElement("div");
    idLabel.textContent = `ID: ${polyline.dataset.polylineId}`;
    idLabel.style.fontSize = "12px";
    idLabel.style.color = "#333";
    idLabel.style.marginBottom = "6px";
    container.appendChild(idLabel);

    const points = window.CoordinatesUtils.elementPointsInCanvas(this.canvas, polyline);
    if (points) {
      const readout = document.createElement("div");
      const length = this.run("polylineLength", {points});
      readout.textContent = `全長 ${length.toFixed(2)}`;
      container.appendChild(readout);
    }

    const geometryWrapper = this.renderPointsEditor(polyline);
    container.appendChild(geometryWrapper);

    this.renderAffineControls(container, polyline);
    this.renderPolylineStyleControls(container, polyline);
  }

  renderPointsEditor(polyline) {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "6px";
    wrapper.dataset.pointsWrapper = "true";

    const title = document.createElement("div");
    title.textContent = "頂点";
    title.style.fontSize = "12px";
    title.style.color = "#555";
    wrapper.appendChild(title);

    const points = this.getPolylinePoints(polyline);

    points.forEach((point, index) => {
      const row = document.createElement("div");
      row.style.display = "grid";
      row.style.gridTemplateColumns = "minmax(0,1fr) minmax(0,1fr)";
      row.style.gap = "6px";

      [
        { axis: "x", label: `P${index + 1} X`, value: point.x },
        { axis: "y", label: `P${index + 1} Y`, value: point.y },
      ].forEach((field) => {
        const inputWrapper = document.createElement("div");
        inputWrapper.style.display = "flex";
        inputWrapper.style.flexDirection = "column";

        const label = document.createElement("label");
        label.textContent = field.label;
        label.style.fontSize = "11px";
        label.style.color = "#555";
        label.style.marginBottom = "2px";
        inputWrapper.appendChild(label);

        const input = document.createElement("input");
        input.type = "number";
        input.value = field.value;
        input.step = "1";
        input.dataset.pointIndex = String(index);
        input.dataset.axis = field.axis;
        input.style.cssText = `
          width: 100%;
          padding: 6px;
          border-radius: 4px;
          border: 1px solid #ccc;
          font-size: 12px;
        `;
        input.addEventListener("change", () => {
          this.updatePolylineFromInputs(polyline, wrapper);
        });
        inputWrapper.appendChild(input);

        row.appendChild(inputWrapper);
      });

      wrapper.appendChild(row);
    });

    return wrapper;
  }

  updatePolylineFromInputs(polyline, wrapper) {
    const points = this.getPolylinePoints(polyline);
    wrapper.querySelectorAll("[data-point-index]").forEach((input) => {
      const index = parseInt(input.dataset.pointIndex, 10);
      if (!points[index]) {
        points[index] = { x: 0, y: 0 };
      }
      const axis = input.dataset.axis === "y" ? "y" : "x";
      const parsed = parseFloat(input.value);
      points[index][axis] = Number.isFinite(parsed) ? parsed : 0;
    });

    this.setPolylinePoints(polyline, points);
    this.saveState();
    this.refreshSelectionVisuals(polyline);
    this.requestToolPanelRefresh();
  }

  getPolylinePoints(polyline) {
    if (!polyline) {
      return [];
    }
    const attr = polyline.getAttribute("points") || "";
    return attr
      .split(/\s+/)
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [xStr, yStr] = pair.split(",");
        const x = parseFloat(xStr);
        const y = parseFloat(yStr);
        return {
          x: Number.isFinite(x) ? x : 0,
          y: Number.isFinite(y) ? y : 0,
        };
      });
  }

  setPolylinePoints(polyline, points) {
    if (!polyline) {
      return;
    }
    const pointsStr = points.map((p) => `${p.x},${p.y}`).join(" ");
    polyline.setAttribute("points", pointsStr);
  }

  renderAffineControls(container, polyline) {
    if (!window.DOMMatrix) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "6px";
    wrapper.style.marginTop = "10px";
    wrapper.dataset.affineWrapper = "true";

    const title = document.createElement("div");
    title.textContent = "ベースアフィン変換";
    title.style.fontSize = "12px";
    title.style.color = "#555";
    title.style.marginBottom = "2px";
    wrapper.appendChild(title);

    const values = this.getAffineValues(polyline);
    const fields = [
      { id: "translateX", label: "平行移動 X", step: "1" },
      { id: "translateY", label: "平行移動 Y", step: "1" },
      { id: "rotation", label: "回転", step: "1", suffix: "度" },
      { id: "scaleX", label: "拡大率 X", step: "0.1" },
      { id: "scaleY", label: "拡大率 Y", step: "0.1" },
    ];

    fields.forEach((field) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "column";

      const label = document.createElement("label");
      label.textContent = field.label;
      label.style.fontSize = "12px";
      label.style.color = "#555";
      label.style.marginBottom = "2px";
      row.appendChild(label);

      const input = document.createElement("input");
      input.type = "number";
      input.step = field.step || "1";
      input.value = values[field.id];
      input.dataset.affineId = field.id;
      input.style.cssText = `
        width: 100%;
        padding: 6px;
        border-radius: 4px;
        border: 1px solid #ccc;
        font-size: 12px;
      `;
      input.addEventListener("change", () => {
        this.updateAffineFromInputs(polyline, wrapper);
      });
      row.appendChild(input);

      if (field.suffix) {
        const suffix = document.createElement("div");
        suffix.textContent = field.suffix;
        suffix.style.fontSize = "11px";
        suffix.style.color = "#888";
        suffix.style.marginTop = "2px";
        row.appendChild(suffix);
      }

      wrapper.appendChild(row);
    });

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.textContent = "適用";
    applyButton.style.cssText = `
      width: 100%;
      padding: 8px;
      margin-top: 6px;
      border-radius: 4px;
      border: 1px solid #2f80ed;
      background: #2f80ed;
      color: #fff;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.2s;
    `;
    applyButton.addEventListener("mouseover", () => {
      applyButton.style.background = "#1a6bd8";
    });
    applyButton.addEventListener("mouseout", () => {
      applyButton.style.background = "#2f80ed";
    });
    applyButton.addEventListener("click", () => {
      this.applyAffineToGeometry(polyline);
    });
    wrapper.appendChild(applyButton);

    container.appendChild(wrapper);
  }

  getAffineValues(polyline) {
    if (!window.DOMMatrix || !polyline) {
      return {
        translateX: 0,
        translateY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }

    let matrix;
    try {
      const transform = polyline.getAttribute("transform");
      matrix = transform ? new DOMMatrix(transform) : new DOMMatrix();
    } catch (error) {
      matrix = new DOMMatrix();
    }

    const anchor = this.getPolylineLocalCenter(polyline);
    const anchorShift = this.getAnchorTranslation(matrix, anchor);

    const translateX = matrix.e - anchorShift.x;
    const translateY = matrix.f - anchorShift.y;
    const scaleX = Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b) || 0;
    let rotation = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    let scaleY;
    if (scaleX !== 0) {
      const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
      scaleY = determinant / scaleX;
    }

    if (!Number.isFinite(scaleY)) {
      const alt = Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d);
      scaleY = alt || 0;
      const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
      if (determinant < 0) {
        scaleY *= -1;
      }
    }

    return {
      translateX: this.roundValue(translateX),
      translateY: this.roundValue(translateY),
      rotation: this.roundValue(rotation),
      scaleX: this.roundValue(scaleX || 1, 4),
      scaleY: this.roundValue(scaleY || 1, 4),
    };
  }

  updateAffineFromInputs(polyline, wrapper) {
    if (!polyline || !wrapper) {
      return;
    }

    const values = {};
    wrapper.querySelectorAll("[data-affine-id]").forEach((input) => {
      const id = input.dataset.affineId;
      let parsed = parseFloat(input.value);
      if (!Number.isFinite(parsed)) {
        parsed = id && id.startsWith("scale") ? 1 : 0;
      }
      values[id] = parsed;
    });

    this.applyAffineValues(polyline, values);
    this.saveState();
    this.refreshSelectionVisuals(polyline);
    this.updateAffineInputs(wrapper, polyline);
  }

  updateAffineInputs(wrapper, polyline) {
    if (!wrapper || !polyline) {
      return;
    }

    const latest = this.getAffineValues(polyline);
    wrapper.querySelectorAll("[data-affine-id]").forEach((input) => {
      const id = input.dataset.affineId;
      if (id && latest[id] !== undefined) {
        input.value = latest[id];
      }
    });
  }

  applyAffineValues(polyline, values) {
    if (!polyline) {
      return;
    }

    const current = this.getAffineValues(polyline);
    const nextValues = {
      ...current,
      ...values,
    };

    const translateX = Number.isFinite(nextValues.translateX)
      ? nextValues.translateX
      : 0;
    const translateY = Number.isFinite(nextValues.translateY)
      ? nextValues.translateY
      : 0;
    const rotation = Number.isFinite(nextValues.rotation)
      ? nextValues.rotation
      : 0;
    let scaleX = Number.isFinite(nextValues.scaleX) ? nextValues.scaleX : 1;
    let scaleY = Number.isFinite(nextValues.scaleY) ? nextValues.scaleY : 1;

    if (this.isAlmostZero(scaleX)) {
      scaleX = scaleX < 0 ? -0.0001 : 0.0001;
    }
    if (this.isAlmostZero(scaleY)) {
      scaleY = scaleY < 0 ? -0.0001 : 0.0001;
    }

    const angleRad = (rotation * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const a = cos * scaleX;
    const b = sin * scaleX;
    const c = -sin * scaleY;
    const d = cos * scaleY;

    const anchor = this.getPolylineLocalCenter(polyline);
    const anchorShift = this.getAnchorTranslation({ a, b, c, d }, anchor);
    const e = anchorShift.x + translateX;
    const f = anchorShift.y + translateY;

    if (this.isIdentityMatrix({ a, b, c, d, e, f })) {
      polyline.removeAttribute("transform");
    } else {
      polyline.setAttribute("transform", `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`);
    }
  }

  applyAffineToGeometry(polyline) {
    if (!polyline || !window.DOMPoint) {
      return;
    }

    const transformAttr = polyline.getAttribute("transform");
    if (!transformAttr) {
      return;
    }

    let matrix;
    try {
      matrix = new DOMMatrix(transformAttr);
    } catch (error) {
      console.error("Failed to parse transform:", error);
      return;
    }

    const points = this.getPolylinePoints(polyline);
    const transformed = points.map((point) => {
      const transformedPoint = new DOMPoint(point.x, point.y).matrixTransform(
        matrix
      );
      return {
        x: this.roundValue(transformedPoint.x, 4),
        y: this.roundValue(transformedPoint.y, 4),
      };
    });

    this.setPolylinePoints(polyline, transformed);
    polyline.removeAttribute("transform");
    this.saveState();
    this.refreshSelectionVisuals(polyline);
    this.requestToolPanelRefresh();
  }

  getPolylineLocalCenter(polyline) {
    if (!polyline || typeof polyline.getBBox !== "function") {
      return { x: 0, y: 0 };
    }

    const bbox = polyline.getBBox();
    return {
      x: bbox.x + bbox.width / 2,
      y: bbox.y + bbox.height / 2,
    };
  }

  getAnchorTranslation(matrix, anchor) {
    if (!matrix || !anchor) {
      return { x: 0, y: 0 };
    }

    const a = Number.isFinite(matrix.a) ? matrix.a : 1;
    const b = Number.isFinite(matrix.b) ? matrix.b : 0;
    const c = Number.isFinite(matrix.c) ? matrix.c : 0;
    const d = Number.isFinite(matrix.d) ? matrix.d : 1;

    if (!Number.isFinite(anchor.x) || !Number.isFinite(anchor.y)) {
      return { x: 0, y: 0 };
    }

    const anchorX = anchor.x;
    const anchorY = anchor.y;
    const shiftedX = anchorX - (a * anchorX + c * anchorY);
    const shiftedY = anchorY - (b * anchorX + d * anchorY);
    return {
      x: shiftedX,
      y: shiftedY,
    };
  }

  renderPolylineStyleControls(container, polyline) {
    const style = window.SvgUtils.getElementStyle(polyline);

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "8px";
    wrapper.style.marginTop = "10px";

    const colorRow = document.createElement("div");
    colorRow.style.display = "flex";
    colorRow.style.flexDirection = "column";

    const colorLabel = document.createElement("label");
    colorLabel.textContent = "線色";
    colorLabel.style.fontSize = "12px";
    colorLabel.style.color = "#555";
    colorLabel.style.marginBottom = "2px";
    colorRow.appendChild(colorLabel);

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = this.normalizeColorForInput(style.stroke);
    colorInput.style.width = "60px";
    colorInput.style.height = "34px";
    colorInput.style.padding = "0";
    colorInput.style.border = "none";
    colorInput.addEventListener("change", (event) => {
      polyline.setAttribute("stroke", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(polyline);
    });
    colorRow.appendChild(colorInput);
    wrapper.appendChild(colorRow);

    const widthRow = document.createElement("div");
    widthRow.style.display = "flex";
    widthRow.style.flexDirection = "column";

    const widthLabel = document.createElement("label");
    widthLabel.textContent = "線幅";
    widthLabel.style.fontSize = "12px";
    widthLabel.style.color = "#555";
    widthLabel.style.marginBottom = "2px";
    widthRow.appendChild(widthLabel);

    const widthInput = document.createElement("input");
    widthInput.type = "number";
    widthInput.value = style.strokeWidth;
    widthInput.min = "0.5";
    widthInput.step = "0.5";
    widthInput.style.cssText = `
      width: 100%;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid #ccc;
      font-size: 12px;
    `;
    widthInput.addEventListener("change", (event) => {
      const width = parseFloat(event.target.value);
      polyline.setAttribute("stroke-width", Number.isFinite(width) ? width : 1);
      this.saveState();
      this.refreshSelectionVisuals(polyline);
    });
    widthRow.appendChild(widthInput);
    wrapper.appendChild(widthRow);

    const dashRow = document.createElement("div");
    dashRow.style.display = "flex";
    dashRow.style.flexDirection = "column";

    const dashLabel = document.createElement("label");
    dashLabel.textContent = "線スタイル";
    dashLabel.style.fontSize = "12px";
    dashLabel.style.color = "#555";
    dashLabel.style.marginBottom = "2px";
    dashRow.appendChild(dashLabel);

    const select = document.createElement("select");
    select.style.cssText = `
      width: 100%;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid #ccc;
      font-size: 12px;
    `;
    const dashOptions = [
      { value: "solid", label: "実線" },
      { value: "dashed", label: "破線" },
      { value: "dotted", label: "点線" },
    ];
    const currentStyle = this.getStrokeStyleKey(polyline);
    dashOptions.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === currentStyle) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    select.addEventListener("change", (event) => {
      this.applyStrokeStyle(polyline, event.target.value);
      this.saveState();
      this.requestToolPanelRefresh();
    });
    dashRow.appendChild(select);
    wrapper.appendChild(dashRow);

    container.appendChild(wrapper);
  }

  normalizeColorForInput(value) {
    const rgb = window.StyleUtils.parseColor(value);
    if (rgb) {
      return window.StyleUtils.rgbToHex(rgb.r, rgb.g, rgb.b);
    }
    return "#000000";
  }

  getStrokeStyleKey(polyline) {
    const dash = polyline.getAttribute("stroke-dasharray") || "none";
    const entries = Object.entries(window.StyleUtils.LINE_STYLES || {});
    for (const [key, pattern] of entries) {
      if (pattern === dash) {
        return key;
      }
    }
    return polyline.dataset.strokeStyle || "solid";
  }

  applyStrokeStyle(polyline, styleKey) {
    const pattern = window.StyleUtils.LINE_STYLES[styleKey] || "none";
    if (pattern === "none") {
      polyline.removeAttribute("stroke-dasharray");
    } else {
      polyline.setAttribute("stroke-dasharray", pattern);
    }
    polyline.dataset.strokeStyle = styleKey;
    this.refreshSelectionVisuals(polyline);
  }

  refreshSelectionVisuals(polyline) {
    if (!this.isPolylineCurrentlySelected(polyline)) {
      return;
    }

    if (this.selectTool) {
      if (typeof this.selectTool.refreshHandles === "function") {
        this.selectTool.refreshHandles();
      } else if (typeof this.selectTool.addControlPoints === "function") {
        this.selectTool.addControlPoints();
      }
    }

    this.updateSelectionStyleInputs(polyline);
  }

  updateSelectionStyleInputs(polyline) {
    if (!polyline) {
      return;
    }

    const strokeInput = document.getElementById("stroke-color");
    if (strokeInput) {
      strokeInput.value = this.normalizeColorForInput(
        polyline.getAttribute("stroke") || "#000000"
      );
    }

    const widthInput = document.getElementById("stroke-width");
    if (widthInput) {
      const width = parseFloat(polyline.getAttribute("stroke-width"));
      if (Number.isFinite(width)) {
        widthInput.value = String(width);
      }
    }

    const opacityInput = document.getElementById("opacity-input");
    if (opacityInput) {
      const opacity = parseFloat(polyline.getAttribute("opacity"));
      if (Number.isFinite(opacity)) {
        opacityInput.value = String(opacity);
      }
    }
  }

  getPolylineElements() {
    const polylines = Array.from(
      this.canvas.querySelectorAll('polyline[data-polyline-tool="true"]')
    );
    return polylines.filter((polyline) => {
      if (!polyline.getAttribute("points")) {
        return false;
      }
      this.initializePolylineMetadata(polyline);
      return true;
    });
  }

  getSelectedPolylineElement() {
    if (!this.selectedPolylineId) {
      return null;
    }

    const polyline = this.canvas.querySelector(
      `polyline[data-polyline-id="${this.selectedPolylineId}"]`
    );

    if (polyline && polyline.getAttribute("data-polyline-tool") === "true") {
      return polyline;
    }

    this.selectedPolylineId = null;
    return null;
  }

  selectPolyline(polyline) {
    if (polyline && polyline.getAttribute("data-polyline-tool") !== "true") {
      polyline = null;
    }

    if (!polyline) {
      this.selectedPolylineId = null;
      this.selectionInteractionInProgress = false;
      this.disconnectSelectedPolylineObserver();
      if (
        this.selectTool &&
        typeof this.selectTool.deselectObject === "function"
      ) {
        this.selectTool.deselectObject();
      }
      this.requestToolPanelRefresh();
      return;
    }

    const polylineId = this.ensurePolylineId(polyline);
    this.selectedPolylineId = polylineId;
    this.selectionInteractionInProgress = false;

    if (this.selectTool && typeof this.selectTool.selectObject === "function") {
      this.selectTool.selectObject(polyline, false);
    }

    this.observeSelectedPolyline(polyline);
    this.requestToolPanelRefresh();
  }

  initializePolylineMetadata(polyline) {
    if (!polyline) {
      return;
    }

    if (polyline.getAttribute("data-polyline-tool") !== "true") {
      return;
    }

    if (!polyline.dataset.strokeStyle) {
      polyline.dataset.strokeStyle = this.getStrokeStyleKey(polyline);
    }

    this.ensurePolylineId(polyline);
  }

  ensurePolylineId(polyline) {
    if (!polyline.dataset.polylineId) {
      polyline.dataset.polylineId = this.generatePolylineId();
    }
    return polyline.dataset.polylineId;
  }

  generatePolylineId() {
    return `polyline-${Date.now()}-${this.polylineIdCounter++}`;
  }

  getPolylineSummary(polyline, index = 0) {
    const points = this.getPolylinePoints(polyline);
    return `PL${index + 1}: 頂点${points.length}`;
  }

  observeSelectedPolyline(polyline) {
    if (!window.MutationObserver || !polyline) {
      this.disconnectSelectedPolylineObserver();
      return;
    }

    if (this.selectedPolylineObserverTarget === polyline) {
      return;
    }

    this.disconnectSelectedPolylineObserver();

    this.selectedPolylineObserverTarget = polyline;
    this.selectedPolylineObserver = new MutationObserver((mutations) => {
      this.handleSelectedPolylineMutations(polyline, mutations);
    });

    this.selectedPolylineObserver.observe(polyline, {
      attributes: true,
      attributeFilter: [
        "points",
        "transform",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "opacity",
      ],
    });
  }

  handleSelectedPolylineMutations(polyline, mutations) {
    if (!mutations || polyline !== this.getSelectedPolylineElement()) {
      return;
    }

    const hasAttributeChange = mutations.some(
      (mutation) => mutation.type === "attributes"
    );

    if (!hasAttributeChange) {
      return;
    }

    this.scheduleSelectedPolylineSync();
  }

  scheduleSelectedPolylineSync() {
    const requestFrame =
      window.requestAnimationFrame || window.setTimeout || ((cb) => cb());
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedPolylineMutationHandle) {
      cancelFrame(this.selectedPolylineMutationHandle);
      this.selectedPolylineMutationHandle = null;
    }

    this.selectedPolylineMutationHandle = requestFrame(() => {
      this.selectedPolylineMutationHandle = null;
      this.syncSelectedPolylineUiState();
    });
  }

  syncSelectedPolylineUiState() {
    const polyline = this.getSelectedPolylineElement();
    if (!polyline) {
      this.disconnectSelectedPolylineObserver();
      return;
    }

    this.initializePolylineMetadata(polyline);
    this.updateSelectionStyleInputs(polyline);
    this.requestToolPanelRefresh();
  }

  disconnectSelectedPolylineObserver() {
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedPolylineObserver) {
      this.selectedPolylineObserver.disconnect();
      this.selectedPolylineObserver = null;
    }

    if (this.selectedPolylineMutationHandle) {
      cancelFrame(this.selectedPolylineMutationHandle);
      this.selectedPolylineMutationHandle = null;
    }

    this.selectedPolylineObserverTarget = null;
  }

  tryBeginSelectionDelegation(event) {
    if (!this.shouldDelegateSelectionEvent(event)) {
      return false;
    }

    const delegated = this.delegateSelectionEvent("handleMouseDown", event);
    if (delegated) {
      this.selectionInteractionInProgress = true;
    }
    return delegated;
  }

  shouldDelegateSelectionEvent(event) {
    const polyline = this.getSelectedPolylineElement();
    if (!polyline) {
      return false;
    }

    const target = event?.target;
    if (!target) {
      return false;
    }

    if (target === polyline) {
      return true;
    }

    return this.isSelectionHandleTarget(target);
  }

  isSelectionHandleTarget(target) {
    if (!target || !target.classList) {
      return false;
    }

    const classes = [
      "control-handle",
      "rotate-handle",
      "rotate-line",
      "translate-handle",
    ];

    return classes.some((cls) => target.classList.contains(cls));
  }

  delegateSelectionEvent(methodName, event) {
    if (!this.selectTool) {
      return false;
    }

    const handler = this.selectTool[methodName];
    if (typeof handler === "function") {
      handler.call(this.selectTool, event);
      return true;
    }

    return false;
  }

  isPolylineCurrentlySelected(polyline) {
    if (!polyline) {
      return false;
    }

    const selections = Array.isArray(window.selectedObjects)
      ? window.selectedObjects
      : [];
    return selections.includes(polyline);
  }

  roundValue(value, decimals = 2) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(value * factor) / factor;
    return this.isAlmostZero(rounded) ? 0 : rounded;
  }

  isAlmostZero(value, epsilon = 0.000001) {
    return Math.abs(value) <= epsilon;
  }

  isIdentityMatrix(matrix) {
    if (!matrix) {
      return true;
    }

    return (
      this.isAlmostZero((matrix.a ?? 0) - 1) &&
      this.isAlmostZero(matrix.b ?? 0) &&
      this.isAlmostZero(matrix.c ?? 0) &&
      this.isAlmostZero((matrix.d ?? 0) - 1) &&
      this.isAlmostZero(matrix.e ?? 0) &&
      this.isAlmostZero(matrix.f ?? 0)
    );
  }
}

window.PolylineTool = PolylineTool;
