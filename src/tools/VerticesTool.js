// VerticesTool.js
// 頂点（vertices）とindicesを管理する専用ツール
//
// 【役割】
// - verticesObject = { vectors: [], indices: [] } を保持し、描画ジオメトリを生成
// - 各頂点をGUIハンドル（円）で表示し、ドラッグで座標編集
// - indicesごとに描画メソッド（線・ポリライン・ポリゴン）とパラメータを適用
// - ToolPropertiesPanelからメソッドやパラメータ、ハンドル半径を操作
//
// 【依存】
// - BaseTool
// - SvgUtils (window.SvgUtils)
//
// 【公開】
// - window.VerticesTool

class VerticesTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);

    this.verticesObject = {
      vectors: [],
      indices: [],
    };

    this.handleElements = [];
    this.geometryElements = [];

    this.handleRadius = 8;
    this.methodSettings = {
      segments: { enabled: false },
      polyline: { enabled: true, closed: false },
      polygon: { enabled: false, fillEnabled: false },
      quadraticBezier: { enabled: false },
      cubicBezier: { enabled: false },
      bezierN: { enabled: false, degree: 4, sampleCount: 80 },
    };

    this.methodOptions = [
      { value: 'segments', label: '線分 (segments)' },
      { value: 'polyline', label: '連続線 (polyline)' },
      { value: 'polygon', label: '面 (polygon)' },
      { value: 'quadraticBezier', label: '2次ベジェ' },
      { value: 'cubicBezier', label: '3次ベジェ' },
      { value: 'bezierN', label: 'n次ベジェ' },
    ];
    this.selectedMethodKey = 'polyline';

    this.isDraggingHandle = false;
    this.draggingHandleIndex = null;

    this.handleLayer = window.SvgUtils.createElement("g", {
      class: "vertices-tool-handles",
      "data-tool-layer": "vertices-handles",
    });
  }

  getTitle() {
    return "Vertices";
  }

  getInstructions() {
    return [
      "クリックで頂点を追加",
      "ハンドルをドラッグして座標を編集",
      "右パネルのドロップダウンで描画メソッドを選択",
      "必要に応じてメソッドを有効化しパラメータを調整",
      "ベジェ系は先頭の必要頂点数を制御点として利用",
      "ダブルクリックで全頂点をリセット",
    ];
  }

  getToolProperties() {
    const selectedKey = this.ensureSelectedMethodKey();
    const props = [
      {
        type: "select",
        label: "メソッド選択",
        options: this.methodOptions,
        value: selectedKey,
        onChange: (value) => {
          this.selectedMethodKey = value;
          this.requestToolPanelRefresh();
        },
      },
      ...this.getMethodPropertyControls(selectedKey),
      {
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
      },
    ];

    return props;
  }

  ensureSelectedMethodKey() {
    if (this.methodOptions.find((opt) => opt.value === this.selectedMethodKey)) {
      return this.selectedMethodKey;
    }
    this.selectedMethodKey = this.methodOptions[0]?.value || '';
    return this.selectedMethodKey;
  }

  getMethodPropertyControls(methodKey) {
    const settings = this.methodSettings[methodKey];
    if (!settings) {
      return [];
    }

    const controls = [
      {
        type: "checkbox",
        label: "メソッド適用",
        checkLabel: "描画に含める",
        value: Boolean(settings.enabled),
        onChange: (checked) => {
          settings.enabled = checked;
          this.rebuildIndices();
          this.renderGeometry();
          this.saveState();
        },
      },
    ];

    switch (methodKey) {
      case "polyline":
        controls.push({
          type: "checkbox",
          label: "ポリライン設定",
          checkLabel: "始点と終点を接続",
          value: Boolean(settings.closed),
          onChange: (checked) => {
            settings.closed = checked;
            this.rebuildIndices();
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
          value: Boolean(settings.fillEnabled),
          onChange: (checked) => {
            settings.fillEnabled = checked;
            this.rebuildIndices();
            this.renderGeometry();
            this.saveState();
          },
        });
        break;
      case "bezierN":
        controls.push({
          type: "number",
          label: "次数 (n)",
          value: settings.degree,
          min: 2,
          max: 12,
          step: 1,
          onChange: (value) => {
            settings.degree = Math.max(2, Math.round(value || 2));
            this.rebuildIndices();
            this.renderGeometry();
            this.saveState();
            this.requestToolPanelRefresh();
          },
        });
        controls.push({
          type: "number",
          label: "サンプル数",
          value: settings.sampleCount,
          min: 10,
          max: 400,
          step: 5,
          onChange: (value) => {
            settings.sampleCount = Math.max(10, Math.round(value || 10));
            this.rebuildIndices();
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

  requestToolPanelRefresh() {
    if (window.toolPropertiesPanel && window.toolPropertiesPanel.currentTool === this) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    // ハンドルレイヤーを最前面に移動
    this.canvas.appendChild(this.handleLayer);
    this.handleLayer.style.display = "block";
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
    if (targetIndex !== null) {
      event.preventDefault();
      this.startHandleDrag(targetIndex);
      return;
    }

    const point = this.getMousePosition(event);
    this.addVertex(point);
    this.rebuildIndices();
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

    this.verticesObject.vectors.pop();
    const handle = this.handleElements.pop();
    if (handle) {
      window.SvgUtils.removeElement(handle);
    }
    this.updateHandleIndices();
    this.rebuildIndices();
    this.renderGeometry();
    this.saveState();
  }

  resetVertices() {
    this.verticesObject.vectors = [];
    this.verticesObject.indices = [];

    this.handleElements.forEach((handle) => window.SvgUtils.removeElement(handle));
    this.handleElements = [];

    this.clearGeometryElements();
    this.saveState();
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

  rebuildIndices() {
    const vectors = this.verticesObject.vectors;
    const indices = [];

    if (this.methodSettings.segments.enabled) {
      for (let i = 0; i < vectors.length - 1; i += 1) {
        indices.push({
          method: "line",
          points: [i, i + 1],
          params: {},
        });
      }
    }

    if (this.methodSettings.polyline.enabled && vectors.length > 1) {
      indices.push({
        method: "polyline",
        points: vectors.map((_, idx) => idx),
        params: { closed: this.methodSettings.polyline.closed },
      });
    }

    if (this.methodSettings.polygon.enabled && vectors.length > 2) {
      indices.push({
        method: "polygon",
        points: vectors.map((_, idx) => idx),
        params: { fillEnabled: this.methodSettings.polygon.fillEnabled },
      });
    }

    if (this.methodSettings.quadraticBezier.enabled && vectors.length >= 3) {
      indices.push({
        method: "quadraticBezier",
        points: [0, 1, 2],
        params: {},
      });
    }

    if (this.methodSettings.cubicBezier.enabled && vectors.length >= 4) {
      indices.push({
        method: "cubicBezier",
        points: [0, 1, 2, 3],
        params: {},
      });
    }

    if (this.methodSettings.bezierN.enabled) {
      const degree = Math.max(2, Math.round(this.methodSettings.bezierN.degree));
      const controlCount = degree + 1;
      if (vectors.length >= controlCount) {
        indices.push({
          method: "bezierN",
          points: Array.from({ length: controlCount }, (_, idx) => idx),
          params: {
            degree,
            sampleCount: Math.max(10, Math.round(this.methodSettings.bezierN.sampleCount || 80)),
          },
        });
      }
    }

    this.verticesObject.indices = indices;
  }

  renderGeometry() {
    this.clearGeometryElements();

    this.verticesObject.indices.forEach((indice) => {
      const element = this.createGeometryElement(indice);
      if (element) {
        this.canvas.appendChild(element);
        this.geometryElements.push(element);
      }
    });
  }

  clearGeometryElements() {
    this.geometryElements.forEach((element) => {
      window.SvgUtils.removeElement(element);
    });
    this.geometryElements = [];
  }

  createGeometryElement(indice) {
    const points = (indice.points || [])
      .map((idx) => this.verticesObject.vectors[idx])
      .filter((pt) => pt);

    if (points.length < 2 && indice.method !== "polygon") {
      return null;
    }

    let element = null;

    switch (indice.method) {
      case "line": {
        const [p1, p2] = points;
        element = window.SvgUtils.createLine(p1.x, p1.y, p2.x, p2.y);
        break;
      }
      case "polyline": {
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
      case "cubicBezier":
      case "bezierN": {
        const bezier = window.VectorUtils?.bezier;
        if (!bezier) {
          return null;
        }
        const pathData = bezier.buildPathData(indice.method, points, indice.params);
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
