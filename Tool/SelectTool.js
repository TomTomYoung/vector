// SelectTool.js
// 選択・移動・変形ツール
class SelectTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedObject = null;
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.resizeHandle = null;
    this.transformOrigin = { x: 0, y: 0 };
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

    // ハンドル操作の確認
    if (
      event.target.classList &&
      event.target.classList.contains("control-handle")
    ) {
      this.saveState();
      this.isResizing = true;
      this.resizeHandle = event.target;
      return;
    }

    if (
      event.target.classList &&
      event.target.classList.contains("rotate-handle")
    ) {
      this.saveState();
      this.isRotating = true;
      return;
    }

    // オブジェクト選択処理
    if (event.target !== this.canvas) {
      this.selectObject(event.target);
      this.isDragging = true;
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

    // ドラッグ処理
    if (this.isDragging && this.selectedObject) {
      const dx = this.currentPoint.x - this.startPoint.x;
      const dy = this.currentPoint.y - this.startPoint.y;

      this.moveObject(this.selectedObject, dx, dy);

      this.startPoint = { ...this.currentPoint };

      // コントロールポイントを更新
      this.addControlPoints();
    }
  }

  handleMouseUp(event) {
    this.isDragging = false;
    this.isResizing = false;
    this.isRotating = false;
    this.resizeHandle = null;
  }

  // オブジェクト選択
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

  // オブジェクト移動
  moveObject(obj, dx, dy) {
    if (!obj) return;

    if (obj.tagName === "rect") {
      const x = parseFloat(obj.getAttribute("x")) + dx;
      const y = parseFloat(obj.getAttribute("y")) + dy;
      obj.setAttribute("x", x);
      obj.setAttribute("y", y);
    } else if (obj.tagName === "circle") {
      const cx = parseFloat(obj.getAttribute("cx")) + dx;
      const cy = parseFloat(obj.getAttribute("cy")) + dy;
      obj.setAttribute("cx", cx);
      obj.setAttribute("cy", cy);
    } else if (obj.tagName === "polygon") {
      const points = obj.getAttribute("points").trim().split(" ");
      const newPoints = points
        .map((point) => {
          const [x, y] = point.split(",").map(parseFloat);
          return `${x + dx},${y + dy}`;
        })
        .join(" ");
      obj.setAttribute("points", newPoints);
    } else if (obj.tagName === "text") {
      const x = parseFloat(obj.getAttribute("x")) + dx;
      const y = parseFloat(obj.getAttribute("y")) + dy;
      obj.setAttribute("x", x);
      obj.setAttribute("y", y);
    } else if (obj.tagName === "path") {
      // パスの移動は未実装
    } else if (obj.tagName === "g") {
      // グループの移動
      let transform = obj.getAttribute("transform") || "";

      if (transform.includes("translate")) {
        // 既存の移動を更新
        transform = transform.replace(
          /translate\([^)]+\)/,
          `translate(${dx}, ${dy})`
        );
      } else {
        // 新しい移動を追加
        transform += ` translate(${dx}, ${dy})`;
      }

      obj.setAttribute("transform", transform.trim());
    }
  }

  // リサイズ処理
  resizeObject() {
    if (!this.selectedObject || !this.resizeHandle) return;

    let newX, newY, newWidth, newHeight;

    // 現在のサイズと位置を取得
    if (this.selectedObject.tagName === "rect") {
      newX = parseFloat(this.selectedObject.getAttribute("x"));
      newY = parseFloat(this.selectedObject.getAttribute("y"));
      newWidth = parseFloat(this.selectedObject.getAttribute("width"));
      newHeight = parseFloat(this.selectedObject.getAttribute("height"));
    } else if (this.selectedObject.tagName === "circle") {
      const cx = parseFloat(this.selectedObject.getAttribute("cx"));
      const cy = parseFloat(this.selectedObject.getAttribute("cy"));
      const r = parseFloat(this.selectedObject.getAttribute("r"));
      newX = cx - r;
      newY = cy - r;
      newWidth = r * 2;
      newHeight = r * 2;
    } else {
      return; // その他のオブジェクトは未対応
    }

    // ハンドルの位置によってリサイズ方向を変更
    if (this.resizeHandle.classList.contains("nw")) {
      const dx = this.currentPoint.x - newX;
      const dy = this.currentPoint.y - newY;
      newX = this.currentPoint.x;
      newY = this.currentPoint.y;
      newWidth -= dx;
      newHeight -= dy;
    } else if (this.resizeHandle.classList.contains("ne")) {
      const dy = this.currentPoint.y - newY;
      newY = this.currentPoint.y;
      newWidth = this.currentPoint.x - newX;
      newHeight -= dy;
    } else if (this.resizeHandle.classList.contains("sw")) {
      const dx = this.currentPoint.x - newX;
      newX = this.currentPoint.x;
      newWidth -= dx;
      newHeight = this.currentPoint.y - newY;
    } else if (this.resizeHandle.classList.contains("se")) {
      newWidth = this.currentPoint.x - newX;
      newHeight = this.currentPoint.y - newY;
    }

    // サイズが負にならないようにする
    if (newWidth < 1) newWidth = 1;
    if (newHeight < 1) newHeight = 1;

    // オブジェクトのサイズを更新
    if (this.selectedObject.tagName === "rect") {
      this.selectedObject.setAttribute("x", newX);
      this.selectedObject.setAttribute("y", newY);
      this.selectedObject.setAttribute("width", newWidth);
      this.selectedObject.setAttribute("height", newHeight);
    } else if (this.selectedObject.tagName === "circle") {
      // 円は四角形のリサイズを半径に変換して適用
      const newRadius = Math.min(newWidth, newHeight) / 2;
      const newCX = newX + newRadius;
      const newCY = newY + newRadius;
      this.selectedObject.setAttribute("cx", newCX);
      this.selectedObject.setAttribute("cy", newCY);
      this.selectedObject.setAttribute("r", newRadius);
    }

    // コントロールポイントを更新
    this.addControlPoints();
  }

  // 回転処理
  rotateObject() {
    if (!this.selectedObject) return;

    // 回転角度を計算
    const dx = this.currentPoint.x - this.transformOrigin.x;
    const dy = this.currentPoint.y - this.transformOrigin.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // 回転の適用
    let transform = this.selectedObject.getAttribute("transform") || "";

    // 既存の回転があれば削除
    if (transform.includes("rotate")) {
      transform = transform.replace(/\s*rotate\([^)]*\)/, "");
    }

    // 新しい回転を適用
    transform += ` rotate(${angle}, ${this.transformOrigin.x}, ${this.transformOrigin.y})`;
    this.selectedObject.setAttribute("transform", transform.trim());

    // コントロールポイントを更新
    this.addControlPoints();
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

  // オブジェクトのバウンディングボックスを取得
  getBoundingBox(obj) {
    if (!obj) return null;

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
      const bbox = obj.getBBox();
      return {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
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

    return null;
  }
}

// グローバルに公開
window.SelectTool = SelectTool;
