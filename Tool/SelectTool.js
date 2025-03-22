class SelectTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedObject = null;
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.resizeHandle = null;
    this.transformOrigin = { x: 0, y: 0 };
    this.initialTransform = ""; // ドラッグ開始時の変換情報を保存
    this.initialBBox = null; // ドラッグ開始時のバウンディングボックスを保存
  }

  getTitle() {
    return "選択";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "default";
  }

  deactivate() {
    // 選択状態は維持する
    this.isActive = false;
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
  }

  // 選択の解除
  deselectObject() {
    if (this.selectedObject) {
      this.selectedObject.removeAttribute("stroke-dasharray");
      this.removeControlPoints();
      this.selectedObject = null;
      window.selectedObject = null;
      window.selectedObjects = [];
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    // リサイズハンドルの場合
    if (
      event.target.classList &&
      event.target.classList.contains("control-handle")
    ) {
      this.saveState();
      this.isResizing = true;
      this.resizeHandle = event.target;
      // 操作開始時の transform とバウンディングボックスを保存
      if (this.selectedObject) {
        this.initialTransform =
          this.selectedObject.getAttribute("transform") || "";
        this.initialBBox = this.getBoundingBox(this.selectedObject);
      }
      return;
    }

    // 回転ハンドルの場合
    if (
      event.target.classList &&
      event.target.classList.contains("rotate-handle")
    ) {
      this.saveState();
      this.isRotating = true;
      // 回転開始前の transform を保存
      this.initialTransform =
        this.selectedObject.getAttribute("transform") || "";

      // オブジェクトのローカルバウンディングボックスの中心を求める
      const bbox = this.selectedObject.getBBox();
      const pt = this.canvas.createSVGPoint();
      pt.x = bbox.x + bbox.width / 2;
      pt.y = bbox.y + bbox.height / 2;
      // getCTM() を使ってグローバル座標系に変換
      const ctm = this.selectedObject.getCTM();
      if (ctm) {
        const globalCenter = pt.matrixTransform(ctm);
        this.fixedTransformOrigin = { x: globalCenter.x, y: globalCenter.y };
      } else {
        this.fixedTransformOrigin = { x: pt.x, y: pt.y };
      }

      // 固定中心と現在のマウス位置から開始角度を計算（度数法）
      const dx = this.currentPoint.x - this.fixedTransformOrigin.x;
      const dy = this.currentPoint.y - this.fixedTransformOrigin.y;
      this.startAngle = Math.atan2(dy, dx) * (180 / Math.PI);

      // transform 属性から既存の回転角度を抽出（matrix 形式も対応）
      const currentTransform =
        this.selectedObject.getAttribute("transform") || "";
      if (currentTransform.startsWith("matrix(")) {
        const values = currentTransform
          .slice(7, currentTransform.length - 1)
          .split(/[\s,]+/)
          .map((val) => parseFloat(val));
        this.initialRotation =
          Math.atan2(values[1], values[0]) * (180 / Math.PI);
      } else {
        const rotateMatch = currentTransform.match(/rotate\(\s*([-\d.]+)/);
        this.initialRotation = rotateMatch ? parseFloat(rotateMatch[1]) : 0;
      }
      return;
    }

    // クリック対象がキャンバス以外の場合はオブジェクトを選択して移動開始
    if (event.target !== this.canvas) {
      this.selectObject(event.target);
      this.isDragging = true;
      if (this.selectedObject) {
        this.initialTransform =
          this.selectedObject.getAttribute("transform") || "";
        this.initialBBox = this.getBoundingBox(this.selectedObject);
      }
      // 初回ドラッグ時の開始座標を記録
      this.startPoint = { ...this.currentPoint };
    } else {
      this.deselectObject();
    }
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    // リサイズ処理
    if (this.isResizing) {
      this.resizeObject();
      return;
    }

    // 回転処理
    if (this.isRotating) {
      this.rotateObject();
      return;
    }

    // 移動処理
    if (this.isDragging && this.selectedObject) {
      const dx = this.currentPoint.x - this.startPoint.x;
      const dy = this.currentPoint.y - this.startPoint.y;
      this.moveObject(this.selectedObject, dx, dy);
      // 継続的なドラッグのため、開始点を更新
      this.startPoint = { ...this.currentPoint };
    }
  }

  handleMouseUp(event) {
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.resizeHandle = null;

    // 移動、回転、リサイズ完了後に control points を更新
    if (this.selectedObject) {
      this.addControlPoints();
    }
  }

  selectObject(element) {
    // 既存の選択を解除
    if (this.selectedObject) {
      this.selectedObject.removeAttribute("stroke-dasharray");
      this.removeControlPoints();
    }

    this.selectedObject = element;
    this.selectedObject.setAttribute("stroke-dasharray", "5 5");

    // グローバル変数を更新（連携用）
    window.selectedObject = element;
    window.selectedObjects = [element];

    // スタイルを反映
    if (document.getElementById("fill-color")) {
      document.getElementById("fill-color").value =
        element.getAttribute("fill") || "#ffffff";
    }
    if (document.getElementById("stroke-color")) {
      document.getElementById("stroke-color").value =
        element.getAttribute("stroke") || "#000000";
    }
    if (document.getElementById("stroke-width")) {
      document.getElementById("stroke-width").value =
        element.getAttribute("stroke-width") || "2";
    }
    if (document.getElementById("opacity-input")) {
      document.getElementById("opacity-input").value =
        element.getAttribute("opacity") || "1";
    }

    // コントロールポイントを追加
    this.addControlPoints();
  }

  // オブジェクト移動 - 変換行列を考慮した改良版
  moveObject(obj, dx, dy) {
    if (!obj) return;
    // 現在の transform 属性を DOMMatrix に変換（失敗したら単位行列）
    let currentTransformStr = obj.getAttribute("transform") || "";
    let currentMatrix;
    try {
      currentMatrix = new DOMMatrix(currentTransformStr);
    } catch (e) {
      currentMatrix = new DOMMatrix();
    }
    // translate の行列を作成
    const translationMatrix = new DOMMatrix().translate(dx, dy);
    // 新しい行列は、translate 行列と既存行列の合成
    const newMatrix = translationMatrix.multiply(currentMatrix);
    obj.setAttribute("transform", newMatrix.toString());
  }

  // リサイズ処理
  resizeObject() {
    if (!this.selectedObject || !this.resizeHandle) return;

    // 初期バウンディングボックスは操作開始時に保存している前提（this.initialBBox）
    const bbox = this.initialBBox;
    let fixedPoint = { x: 0, y: 0 };

    // ハンドルの種類に応じた固定点（反対側の角）を設定
    if (this.resizeHandle.classList.contains("nw")) {
      fixedPoint = { x: bbox.x + bbox.width, y: bbox.y + bbox.height };
    } else if (this.resizeHandle.classList.contains("se")) {
      fixedPoint = { x: bbox.x, y: bbox.y };
    } else if (this.resizeHandle.classList.contains("ne")) {
      fixedPoint = { x: bbox.x, y: bbox.y + bbox.height };
    } else if (this.resizeHandle.classList.contains("sw")) {
      fixedPoint = { x: bbox.x + bbox.width, y: bbox.y };
    }

    // マウスの現在位置と固定点から新サイズを決定
    let scaleX = 1,
      scaleY = 1;
    if (this.resizeHandle.classList.contains("nw")) {
      const newWidth = fixedPoint.x - this.currentPoint.x;
      const newHeight = fixedPoint.y - this.currentPoint.y;
      scaleX = newWidth / bbox.width;
      scaleY = newHeight / bbox.height;
    } else if (this.resizeHandle.classList.contains("se")) {
      const newWidth = this.currentPoint.x - fixedPoint.x;
      const newHeight = this.currentPoint.y - fixedPoint.y;
      scaleX = newWidth / bbox.width;
      scaleY = newHeight / bbox.height;
    } else if (this.resizeHandle.classList.contains("ne")) {
      const newWidth = this.currentPoint.x - fixedPoint.x;
      const newHeight = fixedPoint.y - this.currentPoint.y;
      scaleX = newWidth / bbox.width;
      scaleY = newHeight / bbox.height;
    } else if (this.resizeHandle.classList.contains("sw")) {
      const newWidth = fixedPoint.x - this.currentPoint.x;
      const newHeight = this.currentPoint.y - fixedPoint.y;
      scaleX = newWidth / bbox.width;
      scaleY = newHeight / bbox.height;
    }

    // 最小スケール値を適用（必要に応じて調整）
    if (scaleX < 0.1) scaleX = 0.1;
    if (scaleY < 0.1) scaleY = 0.1;

    // 固定点を基準にスケール行列を作成
    const toFixedPoint = new DOMMatrix().translate(
      -fixedPoint.x,
      -fixedPoint.y
    );
    const scalingMatrix = new DOMMatrix().scale(scaleX, scaleY);
    const backFromFixedPoint = new DOMMatrix().translate(
      fixedPoint.x,
      fixedPoint.y
    );
    const compositeScaling = backFromFixedPoint
      .multiply(scalingMatrix)
      .multiply(toFixedPoint);

    // 初期の transform 属性（操作開始前の状態）を DOMMatrix に変換
    let initialMatrix;
    try {
      initialMatrix = new DOMMatrix(this.initialTransform || "");
    } catch (e) {
      initialMatrix = new DOMMatrix();
    }

    // 合成した行列を適用
    const newMatrix = initialMatrix.multiply(compositeScaling);
    this.selectedObject.setAttribute("transform", newMatrix.toString());

    // 必要に応じて、リサイズ中は control points の再描画は控える
  }

  // 回転処理
  rotateObject() {
    if (!this.selectedObject) return;

    const origin = this.fixedTransformOrigin; // 固定したグローバル中心
    // 現在のマウス位置から角度を計算
    const dx = this.currentPoint.x - origin.x;
    const dy = this.currentPoint.y - origin.y;
    const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);

    // 回転開始時との差分を加算して新角度を求める
    const deltaAngle = currentAngle - this.startAngle;
    const newAngle = this.initialRotation + deltaAngle;

    // 回転行列の作成：固定中心で回転するため、原点移動 → 回転 → 元に戻す
    const toOrigin = new DOMMatrix().translate(-origin.x, -origin.y);
    const rotationMatrix = new DOMMatrix().rotate(newAngle);
    const backToOrigin = new DOMMatrix().translate(origin.x, origin.y);
    const compositeRotation = backToOrigin
      .multiply(rotationMatrix)
      .multiply(toOrigin);

    // 初期状態の transform を DOMMatrix に変換
    let initialMatrix;
    try {
      initialMatrix = new DOMMatrix(this.initialTransform || "");
    } catch (e) {
      initialMatrix = new DOMMatrix();
    }

    // 合成した行列を適用
    const newMatrix = initialMatrix.multiply(compositeRotation);
    this.selectedObject.setAttribute("transform", newMatrix.toString());

    // ドラッグ中は頻繁な control points の再描画は控える
  }

  // コントロールポイント（ハンドル）の追加
  addControlPoints() {
    if (!this.selectedObject) return;

    // 一旦既存のコントロールポイントを削除
    this.removeControlPoints();

    // オブジェクトのバウンディングボックスを取得
    let bbox = this.getBoundingBox(this.selectedObject);
    if (!bbox) return;

    // 変形の中心点
    this.transformOrigin = {
      x: bbox.x + bbox.width / 2,
      y: bbox.y + bbox.height / 2,
    };

    // リサイズハンドルの位置
    const handlePositions = [
      { x: bbox.x, y: bbox.y, cursor: "nwse-resize", class: "nw" },
      { x: bbox.x + bbox.width, y: bbox.y, cursor: "nesw-resize", class: "ne" },
      {
        x: bbox.x,
        y: bbox.y + bbox.height,
        cursor: "nesw-resize",
        class: "sw",
      },
      {
        x: bbox.x + bbox.width,
        y: bbox.y + bbox.height,
        cursor: "nwse-resize",
        class: "se",
      },
    ];

    // リサイズハンドルを追加
    handlePositions.forEach((pos) => {
      const handle = document.createElementNS(this.svgNS, "rect");
      handle.setAttribute("x", pos.x - 4);
      handle.setAttribute("y", pos.y - 4);
      handle.setAttribute("width", 8);
      handle.setAttribute("height", 8);
      handle.setAttribute("fill", "white");
      handle.setAttribute("stroke", "black");
      handle.setAttribute("cursor", pos.cursor);
      handle.classList.add("control-handle", pos.class);
      this.canvas.appendChild(handle);
    });

    // 回転ハンドル
    const rotateHandle = document.createElementNS(this.svgNS, "circle");
    rotateHandle.setAttribute("cx", bbox.x + bbox.width / 2);
    rotateHandle.setAttribute("cy", bbox.y - 20);
    rotateHandle.setAttribute("r", 5);
    rotateHandle.setAttribute("fill", "white");
    rotateHandle.setAttribute("stroke", "black");
    rotateHandle.setAttribute("cursor", "pointer");
    rotateHandle.classList.add("rotate-handle");
    this.canvas.appendChild(rotateHandle);

    // 回転ハンドルと中心を結ぶ線
    const rotateLine = document.createElementNS(this.svgNS, "line");
    rotateLine.setAttribute("x1", bbox.x + bbox.width / 2);
    rotateLine.setAttribute("y1", bbox.y);
    rotateLine.setAttribute("x2", bbox.x + bbox.width / 2);
    rotateLine.setAttribute("y2", bbox.y - 20);
    rotateLine.setAttribute("stroke", "black");
    rotateLine.setAttribute("stroke-dasharray", "2 2");
    rotateLine.classList.add("rotate-line");
    this.canvas.appendChild(rotateLine);
  }

  // コントロールポイントの削除
  removeControlPoints() {
    const handles = document.querySelectorAll(
      ".control-handle, .rotate-handle, .rotate-line"
    );
    handles.forEach((handle) => {
      if (handle.parentNode) {
        handle.parentNode.removeChild(handle);
      }
    });
  }

  // オブジェクトのバウンディングボックスを取得（transform属性を考慮した改良版）
  getBoundingBox(obj) {
    if (!obj) return null;

    // SVGのgetBBoxを使って実際の描画領域を取得する（transform適用後）
    try {
      const svgBBox = obj.getBBox();

      // transformがある場合は、その影響を考慮する
      const transform = obj.getAttribute("transform");
      if (transform) {
        // SVGの座標変換行列を取得
        const ctm = obj.getCTM();
        if (ctm) {
          // 変換行列から四隅の座標を計算
          const points = [
            { x: svgBBox.x, y: svgBBox.y },
            { x: svgBBox.x + svgBBox.width, y: svgBBox.y },
            { x: svgBBox.x + svgBBox.width, y: svgBBox.y + svgBBox.height },
            { x: svgBBox.x, y: svgBBox.y + svgBBox.height },
          ];

          // 変換後の座標を計算
          const transformedPoints = points.map((p) => {
            const svgPoint = this.canvas.createSVGPoint();
            svgPoint.x = p.x;
            svgPoint.y = p.y;
            const transformedPoint = svgPoint.matrixTransform(ctm);
            return { x: transformedPoint.x, y: transformedPoint.y };
          });

          // 変換後の座標から新しいバウンディングボックスを計算
          let minX = Infinity,
            minY = Infinity;
          let maxX = -Infinity,
            maxY = -Infinity;

          transformedPoints.forEach((p) => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          });

          return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };
        }
      }

      // transform属性がないか、CTMが取得できない場合は元のバウンディングボックスを使用
      return {
        x: svgBBox.x,
        y: svgBBox.y,
        width: svgBBox.width,
        height: svgBBox.height,
      };
    } catch (e) {
      console.error("バウンディングボックスの取得に失敗しました", e);

      // 従来の方法でフォールバック
      if (obj.tagName === "rect") {
        return {
          x: parseFloat(obj.getAttribute("x")),
          y: parseFloat(obj.getAttribute("y")),
          width: parseFloat(obj.getAttribute("width")),
          height: parseFloat(obj.getAttribute("height")),
        };
      } else if (obj.tagName === "circle") {
        const cx = parseFloat(obj.getAttribute("cx"));
        const cy = parseFloat(obj.getAttribute("cy"));
        const r = parseFloat(obj.getAttribute("r"));
        return {
          x: cx - r,
          y: cy - r,
          width: r * 2,
          height: r * 2,
        };
      } else if (obj.tagName === "polygon") {
        // 多角形のバウンディングボックスを計算
        const points = obj.getAttribute("points").trim().split(" ");
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;

        points.forEach((point) => {
          const [x, y] = point.split(",").map(parseFloat);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        });

        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      } else if (obj.tagName === "text") {
        // テキストのバウンディングボックス
        const x = parseFloat(obj.getAttribute("x"));
        const y = parseFloat(obj.getAttribute("y"));
        // 推定サイズ（実際のサイズは取得困難）
        return {
          x: x,
          y: y - 16, // フォントサイズを考慮
          width: 100, // 推定幅
          height: 20, // 推定高さ
        };
      } else if (obj.tagName === "g") {
        // グループのバウンディングボックス（すべての子要素を含む）
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;

        Array.from(obj.children).forEach((child) => {
          const childBox = this.getBoundingBox(child);
          if (childBox) {
            minX = Math.min(minX, childBox.x);
            minY = Math.min(minY, childBox.y);
            maxX = Math.max(maxX, childBox.x + childBox.width);
            maxY = Math.max(maxY, childBox.y + childBox.height);
          }
        });

        if (minX === Infinity) return null;

        return {
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
        };
      }
    }
    return null;
  }
}

// グローバルに公開
window.SelectTool = SelectTool;
