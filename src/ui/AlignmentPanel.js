// AlignmentPanel.js
// 整列機能

class AlignmentPanel {
  constructor() {
    this.init();
  }

  init() {
    const toolbar = document.querySelector(".toolbar");

    // 整列ボタンを追加
    this.createAlignmentButtons(toolbar);

    // グループ関連のボタンを追加
    this.createGroupButtons(toolbar);
  }

  createAlignmentButtons(toolbar) {
    const alignLeftBtn = document.createElement("button");
    alignLeftBtn.textContent = "左揃え";
    alignLeftBtn.addEventListener("click", () => this.alignObjects("left"));
    toolbar.appendChild(alignLeftBtn);

    const alignCenterBtn = document.createElement("button");
    alignCenterBtn.textContent = "中央揃え";
    alignCenterBtn.addEventListener("click", () => this.alignObjects("center"));
    toolbar.appendChild(alignCenterBtn);

    const alignRightBtn = document.createElement("button");
    alignRightBtn.textContent = "右揃え";
    alignRightBtn.addEventListener("click", () => this.alignObjects("right"));
    toolbar.appendChild(alignRightBtn);

    const alignTopBtn = document.createElement("button");
    alignTopBtn.textContent = "上揃え";
    alignTopBtn.addEventListener("click", () => this.alignObjects("top"));
    toolbar.appendChild(alignTopBtn);

    const alignMiddleBtn = document.createElement("button");
    alignMiddleBtn.textContent = "垂直中央揃え";
    alignMiddleBtn.addEventListener("click", () => this.alignObjects("middle"));
    toolbar.appendChild(alignMiddleBtn);

    const alignBottomBtn = document.createElement("button");
    alignBottomBtn.textContent = "下揃え";
    alignBottomBtn.addEventListener("click", () => this.alignObjects("bottom"));
    toolbar.appendChild(alignBottomBtn);
  }

  createGroupButtons(toolbar) {
    const groupBtn = document.createElement("button");
    groupBtn.textContent = "グループ化";
    groupBtn.addEventListener("click", this.groupObjects);
    toolbar.appendChild(groupBtn);

    const ungroupBtn = document.createElement("button");
    ungroupBtn.textContent = "グループ解除";
    ungroupBtn.addEventListener("click", this.ungroupObjects);
    toolbar.appendChild(ungroupBtn);
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
}

window.AlignmentPanel = AlignmentPanel;
window.alignObjects = AlignmentPanel.prototype.alignObjects;
window.groupObjects = AlignmentPanel.prototype.groupObjects;
window.ungroupObjects = AlignmentPanel.prototype.ungroupObjects;
