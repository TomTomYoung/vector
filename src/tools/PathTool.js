// PathTool.js
// パス描画ツール（管理UI付き）
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成・スタイル取得
// - StyleUtils (window.StyleUtils): 線スタイル・色処理
// - CoordinatesUtils (window.CoordinatesUtils): 座標取得（BaseTool経由）
//
// 【使用する外部関数】
// - SvgUtils.createElement(): SVG要素作成
// - SvgUtils.getElementStyle(): スタイル取得

class PathTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.pathPoints = [];
    this.currentPath = null;
    this.tempLine = null;
    this.pathMode = "line"; // "line" or "bezier"
    this.autoSelectAfterDraw = false;
    this.selectedPathId = null;
    this.pathIdCounter = 1;
    this.selectionInteractionInProgress = false;
    this.selectedPathObserver = null;
    this.selectedPathObserverTarget = null;
    this.selectedPathMutationHandle = null;
  }

  getTitle() {
    return "パス";
  }

  getInstructions() {
    const modeLabel = this.pathMode === "line" ? "直線" : "ベジェ";
    const instructions = [
      `現在のモード: ${modeLabel}`,
      this.pathMode === "line"
        ? "左クリック: 折れ線の頂点を追加"
        : "左クリック: 制御点/終点を順番に追加",
      "マウス移動: 次の頂点位置をプレビュー",
      "ダブルクリック/Enter: パスを確定",
      "Esc: 描画中のパスをキャンセル",
    ];

    instructions.push(
      "選択リストから既存パスを選び、ジオメトリ・スタイル・アフィン変換を編集できます"
    );

    return instructions;
  }

  getToolProperties() {
    return [
      {
        type: "select",
        label: "描画モード",
        value: this.pathMode,
        options: [
          { value: "line", label: "直線" },
          { value: "bezier", label: "ベジェ" },
        ],
        onChange: (value) => {
          this.pathMode = value;
          this.updatePathData();
          this.requestToolPanelRefresh();
        },
      },
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
        label: "パス一覧",
        render: (container) => this.renderPathList(container),
      },
      {
        type: "custom",
        label: "オブジェクトプロパティ",
        render: (container) => this.renderSelectedPathProperties(container),
      },
    ];
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.requestToolPanelRefresh();
  }

  deactivate() {
    super.deactivate();
    this.cancelPath();
    this.disconnectSelectedPathObserver();
    this.requestToolPanelRefresh();
  }

  cancel() {
    this.cancelPath();
  }

  handleMouseDown(event) {
    this.selectionInteractionInProgress = false;
    if (this.tryBeginSelectionDelegation(event)) {
      return;
    }

    super.handleMouseDown(event);

    if (!this.isActive) return;

    this.handlePathClick(this.startPoint);
    this.requestToolPanelRefresh();
  }

  handleMouseMove(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseMove", event);
      return;
    }

    super.handleMouseMove(event);

    if (!this.isActive) return;

    if (this.pathPoints.length > 0 && this.tempLine) {
      this.updateTemporaryLine(
        this.pathPoints[this.pathPoints.length - 1],
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

    if (this.pathPoints.length >= 2) {
      this.finishPath();
    } else {
      this.cancelPath();
    }

    this.requestToolPanelRefresh();
  }

  handleKeyDown(event) {
    if (!this.isActive) return;

    if (event.key === "Escape") {
      this.cancelPath();
      this.requestToolPanelRefresh();
    }

    if (event.key === "Enter" && this.pathPoints.length >= 2) {
      this.finishPath();
    }
  }

  updatePanel() {
    this.requestToolPanelRefresh();
  }

  handlePathClick(point) {
    if (!point) {
      return;
    }

    if (!this.currentPath) {
      this.saveState();
      this.pathPoints = [];
      this.currentPath = window.SvgUtils.createElement("path", {
        fill: "none",
        stroke: document.getElementById("stroke-color")?.value || "#000000",
        "stroke-width": document.getElementById("stroke-width")?.value || "2",
        "data-layer": window.currentLayerId,
      });
      this.applyDefaultAttributes(this.currentPath);
      this.currentPath.setAttribute("fill", "none");
      this.currentPath.setAttribute("data-path-tool", "true");

      this.canvas.appendChild(this.currentPath);

      this.tempLine = window.SvgUtils.createElement("line", {
        stroke: "#000000",
        "stroke-width": 1,
        "stroke-dasharray": "4 4",
      });
      this.canvas.appendChild(this.tempLine);
    }

    this.pathPoints.push({ ...point });
    this.updatePathData();
  }

  updatePathData() {
    if (!this.currentPath || this.pathPoints.length === 0) return;

    let d = `M ${this.pathPoints[0].x} ${this.pathPoints[0].y}`;

    if (this.pathMode === "line") {
      for (let i = 1; i < this.pathPoints.length; i++) {
        d += ` L ${this.pathPoints[i].x} ${this.pathPoints[i].y}`;
      }
    } else {
      for (let i = 1; i < this.pathPoints.length; i++) {
        if (i % 3 === 1) {
          const cp1 = this.pathPoints[i];

          if (i + 2 < this.pathPoints.length) {
            const cp2 = this.pathPoints[i + 1];
            const endPoint = this.pathPoints[i + 2];
            d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${endPoint.x} ${endPoint.y}`;
          } else {
            d += ` L ${this.pathPoints[i].x} ${this.pathPoints[i].y}`;
          }
        } else if (i % 3 === 2 && i + 1 >= this.pathPoints.length) {
          d += ` L ${this.pathPoints[i].x} ${this.pathPoints[i].y}`;
        }
      }
    }

    this.currentPath.setAttribute("d", d);
    this.currentPath.dataset.pathMode = this.pathMode;
  }

  updateTemporaryLine(start, end) {
    if (!this.tempLine) return;

    this.tempLine.setAttribute("x1", start.x);
    this.tempLine.setAttribute("y1", start.y);
    this.tempLine.setAttribute("x2", end.x);
    this.tempLine.setAttribute("y2", end.y);
  }

  finishPath() {
    if (!this.currentPath || this.pathPoints.length < 2) {
      this.cancelPath();
      return null;
    }

    if (this.tempLine) {
      this.canvas.removeChild(this.tempLine);
      this.tempLine = null;
    }

    this.initializePathMetadata(this.currentPath);

    const createdPath = this.currentPath;
    this.currentPath = null;
    this.pathPoints = [];

    if (window.selectTool) {
      window.selectTool.selectObject(createdPath);
    }

    if (this.autoSelectAfterDraw) {
      this.selectPath(createdPath);
    }

    this.saveState();
    this.requestToolPanelRefresh();
    return createdPath;
  }

  cancelPath() {
    if (this.currentPath) {
      this.canvas.removeChild(this.currentPath);
    }

    if (this.tempLine) {
      this.canvas.removeChild(this.tempLine);
      this.tempLine = null;
    }

    this.currentPath = null;
    this.tempLine = null;
    this.pathPoints = [];
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
    const path = this.getSelectedPathElement();
    const paths = this.getPathElements();
    const index = path ? paths.indexOf(path) : -1;

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    const info = document.createElement("div");
    info.textContent = path
      ? this.getPathSummary(path, index >= 0 ? index : 0)
      : "現在選択されていません";
    info.style.fontSize = "12px";
    info.style.color = path ? "#1a73e8" : "#666";
    container.appendChild(info);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "選択解除";
    button.disabled = !path;
    button.style.cssText = `
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background: ${path ? "#fff" : "#f5f5f5"};
      color: ${path ? "#333" : "#999"};
      font-size: 12px;
      cursor: ${path ? "pointer" : "not-allowed"};
    `;
    button.addEventListener("click", () => {
      this.selectPath(null);
    });
    container.appendChild(button);
  }

  renderPathList(container) {
    const paths = this.getPathElements();

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    if (paths.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "パスがありません";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "4px";

    paths.forEach((path, index) => {
      const pathId = this.ensurePathId(path);
      const isSelected = pathId === this.selectedPathId;
      const summary = this.getPathSummary(path, index);

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
        this.selectPath(path);
      });

      list.appendChild(button);
    });

    container.appendChild(list);
  }

  renderSelectedPathProperties(container) {
    const path = this.getSelectedPathElement();

    if (!path) {
      const empty = document.createElement("div");
      empty.textContent = "一覧からパスを選択すると編集できます";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const idLabel = document.createElement("div");
    idLabel.textContent = `ID: ${path.dataset.pathId}`;
    idLabel.style.fontSize = "12px";
    idLabel.style.color = "#333";
    idLabel.style.marginBottom = "6px";
    container.appendChild(idLabel);

    this.renderPathMeta(container, path);
    this.renderPathDataEditor(container, path);
    this.renderAffineControls(container, path);
    this.renderPathStyleControls(container, path);
  }

  renderPathMeta(container, path) {
    const modeLabel = path.dataset.pathMode === "bezier" ? "ベジェ" : "直線";
    const meta = document.createElement("div");
    meta.style.fontSize = "12px";
    meta.style.color = "#555";
    let lengthText = "";
    try {
      const length = path.getTotalLength();
      if (Number.isFinite(length)) {
        lengthText = ` / 長さ: ${length.toFixed(1)}`;
      }
    } catch (error) {
      lengthText = "";
    }
    meta.textContent = `モード: ${modeLabel}${lengthText}`;
    meta.style.marginBottom = "8px";
    container.appendChild(meta);
  }

  renderPathDataEditor(container, path) {
    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "4px";

    const label = document.createElement("label");
    label.textContent = "d 属性";
    label.style.fontSize = "12px";
    label.style.color = "#555";
    wrapper.appendChild(label);

    const textarea = document.createElement("textarea");
    textarea.value = path.getAttribute("d") || "";
    textarea.rows = 4;
    textarea.style.cssText = `
      width: 100%;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid #ccc;
      font-size: 12px;
      font-family: monospace;
    `;
    textarea.addEventListener("change", () => {
      path.setAttribute("d", textarea.value.trim());
      this.saveState();
      this.refreshSelectionVisuals(path);
    });
    wrapper.appendChild(textarea);

    container.appendChild(wrapper);
  }

  renderAffineControls(container, path) {
    if (!window.DOMMatrix) {
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "8px";
    wrapper.style.marginTop = "10px";

    const title = document.createElement("div");
    title.textContent = "ベースアフィン変換";
    title.style.fontSize = "12px";
    title.style.color = "#555";
    wrapper.appendChild(title);

    const fields = [
      { key: "translateX", label: "平行移動 X", value: 0 },
      { key: "translateY", label: "平行移動 Y", value: 0 },
      { key: "scaleX", label: "拡大率 X", value: 1 },
      { key: "scaleY", label: "拡大率 Y", value: 1 },
      { key: "rotate", label: "回転 (°)", value: 0 },
    ];

    const inputs = {};

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
      input.step = field.key.startsWith("scale") ? "0.1" : "1";
      input.style.cssText = `
        width: 100%;
        padding: 6px;
        border-radius: 4px;
        border: 1px solid #ccc;
        font-size: 12px;
      `;
      row.appendChild(input);
      wrapper.appendChild(row);

      inputs[field.key] = input;
    });

    const applyButton = document.createElement("button");
    applyButton.type = "button";
    applyButton.textContent = "適用";
    applyButton.style.cssText = `
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid #2f80ed;
      background: #2f80ed;
      color: #fff;
      font-size: 12px;
      cursor: pointer;
    `;
    applyButton.addEventListener("click", () => {
      this.applyAffineTransform(path, inputs);
    });
    wrapper.appendChild(applyButton);

    container.appendChild(wrapper);
  }

  applyAffineTransform(path, inputs) {
    const translateX = parseFloat(inputs.translateX.value) || 0;
    const translateY = parseFloat(inputs.translateY.value) || 0;
    const scaleX = parseFloat(inputs.scaleX.value) || 1;
    const scaleY = parseFloat(inputs.scaleY.value) || 1;
    const rotate = parseFloat(inputs.rotate.value) || 0;

    const matrix = new DOMMatrix()
      .translate(translateX, translateY)
      .rotate(rotate)
      .scale(scaleX, scaleY);

    const existing = path.getAttribute("transform");
    const base = existing ? new DOMMatrix(existing) : new DOMMatrix();
    const combined = base.multiply(matrix);
    path.setAttribute("transform", combined.toString());

    this.saveState();
    this.refreshSelectionVisuals(path);
  }

  renderPathStyleControls(container, path) {
    const style = window.SvgUtils.getElementStyle(path);

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
      path.setAttribute("stroke", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(path);
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
      path.setAttribute("stroke-width", Number.isFinite(width) ? width : 1);
      this.saveState();
      this.refreshSelectionVisuals(path);
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
    const currentStyle = this.getStrokeStyleKey(path);
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
      this.applyStrokeStyle(path, event.target.value);
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
      path.setAttribute("fill", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(path);
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
    opacityInput.min = "0";
    opacityInput.max = "1";
    opacityInput.step = "0.05";
    opacityInput.value = path.getAttribute("opacity") || "1";
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
      path.setAttribute("opacity", value);
      this.saveState();
      this.refreshSelectionVisuals(path);
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

  getStrokeStyleKey(path) {
    const dash = path.getAttribute("stroke-dasharray") || "none";
    const entries = Object.entries(window.StyleUtils.LINE_STYLES || {});
    for (const [key, pattern] of entries) {
      if (pattern === dash) {
        return key;
      }
    }
    return path.dataset.strokeStyle || "solid";
  }

  applyStrokeStyle(path, styleKey) {
    const pattern = window.StyleUtils.LINE_STYLES[styleKey] || "none";
    if (pattern === "none") {
      path.removeAttribute("stroke-dasharray");
    } else {
      path.setAttribute("stroke-dasharray", pattern);
    }
    path.dataset.strokeStyle = styleKey;
    this.refreshSelectionVisuals(path);
  }

  getPathElements() {
    const paths = Array.from(
      this.canvas.querySelectorAll('path[data-path-tool="true"]')
    );
    return paths.filter((path) => {
      if (!path.getAttribute("d")) {
        return false;
      }
      this.initializePathMetadata(path);
      return true;
    });
  }

  getSelectedPathElement() {
    if (!this.selectedPathId) {
      return null;
    }

    const path = this.canvas.querySelector(
      `path[data-path-id="${this.selectedPathId}"]`
    );

    if (path && path.getAttribute("data-path-tool") === "true") {
      return path;
    }

    this.selectedPathId = null;
    return null;
  }

  selectPath(path) {
    if (path && path.getAttribute("data-path-tool") !== "true") {
      path = null;
    }

    if (!path) {
      this.selectedPathId = null;
      this.selectionInteractionInProgress = false;
      this.disconnectSelectedPathObserver();
      if (
        window.selectTool &&
        typeof window.selectTool.deselectObject === "function"
      ) {
        window.selectTool.deselectObject();
      }
      this.requestToolPanelRefresh();
      return;
    }

    const pathId = this.ensurePathId(path);
    this.selectedPathId = pathId;
    this.selectionInteractionInProgress = false;

    if (window.selectTool && typeof window.selectTool.selectObject === "function") {
      window.selectTool.selectObject(path, false);
    }

    this.observeSelectedPath(path);
    this.requestToolPanelRefresh();
  }

  initializePathMetadata(path) {
    if (!path || path.getAttribute("data-path-tool") !== "true") {
      return;
    }

    if (!path.dataset.strokeStyle) {
      path.dataset.strokeStyle = this.getStrokeStyleKey(path);
    }

    if (!path.dataset.pathMode) {
      path.dataset.pathMode = this.pathMode;
    }

    this.ensurePathId(path);
  }

  ensurePathId(path) {
    if (!path.dataset.pathId) {
      path.dataset.pathId = this.generatePathId();
    }
    return path.dataset.pathId;
  }

  generatePathId() {
    return `path-${Date.now()}-${this.pathIdCounter++}`;
  }

  getPathSummary(path, index = 0) {
    const d = path.getAttribute("d") || "";
    const commands = d.split(/[A-Za-z]/).filter((segment) => segment.trim());
    return `P${index + 1}: コマンド${commands.length}`;
  }

  observeSelectedPath(path) {
    if (!window.MutationObserver || !path) {
      this.disconnectSelectedPathObserver();
      return;
    }

    if (this.selectedPathObserverTarget === path) {
      return;
    }

    this.disconnectSelectedPathObserver();

    this.selectedPathObserverTarget = path;
    this.selectedPathObserver = new MutationObserver((mutations) => {
      this.handleSelectedPathMutations(path, mutations);
    });

    this.selectedPathObserver.observe(path, {
      attributes: true,
      attributeFilter: [
        "d",
        "transform",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "fill",
        "opacity",
      ],
    });
  }

  handleSelectedPathMutations(path, mutations) {
    if (!mutations || path !== this.getSelectedPathElement()) {
      return;
    }

    const hasAttributeChange = mutations.some(
      (mutation) => mutation.type === "attributes"
    );

    if (!hasAttributeChange) {
      return;
    }

    this.scheduleSelectedPathSync();
  }

  scheduleSelectedPathSync() {
    const requestFrame =
      window.requestAnimationFrame || window.setTimeout || ((cb) => cb());
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedPathMutationHandle) {
      cancelFrame(this.selectedPathMutationHandle);
      this.selectedPathMutationHandle = null;
    }

    this.selectedPathMutationHandle = requestFrame(() => {
      this.selectedPathMutationHandle = null;
      this.syncSelectedPathUiState();
    });
  }

  syncSelectedPathUiState() {
    const path = this.getSelectedPathElement();
    if (!path) {
      this.disconnectSelectedPathObserver();
      return;
    }

    this.initializePathMetadata(path);
    this.updateSelectionStyleInputs(path);
    this.requestToolPanelRefresh();
  }

  disconnectSelectedPathObserver() {
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedPathObserver) {
      this.selectedPathObserver.disconnect();
      this.selectedPathObserver = null;
    }

    if (this.selectedPathMutationHandle) {
      cancelFrame(this.selectedPathMutationHandle);
      this.selectedPathMutationHandle = null;
    }

    this.selectedPathObserverTarget = null;
  }

  refreshSelectionVisuals(path) {
    if (!this.isPathCurrentlySelected(path)) {
      return;
    }

    if (window.selectTool) {
      if (typeof window.selectTool.refreshHandles === "function") {
        window.selectTool.refreshHandles();
      } else if (typeof window.selectTool.addControlPoints === "function") {
        window.selectTool.addControlPoints();
      }
    }

    this.updateSelectionStyleInputs(path);
  }

  isPathCurrentlySelected(path) {
    return (
      path &&
      this.selectedPathId &&
      path.dataset.pathId === this.selectedPathId
    );
  }

  updateSelectionStyleInputs(path) {
    if (!path) {
      return;
    }

    const strokeInput = document.getElementById("stroke-color");
    if (strokeInput) {
      strokeInput.value = this.normalizeColorForInput(
        path.getAttribute("stroke") || "#000000"
      );
    }

    const widthInput = document.getElementById("stroke-width");
    if (widthInput) {
      const width = parseFloat(path.getAttribute("stroke-width"));
      if (Number.isFinite(width)) {
        widthInput.value = String(width);
      }
    }

    const fillInput = document.getElementById("fill-color");
    if (fillInput) {
      fillInput.value = this.normalizeColorForInput(
        path.getAttribute("fill") || "#ffffff"
      );
    }

    const opacityInput = document.getElementById("opacity-input");
    if (opacityInput) {
      const opacity = parseFloat(path.getAttribute("opacity"));
      if (Number.isFinite(opacity)) {
        opacityInput.value = String(opacity);
      }
    }
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
    const path = this.getSelectedPathElement();
    if (!path) {
      return false;
    }

    const target = event?.target;
    if (!target) {
      return false;
    }

    if (target === path) {
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
}

window.PathTool = PathTool;
