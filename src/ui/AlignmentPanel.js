// AlignmentPanel.js
// 整列機能

class AlignmentPanel {
  constructor() {
    this.init();
  }

  init() {
    this.container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");

    if (!this.container) {
      return;
    }

    // 整列ボタンを追加
    this.createAlignmentButtons();

    // グループ関連のボタンを追加
    this.createGroupButtons();
  }

  ensureGroup() {
    if (!this.container) {
      return null;
    }

    let group = document.getElementById("alignment-controls-group");
    if (!group) {
      group = document.createElement("div");
      group.id = "alignment-controls-group";
      group.className = "style-control-group";

      const heading = document.createElement("h4");
      heading.textContent = "整列・変形";
      group.appendChild(heading);

      const stack = document.createElement("div");
      stack.className = "button-stack";
      stack.id = "alignment-button-stack";
      group.appendChild(stack);

      this.container.appendChild(group);
    }

    return document.getElementById("alignment-button-stack") || group;
  }

  createAlignmentButtons() {
    const stack = this.ensureGroup();
    if (!stack) {
      return;
    }

    const buttons = [
      { id: "align-left-btn", label: "左揃え", action: () => this.alignObjects("left") },
      { id: "align-center-btn", label: "中央揃え", action: () => this.alignObjects("center") },
      { id: "align-right-btn", label: "右揃え", action: () => this.alignObjects("right") },
      { id: "align-top-btn", label: "上揃え", action: () => this.alignObjects("top") },
      {
        id: "align-middle-btn",
        label: "垂直中央揃え",
        action: () => this.alignObjects("middle"),
      },
      { id: "align-bottom-btn", label: "下揃え", action: () => this.alignObjects("bottom") },
    ];

    buttons.forEach(({ id, label, action }) => {
      if (document.getElementById(id)) {
        return;
      }
      const button = document.createElement("button");
      button.id = id;
      button.textContent = label;
      button.addEventListener("click", action);
      stack.appendChild(button);
    });
  }

  createGroupButtons() {
    const stack = this.ensureGroup();
    if (!stack) {
      return;
    }

    const buttons = [
      { id: "group-btn", label: "グループ化", action: this.groupObjects },
      { id: "ungroup-btn", label: "グループ解除", action: this.ungroupObjects },
      {
        id: "flip-horizontal-btn",
        label: "水平反転",
        title: "選択したオブジェクトを水平反転",
        action: () => this.flipObjects("horizontal"),
      },
      {
        id: "flip-vertical-btn",
        label: "垂直反転",
        title: "選択したオブジェクトを垂直反転",
        action: () => this.flipObjects("vertical"),
      },
    ];

    buttons.forEach(({ id, label, title, action }) => {
      if (document.getElementById(id)) {
        return;
      }
      const button = document.createElement("button");
      button.id = id;
      button.textContent = label;
      if (title) {
        button.title = title;
      }
      button.addEventListener("click", action);
      stack.appendChild(button);
    });
  }

  // 整列機能の実装
  alignObjects(alignType) {
    if (window.selectedObjects.length <= 1) return;

    // 状態を保存
    if (window.saveState) {
      window.saveState();
    }

    // 選択されたオブジェクトのバウンディングボックスを取得
    const bounds = window.selectedObjects.map((obj) =>
      this.getBoundingBox(obj)
    );

    // 整列の基準値を計算
    let referenceValue;

    switch (alignType) {
      case "left":
        referenceValue = Math.min(...bounds.map((b) => b.x));
        window.selectedObjects.forEach((obj, i) => {
          this.alignObjectHorizontally(obj, referenceValue, "left", bounds[i]);
        });
        break;
      case "center":
        referenceValue =
          bounds.reduce((sum, b) => sum + (b.x + b.width / 2), 0) /
          bounds.length;
        window.selectedObjects.forEach((obj, i) => {
          this.alignObjectHorizontally(
            obj,
            referenceValue,
            "center",
            bounds[i]
          );
        });
        break;
      case "right":
        referenceValue = Math.max(...bounds.map((b) => b.x + b.width));
        window.selectedObjects.forEach((obj, i) => {
          this.alignObjectHorizontally(obj, referenceValue, "right", bounds[i]);
        });
        break;
      case "top":
        referenceValue = Math.min(...bounds.map((b) => b.y));
        window.selectedObjects.forEach((obj, i) => {
          this.alignObjectVertically(obj, referenceValue, "top", bounds[i]);
        });
        break;
      case "middle":
        referenceValue =
          bounds.reduce((sum, b) => sum + (b.y + b.height / 2), 0) /
          bounds.length;
        window.selectedObjects.forEach((obj, i) => {
          this.alignObjectVertically(obj, referenceValue, "middle", bounds[i]);
        });
        break;
      case "bottom":
        referenceValue = Math.max(...bounds.map((b) => b.y + b.height));
        window.selectedObjects.forEach((obj, i) => {
          this.alignObjectVertically(obj, referenceValue, "bottom", bounds[i]);
        });
        break;
    }

    // コントロールポイントを更新
    if (window.selectedObject && window.selectTool) {
      window.selectTool.addControlPoints();
    }
  }

  // 水平方向の整列
  alignObjectHorizontally(obj, reference, alignType, bounds) {
    if (obj.tagName === "rect") {
      let newX = bounds.x;
      if (alignType === "center") {
        newX = reference - bounds.width / 2;
      } else if (alignType === "right") {
        newX = reference - bounds.width;
      } else {
        newX = reference;
      }
      obj.setAttribute("x", newX);
    } else if (obj.tagName === "circle") {
      let newCX = bounds.x + bounds.width / 2;
      if (alignType === "left") {
        newCX = reference + bounds.width / 2;
      } else if (alignType === "right") {
        newCX = reference - bounds.width / 2;
      } else {
        newCX = reference;
      }
      obj.setAttribute("cx", newCX);
    } else if (obj.tagName === "polygon") {
      // 多角形の場合
      const points = obj.getAttribute("points").trim().split(" ");
      const dx =
        alignType === "left"
          ? reference - bounds.x
          : alignType === "right"
          ? reference - (bounds.x + bounds.width)
          : reference - (bounds.x + bounds.width / 2);

      const newPoints = points
        .map((point) => {
          const [x, y] = point.split(",").map(parseFloat);
          return `${x + dx},${y}`;
        })
        .join(" ");

      obj.setAttribute("points", newPoints);
    } else if (obj.tagName === "text") {
      // テキストの場合
      let newX = bounds.x;
      if (alignType === "center") {
        newX = reference - bounds.width / 2;
      } else if (alignType === "right") {
        newX = reference - bounds.width;
      } else {
        newX = reference;
      }
      obj.setAttribute("x", newX);
    }
  }

  // 垂直方向の整列
  alignObjectVertically(obj, reference, alignType, bounds) {
    if (obj.tagName === "rect") {
      let newY = bounds.y;
      if (alignType === "middle") {
        newY = reference - bounds.height / 2;
      } else if (alignType === "bottom") {
        newY = reference - bounds.height;
      } else {
        newY = reference;
      }
      obj.setAttribute("y", newY);
    } else if (obj.tagName === "circle") {
      let newCY = bounds.y + bounds.height / 2;
      if (alignType === "top") {
        newCY = reference + bounds.height / 2;
      } else if (alignType === "bottom") {
        newCY = reference - bounds.height / 2;
      } else {
        newCY = reference;
      }
      obj.setAttribute("cy", newCY);
    } else if (obj.tagName === "polygon") {
      // 多角形の場合
      const points = obj.getAttribute("points").trim().split(" ");
      const dy =
        alignType === "top"
          ? reference - bounds.y
          : alignType === "bottom"
          ? reference - (bounds.y + bounds.height)
          : reference - (bounds.y + bounds.height / 2);

      const newPoints = points
        .map((point) => {
          const [x, y] = point.split(",").map(parseFloat);
          return `${x},${y + dy}`;
        })
        .join(" ");

      obj.setAttribute("points", newPoints);
    } else if (obj.tagName === "text") {
      // テキストの場合
      let newY = bounds.y;
      if (alignType === "middle") {
        newY = reference - bounds.height / 2;
      } else if (alignType === "bottom") {
        newY = reference - bounds.height;
      } else {
        newY = reference;
      }
      obj.setAttribute("y", newY);
    }
  }

  // オブジェクトのバウンディングボックスを取得する関数
  getBoundingBox(obj) {
    if (!obj) return null;

    if (window.selectTool) {
      return window.selectTool.getBoundingBox(obj);
    }

    // 選択ツールが利用できない場合のフォールバック
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
    }

    // デフォルト値
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  // オブジェクトのグループ化
  groupObjects() {
    if (window.selectedObjects.length <= 1) return;

    // 状態を保存
    if (window.saveState) {
      window.saveState();
    }

    const canvas = document.getElementById("canvas");

    // グループ要素を作成
    const group = document.createElementNS(window.svgNS, "g");
    group.setAttribute("data-layer", window.currentLayerId);

    // 選択されたオブジェクトをグループに移動
    window.selectedObjects.forEach((obj) => {
      // 元の親からオブジェクトを削除
      obj.parentNode.removeChild(obj);

      // グループにオブジェクトを追加
      group.appendChild(obj);

      // 選択表示を解除
      obj.removeAttribute("stroke-dasharray");
    });

    // グループをキャンバスに追加
    canvas.appendChild(group);

    // 選択を更新
    window.selectedObjects = [group];
    window.selectedObject = group;

    // グループを選択状態にする
    group.setAttribute("stroke-dasharray", "5 5");

    // コントロールポイントを更新
    if (window.selectTool) {
      window.selectTool.addControlPoints();
    }
  }

  // グループ解除
  ungroupObjects() {
    if (!window.selectedObject || window.selectedObject.tagName !== "g") return;

    // 状態を保存
    if (window.saveState) {
      window.saveState();
    }

    const canvas = document.getElementById("canvas");
    const group = window.selectedObject;
    const layerId = group.getAttribute("data-layer") || window.currentLayerId;

    // グループ内の要素をキャンバスに移動
    const childNodes = Array.from(group.childNodes);
    window.selectedObjects = [];

    childNodes.forEach((node) => {
      // グループから要素を削除
      group.removeChild(node);

      // レイヤー属性を設定
      node.setAttribute("data-layer", layerId);

      // キャンバスに直接追加
      canvas.appendChild(node);

      // 新しい選択対象として追加
      window.selectedObjects.push(node);
      node.setAttribute("stroke-dasharray", "5 5");
    });

    // 空になったグループを削除
    canvas.removeChild(group);

    // 最後の要素を現在の選択オブジェクトにする
    window.selectedObject =
      window.selectedObjects.length > 0
        ? window.selectedObjects[window.selectedObjects.length - 1]
        : null;

    // コントロールポイントを更新
    if (window.selectedObject && window.selectTool) {
      window.selectTool.addControlPoints();
    }
  }

  // オブジェクトを反転
  flipObjects(direction) {
    if (window.selectedObjects.length === 0) return;

    // 状態を保存
    if (window.saveState) {
      window.saveState();
    }

    window.selectedObjects.forEach((obj) => {
      // 現在の変換を取得
      const currentMatrix = obj.getCTM() || new DOMMatrix();
      const bbox = obj.getBBox();

      // バウンディングボックスの中心を計算
      const centerX = bbox.x + bbox.width / 2;
      const centerY = bbox.y + bbox.height / 2;

      // 中心点をグローバル座標に変換
      const canvas = document.getElementById("canvas");
      const pt = canvas.createSVGPoint();
      pt.x = centerX;
      pt.y = centerY;
      const globalCenter = pt.matrixTransform(currentMatrix);

      // 反転用の変換マトリックスを作成
      let flipMatrix;
      if (direction === "horizontal") {
        // 水平反転: 中心を基準にX軸で反転
        flipMatrix = new DOMMatrix()
          .translate(globalCenter.x, globalCenter.y)
          .scale(-1, 1)
          .translate(-globalCenter.x, -globalCenter.y);
      } else {
        // 垂直反転: 中心を基準にY軸で反転
        flipMatrix = new DOMMatrix()
          .translate(globalCenter.x, globalCenter.y)
          .scale(1, -1)
          .translate(-globalCenter.x, -globalCenter.y);
      }

      // 既存の変換に反転を適用
      const newMatrix = flipMatrix.multiply(currentMatrix);
      obj.setAttribute("transform", newMatrix.toString());
    });

    // コントロールポイントを更新
    if (window.selectTool) {
      window.selectTool.addControlPoints();
    }
  }
}

window.AlignmentPanel = AlignmentPanel;
window.alignObjects = AlignmentPanel.prototype.alignObjects;
window.groupObjects = AlignmentPanel.prototype.groupObjects;
window.ungroupObjects = AlignmentPanel.prototype.ungroupObjects;
window.flipObjects = AlignmentPanel.prototype.flipObjects;
