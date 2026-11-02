// PolygonTool.js
// 多角形描画ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
//
// 【使用する外部関数】
// - SvgUtils.createElement(): SVG要素作成
// - SvgUtils.createLine(): 線分要素作成

class PolygonTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.polygonPoints = [];
    this.tempLine = null;
    this.autoSelectAfterDraw = true;
    this.selectedPolygonId = null;
    this.polygonIdCounter = 1;
    this.selectionInteractionInProgress = false;
    this.selectedPolygonObserver = null;
    this.selectedPolygonObserverTarget = null;
    this.selectedPolygonMutationHandle = null;
  }

  getTitle() {
    return "多角形";
  }

  getInstructions() {
    const instructions = ["左クリック: 頂点を追加"];

    if (this.polygonPoints.length > 0) {
      instructions.push("マウス移動: 次の辺をプレビュー");
    }

    instructions.push("ダブルクリックまたはEnter: 多角形を確定");
    instructions.push("Esc: 描画中の多角形をキャンセル");

    return instructions;
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
        label: "多角形一覧",
        render: (container) => this.renderPolygonList(container),
      },
      {
        type: "custom",
        label: "オブジェクトプロパティ",
        render: (container) => this.renderSelectedPolygonProperties(container),
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
    this.cancelPolygon();
    this.disconnectSelectedPolygonObserver();
    this.updatePanel();
  }

  cancel() {
    this.cancelPolygon();
  }

  handleMouseDown(event) {
    this.selectionInteractionInProgress = false;
    if (this.tryBeginSelectionDelegation(event)) {
      return;
    }

    super.handleMouseDown(event);

    if (!this.isActive) return;

    this.handlePolygonClick(this.startPoint);
    this.updatePanel();
  }

  handleMouseMove(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseMove", event);
      return;
    }

    super.handleMouseMove(event);

    if (!this.isActive) return;

    if (this.polygonPoints.length > 0) {
      this.updateTemporaryLine(
        this.polygonPoints[this.polygonPoints.length - 1],
        this.currentPoint
      );
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

  handleDblClick(event) {
    if (!this.isActive) return;

    if (this.polygonPoints.length >= 3) {
      this.finishPolygon();
    } else {
      this.cancelPolygon();
    }

    this.updatePanel();
  }

  handleKeyDown(event) {
    if (!this.isActive) return;

    if (event.key === "Escape") {
      this.cancelPolygon();
      this.updatePanel();
    }

    if (event.key === "Enter" && this.polygonPoints.length >= 3) {
      this.finishPolygon();
      this.updatePanel();
    }
  }

  handlePolygonClick(point) {
    if (!this.drawingObject) {
      this.saveState();
    }

    if (!this.drawingObject) {
      this.drawingObject = window.SvgUtils.createElement("polygon");
      this.drawingObject.setAttribute("data-polygon-tool", "true");
      this.applyDefaultAttributes(this.drawingObject);
      this.canvas.appendChild(this.drawingObject);
      this.isDrawing = true;

      this.tempLine = window.SvgUtils.createLine(0, 0, 0, 0, {
        stroke: "#000000",
        "stroke-width": 1,
        "stroke-dasharray": "4 4",
      });
      this.canvas.appendChild(this.tempLine);

      this.polygonPoints = [];
    }

    this.polygonPoints.push({ ...point });

    this.updatePolygonPath();
    this.updatePanel();
  }

  updatePolygonPath() {
    if (!this.drawingObject || this.polygonPoints.length === 0) return;

    this.draw("polygon", {points: this.polygonPoints}, this.drawingObject);
  }

  updateTemporaryLine(start, end) {
    if (!this.tempLine) return;

    this.tempLine.setAttribute("x1", start.x);
    this.tempLine.setAttribute("y1", start.y);
    this.tempLine.setAttribute("x2", end.x);
    this.tempLine.setAttribute("y2", end.y);
  }

  finishPolygon() {
    if (!this.drawingObject || this.polygonPoints.length < 3) {
      this.cancelPolygon();
      return null;
    }

    if (this.tempLine) {
      this.canvas.removeChild(this.tempLine);
      this.tempLine = null;
    }

    if (this.selectTool) {
      this.selectTool.selectObject(this.drawingObject);
    }

    this.isDrawing = false;
    const createdObject = this.drawingObject;
    this.drawingObject = null;
    this.polygonPoints = [];

    if (createdObject) {
      if (window.currentLayerId) {
        createdObject.setAttribute("data-layer", window.currentLayerId);
      }
      this.initializePolygonMetadata(createdObject);
      if (this.autoSelectAfterDraw) {
        if (
          this.toolManager &&
          typeof this.toolManager.activateTemporaryTool === "function"
        ) {
          this.toolManager.activateTemporaryTool("select", {
            restoreTriggers: ["deselect", "cancel"],
          });
        }

        this.selectPolygon(createdObject);
        if (this.selectTool) {
          this.selectTool.selectObject(createdObject);
        }
      }
    }

    this.requestToolPanelRefresh();
    if (createdObject) this.saveState();
    return createdObject;
  }

  cancelPolygon() {
    if (this.drawingObject) {
      this.canvas.removeChild(this.drawingObject);
    }

    if (this.tempLine) {
      this.canvas.removeChild(this.tempLine);
      this.tempLine = null;
    }

    this.drawingObject = null;
    this.polygonPoints = [];
    this.isDrawing = false;
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
    const polygon = this.getSelectedPolygonElement();
    const polygons = this.getPolygonElements();
    const index = polygon ? polygons.indexOf(polygon) : -1;

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    const info = document.createElement("div");
    info.textContent = polygon
      ? this.getPolygonSummary(polygon, index >= 0 ? index : 0)
      : "現在選択されていません";
    info.style.fontSize = "12px";
    info.style.color = polygon ? "#1a73e8" : "#666";
    container.appendChild(info);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "選択解除";
    button.disabled = !polygon;
    button.style.cssText = `
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background: ${polygon ? "#fff" : "#f5f5f5"};
      color: ${polygon ? "#333" : "#999"};
      font-size: 12px;
      cursor: ${polygon ? "pointer" : "not-allowed"};
    `;
    button.addEventListener("click", () => {
      this.selectPolygon(null);
    });
    container.appendChild(button);
  }

  renderPolygonList(container) {
    const polygons = this.getPolygonElements();

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    if (polygons.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "多角形がありません";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "4px";

    polygons.forEach((polygon, index) => {
      const polygonId = this.ensurePolygonId(polygon);
      const isSelected = polygonId === this.selectedPolygonId;
      const summary = this.getPolygonSummary(polygon, index);

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
        this.selectPolygon(polygon);
      });

      list.appendChild(button);
    });

    container.appendChild(list);
  }

  renderSelectedPolygonProperties(container) {
    const polygon = this.getSelectedPolygonElement();

    if (!polygon) {
      const empty = document.createElement("div");
      empty.textContent = "一覧から多角形を選択すると編集できます";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const idLabel = document.createElement("div");
    idLabel.textContent = `ID: ${polygon.dataset.polygonId}`;
    idLabel.style.fontSize = "12px";
    idLabel.style.color = "#333";
    idLabel.style.marginBottom = "6px";
    container.appendChild(idLabel);

    const geometryWrapper = this.renderPointsEditor(polygon);
    container.appendChild(geometryWrapper);

    this.renderAffineControls(container, polygon);
    this.renderPolygonStyleControls(container, polygon);
  }

  renderPointsEditor(polygon) {
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

    const points = this.getPolygonPoints(polygon);

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
          this.updatePolygonFromInputs(polygon, wrapper);
        });
        inputWrapper.appendChild(input);

        row.appendChild(inputWrapper);
      });

      wrapper.appendChild(row);
    });

    return wrapper;
  }

  updatePolygonFromInputs(polygon, wrapper) {
    const points = this.getPolygonPoints(polygon);
    wrapper.querySelectorAll("[data-point-index]").forEach((input) => {
      const index = parseInt(input.dataset.pointIndex, 10);
      if (!points[index]) {
        points[index] = { x: 0, y: 0 };
      }
      const axis = input.dataset.axis === "y" ? "y" : "x";
      const parsed = parseFloat(input.value);
      points[index][axis] = Number.isFinite(parsed) ? parsed : 0;
    });

    this.setPolygonPoints(polygon, points);
    this.saveState();
    this.refreshSelectionVisuals(polygon);
    this.requestToolPanelRefresh();
  }

  getPolygonPoints(polygon) {
    if (!polygon) {
      return [];
    }
    const attr = polygon.getAttribute("points") || "";
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

  setPolygonPoints(polygon, points) {
    if (!polygon) {
      return;
    }
    const pointsStr = points.map((p) => `${p.x},${p.y}`).join(" ");
    polygon.setAttribute("points", pointsStr);
  }

  renderAffineControls(container, polygon) {
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

    const values = this.getAffineValues(polygon);
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
        this.updateAffineFromInputs(polygon, wrapper);
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
      this.applyAffineToGeometry(polygon);
    });
    wrapper.appendChild(applyButton);

    container.appendChild(wrapper);
  }

  getAffineValues(polygon) {
    if (!window.DOMMatrix || !polygon) {
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
      const transform = polygon.getAttribute("transform");
      matrix = transform ? new DOMMatrix(transform) : new DOMMatrix();
    } catch (error) {
      matrix = new DOMMatrix();
    }

    const anchor = this.getPolygonLocalCenter(polygon);
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

  updateAffineFromInputs(polygon, wrapper) {
    if (!polygon || !wrapper) {
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

    this.applyAffineValues(polygon, values);
    this.saveState();
    this.refreshSelectionVisuals(polygon);
    this.updateAffineInputs(wrapper, polygon);
  }

  updateAffineInputs(wrapper, polygon) {
    if (!wrapper || !polygon) {
      return;
    }

    const latest = this.getAffineValues(polygon);
    wrapper.querySelectorAll("[data-affine-id]").forEach((input) => {
      const id = input.dataset.affineId;
      if (id && latest[id] !== undefined) {
        input.value = latest[id];
      }
    });
  }

  applyAffineValues(polygon, values) {
    if (!polygon) {
      return;
    }

    const current = this.getAffineValues(polygon);
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

    const anchor = this.getPolygonLocalCenter(polygon);
    const anchorShift = this.getAnchorTranslation({ a, b, c, d }, anchor);
    const e = anchorShift.x + translateX;
    const f = anchorShift.y + translateY;

    if (this.isIdentityMatrix({ a, b, c, d, e, f })) {
      polygon.removeAttribute("transform");
    } else {
      polygon.setAttribute("transform", `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`);
    }
  }

  applyAffineToGeometry(polygon) {
    if (!polygon || !window.DOMPoint) {
      return;
    }

    const transformAttr = polygon.getAttribute("transform");
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

    const points = this.getPolygonPoints(polygon);
    const transformed = points.map((point) => {
      const transformedPoint = new DOMPoint(point.x, point.y).matrixTransform(
        matrix
      );
      return {
        x: this.roundValue(transformedPoint.x, 4),
        y: this.roundValue(transformedPoint.y, 4),
      };
    });

    this.setPolygonPoints(polygon, transformed);
    polygon.removeAttribute("transform");
    this.saveState();
    this.refreshSelectionVisuals(polygon);
    this.requestToolPanelRefresh();
  }

  getPolygonLocalCenter(polygon) {
    if (!polygon || typeof polygon.getBBox !== "function") {
      return { x: 0, y: 0 };
    }

    const bbox = polygon.getBBox();
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

  renderPolygonStyleControls(container, polygon) {
    const style = window.SvgUtils.getElementStyle(polygon);

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "8px";
    wrapper.style.marginTop = "10px";

    const strokeRow = document.createElement("div");
    strokeRow.style.display = "flex";
    strokeRow.style.flexDirection = "column";

    const strokeLabel = document.createElement("label");
    strokeLabel.textContent = "線色";
    strokeLabel.style.fontSize = "12px";
    strokeLabel.style.color = "#555";
    strokeLabel.style.marginBottom = "2px";
    strokeRow.appendChild(strokeLabel);

    const strokeInput = document.createElement("input");
    strokeInput.type = "color";
    strokeInput.value = this.normalizeColorForInput(style.stroke);
    strokeInput.style.width = "60px";
    strokeInput.style.height = "34px";
    strokeInput.style.padding = "0";
    strokeInput.style.border = "none";
    strokeInput.addEventListener("change", (event) => {
      polygon.setAttribute("stroke", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(polygon);
    });
    strokeRow.appendChild(strokeInput);
    wrapper.appendChild(strokeRow);

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
      polygon.setAttribute("stroke-width", Number.isFinite(width) ? width : 1);
      this.saveState();
      this.refreshSelectionVisuals(polygon);
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

    const dashSelect = document.createElement("select");
    dashSelect.style.cssText = `
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
    const currentStyle = this.getStrokeStyleKey(polygon);
    dashOptions.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === currentStyle) {
        option.selected = true;
      }
      dashSelect.appendChild(option);
    });
    dashSelect.addEventListener("change", (event) => {
      this.applyStrokeStyle(polygon, event.target.value);
      this.saveState();
      this.requestToolPanelRefresh();
    });
    dashRow.appendChild(dashSelect);
    wrapper.appendChild(dashRow);

    const fillRow = document.createElement("div");
    fillRow.style.display = "flex";
    fillRow.style.flexDirection = "column";

    const fillLabel = document.createElement("label");
    fillLabel.textContent = "塗り色";
    fillLabel.style.fontSize = "12px";
    fillLabel.style.color = "#555";
    fillLabel.style.marginBottom = "2px";
    fillRow.appendChild(fillLabel);

    const fillInput = document.createElement("input");
    fillInput.type = "color";
    fillInput.value = this.normalizeColorForInput(style.fill);
    fillInput.style.width = "60px";
    fillInput.style.height = "34px";
    fillInput.style.padding = "0";
    fillInput.style.border = "none";
    fillInput.addEventListener("change", (event) => {
      polygon.setAttribute("fill", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(polygon);
    });
    fillRow.appendChild(fillInput);
    wrapper.appendChild(fillRow);

    const opacityRow = document.createElement("div");
    opacityRow.style.display = "flex";
    opacityRow.style.flexDirection = "column";

    const opacityLabel = document.createElement("label");
    opacityLabel.textContent = "不透明度";
    opacityLabel.style.fontSize = "12px";
    opacityLabel.style.color = "#555";
    opacityLabel.style.marginBottom = "2px";
    opacityRow.appendChild(opacityLabel);

    const opacityInput = document.createElement("input");
    opacityInput.type = "number";
    opacityInput.value = style.opacity;
    opacityInput.min = "0";
    opacityInput.max = "1";
    opacityInput.step = "0.05";
    opacityInput.style.cssText = `
      width: 100%;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid #ccc;
      font-size: 12px;
    `;
    opacityInput.addEventListener("change", (event) => {
      let value = parseFloat(event.target.value);
      if (!Number.isFinite(value)) {
        value = 1;
      }
      value = Math.min(1, Math.max(0, value));
      polygon.setAttribute("opacity", value);
      this.saveState();
      this.refreshSelectionVisuals(polygon);
    });
    opacityRow.appendChild(opacityInput);
    wrapper.appendChild(opacityRow);

    container.appendChild(wrapper);
  }

  normalizeColorForInput(value) {
    const rgb = window.StyleUtils.parseColor(value);
    if (rgb) {
      return window.StyleUtils.rgbToHex(rgb.r, rgb.g, rgb.b);
    }
    return "#000000";
  }

  getStrokeStyleKey(polygon) {
    const dash = polygon.getAttribute("stroke-dasharray") || "none";
    const entries = Object.entries(window.StyleUtils.LINE_STYLES || {});
    for (const [key, pattern] of entries) {
      if (pattern === dash) {
        return key;
      }
    }
    return polygon.dataset.strokeStyle || "solid";
  }

  applyStrokeStyle(polygon, styleKey) {
    const pattern = window.StyleUtils.LINE_STYLES[styleKey] || "none";
    if (pattern === "none") {
      polygon.removeAttribute("stroke-dasharray");
    } else {
      polygon.setAttribute("stroke-dasharray", pattern);
    }
    polygon.dataset.strokeStyle = styleKey;
    this.refreshSelectionVisuals(polygon);
  }

  refreshSelectionVisuals(polygon) {
    if (!this.isPolygonCurrentlySelected(polygon)) {
      return;
    }

    if (this.selectTool) {
      if (typeof this.selectTool.refreshHandles === "function") {
        this.selectTool.refreshHandles();
      } else if (typeof this.selectTool.addControlPoints === "function") {
        this.selectTool.addControlPoints();
      }
    }

    this.updateSelectionStyleInputs(polygon);
  }

  updateSelectionStyleInputs(polygon) {
    if (!polygon) {
      return;
    }

    const strokeInput = document.getElementById("stroke-color");
    if (strokeInput) {
      strokeInput.value = this.normalizeColorForInput(
        polygon.getAttribute("stroke") || "#000000"
      );
    }

    const widthInput = document.getElementById("stroke-width");
    if (widthInput) {
      const width = parseFloat(polygon.getAttribute("stroke-width"));
      if (Number.isFinite(width)) {
        widthInput.value = String(width);
      }
    }

    const fillInput = document.getElementById("fill-color");
    if (fillInput) {
      fillInput.value = this.normalizeColorForInput(
        polygon.getAttribute("fill") || "#ffffff"
      );
    }

    const opacityInput = document.getElementById("opacity-input");
    if (opacityInput) {
      const opacity = parseFloat(polygon.getAttribute("opacity"));
      if (Number.isFinite(opacity)) {
        opacityInput.value = String(opacity);
      }
    }
  }

  getPolygonElements() {
    const polygons = Array.from(
      this.canvas.querySelectorAll('polygon[data-polygon-tool="true"]')
    );
    return polygons.filter((polygon) => {
      if (!polygon.getAttribute("points")) {
        return false;
      }
      this.initializePolygonMetadata(polygon);
      return true;
    });
  }

  getSelectedPolygonElement() {
    if (!this.selectedPolygonId) {
      return null;
    }

    const polygon = this.canvas.querySelector(
      `polygon[data-polygon-id="${this.selectedPolygonId}"]`
    );

    if (polygon && polygon.getAttribute("data-polygon-tool") === "true") {
      return polygon;
    }

    this.selectedPolygonId = null;
    return null;
  }

  selectPolygon(polygon) {
    if (polygon && polygon.getAttribute("data-polygon-tool") !== "true") {
      polygon = null;
    }

    if (!polygon) {
      this.selectedPolygonId = null;
      this.selectionInteractionInProgress = false;
      this.disconnectSelectedPolygonObserver();
      if (
        this.selectTool &&
        typeof this.selectTool.deselectObject === "function"
      ) {
        this.selectTool.deselectObject();
      }
      this.requestToolPanelRefresh();
      return;
    }

    const polygonId = this.ensurePolygonId(polygon);
    this.selectedPolygonId = polygonId;
    this.selectionInteractionInProgress = false;

    if (this.selectTool && typeof this.selectTool.selectObject === "function") {
      this.selectTool.selectObject(polygon, false);
    }

    this.observeSelectedPolygon(polygon);
    this.requestToolPanelRefresh();
  }

  initializePolygonMetadata(polygon) {
    if (!polygon || polygon.getAttribute("data-polygon-tool") !== "true") {
      return;
    }

    if (!polygon.dataset.strokeStyle) {
      polygon.dataset.strokeStyle = this.getStrokeStyleKey(polygon);
    }

    this.ensurePolygonId(polygon);
  }

  ensurePolygonId(polygon) {
    if (!polygon.dataset.polygonId) {
      polygon.dataset.polygonId = this.generatePolygonId();
    }
    return polygon.dataset.polygonId;
  }

  generatePolygonId() {
    return `polygon-${Date.now()}-${this.polygonIdCounter++}`;
  }

  getPolygonSummary(polygon, index = 0) {
    const points = this.getPolygonPoints(polygon);
    return `PG${index + 1}: 頂点${points.length}`;
  }

  observeSelectedPolygon(polygon) {
    if (!window.MutationObserver || !polygon) {
      this.disconnectSelectedPolygonObserver();
      return;
    }

    if (this.selectedPolygonObserverTarget === polygon) {
      return;
    }

    this.disconnectSelectedPolygonObserver();

    this.selectedPolygonObserverTarget = polygon;
    this.selectedPolygonObserver = new MutationObserver((mutations) => {
      this.handleSelectedPolygonMutations(polygon, mutations);
    });

    this.selectedPolygonObserver.observe(polygon, {
      attributes: true,
      attributeFilter: [
        "points",
        "transform",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "fill",
        "opacity",
      ],
    });
  }

  handleSelectedPolygonMutations(polygon, mutations) {
    if (!mutations || polygon !== this.getSelectedPolygonElement()) {
      return;
    }

    const hasAttributeChange = mutations.some(
      (mutation) => mutation.type === "attributes"
    );

    if (!hasAttributeChange) {
      return;
    }

    this.scheduleSelectedPolygonSync();
  }

  scheduleSelectedPolygonSync() {
    const requestFrame =
      window.requestAnimationFrame || window.setTimeout || ((cb) => cb());
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedPolygonMutationHandle) {
      cancelFrame(this.selectedPolygonMutationHandle);
      this.selectedPolygonMutationHandle = null;
    }

    this.selectedPolygonMutationHandle = requestFrame(() => {
      this.selectedPolygonMutationHandle = null;
      this.syncSelectedPolygonUiState();
    });
  }

  syncSelectedPolygonUiState() {
    const polygon = this.getSelectedPolygonElement();
    if (!polygon) {
      this.disconnectSelectedPolygonObserver();
      return;
    }

    this.initializePolygonMetadata(polygon);
    this.updateSelectionStyleInputs(polygon);
    this.requestToolPanelRefresh();
  }

  disconnectSelectedPolygonObserver() {
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedPolygonObserver) {
      this.selectedPolygonObserver.disconnect();
      this.selectedPolygonObserver = null;
    }

    if (this.selectedPolygonMutationHandle) {
      cancelFrame(this.selectedPolygonMutationHandle);
      this.selectedPolygonMutationHandle = null;
    }

    this.selectedPolygonObserverTarget = null;
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
    const polygon = this.getSelectedPolygonElement();
    if (!polygon) {
      return false;
    }

    const target = event?.target;
    if (!target) {
      return false;
    }

    if (target === polygon) {
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

  isPolygonCurrentlySelected(polygon) {
    if (!polygon) {
      return false;
    }

    const selections = Array.isArray(window.selectedObjects)
      ? window.selectedObjects
      : [];
    return selections.includes(polygon);
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

window.PolygonTool = PolygonTool;
