// LayerPanel.js
// レイヤー管理パネル

class LayerPanel {
  constructor() {
    this.init();
  }

  init() {
    // レイヤーパネルを作成
    this.createLayerPanel();

    // レイヤー一覧を更新
    this.updateLayerList();
  }

  createLayerPanel() {
    const toolbar = document.querySelector(".toolbar");

    // レイヤー管理用のコンテナを作成
    const layerContainer = document.createElement("div");
    layerContainer.id = "layer-container";
    layerContainer.style.display = "flex";
    layerContainer.style.flexDirection = "column";
    layerContainer.style.marginRight = "15px";
    layerContainer.style.minWidth = "150px";
    layerContainer.style.border = "1px solid #ccc";
    layerContainer.style.padding = "5px";
    layerContainer.style.backgroundColor = "#f8f8f8";

    // レイヤーのタイトル
    const layerTitle = document.createElement("div");
    layerTitle.textContent = "レイヤー";
    layerTitle.style.fontWeight = "bold";
    layerTitle.style.marginBottom = "5px";
    layerContainer.appendChild(layerTitle);

    // レイヤーリスト
    const layerList = document.createElement("div");
    layerList.id = "layer-list";
    layerList.style.maxHeight = "120px";
    layerList.style.overflowY = "auto";
    layerList.style.marginBottom = "5px";
    layerContainer.appendChild(layerList);

    // レイヤー追加ボタン
    const addLayerBtn = document.createElement("button");
    addLayerBtn.id = "add-layer";
    addLayerBtn.textContent = "レイヤー追加";
    addLayerBtn.style.width = "100%";
    addLayerBtn.addEventListener("click", () => {
      const newLayerId =
        window.layers.length > 0
          ? Math.max(...window.layers.map((layer) => layer.id)) + 1
          : 1;

      window.layers.push({
        id: newLayerId,
        name: `レイヤー ${newLayerId}`,
        visible: true,
        locked: false,
        color: "#000000",
        lineStyle: "solid",
        lineWidth: "2",
      });

      window.currentLayerId = newLayerId;
      this.updateLayerList();
    });
    layerContainer.appendChild(addLayerBtn);

    // ツールバーの先頭に追加
    toolbar.insertBefore(layerContainer, toolbar.firstChild);
  }

  // レイヤー一覧を更新
  updateLayerList() {
    const layerList = document.getElementById("layer-list");
    layerList.innerHTML = "";

    window.layers.forEach((layer) => {
      const layerItem = document.createElement("div");
      layerItem.style.padding = "5px";
      layerItem.style.marginBottom = "5px";
      layerItem.style.backgroundColor =
        layer.id === window.currentLayerId ? "#e6f2ff" : "#f5f5f5";
      layerItem.style.cursor = "pointer";
      layerItem.style.display = "flex";
      layerItem.style.alignItems = "center";
      layerItem.style.flexWrap = "wrap";

      // 1行目: 可視性、名前、ロック、設定
      const row1 = document.createElement("div");
      row1.style.display = "flex";
      row1.style.alignItems = "center";
      row1.style.width = "100%";

      const visibilityCheckbox = document.createElement("input");
      visibilityCheckbox.type = "checkbox";
      visibilityCheckbox.checked = layer.visible;
      visibilityCheckbox.title = "表示/非表示";
      visibilityCheckbox.addEventListener("change", (e) => {
        e.stopPropagation();
        layer.visible = visibilityCheckbox.checked;
        this.updateLayerVisibility();
      });

      const nameSpan = document.createElement("span");
      nameSpan.textContent = layer.name;
      nameSpan.style.marginLeft = "5px";
      nameSpan.style.flex = "1";
      nameSpan.style.fontSize = "12px";

      // ロックボタン
      const lockBtn = document.createElement("button");
      lockBtn.textContent = layer.locked ? "🔒" : "🔓";
      lockBtn.style.padding = "2px 5px";
      lockBtn.style.fontSize = "12px";
      lockBtn.style.marginLeft = "3px";
      lockBtn.title = layer.locked ? "ロック解除" : "ロック";
      lockBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        layer.locked = !layer.locked;
        this.updateLayerList();
      });

      // 設定ボタン
      const settingsBtn = document.createElement("button");
      settingsBtn.textContent = "⚙";
      settingsBtn.style.padding = "2px 5px";
      settingsBtn.style.fontSize = "12px";
      settingsBtn.style.marginLeft = "3px";
      settingsBtn.title = "レイヤー設定";
      settingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.showLayerSettings(layer);
      });

      row1.appendChild(visibilityCheckbox);
      row1.appendChild(nameSpan);
      row1.appendChild(lockBtn);
      row1.appendChild(settingsBtn);

      layerItem.appendChild(row1);

      layerItem.addEventListener("click", (e) => {
        if (
          e.target !== visibilityCheckbox &&
          e.target !== lockBtn &&
          e.target !== settingsBtn
        ) {
          window.currentLayerId = layer.id;
          this.updateLayerList();
        }
      });

      layerList.appendChild(layerItem);
    });
  }

  // レイヤー設定ダイアログ
  showLayerSettings(layer) {
    const existingDialog = document.getElementById("layer-settings-dialog");
    if (existingDialog) {
      existingDialog.remove();
    }

    const dialog = document.createElement("div");
    dialog.id = "layer-settings-dialog";
    dialog.style.position = "fixed";
    dialog.style.top = "50%";
    dialog.style.left = "50%";
    dialog.style.transform = "translate(-50%, -50%)";
    dialog.style.background = "white";
    dialog.style.padding = "20px";
    dialog.style.border = "2px solid #333";
    dialog.style.borderRadius = "5px";
    dialog.style.zIndex = "10000";
    dialog.style.boxShadow = "0 4px 6px rgba(0,0,0,0.3)";

    const title = document.createElement("h3");
    title.textContent = `${layer.name} の設定`;
    title.style.marginTop = "0";
    dialog.appendChild(title);

    // レイヤー名
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "名前: ";
    nameLabel.style.display = "block";
    nameLabel.style.marginBottom = "5px";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = layer.name;
    nameInput.style.width = "200px";
    nameInput.style.marginBottom = "10px";
    nameLabel.appendChild(nameInput);
    dialog.appendChild(nameLabel);

    // 色
    const colorLabel = document.createElement("label");
    colorLabel.textContent = "色: ";
    colorLabel.style.display = "block";
    colorLabel.style.marginBottom = "5px";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = layer.color || "#000000";
    colorInput.style.marginBottom = "10px";
    colorLabel.appendChild(colorInput);
    dialog.appendChild(colorLabel);

    // 線種
    const lineStyleLabel = document.createElement("label");
    lineStyleLabel.textContent = "線種: ";
    lineStyleLabel.style.display = "block";
    lineStyleLabel.style.marginBottom = "5px";
    const lineStyleSelect = document.createElement("select");
    lineStyleSelect.style.marginBottom = "10px";
    const styles = [
      { value: "solid", label: "実線" },
      { value: "dashed", label: "破線" },
      { value: "dotted", label: "点線" },
    ];
    styles.forEach((style) => {
      const option = document.createElement("option");
      option.value = style.value;
      option.textContent = style.label;
      if (layer.lineStyle === style.value) option.selected = true;
      lineStyleSelect.appendChild(option);
    });
    lineStyleLabel.appendChild(lineStyleSelect);
    dialog.appendChild(lineStyleLabel);

    // 線幅
    const lineWidthLabel = document.createElement("label");
    lineWidthLabel.textContent = "線幅: ";
    lineWidthLabel.style.display = "block";
    lineWidthLabel.style.marginBottom = "5px";
    const lineWidthInput = document.createElement("input");
    lineWidthInput.type = "number";
    lineWidthInput.value = layer.lineWidth || "2";
    lineWidthInput.min = "0.5";
    lineWidthInput.step = "0.5";
    lineWidthInput.style.width = "80px";
    lineWidthInput.style.marginBottom = "10px";
    lineWidthLabel.appendChild(lineWidthInput);
    dialog.appendChild(lineWidthLabel);

    // ボタン
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "flex-end";
    buttonContainer.style.gap = "10px";

    const okBtn = document.createElement("button");
    okBtn.textContent = "OK";
    okBtn.addEventListener("click", () => {
      layer.name = nameInput.value;
      layer.color = colorInput.value;
      layer.lineStyle = lineStyleSelect.value;
      layer.lineWidth = lineWidthInput.value;
      this.updateLayerList();
      this.applyLayerStyles(layer);
      dialog.remove();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "キャンセル";
    cancelBtn.addEventListener("click", () => {
      dialog.remove();
    });

    buttonContainer.appendChild(okBtn);
    buttonContainer.appendChild(cancelBtn);
    dialog.appendChild(buttonContainer);

    document.body.appendChild(dialog);
  }

  // レイヤーのスタイルを適用
  applyLayerStyles(layer) {
    document.querySelectorAll(`[data-layer="${layer.id}"]`).forEach((el) => {
      if (layer.color) {
        el.setAttribute("stroke", layer.color);
      }
      if (layer.lineWidth) {
        el.setAttribute("stroke-width", layer.lineWidth);
      }
      if (layer.lineStyle) {
        const dashArrays = {
          solid: "none",
          dashed: "10,5",
          dotted: "2,3",
        };
        el.setAttribute("stroke-dasharray", dashArrays[layer.lineStyle] || "none");
      }
    });
  }

  // レイヤーの表示/非表示を更新
  updateLayerVisibility() {
    document.querySelectorAll("[data-layer]").forEach((el) => {
      const layerId = parseInt(el.getAttribute("data-layer"));
      const layer = window.layers.find((l) => l.id === layerId);

      if (layer) {
        el.style.display = layer.visible ? "inline" : "none";
      }
    });
  }
}

window.LayerPanel = LayerPanel;
window.updateLayerList = LayerPanel.prototype.updateLayerList;
window.updateLayerVisibility = LayerPanel.prototype.updateLayerVisibility;
