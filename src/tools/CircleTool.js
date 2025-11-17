// CircleTool.js
// 円描画ツール（個別オブジェクト管理とアフィン操作対応）

class CircleTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.autoSelectAfterDraw = true;
    this.isDrawing = false;
    this.selectedCircleId = null;
    this.circleIdCounter = 1;
    this.selectionInteractionInProgress = false;
    this.selectedCircleObserver = null;
    this.selectedCircleObserverTarget = null;
    this.selectedCircleMutationHandle = null;
  }

  getTitle() {
    return "円";
  }

  getInstructions() {
    if (!this.isDrawing) {
      return [
        "左クリック: 円の中心を指定",
        "そのままドラッグして半径を調整",
        "マウスボタンを離す: 円を確定",
        "Esc: 描画をリセット",
      ];
    }

    return [
      "マウス移動: 半径を調整",
      "マウスボタンを離す: 円を確定",
      "Esc: 描画中の円をキャンセル",
    ];
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
        label: "円一覧",
        render: (container) => this.renderCircleList(container),
      },
      {
        type: "custom",
        label: "オブジェクトプロパティ",
        render: (container) => this.renderSelectedCircleProperties(container),
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
    this.disconnectSelectedCircleObserver();
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

    this.drawingObject = window.SvgUtils.createElement("circle", {
      cx: this.startPoint.x,
      cy: this.startPoint.y,
      r: 0,
    });
    this.drawingObject.setAttribute("data-circle-tool", "true");
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

    const radius = window.GeometryUtils.distance(
      this.startPoint,
      this.currentPoint
    );
    this.drawingObject.setAttribute("r", Math.max(0, radius));
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

    this.finishCircle();
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

  finishCircle() {
    if (!this.drawingObject) {
      return null;
    }

    const radius = parseFloat(this.drawingObject.getAttribute("r"));
    let finishedCircle = null;

    if (!Number.isFinite(radius) || radius < 1) {
      this.canvas.removeChild(this.drawingObject);
    } else {
      this.drawingObject.setAttribute("data-layer", window.currentLayerId);
      this.initializeCircleMetadata(this.drawingObject);
      finishedCircle = this.drawingObject;
    }

    this.isDrawing = false;
    this.drawingObject = null;

    if (finishedCircle && this.autoSelectAfterDraw) {
      if (
        window.toolManager &&
        typeof window.toolManager.activateTemporaryTool === "function"
      ) {
        window.toolManager.activateTemporaryTool("select", {
          restoreTriggers: ["deselect", "cancel"],
        });
      }

      this.selectCircle(finishedCircle);
      if (window.selectTool) {
        window.selectTool.selectObject(finishedCircle, false);
      }
    }

    this.requestToolPanelRefresh();
    this.updatePanel();

    return finishedCircle;
  }

  renderSelectionControls(container) {
    const circle = this.getSelectedCircleElement();
    const circles = this.getCircleElements();
    const index = circle ? circles.indexOf(circle) : -1;

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    const info = document.createElement("div");
    info.textContent = circle
      ? this.getCircleSummary(circle, index >= 0 ? index : 0)
      : "現在選択されていません";
    info.style.fontSize = "12px";
    info.style.color = circle ? "#1a73e8" : "#666";
    container.appendChild(info);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "選択解除";
    button.disabled = !circle;
    button.style.cssText = `
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background: ${circle ? "#fff" : "#f5f5f5"};
      color: ${circle ? "#333" : "#999"};
      font-size: 12px;
      cursor: ${circle ? "pointer" : "not-allowed"};
    `;
    button.addEventListener("click", () => {
      this.selectCircle(null);
    });

    container.appendChild(button);
  }

  renderCircleList(container) {
    const circles = this.getCircleElements();

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    if (circles.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "円がありません";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "4px";

    circles.forEach((circle, index) => {
      const circleId = this.ensureCircleId(circle);
      const isSelected = circleId === this.selectedCircleId;
      const summary = this.getCircleSummary(circle, index);

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
        this.selectCircle(circle);
      });

      list.appendChild(button);
    });

    container.appendChild(list);
  }

  renderSelectedCircleProperties(container) {
    const circle = this.getSelectedCircleElement();

    if (!circle) {
      const empty = document.createElement("div");
      empty.textContent = "一覧から円を選択すると編集できます";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const idLabel = document.createElement("div");
    idLabel.textContent = `ID: ${circle.dataset.circleId}`;
    idLabel.style.fontSize = "12px";
    idLabel.style.color = "#333";
    idLabel.style.marginBottom = "6px";
    container.appendChild(idLabel);

    const geometryWrapper = this.renderCircleGeometryControls(circle);
    container.appendChild(geometryWrapper);

    this.renderAffineControls(container, circle);
    this.renderCircleStyleControls(container, circle);
  }

  renderCircleGeometryControls(circle) {
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

    const geometry = this.getCircleGeometry(circle);

    const fields = [
      { id: "cx", label: "中心X", value: geometry.cx },
      { id: "cy", label: "中心Y", value: geometry.cy },
      { id: "r", label: "半径", value: geometry.r, min: 0 },
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
        this.updateCircleFromInputs(circle, wrapper);
      });

      row.appendChild(input);
      wrapper.appendChild(row);
    });

    return wrapper;
  }

  updateCircleFromInputs(circle, wrapper) {
    const geometry = this.getCircleGeometry(circle);

    wrapper.querySelectorAll("[data-geometry-field]").forEach((input) => {
      const field = input.dataset.geometryField;
      const value = parseFloat(input.value);
      geometry[field] = Number.isFinite(value) ? value : geometry[field];
    });

    geometry.r = Math.max(0, geometry.r);

    this.applyCircleGeometry(circle, geometry);
    this.saveState();
    this.refreshSelectionVisuals(circle);
    this.requestToolPanelRefresh();
  }

  getCircleGeometry(circle) {
    if (!circle) {
      return { cx: 0, cy: 0, r: 0 };
    }

    const cx = parseFloat(circle.getAttribute("cx"));
    const cy = parseFloat(circle.getAttribute("cy"));
    const r = parseFloat(circle.getAttribute("r"));

    return {
      cx: Number.isFinite(cx) ? cx : 0,
      cy: Number.isFinite(cy) ? cy : 0,
      r: Number.isFinite(r) ? r : 0,
    };
  }

  applyCircleGeometry(circle, geometry) {
    if (!circle || !geometry) {
      return;
    }

    circle.setAttribute("cx", geometry.cx);
    circle.setAttribute("cy", geometry.cy);
    circle.setAttribute("r", geometry.r);
  }

  renderAffineControls(container, circle) {
    if (!window.DOMMatrix) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "6px";
    wrapper.style.marginTop = "10px";

    const title = document.createElement("div");
    title.textContent = "ベースアフィン変換";
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

    const currentValues = this.getAffineValues(circle);

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
        this.updateAffineFromInputs(circle, wrapper);
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
      this.applyAffineToGeometry(circle);
      this.updateAffineInputs(wrapper, circle);
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
      circle.removeAttribute("transform");
      this.updateAffineInputs(wrapper, circle);
      this.refreshSelectionVisuals(circle);
    });
    buttonsRow.appendChild(resetButton);

    wrapper.appendChild(buttonsRow);
    container.appendChild(wrapper);
  }

  getAffineValues(circle) {
    if (!circle) {
      return {
        translateX: 0,
        translateY: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      };
    }

    const transformAttr = circle.getAttribute("transform");
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

  updateAffineFromInputs(circle, wrapper) {
    if (!circle || !wrapper) {
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

    this.applyAffineValues(circle, values);
    this.saveState();
    this.refreshSelectionVisuals(circle);
    this.updateAffineInputs(wrapper, circle);
  }

  updateAffineInputs(wrapper, circle) {
    if (!wrapper || !circle) {
      return;
    }

    const latest = this.getAffineValues(circle);
    wrapper.querySelectorAll("[data-affine-id]").forEach((input) => {
      const id = input.dataset.affineId;
      if (id && latest[id] !== undefined) {
        input.value = latest[id];
      }
    });
  }

  applyAffineValues(circle, values) {
    if (!circle) {
      return;
    }

    const current = this.getAffineValues(circle);
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

    const anchor = this.getCircleLocalCenter(circle);
    const anchorShift = this.getAnchorTranslation({ a, b, c, d }, anchor);
    const e = anchorShift.x + translateX;
    const f = anchorShift.y + translateY;

    if (this.isIdentityMatrix({ a, b, c, d, e, f })) {
      circle.removeAttribute("transform");
    } else {
      circle.setAttribute("transform", `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`);
    }
  }

  applyAffineToGeometry(circle) {
    if (!circle || !window.DOMPoint) {
      return;
    }

    const transformAttr = circle.getAttribute("transform");
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

    const geometry = this.getCircleGeometry(circle);
    const center = new DOMPoint(geometry.cx, geometry.cy).matrixTransform(matrix);
    const radiusPoint = new DOMPoint(geometry.cx + geometry.r, geometry.cy).matrixTransform(
      matrix
    );

    const dx = radiusPoint.x - center.x;
    const dy = radiusPoint.y - center.y;
    const radius = Math.sqrt(dx * dx + dy * dy);

    circle.setAttribute("cx", this.roundValue(center.x, 4));
    circle.setAttribute("cy", this.roundValue(center.y, 4));
    circle.setAttribute("r", this.roundValue(radius, 4));
    circle.removeAttribute("transform");

    this.saveState();
    this.refreshSelectionVisuals(circle);
    this.requestToolPanelRefresh();
  }

  getCircleLocalCenter(circle) {
    return this.getCircleGeometry(circle);
  }

  getAnchorTranslation(matrix, anchor) {
    if (!matrix || !anchor) {
      return { x: 0, y: 0 };
    }

    const a = Number.isFinite(matrix.a) ? matrix.a : 1;
    const b = Number.isFinite(matrix.b) ? matrix.b : 0;
    const c = Number.isFinite(matrix.c) ? matrix.c : 0;
    const d = Number.isFinite(matrix.d) ? matrix.d : 1;

    if (!Number.isFinite(anchor.cx ?? anchor.x) || !Number.isFinite(anchor.cy ?? anchor.y)) {
      return { x: 0, y: 0 };
    }

    const anchorX = anchor.cx ?? anchor.x;
    const anchorY = anchor.cy ?? anchor.y;
    const shiftedX = anchorX - (a * anchorX + c * anchorY);
    const shiftedY = anchorY - (b * anchorX + d * anchorY);
    return {
      x: shiftedX,
      y: shiftedY,
    };
  }

  renderCircleStyleControls(container, circle) {
    const style = window.SvgUtils.getElementStyle(circle);

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
      circle.setAttribute("stroke", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(circle);
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
      circle.setAttribute("stroke-width", Number.isFinite(width) ? width : 1);
      this.saveState();
      this.refreshSelectionVisuals(circle);
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
    const currentStyle = this.getStrokeStyleKey(circle);
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
      this.applyStrokeStyle(circle, event.target.value);
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
      circle.setAttribute("fill", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(circle);
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
      circle.setAttribute("opacity", value);
      this.saveState();
      this.refreshSelectionVisuals(circle);
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

  getStrokeStyleKey(circle) {
    const dash = circle.getAttribute("stroke-dasharray") || "none";
    const entries = Object.entries(window.StyleUtils.LINE_STYLES || {});
    for (const [key, pattern] of entries) {
      if (pattern === dash) {
        return key;
      }
    }
    return circle.dataset.strokeStyle || "solid";
  }

  applyStrokeStyle(circle, styleKey) {
    const pattern = window.StyleUtils.LINE_STYLES[styleKey] || "none";
    if (pattern === "none") {
      circle.removeAttribute("stroke-dasharray");
    } else {
      circle.setAttribute("stroke-dasharray", pattern);
    }
    circle.dataset.strokeStyle = styleKey;
    this.refreshSelectionVisuals(circle);
  }

  requestToolPanelRefresh() {
    if (
      window.toolPropertiesPanel &&
      window.toolPropertiesPanel.currentTool === this
    ) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  refreshSelectionVisuals(circle) {
    if (!this.isCircleCurrentlySelected(circle)) {
      return;
    }

    if (window.selectTool) {
      if (typeof window.selectTool.refreshHandles === "function") {
        window.selectTool.refreshHandles();
      } else if (typeof window.selectTool.addControlPoints === "function") {
        window.selectTool.addControlPoints();
      }
    }

    this.updateSelectionStyleInputs(circle);
  }

  updateSelectionStyleInputs(circle) {
    if (!circle) {
      return;
    }

    const strokeInput = document.getElementById("stroke-color");
    if (strokeInput) {
      strokeInput.value = this.normalizeColorForInput(
        circle.getAttribute("stroke") || "#000000"
      );
    }

    const widthInput = document.getElementById("stroke-width");
    if (widthInput) {
      const width = parseFloat(circle.getAttribute("stroke-width"));
      if (Number.isFinite(width)) {
        widthInput.value = String(width);
      }
    }

    const fillInput = document.getElementById("fill-color");
    if (fillInput) {
      fillInput.value = this.normalizeColorForInput(
        circle.getAttribute("fill") || "#000000"
      );
    }

    const opacityInput = document.getElementById("opacity-input");
    if (opacityInput) {
      const opacity = parseFloat(circle.getAttribute("opacity"));
      if (Number.isFinite(opacity)) {
        opacityInput.value = String(opacity);
      }
    }
  }

  getCircleElements() {
    const circles = Array.from(
      this.canvas.querySelectorAll('circle[data-circle-tool="true"]')
    );
    return circles.filter((circle) => {
      if (!circle.getAttribute("r")) {
        return false;
      }
      this.initializeCircleMetadata(circle);
      return true;
    });
  }

  initializeCircleMetadata(circle) {
    if (!circle || circle.getAttribute("data-circle-tool") !== "true") {
      return;
    }

    if (!circle.dataset.strokeStyle) {
      circle.dataset.strokeStyle = this.getStrokeStyleKey(circle);
    }

    this.ensureCircleId(circle);
  }

  ensureCircleId(circle) {
    if (!circle.dataset.circleId) {
      circle.dataset.circleId = this.generateCircleId();
    }
    return circle.dataset.circleId;
  }

  generateCircleId() {
    return `circle-${Date.now()}-${this.circleIdCounter++}`;
  }

  getCircleSummary(circle, index = 0) {
    const geometry = this.getCircleGeometry(circle);
    return `C${index + 1}: 中心(${Math.round(geometry.cx)}, ${Math.round(
      geometry.cy
    )}) r=${Math.round(geometry.r)}`;
  }

  getSelectedCircleElement() {
    if (!this.selectedCircleId) {
      return null;
    }

    const circle = this.canvas.querySelector(
      `circle[data-circle-id="${this.selectedCircleId}"]`
    );

    if (circle && circle.getAttribute("data-circle-tool") === "true") {
      return circle;
    }

    this.selectedCircleId = null;
    return null;
  }

  selectCircle(circle) {
    if (circle && circle.getAttribute("data-circle-tool") !== "true") {
      circle = null;
    }

    if (!circle) {
      this.selectedCircleId = null;
      this.selectionInteractionInProgress = false;
      this.disconnectSelectedCircleObserver();
      if (
        window.selectTool &&
        typeof window.selectTool.deselectObject === "function"
      ) {
        window.selectTool.deselectObject();
      }
      this.requestToolPanelRefresh();
      return;
    }

    const circleId = this.ensureCircleId(circle);
    this.selectedCircleId = circleId;
    this.selectionInteractionInProgress = false;

    if (window.selectTool && typeof window.selectTool.selectObject === "function") {
      window.selectTool.selectObject(circle, false);
    }

    this.observeSelectedCircle(circle);
    this.requestToolPanelRefresh();
  }

  observeSelectedCircle(circle) {
    if (!window.MutationObserver || !circle) {
      this.disconnectSelectedCircleObserver();
      return;
    }

    if (this.selectedCircleObserverTarget === circle) {
      return;
    }

    this.disconnectSelectedCircleObserver();

    this.selectedCircleObserverTarget = circle;
    this.selectedCircleObserver = new MutationObserver((mutations) => {
      this.handleSelectedCircleMutations(circle, mutations);
    });

    this.selectedCircleObserver.observe(circle, {
      attributes: true,
      attributeFilter: [
        "cx",
        "cy",
        "r",
        "transform",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "fill",
        "opacity",
      ],
    });
  }

  handleSelectedCircleMutations(circle, mutations) {
    if (!mutations || circle !== this.getSelectedCircleElement()) {
      return;
    }

    const hasAttributeChange = mutations.some(
      (mutation) => mutation.type === "attributes"
    );

    if (!hasAttributeChange) {
      return;
    }

    this.scheduleSelectedCircleSync();
  }

  scheduleSelectedCircleSync() {
    const requestFrame =
      window.requestAnimationFrame || window.setTimeout || ((cb) => cb());
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedCircleMutationHandle) {
      cancelFrame(this.selectedCircleMutationHandle);
      this.selectedCircleMutationHandle = null;
    }

    this.selectedCircleMutationHandle = requestFrame(() => {
      this.selectedCircleMutationHandle = null;
      this.syncSelectedCircleUiState();
    });
  }

  syncSelectedCircleUiState() {
    const circle = this.getSelectedCircleElement();
    if (!circle) {
      this.disconnectSelectedCircleObserver();
      return;
    }

    this.initializeCircleMetadata(circle);
    this.updateSelectionStyleInputs(circle);
    this.requestToolPanelRefresh();
  }

  disconnectSelectedCircleObserver() {
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedCircleObserver) {
      this.selectedCircleObserver.disconnect();
      this.selectedCircleObserver = null;
    }

    if (this.selectedCircleMutationHandle) {
      cancelFrame(this.selectedCircleMutationHandle);
      this.selectedCircleMutationHandle = null;
    }

    this.selectedCircleObserverTarget = null;
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
    const circle = this.getSelectedCircleElement();
    if (!circle) {
      return false;
    }

    const target = event?.target;
    if (!target) {
      return false;
    }

    if (target === circle) {
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

  isCircleCurrentlySelected(circle) {
    if (!circle) {
      return false;
    }

    const selections = Array.isArray(window.selectedObjects)
      ? window.selectedObjects
      : [];
    return selections.includes(circle);
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

window.CircleTool = CircleTool;
