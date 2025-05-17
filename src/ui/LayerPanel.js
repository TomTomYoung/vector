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

      const visibilityCheckbox = document.createElement("input");
      visibilityCheckbox.type = "checkbox";
      visibilityCheckbox.checked = layer.visible;
      visibilityCheckbox.addEventListener("change", () => {
        layer.visible = visibilityCheckbox.checked;
        this.updateLayerVisibility();
      });

      const nameSpan = document.createElement("span");
      nameSpan.textContent = layer.name;
      nameSpan.style.marginLeft = "5px";
      nameSpan.style.flex = "1";

      layerItem.appendChild(visibilityCheckbox);
      layerItem.appendChild(nameSpan);

      layerItem.addEventListener("click", (e) => {
        if (e.target !== visibilityCheckbox) {
          window.currentLayerId = layer.id;
          this.updateLayerList();
        }
      });

      layerList.appendChild(layerItem);
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
