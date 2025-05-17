// StylePanel.js
// スタイル設定パネルの管理

class StylePanel {
  constructor() {
    this.init();
  }

  init() {
    const toolbar = document.querySelector(".toolbar");

    // 削除ボタンの作成
    this.createDeleteButton(toolbar);

    // スタイル設定コントロールの作成
    this.createStyleControls(toolbar);
  }

  createDeleteButton(toolbar) {
    const deleteBtn = document.getElementById("delete-btn");

    if (!deleteBtn) {
      const deleteButton = document.createElement("button");
      deleteButton.id = "delete-btn";
      deleteButton.textContent = "削除";
      deleteButton.addEventListener("click", this.deleteSelectedObject);
      toolbar.appendChild(deleteButton);
    }
  }

  createStyleControls(toolbar) {
    const styleControls = document.createElement("div");
    styleControls.style.marginLeft = "15px";
    styleControls.style.display = "flex";
    styleControls.style.alignItems = "center";

    // 塗りつぶし色
    const fillColorLabel = document.createElement("label");
    fillColorLabel.textContent = "塗り:";
    fillColorLabel.style.marginRight = "5px";

    const fillColorInput = document.createElement("input");
    fillColorInput.type = "color";
    fillColorInput.id = "fill-color";
    fillColorInput.value = "#ffffff";
    fillColorInput.style.marginRight = "10px";
    fillColorInput.addEventListener("change", this.updateSelectedObjectStyle);

    // 線の色
    const strokeColorLabel = document.createElement("label");
    strokeColorLabel.textContent = "線:";
    strokeColorLabel.style.marginRight = "5px";

    const strokeColorInput = document.createElement("input");
    strokeColorInput.type = "color";
    strokeColorInput.id = "stroke-color";
    strokeColorInput.value = "#000000";
    strokeColorInput.style.marginRight = "10px";
    strokeColorInput.addEventListener("change", this.updateSelectedObjectStyle);

    // 線の太さ
    const strokeWidthLabel = document.createElement("label");
    strokeWidthLabel.textContent = "線幅:";
    strokeWidthLabel.style.marginRight = "5px";

    const strokeWidthSelect = document.createElement("select");
    strokeWidthSelect.id = "stroke-width";
    strokeWidthSelect.style.marginRight = "10px";
    strokeWidthSelect.addEventListener(
      "change",
      this.updateSelectedObjectStyle
    );

    const widths = [1, 2, 3, 5, 8];
    widths.forEach((width) => {
      const option = document.createElement("option");
      option.value = width;
      option.textContent = `${width}px`;
      if (width === 2) option.selected = true;
      strokeWidthSelect.appendChild(option);
    });

    // 透明度
    const opacityLabel = document.createElement("label");
    opacityLabel.textContent = "透明度:";
    opacityLabel.style.marginRight = "5px";

    const opacityInput = document.createElement("input");
    opacityInput.type = "range";
    opacityInput.min = "0";
    opacityInput.max = "1";
    opacityInput.step = "0.1";
    opacityInput.value = "1";
    opacityInput.id = "opacity-input";
    opacityInput.style.width = "80px";
    opacityInput.style.marginRight = "10px";
    opacityInput.addEventListener("change", this.updateSelectedObjectStyle);

    // コントロールを追加
    styleControls.appendChild(fillColorLabel);
    styleControls.appendChild(fillColorInput);
    styleControls.appendChild(strokeColorLabel);
    styleControls.appendChild(strokeColorInput);
    styleControls.appendChild(strokeWidthLabel);
    styleControls.appendChild(strokeWidthSelect);
    styleControls.appendChild(opacityLabel);
    styleControls.appendChild(opacityInput);

    // ツールバーに追加
    const deleteBtn = document.getElementById("delete-btn");
    if (deleteBtn) {
      toolbar.insertBefore(styleControls, deleteBtn);
    } else {
      toolbar.appendChild(styleControls);
    }
  }

  // 選択したオブジェクトを削除
  deleteSelectedObject() {
    if (!window.selectedObject) return;

    // 状態を保存
    if (window.saveState) {
      window.saveState();
    }

    // キャンバスから選択オブジェクトを削除
    const canvas = document.getElementById("canvas");
    if (canvas.contains(window.selectedObject)) {
      canvas.removeChild(window.selectedObject);
    }

    // 選択状態をクリア
    if (window.selectTool) {
      window.selectTool.deselectObject();
    }
    window.selectedObjects = [];
  }

  // 選択したオブジェクトのスタイルを更新
  updateSelectedObjectStyle() {
    if (!window.selectedObject) return;

    // 状態を保存
    if (window.saveState) {
      window.saveState();
    }

    window.selectedObject.setAttribute(
      "fill",
      document.getElementById("fill-color").value
    );
    window.selectedObject.setAttribute(
      "stroke",
      document.getElementById("stroke-color").value
    );
    window.selectedObject.setAttribute(
      "stroke-width",
      document.getElementById("stroke-width").value
    );
    window.selectedObject.setAttribute(
      "opacity",
      document.getElementById("opacity-input").value
    );
  }
}

window.StylePanel = StylePanel;
window.deleteSelectedObject = StylePanel.prototype.deleteSelectedObject;
window.updateSelectedObjectStyle =
  StylePanel.prototype.updateSelectedObjectStyle;
