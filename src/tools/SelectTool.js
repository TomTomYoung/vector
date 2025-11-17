class SelectTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedObject = null;
    this.isDragging = false;
    this.isRotating = false; // isRotizing → isRotating に修正
    this.isResizing = false;
    this.resizeHandle = null;
    this.initialMatrix = null;
    this.initialBBox = null;
    this.fixedPoint = null;
    this.startVector = null;
    this.startPoint = null;
    this.startAngle = 0; // 追加：初期角度
    this.multiInitialMatrices = [];
    this.handleOptions = {
      resize: true,
      rotate: true,
      translate: true,
    };
    this.isMarqueeSelecting = false;
    this.marqueeStart = null;
    this.marqueeRect = null;
  }

  sanitizeColorValue(value, fallback = "#000000") {
    if (typeof value !== "string") {
      return fallback;
    }

    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.toLowerCase() === "none") {
      return fallback;
    }

    const colorPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
    return colorPattern.test(trimmed) ? trimmed : fallback;
  }

  sanitizeNumericValue(value, fallback) {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  normalizeGeometryForTransform(element) {
    if (!element || !element.tagName) return;

    const tag = element.tagName.toLowerCase();
    if (tag !== "rect") return;

    let x = Number(element.getAttribute("x"));
    let y = Number(element.getAttribute("y"));

    if (!Number.isFinite(x)) x = 0;
    if (!Number.isFinite(y)) y = 0;

    if (x === 0 && y === 0) return;

    const translation = new DOMMatrix().translate(x, y);
    const transformAttr = element.getAttribute("transform");
    const baseMatrix = transformAttr
      ? new DOMMatrix(transformAttr)
      : new DOMMatrix();
    const combined = baseMatrix.multiply(translation);

    element.setAttribute("x", 0);
    element.setAttribute("y", 0);
    element.setAttribute("transform", combined.toString());
  }

  getTitle() {
    return "選択";
  }

  getInstructions() {
    return [
      "左クリック: オブジェクトを選択",
      "Shift/Ctrl+左クリック: 複数選択",
      "ドラッグ: 選択オブジェクトを移動",
      "中心ハンドルドラッグ: 平行移動",
      "ハンドルをドラッグ: サイズ変更",
      "回転ハンドルをドラッグ: 回転",
      "空白ドラッグ: 矩形選択（非選択時）",
      "Delete: 選択削除",
      "Ctrl+C/V/X: コピー/貼り付け/切り取り",
      "Ctrl+A: すべて選択",
    ];
  }

  getToolProperties() {
    return [
      {
        type: "checkbox",
        label: "リサイズハンドル",
        checkLabel: "表示する",
        value: this.handleOptions.resize,
        onChange: (checked) => {
          this.handleOptions.resize = checked;
          this.refreshHandles();
        },
      },
      {
        type: "checkbox",
        label: "回転ハンドル",
        checkLabel: "表示する",
        value: this.handleOptions.rotate,
        onChange: (checked) => {
          this.handleOptions.rotate = checked;
          this.refreshHandles();
        },
      },
      {
        type: "checkbox",
        label: "中心ハンドル",
        checkLabel: "表示する",
        value: this.handleOptions.translate,
        onChange: (checked) => {
          this.handleOptions.translate = checked;
          this.refreshHandles();
        },
      },
      {
        type: "custom",
        label: "オブジェクトプロパティ",
        render: (container) => this.renderSelectedObjectStyles(container),
      },
    ];
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  refreshHandles() {
    if (this.selectedObject) {
      this.addControlPoints();
    }
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "default";
  }

  deactivate() {
    this.isDragging = this.isResizing = this.isRotating = false; // isRotizing → isRotating
    this.isMarqueeSelecting = false;
    this.marqueeStart = null;
    if (this.marqueeRect && this.marqueeRect.parentNode) {
      this.marqueeRect.parentNode.removeChild(this.marqueeRect);
    }
    this.marqueeRect = null;
    super.deactivate();
  }

  deselectObject(trigger = "deselect") {
    const selections = Array.isArray(window.selectedObjects)
      ? window.selectedObjects
      : [];
    const hasSelection = !!this.selectedObject || selections.length > 0;

    if (!hasSelection) return;
    // 全ての選択されたオブジェクトから点線を削除
    selections.forEach((obj) =>
      obj.removeAttribute("stroke-dasharray")
    );
    this.removeControlPoints();
    this.selectedObject = null;
    window.selectedObject = null;
    window.selectedObjects = [];
    this.isMarqueeSelecting = false;
    this.marqueeStart = null;
    if (this.marqueeRect && this.marqueeRect.parentNode) {
      this.marqueeRect.parentNode.removeChild(this.marqueeRect);
    }
    this.marqueeRect = null;

    if (
      this.toolManager &&
      typeof this.toolManager.restorePreviousTool === "function"
    ) {
      this.toolManager.restorePreviousTool(trigger);
    }
  }

  // 選択されたオブジェクトを削除
  deleteSelectedObjects() {
    if (window.selectedObjects.length === 0) return;

    // 状態を保存
    this.saveState();

    // 選択された全てのオブジェクトを削除
    window.selectedObjects.forEach((obj) => {
      if (obj.parentNode) {
        obj.parentNode.removeChild(obj);
      }
    });

    // コントロールポイントを削除
    this.removeControlPoints();

    // 選択状態をクリア
    this.selectedObject = null;
    window.selectedObject = null;
    window.selectedObjects = [];

    if (
      this.toolManager &&
      typeof this.toolManager.restorePreviousTool === "function"
    ) {
      this.toolManager.restorePreviousTool("deselect");
    }
  }

  // 選択されたオブジェクトをコピー
  copySelectedObjects() {
    if (window.selectedObjects.length === 0) return;

    // クリップボードをクリア
    window.clipboard = [];

    // 選択されたオブジェクトをクローン
    window.selectedObjects.forEach((obj) => {
      window.clipboard.push(obj.cloneNode(true));
    });
  }

  // クリップボードのオブジェクトをペースト
  pasteObjects() {
    if (window.clipboard.length === 0) return;

    // 状態を保存
    this.saveState();

    // 既存の選択を解除
    this.deselectObject("internal");

    const pastedObjects = [];

    // クリップボードからオブジェクトをペースト
    window.clipboard.forEach((obj) => {
      const clone = obj.cloneNode(true);

      // 少しずらして配置（10px右下）
      const currentTransform = clone.getAttribute("transform") || "";
      const offset = new DOMMatrix().translate(10, 10);

      if (currentTransform) {
        const currentMatrix = new DOMMatrix(currentTransform);
        const newMatrix = offset.multiply(currentMatrix);
        clone.setAttribute("transform", newMatrix.toString());
      } else {
        clone.setAttribute("transform", offset.toString());
      }

      // キャンバスに追加
      this.canvas.appendChild(clone);
      pastedObjects.push(clone);
    });

    // ペーストしたオブジェクトを選択
    pastedObjects.forEach((obj, index) => {
      if (index === 0) {
        this.selectObject(obj, false);
      } else {
        this.selectObject(obj, true);
      }
    });

    // クリップボードを更新（連続ペースト用）
    window.clipboard = pastedObjects.map((obj) => obj.cloneNode(true));
  }

  // 選択されたオブジェクトをカット
  cutSelectedObjects() {
    if (window.selectedObjects.length === 0) return;

    // コピーしてから削除
    this.copySelectedObjects();
    this.deleteSelectedObjects();
  }

  // 全てのオブジェクトを選択
  selectAll() {
    // キャンバス内の全ての図形要素を取得
    const allObjects = Array.from(this.canvas.children).filter(
      (el) =>
        !el.classList.contains("control-handle") &&
        !el.classList.contains("rotate-handle") &&
        !el.classList.contains("rotate-line") &&
        !el.classList.contains("translate-handle") &&
        el.tagName !== "defs"
    );

    if (allObjects.length === 0) return;

    // 既存の選択を解除
    this.deselectObject("internal");

    // 全てのオブジェクトを選択
    allObjects.forEach((obj, index) => {
      if (index === 0) {
        this.selectObject(obj, false);
      } else {
        this.selectObject(obj, true);
      }
    });
  }

  // マウスダウン時の処理
  handleMouseDown(event) {
    super.handleMouseDown(event);
    // まずすべてリセット
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false; // isRotizing → isRotating
    this.resizeHandle = null;
    this.currentPoint = this.getSVGPoint(event);
    this.multiInitialMatrices = [];

    // Shift/Ctrlキーの状態を取得
    const isMultiSelect = event.shiftKey || event.ctrlKey;

    // 状態を保存
    this.saveState();

    // リサイズハンドルなら
    if (
      event.target.classList &&
      event.target.classList.contains("control-handle")
    ) {
      this.isResizing = true;
      this.resizeHandle = event.target;
      this.normalizeGeometryForTransform(this.selectedObject);
      this.initialMatrix = this.selectedObject.getCTM() || new DOMMatrix();
      this.initialBBox = this.selectedObject.getBBox();

      // 固定点（ハンドルの対角）を計算
      const cls = this.resizeHandle.classList;
      let opp = { x: 0, y: 0 };
      if (cls.contains("nw")) {
        opp = {
          x: this.initialBBox.x + this.initialBBox.width,
          y: this.initialBBox.y + this.initialBBox.height,
        };
      } else if (cls.contains("ne")) {
        opp = {
          x: this.initialBBox.x,
          y: this.initialBBox.y + this.initialBBox.height,
        };
      } else if (cls.contains("sw")) {
        opp = {
          x: this.initialBBox.x + this.initialBBox.width,
          y: this.initialBBox.y,
        };
      } else {
        // se
        opp = { x: this.initialBBox.x, y: this.initialBBox.y };
      }
      // ローカル→グローバル
      const pt = this.canvas.createSVGPoint();
      pt.x = opp.x;
      pt.y = opp.y;
      this.fixedPoint = pt.matrixTransform(this.selectedObject.getCTM());
      // 開始ベクトル
      this.startVector = {
        x: this.currentPoint.x - this.fixedPoint.x,
        y: this.currentPoint.y - this.fixedPoint.y,
      };
      return;
    }

    if (
      event.target.classList &&
      event.target.classList.contains("translate-handle")
    ) {
      if (window.selectedObjects.length > 1) {
        this.multiInitialMatrices = window.selectedObjects.map(
          (obj) => obj.getCTM() || new DOMMatrix()
        );
      } else if (this.selectedObject) {
        this.initialMatrix = this.selectedObject.getCTM() || new DOMMatrix();
      }
      this.startPoint = { ...this.currentPoint };
      this.isDragging = true;
      return;
    }

    // 回転ハンドルなら
    if (
      event.target.classList &&
      event.target.classList.contains("rotate-handle")
    ) {
      this.isRotating = true; // ここも修正
      this.initialMatrix = this.selectedObject.getCTM() || new DOMMatrix();
      // 回転中心はバウンディングボックスの中心
      const bb = this.selectedObject.getBBox();
      const center = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
      const pt = this.canvas.createSVGPoint();
      pt.x = center.x;
      pt.y = center.y;
      this.fixedPoint = pt.matrixTransform(this.selectedObject.getCTM());
      // 開始角度
      const dx = this.currentPoint.x - this.fixedPoint.x;
      const dy = this.currentPoint.y - this.fixedPoint.y;
      this.startAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
      return;
    }

    // 図形本体クリックならドラッグ開始
    if (event.target !== this.canvas) {
      this.selectObject(event.target, isMultiSelect);
      this.isDragging = true;

      // 複数選択の場合は各オブジェクトの初期状態を保存
      if (window.selectedObjects.length > 1) {
        this.multiInitialMatrices = window.selectedObjects.map(obj =>
          obj.getCTM() || new DOMMatrix()
        );
      } else {
        this.initialMatrix = this.selectedObject.getCTM() || new DOMMatrix();
      }
      this.startPoint = { ...this.currentPoint };
    } else {
      // キャンバスクリック時は複数選択でなければ選択解除し、矩形選択を開始
      if (!isMultiSelect && window.selectedObjects.length > 0) {
        this.deselectObject();
        return;
      }

      if (window.selectedObjects.length === 0) {
        this.startMarqueeSelection(this.currentPoint);
      }
    }
  }

  handleMouseMove(event) {
    // スーパークラスの処理を呼び出し
    super.handleMouseMove(event);

    // 現在位置を更新
    this.currentPoint = this.getSVGPoint(event);

    if (this.isMarqueeSelecting) {
      this.updateMarqueeSelection(this.currentPoint);
      return;
    }

    if (this.isResizing) {
      this.resizeObject();
      return;
    }
    if (this.isRotating) {
      // isRotizing → isRotating
      this.rotateObject();
      return;
    }
    if (this.isDragging) {
      this.moveObject();
    }
  }

  handleMouseUp(event) {
    if (this.isMarqueeSelecting) {
      this.finalizeMarqueeSelection();
      return;
    }

    this.isDragging = this.isResizing = this.isRotating = false; // isRotizing → isRotating
    this.resizeHandle = null;
    this.multiInitialMatrices = [];
    if (this.selectedObject) this.addControlPoints();
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      if (this.isDragging || this.isResizing || this.isRotating) {
        this.isDragging = this.isResizing = this.isRotating = false;
        this.resizeHandle = null;
      }

      this.deselectObject("cancel");
    }
  }

  selectObject(el, addToSelection = false) {
    // コントロールポイントやキャンバス自体は選択対象外
    if (
      !el ||
      el === this.canvas ||
      el.classList.contains("control-handle") ||
      el.classList.contains("rotate-handle") ||
      el.classList.contains("rotate-line") ||
      el.classList.contains("translate-handle")
    ) {
      return;
    }

    // レイヤーがロックされているかチェック
    const layerId = parseInt(el.getAttribute("data-layer"));
    if (layerId) {
      const layer = window.layers.find((l) => l.id === layerId);
      if (layer && layer.locked) {
        console.log(`レイヤー "${layer.name}" はロックされています`);
        return;
      }
    }

    if (addToSelection) {
      // 追加選択モード
      const index = window.selectedObjects.indexOf(el);
      if (index >= 0) {
        // 既に選択されている場合は選択解除
        el.removeAttribute("stroke-dasharray");
        window.selectedObjects.splice(index, 1);
        if (window.selectedObjects.length === 0) {
          this.selectedObject = null;
          window.selectedObject = null;
          this.removeControlPoints();
        } else {
          this.selectedObject = window.selectedObjects[0];
          window.selectedObject = this.selectedObject;
          this.addControlPoints();
        }
      } else {
        // 新しく追加
        el.setAttribute("stroke-dasharray", "5 5");
      window.selectedObjects.push(el);
      this.selectedObject = el;
      window.selectedObject = el;
      this.addControlPoints();
    }
    } else {
      // 単一選択モード（既存の選択をクリア）
      if (this.selectedObject) {
        window.selectedObjects.forEach((obj) =>
          obj.removeAttribute("stroke-dasharray")
        );
        this.removeControlPoints();
      }
      this.selectedObject = el;
      el.setAttribute("stroke-dasharray", "5 5");
      window.selectedObject = el;
      window.selectedObjects = [el];

      this.addControlPoints();

      // 右ペインのツールプロパティパネルを更新
      this.updatePanel();
    }
  }

  // 移動処理
  moveObject() {
    if (!this.isDragging || !this.selectedObject || !this.startPoint) return;
    const dx = this.currentPoint.x - this.startPoint.x;
    const dy = this.currentPoint.y - this.startPoint.y;
    if (!isFinite(dx) || !isFinite(dy)) return;

    // 複数選択の場合は全てのオブジェクトを移動
    if (window.selectedObjects.length > 1) {
      window.selectedObjects.forEach((obj, index) => {
        const initialMatrix =
          this.multiInitialMatrices[index] || new DOMMatrix();
        const delta = new DOMMatrix().translate(dx, dy);
        const m = delta.multiply(initialMatrix);
        if (![m.a, m.b, m.c, m.d, m.e, m.f].every(isFinite)) return;
        obj.setAttribute("transform", m.toString());
      });
    } else {
      const delta = new DOMMatrix().translate(dx, dy);
      const m = delta.multiply(this.initialMatrix);
      if (![m.a, m.b, m.c, m.d, m.e, m.f].every(isFinite)) return;
      this.selectedObject.setAttribute("transform", m.toString());
    }
  }

  // 回転処理
  rotateObject() {
    if (!this.isRotating || !this.fixedPoint || !this.selectedObject) return;
    const dx = this.currentPoint.x - this.fixedPoint.x;
    const dy = this.currentPoint.y - this.fixedPoint.y;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const delta = angle - this.startAngle;
    if (!isFinite(delta)) return;
    const m = new DOMMatrix()
      .translate(this.fixedPoint.x, this.fixedPoint.y)
      .rotate(delta)
      .translate(-this.fixedPoint.x, -this.fixedPoint.y)
      .multiply(this.initialMatrix);
    if (![m.a, m.b, m.c, m.d, m.e, m.f].every(isFinite)) return;
    this.selectedObject.setAttribute("transform", m.toString());
  }

  // リサイズ処理
  resizeObject() {
    if (
      !this.isResizing ||
      !this.fixedPoint ||
      !this.startVector ||
      !this.selectedObject
    )
      return;
    const vx = this.currentPoint.x - this.fixedPoint.x;
    const vy = this.currentPoint.y - this.fixedPoint.y;
    let sx = vx / this.startVector.x;
    let sy = vy / this.startVector.y;

    // スケール値が小さすぎる場合は制限
    if (Math.abs(sx) < 0.1) sx = Math.sign(sx) * 0.1;
    if (Math.abs(sy) < 0.1) sy = Math.sign(sy) * 0.1;

    if (!isFinite(sx) || !isFinite(sy)) return;
    const m = new DOMMatrix()
      .translate(this.fixedPoint.x, this.fixedPoint.y)
      .scale(sx, sy)
      .translate(-this.fixedPoint.x, -this.fixedPoint.y)
      .multiply(this.initialMatrix);
    if (![m.a, m.b, m.c, m.d, m.e, m.f].every(isFinite)) return;
    this.selectedObject.setAttribute("transform", m.toString());
  }

  // SVGPoint を取得
  getSVGPoint(event) {
    const zoomManager = window.zoomPanManager;

    if (zoomManager) {
      const rect = this.canvas.getBoundingClientRect();
      const transform =
        typeof zoomManager.getTransform === "function"
          ? zoomManager.getTransform()
          : {
              zoom: zoomManager.zoom || 1,
            };

      const zoom = transform && Number.isFinite(transform.zoom)
        ? transform.zoom || 1
        : 1;

      return {
        x: (event.clientX - rect.left) / zoom,
        y: (event.clientY - rect.top) / zoom,
      };
    }

    const pt = this.canvas.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const ctm = this.canvas.getScreenCTM();

    if (ctm && typeof ctm.inverse === "function") {
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    }

    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  // ローカル座標→グローバル座標
  localToGlobal(pt) {
    const svgPt = this.canvas.createSVGPoint();
    svgPt.x = pt.x;
    svgPt.y = pt.y;
    return svgPt.matrixTransform(this.initialMatrix);
  }

  addControlPoints() {
    if (!this.selectedObject) return;
    this.removeControlPoints();
    const bb = this.selectedObject.getBBox();
    const handles = [
      { x: bb.x, y: bb.y, cls: "nw", cursor: "nwse-resize" },
      { x: bb.x + bb.width, y: bb.y, cls: "ne", cursor: "nesw-resize" },
      { x: bb.x, y: bb.y + bb.height, cls: "sw", cursor: "nesw-resize" },
      {
        x: bb.x + bb.width,
        y: bb.y + bb.height,
        cls: "se",
        cursor: "nwse-resize",
      },
    ];

    // SVG要素の変換を取得
    const ctm = this.selectedObject.getCTM() || new DOMMatrix();

    // ハンドルを追加（変換を適用）
    if (this.handleOptions.resize) {
      handles.forEach((h) => {
        // ローカル座標→グローバル座標に変換
        const pt = this.canvas.createSVGPoint();
        pt.x = h.x;
        pt.y = h.y;
        const transformed = pt.matrixTransform(ctm);

        const r = document.createElementNS(this.svgNS, "rect");
        r.setAttribute("x", transformed.x - 4);
        r.setAttribute("y", transformed.y - 4);
        r.setAttribute("width", 8);
        r.setAttribute("height", 8);
        r.setAttribute("fill", "white");
        r.setAttribute("stroke", "black");
        r.setAttribute("cursor", h.cursor);
        r.classList.add("control-handle", h.cls);
        this.canvas.appendChild(r);
      });
    }

    // 回転中心とハンドル位置を計算（変換適用）
    const center = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    const topCenter = { x: bb.x + bb.width / 2, y: bb.y };

    const ptCenter = this.canvas.createSVGPoint();
    ptCenter.x = center.x;
    ptCenter.y = center.y;
    const transformedCenter = ptCenter.matrixTransform(ctm);

    const ptTop = this.canvas.createSVGPoint();
    ptTop.x = topCenter.x;
    ptTop.y = topCenter.y;
    const transformedTop = ptTop.matrixTransform(ctm);

    // 回転ハンドル位置を計算
    const rotateHandleOffset = 20; // 回転ハンドルの距離
    const dx = transformedTop.x - transformedCenter.x;
    const dy = transformedTop.y - transformedCenter.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len;
    const uy = dy / len;

    const rotHandlePos = {
      x: transformedCenter.x + ux * (len + rotateHandleOffset),
      y: transformedCenter.y + uy * (len + rotateHandleOffset),
    };

    // 回転ハンドル
    if (this.handleOptions.rotate) {
      const rot = document.createElementNS(this.svgNS, "circle");
      rot.setAttribute("cx", rotHandlePos.x);
      rot.setAttribute("cy", rotHandlePos.y);
      rot.setAttribute("r", 5);
      rot.setAttribute("fill", "white");
      rot.setAttribute("stroke", "black");
      rot.setAttribute("cursor", "pointer");
      rot.classList.add("rotate-handle");
      this.canvas.appendChild(rot);

      // 回転ハンドルへの線
      const line = document.createElementNS(this.svgNS, "line");
      line.setAttribute("x1", transformedCenter.x);
      line.setAttribute("y1", transformedCenter.y);
      line.setAttribute("x2", rotHandlePos.x);
      line.setAttribute("y2", rotHandlePos.y);
      line.setAttribute("stroke", "black");
      line.setAttribute("stroke-dasharray", "2 2");
      line.classList.add("rotate-line");
      this.canvas.appendChild(line);
    }

    if (this.handleOptions.translate) {
      const translateHandle = document.createElementNS(this.svgNS, "circle");
      translateHandle.setAttribute("cx", transformedCenter.x);
      translateHandle.setAttribute("cy", transformedCenter.y);
      translateHandle.setAttribute("r", 6);
      translateHandle.setAttribute("fill", "#ffffff");
      translateHandle.setAttribute("stroke", "#4a90e2");
      translateHandle.setAttribute("stroke-width", "1.5");
      translateHandle.setAttribute("cursor", "move");
      translateHandle.classList.add("translate-handle");
      this.canvas.appendChild(translateHandle);
    }
  }

  removeControlPoints() {
    document
      .querySelectorAll(
        ".control-handle, .rotate-handle, .rotate-line, .translate-handle"
      )
      .forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
  }

  startMarqueeSelection(point) {
    this.isMarqueeSelecting = true;
    this.marqueeStart = { ...point };
    if (this.marqueeRect && this.marqueeRect.parentNode) {
      this.marqueeRect.parentNode.removeChild(this.marqueeRect);
    }
    this.marqueeRect = document.createElementNS(this.svgNS, "rect");
    this.marqueeRect.classList.add("marquee-selection");
    this.marqueeRect.setAttribute("x", point.x);
    this.marqueeRect.setAttribute("y", point.y);
    this.marqueeRect.setAttribute("width", 0);
    this.marqueeRect.setAttribute("height", 0);
    this.canvas.appendChild(this.marqueeRect);
  }

  updateMarqueeSelection(point) {
    if (!this.isMarqueeSelecting || !this.marqueeRect || !this.marqueeStart) {
      return;
    }

    const x = Math.min(this.marqueeStart.x, point.x);
    const y = Math.min(this.marqueeStart.y, point.y);
    const width = Math.abs(this.marqueeStart.x - point.x);
    const height = Math.abs(this.marqueeStart.y - point.y);

    this.marqueeRect.setAttribute("x", x);
    this.marqueeRect.setAttribute("y", y);
    this.marqueeRect.setAttribute("width", width);
    this.marqueeRect.setAttribute("height", height);
  }

  finalizeMarqueeSelection() {
    if (!this.isMarqueeSelecting) {
      return;
    }

    this.isMarqueeSelecting = false;

    if (!this.marqueeRect) {
      return;
    }

    const rect = {
      x: parseFloat(this.marqueeRect.getAttribute("x")) || 0,
      y: parseFloat(this.marqueeRect.getAttribute("y")) || 0,
      width: parseFloat(this.marqueeRect.getAttribute("width")) || 0,
      height: parseFloat(this.marqueeRect.getAttribute("height")) || 0,
    };

    if (this.marqueeRect.parentNode) {
      this.marqueeRect.parentNode.removeChild(this.marqueeRect);
    }
    this.marqueeRect = null;
    this.marqueeStart = null;

    if (rect.width < 2 || rect.height < 2) {
      return;
    }

    const objects = Array.from(this.canvas.children).filter((el) => {
      if (
        !el ||
        el.classList.contains("control-handle") ||
        el.classList.contains("rotate-handle") ||
        el.classList.contains("rotate-line") ||
        el.classList.contains("translate-handle") ||
        el.classList.contains("marquee-selection") ||
        el.tagName === "defs"
      ) {
        return false;
      }

      const layerId = parseInt(el.getAttribute("data-layer"));
      if (layerId) {
        const layers = Array.isArray(window.layers) ? window.layers : [];
        const layer = layers.find((l) => l.id === layerId);
        if (layer && layer.locked) {
          return false;
        }
      }

      const bbox = this.getBoundingBox(el);
      if (!bbox) return false;

      const withinX =
        bbox.x >= rect.x && bbox.x + bbox.width <= rect.x + rect.width;
      const withinY =
        bbox.y >= rect.y && bbox.y + bbox.height <= rect.y + rect.height;

      return withinX && withinY;
    });

    if (objects.length === 0) {
      return;
    }

    const previousSelection = Array.isArray(window.selectedObjects)
      ? window.selectedObjects
      : [];
    previousSelection.forEach((obj) =>
      obj.removeAttribute("stroke-dasharray")
    );

    window.selectedObjects = [];
    objects.forEach((obj) => {
      obj.setAttribute("stroke-dasharray", "5 5");
      window.selectedObjects.push(obj);
    });

    this.selectedObject = window.selectedObjects[0];
    window.selectedObject = this.selectedObject;
    this.addControlPoints();
  }

  getBoundingBox(obj) {
    try {
      const bb = obj.getBBox();
      const ctm = obj.getCTM() || new DOMMatrix();
      if (ctm.isIdentity) return bb;
      const pts = [
        new DOMPoint(bb.x, bb.y),
        new DOMPoint(bb.x + bb.width, bb.y),
        new DOMPoint(bb.x + bb.width, bb.y + bb.height),
        new DOMPoint(bb.x, bb.y + bb.height),
      ].map((pt) => pt.matrixTransform(ctm));
      const xs = pts.map((p) => p.x),
        ys = pts.map((p) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      };
    } catch (e) {
      console.error("バウンディングボックスの取得に失敗しました", e);
      // フォールバック処理
      return null;
    }
  }

  renderSelectedObjectStyles(container) {
    const selectedObj = window.selectedObject;

    if (!selectedObj || window.selectedObjects.length !== 1) {
      const empty = document.createElement("div");
      empty.textContent = "オブジェクトを選択すると編集できます";
      empty.style.fontSize = "12px";
      empty.style.color = "#666";
      container.appendChild(empty);
      return;
    }

    const style = window.SvgUtils.getElementStyle(selectedObj);

    const wrapper = document.createElement("div");
    wrapper.style.display = "flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.gap = "8px";
    wrapper.style.marginTop = "10px";

    // 線色
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
      selectedObj.setAttribute("stroke", event.target.value);
      this.saveState();
    });
    strokeRow.appendChild(strokeInput);
    wrapper.appendChild(strokeRow);

    // 線幅
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
      selectedObj.setAttribute("stroke-width", Number.isFinite(width) ? width : 1);
      this.saveState();
    });
    widthRow.appendChild(widthInput);
    wrapper.appendChild(widthRow);

    // 線スタイル
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
    const currentStyle = this.getStrokeStyleKey(selectedObj);
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
      this.applyStrokeStyle(selectedObj, event.target.value);
      this.saveState();
      this.updatePanel();
    });
    dashRow.appendChild(dashSelect);
    wrapper.appendChild(dashRow);

    // 塗り色
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
      selectedObj.setAttribute("fill", event.target.value);
      this.saveState();
    });
    fillRow.appendChild(fillInput);
    wrapper.appendChild(fillRow);

    // 不透明度
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
      selectedObj.setAttribute("opacity", value);
      this.saveState();
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

  getStrokeStyleKey(element) {
    if (!element) return "solid";

    const dashArray = element.getAttribute("stroke-dasharray");
    if (!dashArray || dashArray === "none") return "solid";

    const normalized = dashArray.trim().replace(/\s+/g, " ");

    if (window.StyleUtils && window.StyleUtils.LINE_STYLES) {
      for (const [key, pattern] of Object.entries(window.StyleUtils.LINE_STYLES)) {
        if (pattern === normalized) {
          return key;
        }
      }
    }

    if (normalized.includes("5 5") || normalized.includes("10 10")) {
      return "dashed";
    }
    if (normalized.includes("2 2") || normalized.includes("1 1")) {
      return "dotted";
    }

    return "solid";
  }

  applyStrokeStyle(element, styleKey) {
    if (!element) return;

    if (styleKey === "solid") {
      element.removeAttribute("stroke-dasharray");
      return;
    }

    if (window.StyleUtils && window.StyleUtils.LINE_STYLES) {
      const pattern = window.StyleUtils.LINE_STYLES[styleKey];
      if (pattern) {
        element.setAttribute("stroke-dasharray", pattern);
        return;
      }
    }

    const fallbackPatterns = {
      dashed: "10 10",
      dotted: "2 2",
    };

    const pattern = fallbackPatterns[styleKey];
    if (pattern) {
      element.setAttribute("stroke-dasharray", pattern);
    }
  }
}

window.SelectTool = SelectTool;
