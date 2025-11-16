// RectangleTool.js
// 長方形描画ツール（個別オブジェクト管理とアフィン操作対応）

class RectangleTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.autoSelectAfterDraw = true;
    this.selectedRectangleId = null;
    this.rectangleIdCounter = 1;
    this.selectionInteractionInProgress = false;
    this.selectedRectangleObserver = null;
    this.selectedRectangleObserverTarget = null;
    this.selectedRectangleMutationHandle = null;
  }

  getTitle() {
    return "長方形";
  }

  getInstructions() {
    return {
      items: [
        "左クリック+ドラッグ: 始点から終点までドラッグして長方形を描画",
        "マウスボタンを離す: 長方形を確定",
        "Esc: キャンセル",
      ],
    };
  }

  getToolProperties() {
    return [
      {
        type: "checkbox",
        label: "作成後に選択状態にする",
        checkLabel: "有効",
        value: this.autoSelectAfterDraw,
        onChange: (checked) => {
          this.autoSelectAfterDraw = checked;
        },
      },
      {
        type: "custom",
        label: "選択状態",
        render: (container) => this.renderSelectionControls(container),
      },
      {
        type: "custom",
        label: "長方形一覧",
        render: (container) => this.renderRectangleList(container),
      },
      {
        type: "custom",
        label: "オブジェクトプロパティ",
        render: (container) => this.renderSelectedRectangleProperties(container),
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
    this.selectionInteractionInProgress = false;
    this.disconnectSelectedRectangleObserver();
    this.updatePanel();
  }

  handleMouseDown(event) {
    this.selectionInteractionInProgress = false;
    if (this.tryBeginSelectionDelegation(event)) {
      return;
    }

    super.handleMouseDown(event);

    if (!this.isActive || event.button !== 0) {
      return;
    }

    this.saveState();
    this.isDrawing = true;

    this.drawingObject = window.SvgUtils.createElement("rect", {
      x: this.startPoint.x,
      y: this.startPoint.y,
      width: 0,
      height: 0,
    });
    this.drawingObject.setAttribute("data-rectangle-tool", "true");

    this.applyDefaultAttributes(this.drawingObject);
    this.canvas.appendChild(this.drawingObject);
  }

  handleMouseMove(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseMove", event);
      return;
    }

    super.handleMouseMove(event);

    if (!this.isActive || !this.isDrawing || !this.drawingObject) {
      return;
    }

    this.updateDrawingRectangle(this.currentPoint);
  }

  handleMouseUp(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseUp", event);
      this.selectionInteractionInProgress = false;
      return;
    }

    if (!this.isActive || !this.isDrawing || event.button !== 0) {
      return;
    }

    this.finishRectangle();
  }

  handleMouseLeave(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseUp", event);
      this.selectionInteractionInProgress = false;
      return;
    }

    super.handleMouseLeave(event);
  }

  handleKeyDown(event) {
    if (event.key === "Escape" && this.isDrawing) {
      if (this.drawingObject) {
        this.canvas.removeChild(this.drawingObject);
      }
      this.isDrawing = false;
      this.drawingObject = null;
      this.updatePanel();
    }
  }

  updateDrawingRectangle(currentPoint) {
    if (!this.drawingObject || !currentPoint) {
      return;
    }

    const width = currentPoint.x - this.startPoint.x;
    const height = currentPoint.y - this.startPoint.y;

    const x = width < 0 ? currentPoint.x : this.startPoint.x;
    const y = height < 0 ? currentPoint.y : this.startPoint.y;
    const w = Math.abs(width);
    const h = Math.abs(height);

    this.drawingObject.setAttribute("x", x);
    this.drawingObject.setAttribute("y", y);
    this.drawingObject.setAttribute("width", w);
    this.drawingObject.setAttribute("height", h);
  }

  finishRectangle() {
    if (!this.drawingObject) {
      return null;
    }

    const width = parseFloat(this.drawingObject.getAttribute("width"));
    const height = parseFloat(this.drawingObject.getAttribute("height"));

    let finishedRectangle = null;

    if (width < 2 || height < 2) {
      this.canvas.removeChild(this.drawingObject);
    } else {
      this.drawingObject.setAttribute("data-layer", window.currentLayerId);
      this.initializeRectangleMetadata(this.drawingObject);
      finishedRectangle = this.drawingObject;
    }

    this.isDrawing = false;
    this.drawingObject = null;

    if (finishedRectangle && this.autoSelectAfterDraw) {
      if (
        window.toolManager &&
        typeof window.toolManager.activateTemporaryTool === "function"
      ) {
        window.toolManager.activateTemporaryTool("select", {
          restoreTriggers: ["deselect", "cancel"],
        });
      }

      this.selectRectangle(finishedRectangle);
      if (window.selectTool) {
        window.selectTool.selectObject(finishedRectangle, false);
      }
    }

    this.requestToolPanelRefresh();
    this.updatePanel();

    return finishedRectangle;
  }

  renderSelectionControls(container) {
    const rectangle = this.getSelectedRectangleElement();
    const rectangles = this.getRectangleElements();
    const index = rectangle ? rectangles.indexOf(rectangle) : -1;

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    const info = document.createElement("div");
    info.textContent = rectangle
      ? this.getRectangleSummary(rectangle, index >= 0 ? index : 0)
      : "現在選択されていません";
    info.style.fontSize = "12px";
    info.style.color = rectangle ? "#1a73e8" : "#666";
    container.appendChild(info);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "選択解除";
    button.disabled = !rectangle;
    button.style.cssText = `
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background: ${rectangle ? "#fff" : "#f5f5f5"};
      color: ${rectangle ? "#333" : "#999"};
      font-size: 12px;
      cursor: ${rectangle ? "pointer" : "not-allowed"};
    `;
    button.addEventListener("click", () => {
      this.selectRectangle(null);
    });

    container.appendChild(button);
  }

  renderRectangleList(container) {
    const rectangles = this.getRectangleElements();

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    if (rectangles.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "長方形がありません";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "4px";

    rectangles.forEach((rectangle, index) => {
      const rectangleId = this.ensureRectangleId(rectangle);
      const isSelected = rectangleId === this.selectedRectangleId;
      const summary = this.getRectangleSummary(rectangle, index);

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
        this.selectRectangle(rectangle);
      });

      list.appendChild(button);
    });

    container.appendChild(list);
  }

  renderSelectedRectangleProperties(container) {
    const rectangle = this.getSelectedRectangleElement();

    if (!rectangle) {
      const empty = document.createElement("div");
      empty.textContent = "一覧から長方形を選択すると編集できます";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const idLabel = document.createElement("div");
    idLabel.textContent = `ID: ${rectangle.dataset.rectangleId}`;
    idLabel.style.fontSize = "12px";
    idLabel.style.color = "#333";
    idLabel.style.marginBottom = "6px";
    container.appendChild(idLabel);

    const geometryWrapper = this.renderRectangleGeometryControls(rectangle);
    container.appendChild(geometryWrapper);

    this.renderAffineControls(container, rectangle);
    this.renderRectangleStyleControls(container, rectangle);
  }

  renderRectangleGeometryControls(rectangle) {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "6px";
    wrapper.style.marginBottom = "10px";

    const title = document.createElement("div");
    title.textContent = "ジオメトリ";
    title.style.fontSize = "12px";
    title.style.color = "#555";
    wrapper.appendChild(title);

    const geometry = this.getRectangleGeometry(rectangle);

    const fields = [
      { id: "x", label: "X", value: geometry.x },
      { id: "y", label: "Y", value: geometry.y },
      { id: "width", label: "幅", value: geometry.width, min: 0 },
      { id: "height", label: "高さ", value: geometry.height, min: 0 },
    ];

    fields.forEach((field) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "column";

      const label = document.createElement("label");
      label.textContent = field.label;
      label.style.fontSize = "11px";
      label.style.color = "#555";
      label.style.marginBottom = "2px";
      row.appendChild(label);

      const input = document.createElement("input");
      input.type = "number";
      input.value = field.value;
      input.step = "1";
      if (field.min !== undefined) {
        input.min = String(field.min);
      }
      input.dataset.geometryField = field.id;
      input.style.cssText = `
        width: 100%;
        padding: 6px;
        border-radius: 4px;
        border: 1px solid #ccc;
        font-size: 12px;
      `;
      input.addEventListener("change", () => {
        this.updateRectangleFromInputs(rectangle, wrapper);
      });

      row.appendChild(input);
      wrapper.appendChild(row);
    });

    return wrapper;
  }

  updateRectangleFromInputs(rectangle, wrapper) {
    const geometry = this.getRectangleGeometry(rectangle);

    wrapper.querySelectorAll("[data-geometry-field]").forEach((input) => {
      const field = input.dataset.geometryField;
      const value = parseFloat(input.value);
      geometry[field] = Number.isFinite(value) ? value : geometry[field];
    });

    geometry.width = Math.max(0, geometry.width);
    geometry.height = Math.max(0, geometry.height);

    this.applyRectangleGeometry(rectangle, geometry);
    this.saveState();
    this.refreshSelectionVisuals(rectangle);
    this.requestToolPanelRefresh();
  }

  getRectangleGeometry(rectangle) {
    if (!rectangle) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const x = parseFloat(rectangle.getAttribute("x"));
    const y = parseFloat(rectangle.getAttribute("y"));
    const width = parseFloat(rectangle.getAttribute("width"));
    const height = parseFloat(rectangle.getAttribute("height"));

    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      width: Number.isFinite(width) ? width : 0,
      height: Number.isFinite(height) ? height : 0,
    };
  }

  applyRectangleGeometry(rectangle, geometry) {
    if (!rectangle || !geometry) {
      return;
    }

    rectangle.setAttribute("x", geometry.x);
    rectangle.setAttribute("y", geometry.y);
    rectangle.setAttribute("width", geometry.width);
    rectangle.setAttribute("height", geometry.height);
  }

  renderAffineControls(container, rectangle) {
    if (!window.DOMMatrix) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "6px";
    wrapper.style.marginTop = "10px";

    const title = document.createElement("div");
    title.textContent = "アフィン変換";
    title.style.fontSize = "12px";
    title.style.color = "#555";
    wrapper.appendChild(title);

    const controls = [
      { id: "translateX", label: "移動X", step: "1" },
      { id: "translateY", label: "移動Y", step: "1" },
      { id: "rotation", label: "回転", step: "1" },
      { id: "scaleX", label: "拡大X", step: "0.01" },
      { id: "scaleY", label: "拡大Y", step: "0.01" },
    ];

    const currentValues = this.getAffineValues(rectangle);

    controls.forEach((control) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.flexDirection = "column";

      const label = document.createElement("label");
      label.textContent = control.label;
      label.style.fontSize = "11px";
      label.style.color = "#555";
      label.style.marginBottom = "2px";
      row.appendChild(label);

      const input = document.createElement("input");
      input.type = "number";
      input.step = control.step;
      input.value = currentValues[control.id];
      input.dataset.affineId = control.id;
      if (control.id.startsWith("scale")) {
        input.min = "-10";
      }
      input.style.cssText = `
        width: 100%;
        padding: 6px;
        border-radius: 4px;
        border: 1px solid #ccc;
        font-size: 12px;
      `;
      input.addEventListener("change", () => {
        this.updateAffineFromInputs(rectangle, wrapper);
      });

      row.appendChild(input);
      wrapper.appendChild(row);
    });

    const buttonsRow = document.createElement("div");
    buttonsRow.style.display = "flex";
    buttonsRow.style.gap = "8px";
    buttonsRow.style.marginTop = "4px";

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.textContent = "適用";
    applyButton.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid #2f80ed;
      background: #e8f0fe;
      color: #1a73e8;
      font-size: 12px;
      cursor: pointer;
    `;
    applyButton.addEventListener("click", () => {
      this.applyAffineToGeometry(rectangle);
      this.updateAffineInputs(wrapper, rectangle);
    });
    buttonsRow.appendChild(applyButton);

    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.textContent = "リセット";
    resetButton.style.cssText = `
      flex: 1;
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background: #fff;
      color: #333;
      font-size: 12px;
      cursor: pointer;
    `;
    resetButton.addEventListener("click", () => {
      rectangle.removeAttribute("transform");
      this.updateAffineInputs(wrapper, rectangle);
      this.refreshSelectionVisuals(rectangle);
    });
    buttonsRow.appendChild(resetButton);

    wrapper.appendChild(buttonsRow);
    container.appendChild(wrapper);
  }

  getAffineValues(rectangle) {
    if (!rectangle) {
      return {
        translateX: 0,
        translateY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }

    const transformAttr = rectangle.getAttribute("transform");
    if (!transformAttr || !window.DOMMatrix) {
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
      matrix = new DOMMatrix(transformAttr);
    } catch (error) {
      console.error("Failed to parse transform:", error);
      return {
        translateX: 0,
        translateY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }

    const rotation = Math.atan2(matrix.b, matrix.a) * (180 / Math.PI);
    const scaleX = Math.sqrt(matrix.a * matrix.a + matrix.b * matrix.b) || 1;
    const scaleY =
      Math.sqrt(matrix.c * matrix.c + matrix.d * matrix.d) *
        (matrix.d < 0 ? -1 : 1) || 1;

    return {
      translateX: this.roundValue(matrix.e, 3),
      translateY: this.roundValue(matrix.f, 3),
      rotation: this.roundValue(rotation, 2),
      scaleX: this.roundValue(scaleX, 3),
      scaleY: this.roundValue(scaleY, 3),
    };
  }

  updateAffineFromInputs(rectangle, wrapper) {
    if (!rectangle || !wrapper) {
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

    this.applyAffineValues(rectangle, values);
    this.saveState();
    this.refreshSelectionVisuals(rectangle);
    this.updateAffineInputs(wrapper, rectangle);
  }

  updateAffineInputs(wrapper, rectangle) {
    if (!wrapper || !rectangle) {
      return;
    }

    const latest = this.getAffineValues(rectangle);
    wrapper.querySelectorAll("[data-affine-id]").forEach((input) => {
      const id = input.dataset.affineId;
      if (id && latest[id] !== undefined) {
        input.value = latest[id];
      }
    });
  }

  applyAffineValues(rectangle, values) {
    if (!rectangle) {
      return;
    }

    const current = this.getAffineValues(rectangle);
    const next = {
      ...current,
      ...values,
    };

    const translateX = Number.isFinite(next.translateX) ? next.translateX : 0;
    const translateY = Number.isFinite(next.translateY) ? next.translateY : 0;
    const rotation = Number.isFinite(next.rotation) ? next.rotation : 0;
    let scaleX = Number.isFinite(next.scaleX) ? next.scaleX : 1;
    let scaleY = Number.isFinite(next.scaleY) ? next.scaleY : 1;

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

    const anchor = this.getRectangleLocalCenter(rectangle);
    const anchorShift = this.getAnchorTranslation({ a, b, c, d }, anchor);
    const e = anchorShift.x + translateX;
    const f = anchorShift.y + translateY;

    if (this.isIdentityMatrix({ a, b, c, d, e, f })) {
      rectangle.removeAttribute("transform");
    } else {
      rectangle.setAttribute(
        "transform",
        `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`
      );
    }
  }

  applyAffineToGeometry(rectangle) {
    if (!rectangle || !window.DOMPoint) {
      return;
    }

    const transformAttr = rectangle.getAttribute("transform");
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

    const geometry = this.getRectangleGeometry(rectangle);
    const corners = [
      new DOMPoint(geometry.x, geometry.y),
      new DOMPoint(geometry.x + geometry.width, geometry.y),
      new DOMPoint(geometry.x, geometry.y + geometry.height),
      new DOMPoint(geometry.x + geometry.width, geometry.y + geometry.height),
    ].map((point) => point.matrixTransform(matrix));

    const minX = Math.min(...corners.map((p) => p.x));
    const minY = Math.min(...corners.map((p) => p.y));
    const maxX = Math.max(...corners.map((p) => p.x));
    const maxY = Math.max(...corners.map((p) => p.y));

    rectangle.setAttribute("x", this.roundValue(minX, 4));
    rectangle.setAttribute("y", this.roundValue(minY, 4));
    rectangle.setAttribute("width", this.roundValue(maxX - minX, 4));
    rectangle.setAttribute("height", this.roundValue(maxY - minY, 4));
    rectangle.removeAttribute("transform");

    this.saveState();
    this.refreshSelectionVisuals(rectangle);
    this.requestToolPanelRefresh();
  }

  getRectangleLocalCenter(rectangle) {
    if (!rectangle || typeof rectangle.getBBox !== "function") {
      return { x: 0, y: 0 };
    }

    const bbox = rectangle.getBBox();
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

  renderRectangleStyleControls(container, rectangle) {
    const style = window.SvgUtils.getElementStyle(rectangle);

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
      rectangle.setAttribute("stroke", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(rectangle);
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
    widthInput.min = "0";
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
      rectangle.setAttribute("stroke-width", Number.isFinite(width) ? width : 1);
      this.saveState();
      this.refreshSelectionVisuals(rectangle);
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
    const currentStyle = this.getStrokeStyleKey(rectangle);
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
      this.applyStrokeStyle(rectangle, event.target.value);
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
      rectangle.setAttribute("fill", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(rectangle);
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
      rectangle.setAttribute("opacity", value);
      this.saveState();
      this.refreshSelectionVisuals(rectangle);
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

  getStrokeStyleKey(rectangle) {
    const dash = rectangle.getAttribute("stroke-dasharray") || "none";
    const entries = Object.entries(window.StyleUtils.LINE_STYLES || {});
    for (const [key, pattern] of entries) {
      if (pattern === dash) {
        return key;
      }
    }
    return rectangle.dataset.strokeStyle || "solid";
  }

  applyStrokeStyle(rectangle, styleKey) {
    const pattern = window.StyleUtils.LINE_STYLES[styleKey] || "none";
    if (pattern === "none") {
      rectangle.removeAttribute("stroke-dasharray");
    } else {
      rectangle.setAttribute("stroke-dasharray", pattern);
    }
    rectangle.dataset.strokeStyle = styleKey;
    this.refreshSelectionVisuals(rectangle);
  }

  requestToolPanelRefresh() {
    if (
      window.toolPropertiesPanel &&
      window.toolPropertiesPanel.currentTool === this
    ) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  refreshSelectionVisuals(rectangle) {
    if (!this.isRectangleCurrentlySelected(rectangle)) {
      return;
    }

    if (window.selectTool) {
      if (typeof window.selectTool.refreshHandles === "function") {
        window.selectTool.refreshHandles();
      } else if (typeof window.selectTool.addControlPoints === "function") {
        window.selectTool.addControlPoints();
      }
    }

    this.updateSelectionStyleInputs(rectangle);
  }

  updateSelectionStyleInputs(rectangle) {
    if (!rectangle) {
      return;
    }

    const strokeInput = document.getElementById("stroke-color");
    if (strokeInput) {
      strokeInput.value = this.normalizeColorForInput(
        rectangle.getAttribute("stroke") || "#000000"
      );
    }

    const widthInput = document.getElementById("stroke-width");
    if (widthInput) {
      const width = parseFloat(rectangle.getAttribute("stroke-width"));
      if (Number.isFinite(width)) {
        widthInput.value = String(width);
      }
    }

    const fillInput = document.getElementById("fill-color");
    if (fillInput) {
      fillInput.value = this.normalizeColorForInput(
        rectangle.getAttribute("fill") || "#000000"
      );
    }

    const opacityInput = document.getElementById("opacity-input");
    if (opacityInput) {
      const opacity = parseFloat(rectangle.getAttribute("opacity"));
      if (Number.isFinite(opacity)) {
        opacityInput.value = String(opacity);
      }
    }
  }

  getRectangleElements() {
    const rectangles = Array.from(
      this.canvas.querySelectorAll('rect[data-rectangle-tool="true"]')
    );
    return rectangles.filter((rectangle) => {
      if (!rectangle.getAttribute("width") || !rectangle.getAttribute("height")) {
        return false;
      }
      this.initializeRectangleMetadata(rectangle);
      return true;
    });
  }

  initializeRectangleMetadata(rectangle) {
    if (!rectangle || rectangle.getAttribute("data-rectangle-tool") !== "true") {
      return;
    }

    if (!rectangle.dataset.strokeStyle) {
      rectangle.dataset.strokeStyle = this.getStrokeStyleKey(rectangle);
    }

    this.ensureRectangleId(rectangle);
  }

  ensureRectangleId(rectangle) {
    if (!rectangle.dataset.rectangleId) {
      rectangle.dataset.rectangleId = this.generateRectangleId();
    }
    return rectangle.dataset.rectangleId;
  }

  generateRectangleId() {
    return `rect-${Date.now()}-${this.rectangleIdCounter++}`;
  }

  getRectangleSummary(rectangle, index = 0) {
    const geometry = this.getRectangleGeometry(rectangle);
    return `R${index + 1}: (${Math.round(geometry.x)}, ${Math.round(
      geometry.y
    )}) ${Math.round(geometry.width)}×${Math.round(geometry.height)}`;
  }

  getSelectedRectangleElement() {
    if (!this.selectedRectangleId) {
      return null;
    }

    const rectangle = this.canvas.querySelector(
      `rect[data-rectangle-id="${this.selectedRectangleId}"]`
    );

    if (rectangle && rectangle.getAttribute("data-rectangle-tool") === "true") {
      return rectangle;
    }

    this.selectedRectangleId = null;
    return null;
  }

  selectRectangle(rectangle) {
    if (rectangle && rectangle.getAttribute("data-rectangle-tool") !== "true") {
      rectangle = null;
    }

    if (!rectangle) {
      this.selectedRectangleId = null;
      this.selectionInteractionInProgress = false;
      this.disconnectSelectedRectangleObserver();
      if (
        window.selectTool &&
        typeof window.selectTool.deselectObject === "function"
      ) {
        window.selectTool.deselectObject();
      }
      this.requestToolPanelRefresh();
      return;
    }

    const rectangleId = this.ensureRectangleId(rectangle);
    this.selectedRectangleId = rectangleId;
    this.selectionInteractionInProgress = false;

    if (window.selectTool && typeof window.selectTool.selectObject === "function") {
      window.selectTool.selectObject(rectangle, false);
    }

    this.observeSelectedRectangle(rectangle);
    this.requestToolPanelRefresh();
  }

  observeSelectedRectangle(rectangle) {
    if (!window.MutationObserver || !rectangle) {
      this.disconnectSelectedRectangleObserver();
      return;
    }

    if (this.selectedRectangleObserverTarget === rectangle) {
      return;
    }

    this.disconnectSelectedRectangleObserver();

    this.selectedRectangleObserverTarget = rectangle;
    this.selectedRectangleObserver = new MutationObserver((mutations) => {
      this.handleSelectedRectangleMutations(rectangle, mutations);
    });

    this.selectedRectangleObserver.observe(rectangle, {
      attributes: true,
      attributeFilter: [
        "x",
        "y",
        "width",
        "height",
        "transform",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "fill",
        "opacity",
      ],
    });
  }

  handleSelectedRectangleMutations(rectangle, mutations) {
    if (!mutations || rectangle !== this.getSelectedRectangleElement()) {
      return;
    }

    const hasAttributeChange = mutations.some(
      (mutation) => mutation.type === "attributes"
    );

    if (!hasAttributeChange) {
      return;
    }

    this.scheduleSelectedRectangleSync();
  }

  scheduleSelectedRectangleSync() {
    const requestFrame =
      window.requestAnimationFrame || window.setTimeout || ((cb) => cb());
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedRectangleMutationHandle) {
      cancelFrame(this.selectedRectangleMutationHandle);
      this.selectedRectangleMutationHandle = null;
    }

    this.selectedRectangleMutationHandle = requestFrame(() => {
      this.selectedRectangleMutationHandle = null;
      this.syncSelectedRectangleUiState();
    });
  }

  syncSelectedRectangleUiState() {
    const rectangle = this.getSelectedRectangleElement();
    if (!rectangle) {
      this.disconnectSelectedRectangleObserver();
      return;
    }

    this.initializeRectangleMetadata(rectangle);
    this.updateSelectionStyleInputs(rectangle);
    this.requestToolPanelRefresh();
  }

  disconnectSelectedRectangleObserver() {
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedRectangleObserver) {
      this.selectedRectangleObserver.disconnect();
      this.selectedRectangleObserver = null;
    }

    if (this.selectedRectangleMutationHandle) {
      cancelFrame(this.selectedRectangleMutationHandle);
      this.selectedRectangleMutationHandle = null;
    }

    this.selectedRectangleObserverTarget = null;
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
    const rectangle = this.getSelectedRectangleElement();
    if (!rectangle) {
      return false;
    }

    const target = event?.target;
    if (!target) {
      return false;
    }

    if (target === rectangle) {
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
    if (!window.selectTool) {
      return false;
    }

    const handler = window.selectTool[methodName];
    if (typeof handler === "function") {
      handler.call(window.selectTool, event);
      return true;
    }

    return false;
  }

  isRectangleCurrentlySelected(rectangle) {
    if (!rectangle) {
      return false;
    }

    const selections = Array.isArray(window.selectedObjects)
      ? window.selectedObjects
      : [];
    return selections.includes(rectangle);
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

window.RectangleTool = RectangleTool;
