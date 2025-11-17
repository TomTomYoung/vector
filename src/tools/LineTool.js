// LineTool.js
// 直線描画ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - CoordinatesUtils (window.CoordinatesUtils): 座標スナップ
// - StyleUtils (window.StyleUtils): スタイル適用
//
// 【使用する外部関数】
// - SvgUtils.createElement(): SVG要素作成
// - CoordinatesUtils.snapToOrtho(): 直交スナップ
// - StyleUtils.applyStyle(): スタイル適用

class LineTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.startPoint = null;
    this.currentLine = null;
    this.isDrawing = false;
    this.operationMode = "drag"; // "drag" または "twoClick"
    this.autoSelectAfterDraw = false;
    this.selectedLineId = null;
    this.lineIdCounter = 1;
    this.geometryStyles = this.createGeometryStyles();
    this.selectionInteractionInProgress = false;
    this.selectedLineObserver = null;
    this.selectedLineObserverTarget = null;
    this.selectedLineMutationHandle = null;
  }

  getTitle() {
    return "直線";
  }

  getInstructions() {
    const items =
      this.operationMode === "twoClick"
        ? [
            "左クリック: 始点を設定",
            "マウス移動: 終点プレビューを更新",
            "左クリック（2回目）: 終点を確定して直線を作成",
            "F8: 直交モード（Ortho）切り替え",
            "Esc: キャンセル",
          ]
        : [
            "左クリック+ドラッグ: 始点から終点までドラッグして直線を作成",
            "F8: 直交モード（Ortho）切り替え",
            "Esc: キャンセル",
          ];

    return {
      items,
      controls: [
        {
          type: "select",
          label: "操作方法",
          value: this.operationMode,
          options: [
            { value: "drag", label: "ドラッグ" },
            { value: "twoClick", label: "クリック2回" },
          ],
          onChange: (value) => {
            this.operationMode = value;
            this.resetDrawingState();
            if (window.toolPropertiesPanel) {
              window.toolPropertiesPanel.updatePanel();
            }
          },
        },
      ],
    };
  }

  getToolProperties() {
    const props = [
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
        label: "直線オブジェクト一覧",
        render: (container) => this.renderLineList(container),
      },
      {
        type: "custom",
        label: "オブジェクトプロパティ",
        render: (container) => this.renderSelectedLineProperties(container),
      },
    ];

    return props;
  }

  renderSelectionControls(container) {
    const line = this.getSelectedLineElement();
    const lines = this.getLineElements();
    const index = line ? lines.indexOf(line) : -1;

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    const info = document.createElement("div");
    info.textContent = line
      ? this.getLineSummary(line, index >= 0 ? index : 0)
      : "現在選択されていません";
    info.style.fontSize = "12px";
    info.style.color = line ? "#1a73e8" : "#666";
    container.appendChild(info);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "選択解除";
    button.disabled = !line;
    button.style.cssText = `
      padding: 6px 8px;
      border-radius: 4px;
      border: 1px solid #ccc;
      background: ${line ? "#fff" : "#f5f5f5"};
      color: ${line ? "#333" : "#999"};
      font-size: 12px;
      cursor: ${line ? "pointer" : "not-allowed"};
    `;
    button.addEventListener("click", () => {
      this.selectLine(null);
    });

    container.appendChild(button);
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
  }

  deactivate() {
    super.deactivate();
    this.resetDrawingState();
    this.disconnectSelectedLineObserver();
  }

  handleMouseDown(event) {
    if (!this.isActive) {
      return;
    }

    this.selectionInteractionInProgress = false;

    if (this.tryBeginSelectionDelegation(event)) {
      return;
    }

    super.handleMouseDown(event);

    if (event.button !== 0) {
      return;
    }

    const startPoint = this.getMousePosition(event);

    if (this.operationMode === "drag") {
      this.beginLine(startPoint);
      return;
    }

    if (!this.isDrawing) {
      this.beginLine(startPoint);
    } else {
      this.updateCurrentLineEnd(startPoint);
      this.finishLine();
    }
  }

  handleMouseMove(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseMove", event);
      return;
    }

    super.handleMouseMove(event);

    if (this.isDrawing && this.currentLine) {
      const currentPoint = this.getMousePosition(event);
      this.updateCurrentLineEnd(currentPoint);
    }
  }

  handleMouseUp(event) {
    if (this.selectionInteractionInProgress) {
      this.delegateSelectionEvent("handleMouseUp", event);
      this.selectionInteractionInProgress = false;
      return;
    }

    if (!this.isActive) return;

    if (this.operationMode === "drag") {
      if (this.isDrawing && this.currentLine) {
        const endPoint = this.getMousePosition(event);
        this.updateCurrentLineEnd(endPoint);
        this.finishLine();
      }

      super.handleMouseUp(event);
      return;
    }

    if (this.operationMode === "twoClick") {
      // 1回目のクリック後はマウスボタンを離してもプレビューを維持する
      if (this.isDrawing && this.currentLine) {
        return;
      }
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

  finishLine() {
    if (!this.currentLine) return;

    const finishedLine = this.currentLine;
    const lineId = this.ensureLineId(finishedLine);

    // 状態を保存
    this.saveState();

    if (this.autoSelectAfterDraw && finishedLine && window.selectTool) {
      window.selectTool.selectObject(finishedLine);
    }

    // 線を確定（既にキャンバスに追加されている）
    this.currentLine = null;
    this.startPoint = null;
    this.isDrawing = false;

    if (lineId) {
      this.selectedLineId = lineId;
      this.requestToolPanelRefresh();
      if (this.autoSelectAfterDraw && finishedLine) {
        this.observeSelectedLine(finishedLine);
      }
    }

    if (this.autoSelectAfterDraw && finishedLine && window.selectTool) {
      if (
        window.toolManager &&
        typeof window.toolManager.activateTemporaryTool === "function"
      ) {
        window.toolManager.activateTemporaryTool("select", {
          restoreTriggers: ["deselect", "cancel"],
        });
      }

      window.selectTool.selectObject(finishedLine);
    }
  }

  handleKeyDown(event) {
    // Escapeキーでキャンセル
    if (event.key === "Escape" && this.isDrawing) {
      this.resetDrawingState();
    }
  }

  beginLine(point) {
    this.resetDrawingState();

    this.startPoint = point;
    this.isDrawing = true;

    // SvgUtils.createLine を使用
    this.currentLine = window.SvgUtils.createLine(
      this.startPoint.x,
      this.startPoint.y,
      this.startPoint.x,
      this.startPoint.y,
      {
        fill: "none",
        "data-layer": window.currentLayerId,
        "data-line-tool": "true",
      }
    );

    this.initializeLineMetadata(this.currentLine);
    this.applyLineAppearance(this.currentLine);
    this.canvas.appendChild(this.currentLine);
  }

  updateCurrentLineEnd(point) {
    if (!this.currentLine || !this.startPoint) return;

    let endPoint = point;

    // 直交モード: CoordinatesUtils.snapToOrtho を使用
    if (window.orthoMode) {
      endPoint = window.CoordinatesUtils.snapToOrtho(this.startPoint, point);
    }

    this.currentLine.setAttribute("x2", endPoint.x);
    this.currentLine.setAttribute("y2", endPoint.y);
  }

  onCommonPropertiesChanged(properties) {
    if (!this.currentLine) {
      return;
    }

    this.applyLineAppearance(this.currentLine, properties);
  }

  resetDrawingState() {
    if (this.currentLine && this.currentLine.parentNode) {
      this.canvas.removeChild(this.currentLine);
    }
    this.currentLine = null;
    this.startPoint = null;
    this.isDrawing = false;
  }

  applyLineAppearance(line, properties = null) {
    if (!line) return;

    const style = properties
      ? {
          stroke: properties.strokeColor,
          strokeWidth: properties.strokeWidth,
          strokeDasharray: window.StyleUtils.LINE_STYLES[properties.strokeStyle] || 'none',
          opacity: 1,
          fill: "none"
        }
      : {
          ...this.currentStyle,
          strokeDasharray: window.StyleUtils.LINE_STYLES[this.currentStyle.strokeStyle] || 'none',
          fill: "none"
        };

    // StyleUtils.applyStyle を使用
    window.StyleUtils.applyStyle(line, style);

    if (style.strokeDasharray && style.strokeDasharray !== "none") {
      line.setAttribute("stroke-dasharray", style.strokeDasharray);
    } else {
      line.removeAttribute("stroke-dasharray");
    }

    const strokeStyleKey =
      (properties && properties.strokeStyle) || this.currentStyle.strokeStyle || "solid";
    line.dataset.strokeStyle = strokeStyleKey;
    this.initializeLineMetadata(line);
  }

  requestToolPanelRefresh() {
    if (
      window.toolPropertiesPanel &&
      window.toolPropertiesPanel.currentTool === this
    ) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  renderLineList(container) {
    const lines = this.getLineElements();

    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "6px";

    if (lines.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "直線オブジェクトがありません";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "4px";

    lines.forEach((line, index) => {
      const lineId = this.ensureLineId(line);
      const isSelected = lineId === this.selectedLineId;
      const summary = this.getLineSummary(line, index);
      const styleLabel = this.getGeometryStyleLabel(line);

      const button = document.createElement("button");
      button.type = "button";
      button.textContent = `${summary} / ${styleLabel}`;
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
        this.selectLine(line);
      });

      list.appendChild(button);
    });

    container.appendChild(list);
  }

  renderSelectedLineProperties(container) {
    const line = this.getSelectedLineElement();

    if (!line) {
      const empty = document.createElement("div");
      empty.textContent = "一覧から直線を選択すると詳細を編集できます";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const idLabel = document.createElement("div");
    idLabel.textContent = `ID: ${line.dataset.lineId}`;
    idLabel.style.fontSize = "12px";
    idLabel.style.color = "#333";
    idLabel.style.marginBottom = "6px";
    container.appendChild(idLabel);

    const geometryStyleKey = this.getLineGeometryStyle(line);
    const options = Object.entries(this.geometryStyles).map(([key, def]) => ({
      value: key,
      label: def.label,
    }));

    const styleWrapper = document.createElement("div");
    styleWrapper.style.display = "flex";
    styleWrapper.style.flexDirection = "column";
    styleWrapper.style.gap = "4px";
    styleWrapper.style.marginBottom = "10px";

    const styleLabel = document.createElement("label");
    styleLabel.textContent = "幾何スタイル";
    styleLabel.style.fontSize = "12px";
    styleLabel.style.color = "#555";
    styleWrapper.appendChild(styleLabel);

    const styleSelect = document.createElement("select");
    styleSelect.style.cssText = `
      width: 100%;
      padding: 6px;
      border-radius: 4px;
      border: 1px solid #ccc;
      font-size: 12px;
    `;
    options.forEach((opt) => {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (opt.value === geometryStyleKey) {
        option.selected = true;
      }
      styleSelect.appendChild(option);
    });
    styleSelect.addEventListener("change", (event) => {
      line.dataset.geometryStyle = event.target.value;
      this.saveState();
      this.requestToolPanelRefresh();
    });
    styleWrapper.appendChild(styleSelect);
    container.appendChild(styleWrapper);

    const styleDef = this.geometryStyles[geometryStyleKey];
    if (styleDef) {
      const geometryWrapper = document.createElement("div");
      geometryWrapper.style.display = "flex";
      geometryWrapper.style.flexDirection = "column";
      geometryWrapper.style.gap = "6px";
      geometryWrapper.dataset.geometryStyle = geometryStyleKey;

      const values = styleDef.getValues(line);

      styleDef.fields.forEach((field) => {
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
        input.type = field.type || "number";
        input.value = values[field.id];
        input.step = field.step || "1";
        if (field.min !== undefined) input.min = field.min;
        if (field.max !== undefined) input.max = field.max;
        input.dataset.paramId = field.id;
        input.style.cssText = `
          width: 100%;
          padding: 6px;
          border-radius: 4px;
          border: 1px solid #ccc;
          font-size: 12px;
        `;
        input.addEventListener("change", () => {
          this.updateLineGeometryFromInputs(line, geometryWrapper);
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

        geometryWrapper.appendChild(row);
      });

      container.appendChild(geometryWrapper);
    }

    this.renderAffineControls(container, line);
    this.renderLineStyleControls(container, line);
  }

  renderAffineControls(container, line) {
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

    const values = this.getAffineValues(line);
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
        this.updateAffineFromInputs(line, wrapper);
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

    // アフィン適用ボタンを追加
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
      this.applyAffineToGeometry(line);
    });
    wrapper.appendChild(applyButton);

    container.appendChild(wrapper);
  }

  renderLineStyleControls(container, line) {
    const style = window.SvgUtils.getElementStyle(line);

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
      line.setAttribute("stroke", event.target.value);
      this.saveState();
      this.refreshSelectionVisuals(line);
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
      line.setAttribute("stroke-width", Number.isFinite(width) ? width : 1);
      this.saveState();
      this.refreshSelectionVisuals(line);
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
    const currentStyle = this.getStrokeStyleKey(line);
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
      this.applyStrokeStyle(line, event.target.value);
      this.saveState();
      this.requestToolPanelRefresh();
    });
    dashRow.appendChild(select);
    wrapper.appendChild(dashRow);

    container.appendChild(wrapper);
  }

  updateLineGeometryFromInputs(line, wrapper) {
    const styleKey = wrapper.dataset.geometryStyle || this.getDefaultGeometryStyle();
    const styleDef = this.geometryStyles[styleKey];
    if (!styleDef) {
      return;
    }

    const values = {};
    wrapper.querySelectorAll("[data-param-id]").forEach((input) => {
      const id = input.dataset.paramId;
      const parsed = parseFloat(input.value);
      values[id] = Number.isFinite(parsed) ? parsed : 0;
    });

    styleDef.applyValues(line, values);
    this.saveState();
    this.refreshSelectionVisuals(line);
    this.requestToolPanelRefresh();
  }

  updateAffineFromInputs(line, wrapper) {
    if (!line || !wrapper) {
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

    this.applyAffineValues(line, values);
    this.saveState();
    this.refreshSelectionVisuals(line);
    this.updateAffineInputs(wrapper, line);
  }

  updateAffineInputs(wrapper, line) {
    if (!wrapper || !line) {
      return;
    }

    const latest = this.getAffineValues(line);
    wrapper.querySelectorAll("[data-affine-id]").forEach((input) => {
      const id = input.dataset.affineId;
      if (id && latest[id] !== undefined) {
        input.value = latest[id];
      }
    });
  }

  getAffineValues(line) {
    if (!window.DOMMatrix || !line) {
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
      const transform = line.getAttribute("transform");
      matrix = transform ? new DOMMatrix(transform) : new DOMMatrix();
    } catch (error) {
      matrix = new DOMMatrix();
    }

    const anchor = this.getLineLocalCenter(line);
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

  applyAffineValues(line, values) {
    if (!line) {
      return;
    }

    const current = this.getAffineValues(line);
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

    const anchor = this.getLineLocalCenter(line);
    const anchorShift = this.getAnchorTranslation({ a, b, c, d }, anchor);
    const e = anchorShift.x + translateX;
    const f = anchorShift.y + translateY;

    if (this.isIdentityMatrix({ a, b, c, d, e, f })) {
      line.removeAttribute("transform");
    } else {
      line.setAttribute(
        "transform",
        `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`
      );
    }
  }

  applyAffineToGeometry(line) {
    if (!line || !window.DOMPoint) {
      return;
    }

    const transformAttr = line.getAttribute("transform");
    if (!transformAttr) {
      // transformがなければ何もしない
      return;
    }

    const x1 = this.toNumber(line.getAttribute("x1"));
    const y1 = this.toNumber(line.getAttribute("y1"));
    const x2 = this.toNumber(line.getAttribute("x2"));
    const y2 = this.toNumber(line.getAttribute("y2"));

    // 現在のtransform行列を取得
    let matrix;
    try {
      matrix = new DOMMatrix(transformAttr);
    } catch (error) {
      console.error("Failed to parse transform:", error);
      return;
    }

    // 始点と終点に変換を適用
    const p1 = new DOMPoint(x1, y1).matrixTransform(matrix);
    const p2 = new DOMPoint(x2, y2).matrixTransform(matrix);

    // 座標を更新
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);

    // transformをクリア
    line.removeAttribute("transform");

    // 状態を保存
    this.saveState();

    // 選択ビジュアルを更新
    this.refreshSelectionVisuals(line);

    // UIを更新
    this.requestToolPanelRefresh();
  }

  getLineLocalCenter(line) {
    if (!line) {
      return null;
    }

    const x1 = this.toNumber(line.getAttribute("x1"));
    const y1 = this.toNumber(line.getAttribute("y1"));
    const x2 = this.toNumber(line.getAttribute("x2"));
    const y2 = this.toNumber(line.getAttribute("y2"));

    if (
      !Number.isFinite(x1) ||
      !Number.isFinite(y1) ||
      !Number.isFinite(x2) ||
      !Number.isFinite(y2)
    ) {
      return null;
    }

    return {
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
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

  getLineElements() {
    const lines = Array.from(
      this.canvas.querySelectorAll('line[data-line-tool="true"]')
    );
    lines.forEach((line) => this.initializeLineMetadata(line));
    return lines;
  }

  getSelectedLineElement() {
    if (!this.selectedLineId) {
      return null;
    }

    const line = this.canvas.querySelector(
      `line[data-line-id="${this.selectedLineId}"]`
    );

    if (line && line.getAttribute("data-line-tool") === "true") {
      return line;
    }

    this.selectedLineId = null;
    return null;
  }

  selectLine(line) {
    if (line && line.getAttribute("data-line-tool") !== "true") {
      line = null;
    }

    if (!line) {
      this.selectedLineId = null;
      this.selectionInteractionInProgress = false;
      this.disconnectSelectedLineObserver();
      if (
        window.selectTool &&
        typeof window.selectTool.deselectObject === "function"
      ) {
        window.selectTool.deselectObject();
      }
      this.requestToolPanelRefresh();
      return;
    }

    const lineId = this.ensureLineId(line);
    this.selectedLineId = lineId;
    this.selectionInteractionInProgress = false;

    if (window.selectTool && typeof window.selectTool.selectObject === "function") {
      window.selectTool.selectObject(line, false);
    }

    this.observeSelectedLine(line);
    this.requestToolPanelRefresh();
  }

  initializeLineMetadata(line) {
    if (!line || line.getAttribute("data-line-tool") !== "true") {
      return;
    }

    this.ensureLineId(line);

    if (!line.dataset.geometryStyle) {
      line.dataset.geometryStyle = this.getDefaultGeometryStyle();
    }

    if (!line.dataset.strokeStyle) {
      line.dataset.strokeStyle = this.getStrokeStyleKey(line);
    }
  }

  ensureLineId(line) {
    if (!line.dataset.lineId) {
      line.dataset.lineId = this.generateLineId();
    }
    return line.dataset.lineId;
  }

  generateLineId() {
    return `line-${Date.now()}-${this.lineIdCounter++}`;
  }

  getDefaultGeometryStyle() {
    return "endpoints";
  }

  createGeometryStyles() {
    return {
      endpoints: {
        label: "座標 (x1, y1, x2, y2)",
        fields: [
          { id: "x1", label: "X1", step: "1" },
          { id: "y1", label: "Y1", step: "1" },
          { id: "x2", label: "X2", step: "1" },
          { id: "y2", label: "Y2", step: "1" },
        ],
        getValues: (line) => ({
          x1: this.toNumber(line.getAttribute("x1")),
          y1: this.toNumber(line.getAttribute("y1")),
          x2: this.toNumber(line.getAttribute("x2")),
          y2: this.toNumber(line.getAttribute("y2")),
        }),
        applyValues: (line, values) => {
          line.setAttribute("x1", values.x1);
          line.setAttribute("y1", values.y1);
          line.setAttribute("x2", values.x2);
          line.setAttribute("y2", values.y2);
        },
      },
      polar: {
        label: "始点 + 長さ/角度",
        fields: [
          { id: "startX", label: "始点X", step: "1" },
          { id: "startY", label: "始点Y", step: "1" },
          { id: "length", label: "長さ", step: "1", min: 0 },
          { id: "angle", label: "角度", step: "1", suffix: "度" },
        ],
        getValues: (line) => {
          const x1 = this.toNumber(line.getAttribute("x1"));
          const y1 = this.toNumber(line.getAttribute("y1"));
          const x2 = this.toNumber(line.getAttribute("x2"));
          const y2 = this.toNumber(line.getAttribute("y2"));
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
          return {
            startX: x1,
            startY: y1,
            length: Number.isFinite(length) ? Number(length.toFixed(2)) : 0,
            angle: Number.isFinite(angle) ? Number(angle.toFixed(2)) : 0,
          };
        },
        applyValues: (line, values) => {
          const startX = values.startX;
          const startY = values.startY;
          const length = Math.max(0, values.length);
          const angleRad = (values.angle * Math.PI) / 180;
          const x2 = startX + length * Math.cos(angleRad);
          const y2 = startY + length * Math.sin(angleRad);
          line.setAttribute("x1", startX);
          line.setAttribute("y1", startY);
          line.setAttribute("x2", x2);
          line.setAttribute("y2", y2);
        },
      },
    };
  }

  getLineGeometryStyle(line) {
    const key = line?.dataset?.geometryStyle;
    if (key && this.geometryStyles[key]) {
      return key;
    }
    return this.getDefaultGeometryStyle();
  }

  getGeometryStyleLabel(line) {
    const key = this.getLineGeometryStyle(line);
    return this.geometryStyles[key]?.label || "座標";
  }

  getLineSummary(line, index = 0) {
    const x1 = this.toNumber(line.getAttribute("x1"));
    const y1 = this.toNumber(line.getAttribute("y1"));
    const x2 = this.toNumber(line.getAttribute("x2"));
    const y2 = this.toNumber(line.getAttribute("y2"));
    return `L${index + 1}: (${Math.round(x1)}, ${Math.round(y1)}) → (${Math.round(
      x2
    )}, ${Math.round(y2)})`;
  }

  toNumber(value, fallback = 0) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  normalizeColorForInput(value) {
    const rgb = window.StyleUtils.parseColor(value);
    if (rgb) {
      return window.StyleUtils.rgbToHex(rgb.r, rgb.g, rgb.b);
    }
    return "#000000";
  }

  getStrokeStyleKey(line) {
    const dash = line.getAttribute("stroke-dasharray") || "none";
    const entries = Object.entries(window.StyleUtils.LINE_STYLES || {});
    for (const [key, pattern] of entries) {
      if (pattern === dash) {
        return key;
      }
    }
    return line.dataset.strokeStyle || "solid";
  }

  applyStrokeStyle(line, styleKey) {
    const pattern = window.StyleUtils.LINE_STYLES[styleKey] || "none";
    if (pattern === "none") {
      line.removeAttribute("stroke-dasharray");
    } else {
      line.setAttribute("stroke-dasharray", pattern);
    }
    line.dataset.strokeStyle = styleKey;
    this.refreshSelectionVisuals(line);
  }

  refreshSelectionVisuals(line) {
    if (!this.isLineCurrentlySelected(line)) {
      return;
    }

    if (window.selectTool) {
      if (typeof window.selectTool.refreshHandles === "function") {
        window.selectTool.refreshHandles();
      } else if (typeof window.selectTool.addControlPoints === "function") {
        window.selectTool.addControlPoints();
      }
    }

    this.updateSelectionStyleInputs(line);
  }

  updateSelectionStyleInputs(line) {
    if (!line) {
      return;
    }

    const strokeInput = document.getElementById("stroke-color");
    if (strokeInput) {
      strokeInput.value = this.normalizeColorForInput(
        line.getAttribute("stroke") || "#000000"
      );
    }

    const widthInput = document.getElementById("stroke-width");
    if (widthInput) {
      const width = parseFloat(line.getAttribute("stroke-width"));
      if (Number.isFinite(width)) {
        widthInput.value = String(width);
      }
    }

    const opacityInput = document.getElementById("opacity-input");
    if (opacityInput) {
      const opacity = parseFloat(line.getAttribute("opacity"));
      if (Number.isFinite(opacity)) {
        opacityInput.value = String(opacity);
      }
    }
  }

  isLineCurrentlySelected(line) {
    if (!line) {
      return false;
    }

    const selections = Array.isArray(window.selectedObjects)
      ? window.selectedObjects
      : [];
    return selections.includes(line);
  }

  observeSelectedLine(line) {
    if (!window.MutationObserver || !line) {
      this.disconnectSelectedLineObserver();
      return;
    }

    if (this.selectedLineObserverTarget === line) {
      return;
    }

    this.disconnectSelectedLineObserver();

    this.selectedLineObserverTarget = line;
    this.selectedLineObserver = new MutationObserver((mutations) => {
      this.handleSelectedLineMutations(line, mutations);
    });

    this.selectedLineObserver.observe(line, {
      attributes: true,
      attributeFilter: [
        "x1",
        "y1",
        "x2",
        "y2",
        "transform",
        "stroke",
        "stroke-width",
        "stroke-dasharray",
        "opacity",
      ],
    });
  }

  handleSelectedLineMutations(line, mutations) {
    if (!mutations || line !== this.getSelectedLineElement()) {
      return;
    }

    const hasAttributeChange = mutations.some(
      (mutation) => mutation.type === "attributes"
    );

    if (!hasAttributeChange) {
      return;
    }

    this.scheduleSelectedLineSync();
  }

  scheduleSelectedLineSync() {
    const requestFrame =
      window.requestAnimationFrame || window.setTimeout || ((cb) => cb());
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedLineMutationHandle) {
      cancelFrame(this.selectedLineMutationHandle);
      this.selectedLineMutationHandle = null;
    }

    this.selectedLineMutationHandle = requestFrame(() => {
      this.selectedLineMutationHandle = null;
      this.syncSelectedLineUiState();
    });
  }

  syncSelectedLineUiState() {
    const line = this.getSelectedLineElement();
    if (!line) {
      this.disconnectSelectedLineObserver();
      return;
    }

    this.initializeLineMetadata(line);
    this.updateSelectionStyleInputs(line);
    this.requestToolPanelRefresh();
  }

  disconnectSelectedLineObserver() {
    const cancelFrame =
      window.cancelAnimationFrame || window.clearTimeout || (() => {});

    if (this.selectedLineObserver) {
      this.selectedLineObserver.disconnect();
      this.selectedLineObserver = null;
    }

    if (this.selectedLineMutationHandle) {
      cancelFrame(this.selectedLineMutationHandle);
      this.selectedLineMutationHandle = null;
    }

    this.selectedLineObserverTarget = null;
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
    const line = this.getSelectedLineElement();
    if (!line) {
      return false;
    }

    const target = event?.target;
    if (!target) {
      return false;
    }

    if (target === line) {
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

window.LineTool = LineTool;
