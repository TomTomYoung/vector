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
    const layerPanel = document.createElement("div");
    layerPanel.style.position = "absolute";
    layerPanel.style.right = "10px";
    layerPanel.style.top = "60px";
    layerPanel.style.width = "150px";
    layerPanel.style.background = "white";
    layerPanel.style.border = "1px solid #ccc";
    layerPanel.style.padding = "10px";
    layerPanel.style.zIndex = "100";
    layerPanel.innerHTML = `
        <h3>レイヤー</h3>
        <div id="layer-list"></div>
        <button id="add-layer">レイヤー追加</button>
      `;
    document.body.appendChild(layerPanel);

    // レイヤー追加ボタンのイベント処理
    document.getElementById("add-layer").addEventListener("click", () => {
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
