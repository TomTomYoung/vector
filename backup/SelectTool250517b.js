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

    // 現在の変換行列を取得
    let currentTransformStr = obj.getAttribute("transform") || "";
    let currentMatrix;
    try {
      currentMatrix = new DOMMatrix(currentTransformStr);
    } catch (e) {
      currentMatrix = new DOMMatrix();
    }

    // 現在の変換の逆を計算
    const inverseMatrix = currentMatrix.inverse();

    // 移動量を逆変換して、現在のスケール/回転を考慮した値を得る
    const pt = this.canvas.createSVGPoint();
    pt.x = dx;
    pt.y = dy;

    // 逆行列から回転・スケール部分だけを抽出（e, fをクリア）
    const rotScaleOnly = new DOMMatrix([
      inverseMatrix.a,
      inverseMatrix.b,
      inverseMatrix.c,
      inverseMatrix.d,
      0,
      0, // 移動成分をクリア
    ]);

    // 移動量を変換
    const transformedDelta = pt.matrixTransform(rotScaleOnly);

    // 変換後の移動量で新しい移動行列を作成
    const translationMatrix = new DOMMatrix().translate(
      transformedDelta.x,
      transformedDelta.y
    );

    // 現在の変換に新しい移動を追加
    const newMatrix = currentMatrix.multiply(translationMatrix);
    obj.setAttribute("transform", newMatrix.toString());
  }

  resizeObject() {
    if (!this.selectedObject || !this.resizeHandle) return;

    // 初期バウンディングボックスを使用
    const bbox = this.initialBBox;

    // リサイズパラメータの計算（既存コード）
    let fixedPoint = { x: 0, y: 0 };
    // ハンドルの種類に応じた固定点設定（既存コード）
    // ...

    // スケール計算（既存コード）
    // ...

    // 初期の変換パラメータを抽出（初回のみ）
    if (!this.resizeParams) {
      this.resizeParams = this.extractTransformParams(this.initialTransform);
    }

    // 新しいスケール値を計算（初期スケールを掛け合わせる）
    const newScaleX = this.resizeParams.scale.x * scaleX;
    const newScaleY = this.resizeParams.scale.y * scaleY;

    // 新しい変換パラメータを作成
    const newParams = {
      translate: this.resizeParams.translate,
      scale: { x: newScaleX, y: newScaleY },
      rotate: this.resizeParams.rotate,
    };

    // 固定点を基準にした変換文字列を生成
    const newTransform = this.createTransformStringWithFixedPoint(
      newParams,
      fixedPoint
    );

    this.selectedObject.setAttribute("transform", newTransform);
  }

  // 固定点を基準にした変換文字列を生成
  createTransformStringWithFixedPoint(params, fixedPoint) {
    let transform = "";

    // まず移動
    if (params.translate.x !== 0 || params.translate.y !== 0) {
      transform += `translate(${params.translate.x},${params.translate.y}) `;
    }

    // 回転があれば適用
    if (params.rotate !== 0) {
      // 中心点を基準に回転
      const center = {
        x: this.initialBBox.x + this.initialBBox.width / 2,
        y: this.initialBBox.y + this.initialBBox.height / 2,
      };
      transform += `translate(${center.x},${center.y}) `;
      transform += `rotate(${params.rotate}) `;
      transform += `translate(${-center.x},${-center.y}) `;
    }

    // 固定点を基準にスケール
    transform += `translate(${fixedPoint.x},${fixedPoint.y}) `;
    transform += `scale(${params.scale.x},${params.scale.y}) `;
    transform += `translate(${-fixedPoint.x},${-fixedPoint.y}) `;

    return transform;
  }
  // 回転処理
  rotateObject() {
    if (!this.selectedObject) return;

    // 1. 変換前パラメータの確認（初回のみ抽出して保存）
    if (!this.transformParams) {
      this.transformParams = this.extractTransformParams(this.initialTransform);
    }

    // 2. 中心点計算（方法2: 無変換時の4角に変換前t,s,rを適用）
    if (!this.rotationCenter) {
      const bbox = this.selectedObject.getBBox(); // 無変換時のバウンディングボックス
      const corners = [
        { x: bbox.x, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y },
        { x: bbox.x + bbox.width, y: bbox.y + bbox.height },
        { x: bbox.x, y: bbox.y + bbox.height },
      ];

      // 無変換時の各角に現在の変換を適用
      const transformedCorners = corners.map((corner) => {
        // 無変換の角に t,s,r を順に適用
        return this.applyTransform(corner, this.transformParams);
      });

      // 変換後の角から中心を計算
      this.rotationCenter = {
        x: transformedCorners.reduce((sum, pt) => sum + pt.x, 0) / 4,
        y: transformedCorners.reduce((sum, pt) => sum + pt.y, 0) / 4,
      };
    }

    // 3. 回転差分の計算
    const dx = this.currentPoint.x - this.rotationCenter.x;
    const dy = this.currentPoint.y - this.rotationCenter.y;
    const currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    const deltaAngle = currentAngle - this.startAngle;

    // 4. 新変換適用
    const newParams = {
      translate: this.transformParams.translate,
      scale: this.transformParams.scale,
      rotate: this.transformParams.rotate + deltaAngle,
    };

    // 無変換から新しいt,s,rを適用した変換文字列を生成
    const newTransform = this.createTransformString(
      newParams,
      this.rotationCenter
    );
    this.selectedObject.setAttribute("transform", newTransform);
  }

  // 変換パラメータ抽出ヘルパーメソッド
  extractTransformParams(transformStr) {
    const params = {
      translate: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotate: 0,
    };

    // 各パラメータを正規表現で抽出（簡易実装）
    const translateMatch = transformStr.match(
      /translate\(\s*([-\d.]+)(?:\s*,\s*)?([-\d.]+)?\s*\)/
    );
    if (translateMatch) {
      params.translate.x = parseFloat(translateMatch[1]) || 0;
      params.translate.y = parseFloat(translateMatch[2]) || 0;
    }

    const scaleMatch = transformStr.match(
      /scale\(\s*([-\d.]+)(?:\s*,\s*)?([-\d.]+)?\s*\)/
    );
    if (scaleMatch) {
      params.scale.x = parseFloat(scaleMatch[1]) || 1;
      params.scale.y = parseFloat(scaleMatch[2] || scaleMatch[1]) || 1;
    }

    const rotateMatch = transformStr.match(/rotate\(\s*([-\d.]+)/);
    if (rotateMatch) {
      params.rotate = parseFloat(rotateMatch[1]) || 0;
    }

    return params;
  }

  // 指定されたt,s,rパラメータで変換文字列を生成
  createTransformString(params, center) {
    let transform = "";

    // まず移動
    if (params.translate.x !== 0 || params.translate.y !== 0) {
      transform += `translate(${params.translate.x},${params.translate.y}) `;
    }

    // 中心点を基準に回転
    transform += `translate(${center.x},${center.y}) `;
    transform += `rotate(${params.rotate}) `;
    transform += `translate(${-center.x},${-center.y}) `;

    // スケール
    if (params.scale.x !== 1 || params.scale.y !== 1) {
      transform += `scale(${params.scale.x},${params.scale.y}) `;
    }

    return transform;
  }

  // 点に変換を適用するヘルパーメソッド
  applyTransform(point, params) {
    // SVGPointとDOMMatrixを使った正確な実装
    const svgPoint = this.canvas.createSVGPoint();
    svgPoint.x = point.x;
    svgPoint.y = point.y;

    let matrix = new DOMMatrix();

    // 変換を順に適用
    if (params.translate.x !== 0 || params.translate.y !== 0) {
      matrix = matrix.translate(params.translate.x, params.translate.y);
    }

    if (params.rotate !== 0) {
      matrix = matrix.rotate(params.rotate);
    }

    if (params.scale.x !== 1 || params.scale.y !== 1) {
      matrix = matrix.scale(params.scale.x, params.scale.y);
    }

    const transformed = svgPoint.matrixTransform(matrix);
    return { x: transformed.x, y: transformed.y };
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
  // getBoundingBox(obj) {
  //   if (!obj) return null;

  //   // SVGのgetBBoxを使って実際の描画領域を取得する（transform適用後）
  //   try {
  //     const svgBBox = obj.getBBox();

  //     // transformがある場合は、その影響を考慮する
  //     const transform = obj.getAttribute("transform");
  //     if (transform) {
  //       // SVGの座標変換行列を取得
  //       const ctm = obj.getCTM();
  //       if (ctm) {
  //         // 変換行列から四隅の座標を計算
  //         const points = [
  //           { x: svgBBox.x, y: svgBBox.y },
  //           { x: svgBBox.x + svgBBox.width, y: svgBBox.y },
  //           { x: svgBBox.x + svgBBox.width, y: svgBBox.y + svgBBox.height },
  //           { x: svgBBox.x, y: svgBBox.y + svgBBox.height },
  //         ];

  //         // 変換後の座標を計算
  //         const transformedPoints = points.map((p) => {
  //           const svgPoint = this.canvas.createSVGPoint();
  //           svgPoint.x = p.x;
  //           svgPoint.y = p.y;
  //           const transformedPoint = svgPoint.matrixTransform(ctm);
  //           return { x: transformedPoint.x, y: transformedPoint.y };
  //         });

  //         // 変換後の座標から新しいバウンディングボックスを計算
  //         let minX = Infinity,
  //           minY = Infinity;
  //         let maxX = -Infinity,
  //           maxY = -Infinity;

  //         transformedPoints.forEach((p) => {
  //           minX = Math.min(minX, p.x);
  //           minY = Math.min(minY, p.y);
  //           maxX = Math.max(maxX, p.x);
  //           maxY = Math.max(maxY, p.y);
  //         });

  //         return {
  //           x: minX,
  //           y: minY,
  //           width: maxX - minX,
  //           height: maxY - minY,
  //         };
  //       }
  //     }

  //     // transform属性がないか、CTMが取得できない場合は元のバウンディングボックスを使用
  //     return {
  //       x: svgBBox.x,
  //       y: svgBBox.y,
  //       width: svgBBox.width,
  //       height: svgBBox.height,
  //     };
  //   } catch (e) {
  //     console.error("バウンディングボックスの取得に失敗しました", e);

  //     // 従来の方法でフォールバック
  //     if (obj.tagName === "rect") {
  //       return {
  //         x: parseFloat(obj.getAttribute("x")),
  //         y: parseFloat(obj.getAttribute("y")),
  //         width: parseFloat(obj.getAttribute("width")),
  //         height: parseFloat(obj.getAttribute("height")),
  //       };
  //     } else if (obj.tagName === "circle") {
  //       const cx = parseFloat(obj.getAttribute("cx"));
  //       const cy = parseFloat(obj.getAttribute("cy"));
  //       const r = parseFloat(obj.getAttribute("r"));
  //       return {
  //         x: cx - r,
  //         y: cy - r,
  //         width: r * 2,
  //         height: r * 2,
  //       };
  //     } else if (obj.tagName === "polygon") {
  //       // 多角形のバウンディングボックスを計算
  //       const points = obj.getAttribute("points").trim().split(" ");
  //       let minX = Infinity,
  //         minY = Infinity,
  //         maxX = -Infinity,
  //         maxY = -Infinity;

  //       points.forEach((point) => {
  //         const [x, y] = point.split(",").map(parseFloat);
  //         minX = Math.min(minX, x);
  //         minY = Math.min(minY, y);
  //         maxX = Math.max(maxX, x);
  //         maxY = Math.max(maxY, y);
  //       });

  //       return {
  //         x: minX,
  //         y: minY,
  //         width: maxX - minX,
  //         height: maxY - minY,
  //       };
  //     } else if (obj.tagName === "text") {
  //       // テキストのバウンディングボックス
  //       const x = parseFloat(obj.getAttribute("x"));
  //       const y = parseFloat(obj.getAttribute("y"));
  //       // 推定サイズ（実際のサイズは取得困難）
  //       return {
  //         x: x,
  //         y: y - 16, // フォントサイズを考慮
  //         width: 100, // 推定幅
  //         height: 20, // 推定高さ
  //       };
  //     } else if (obj.tagName === "g") {
  //       // グループのバウンディングボックス（すべての子要素を含む）
  //       let minX = Infinity,
  //         minY = Infinity,
  //         maxX = -Infinity,
  //         maxY = -Infinity;

  //       Array.from(obj.children).forEach((child) => {
  //         const childBox = this.getBoundingBox(child);
  //         if (childBox) {
  //           minX = Math.min(minX, childBox.x);
  //           minY = Math.min(minY, childBox.y);
  //           maxX = Math.max(maxX, childBox.x + childBox.width);
  //           maxY = Math.max(maxY, childBox.y + childBox.height);
  //         }
  //       });

  //       if (minX === Infinity) return null;

  //       return {
  //         x: minX,
  //         y: minY,
  //         width: maxX - minX,
  //         height: maxY - minY,
  //       };
  //     }
  //   }
  //   return null;
  // }

  // オブジェクトのバウンディングボックスを取得（transform属性をDOMMatrix/DOMPointで考慮）
  getBoundingBox(obj) {
    if (!obj) return null;

    try {
      const svgBBox = obj.getBBox();
      // 変換行列の取得: getCTM() が利用できる場合はそれを優先
      let matrix = new DOMMatrix();
      if (typeof obj.getCTM === "function") {
        const ctm = obj.getCTM();
        if (ctm) {
          matrix = ctm;
        } else if (obj.getAttribute("transform")) {
          matrix = new DOMMatrix(obj.getAttribute("transform"));
        }
      } else if (obj.getAttribute("transform")) {
        matrix = new DOMMatrix(obj.getAttribute("transform"));
      }

      // 変換がなければ元のバウンディングボックスを返す
      if (matrix.isIdentity) {
        return {
          x: svgBBox.x,
          y: svgBBox.y,
          width: svgBBox.width,
          height: svgBBox.height,
        };
      }

      // SVGのバウンディングボックスの四隅を DOMPoint で生成
      const points = [
        new DOMPoint(svgBBox.x, svgBBox.y),
        new DOMPoint(svgBBox.x + svgBBox.width, svgBBox.y),
        new DOMPoint(svgBBox.x + svgBBox.width, svgBBox.y + svgBBox.height),
        new DOMPoint(svgBBox.x, svgBBox.y + svgBBox.height),
      ];

      // 各ポイントを変換後の座標に変換
      const transformedPoints = points.map((point) =>
        point.matrixTransform(matrix)
      );

      // 変換後の座標から新しいバウンディングボックスを算出
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
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
    } catch (e) {
      console.error("バウンディングボックスの取得に失敗しました", e);
      // ここからは従来の方法でフォールバック
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
        const x = parseFloat(obj.getAttribute("x"));
        const y = parseFloat(obj.getAttribute("y"));
        return {
          x: x,
          y: y - 16,
          width: 100,
          height: 20,
        };
      } else if (obj.tagName === "g") {
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
