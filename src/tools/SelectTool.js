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
  }

  getTitle() {
    return "選択";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "default";
  }

  deactivate() {
    this.isDragging = this.isResizing = this.isRotating = false; // isRotizing → isRotating
    super.deactivate();
  }

  deselectObject() {
    if (!this.selectedObject) return;
    this.selectedObject.removeAttribute("stroke-dasharray");
    this.removeControlPoints();
    this.selectedObject = null;
    window.selectedObject = null;
    window.selectedObjects = [];
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

    // 状態を保存
    this.saveState();

    // リサイズハンドルなら
    if (
      event.target.classList &&
      event.target.classList.contains("control-handle")
    ) {
      this.isResizing = true;
      this.resizeHandle = event.target;
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
      this.selectObject(event.target);
      this.isDragging = true;
      this.initialMatrix = this.selectedObject.getCTM() || new DOMMatrix();
      this.startPoint = { ...this.currentPoint };
    } else {
      this.deselectObject();
    }
  }

  handleMouseMove(event) {
    // スーパークラスの処理を呼び出し
    super.handleMouseMove(event);

    // 現在位置を更新
    this.currentPoint = this.getSVGPoint(event);

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
    this.isDragging = this.isResizing = this.isRotating = false; // isRotizing → isRotating
    this.resizeHandle = null;
    if (this.selectedObject) this.addControlPoints();
  }

  selectObject(el) {
    if (this.selectedObject) {
      this.selectedObject.removeAttribute("stroke-dasharray");
      this.removeControlPoints();
    }
    this.selectedObject = el;
    el.setAttribute("stroke-dasharray", "5 5");
    window.selectedObject = el;
    window.selectedObjects = [el];

    // スタイルを反映
    if (document.getElementById("fill-color")) {
      document.getElementById("fill-color").value =
        el.getAttribute("fill") || "#ffffff";
    }
    if (document.getElementById("stroke-color")) {
      document.getElementById("stroke-color").value =
        el.getAttribute("stroke") || "#000000";
    }
    if (document.getElementById("stroke-width")) {
      document.getElementById("stroke-width").value =
        el.getAttribute("stroke-width") || "2";
    }
    if (document.getElementById("opacity-input")) {
      document.getElementById("opacity-input").value =
        el.getAttribute("opacity") || "1";
    }

    this.addControlPoints();
  }

  // 移動処理
  moveObject() {
    if (!this.isDragging || !this.selectedObject || !this.startPoint) return;
    const dx = this.currentPoint.x - this.startPoint.x;
    const dy = this.currentPoint.y - this.startPoint.y;
    if (!isFinite(dx) || !isFinite(dy)) return;
    const delta = new DOMMatrix().translate(dx, dy);
    const m = delta.multiply(this.initialMatrix);
    if (![m.a, m.b, m.c, m.d, m.e, m.f].every(isFinite)) return;
    this.selectedObject.setAttribute("transform", m.toString());
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
    const pt = this.canvas.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    return pt.matrixTransform(this.canvas.getScreenCTM().inverse());
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

  removeControlPoints() {
    document
      .querySelectorAll(".control-handle, .rotate-handle, .rotate-line")
      .forEach((el) => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });
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
}

window.SelectTool = SelectTool;
