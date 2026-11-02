// JoinTool.js
// 結合ツール（複数の線を1つのポリラインに結合）
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createElement(): SVG要素作成
// - GeometryUtils.distance(): 2点間距離

class JoinTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedElements = [];
  }

  getTitle() {
    return "結合";
  }

  getInstructions() {
    const count = this.selectedElements.length;
    const instructions = [
      "左クリック: 線またはポリラインを選択/解除",
      "Enter: 選択した要素をつないで1本のポリラインにする",
      "Esc: 選択をすべてクリア",
    ];

    if (count === 0) {
      instructions.unshift("結合したい線を2本以上選択");
    } else {
      instructions.unshift(`現在${count}本選択中`);
    }

    return instructions;
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.createJoinControls();
    this.updatePanel();
  }

  deactivate() {
    super.deactivate();
    this.removeJoinControls();
    this.clearSelection();
    this.updatePanel();
  }

  createJoinControls() {
    if (document.getElementById("join-controls")) return;

    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    const controls = document.createElement("div");
    controls.id = "join-controls";
    controls.className = "style-control-group";

    const heading = document.createElement("h4");
    heading.textContent = "結合操作";
    controls.appendChild(heading);

    const info = document.createElement("p");
    info.className = "control-info";
    info.textContent = "線を選択 (Enterで結合、Escでクリア)";
    controls.appendChild(info);

    container.appendChild(controls);
  }

  removeJoinControls() {
    const controls = document.getElementById("join-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (event.target === this.canvas) return;

    if (event.target.tagName === "line" || event.target.tagName === "polyline") {
      this.toggleSelection(event.target);
    }
  }

  toggleSelection(element) {
    if (this.selectedElements.includes(element)) {
      this.deselectElement(element);
    } else {
      this.selectElement(element);
    }
  }

  selectElement(element) {
    this.selectedElements.push(element);
    element.setAttribute("data-vector-highlight", "join");

    this.updateInfo();
    this.updatePanel();
  }

  deselectElement(element) {
    const index = this.selectedElements.indexOf(element);
    if (index > -1) {
      this.selectedElements.splice(index, 1);
      element.removeAttribute("data-vector-highlight");
    }

    this.updateInfo();
    this.updatePanel();
  }

  clearSelection() {
    this.selectedElements.forEach((element) => {
      element.removeAttribute("data-vector-highlight");
    });
    this.selectedElements = [];
    this.updateInfo();
    this.updatePanel();
  }

  updateInfo() {
    const info = document.querySelector("#join-controls .control-info");
    if (info) {
      info.textContent = `線を選択 (${this.selectedElements.length}個選択中、Enterで結合、Escでクリア)`;
    }
  }

  joinElements() {
    if (this.selectedElements.length < 2) {
      console.log("少なくとも2つの線を選択してください");
      return;
    }

    // 全ての要素を点の配列に変換
    const segments = this.selectedElements.map(el => window.VectorUtils.linearEditing.outline(el, this.canvas)?.points ?? []);

    // 連結された線を見つけて順序付け
    const orderedPoints = this.run("join", {segments});

    if (orderedPoints.length === 0) {
      console.log("選択した線は連結されていません");
      return;
    }

    this.saveState();

    // 元の要素の属性を取得（最初の要素から）
    const firstElement = this.selectedElements[0];
    const stroke = firstElement.getAttribute("stroke");
    const strokeWidth = firstElement.getAttribute("stroke-width");
    const layerId = firstElement.getAttribute("data-layer");

    // 元の要素を削除
    this.selectedElements.forEach((el) => {
      el.parentNode.removeChild(el);
    });

    // 新しいポリラインを作成（SvgUtils.createElement を使用）
    const polyline = window.SvgUtils.createElement("polyline", {
      points: orderedPoints.map((p) => `${p.x},${p.y}`).join(" "),
      stroke: stroke,
      "stroke-width": strokeWidth,
      fill: "none",
      "data-layer": layerId
    });

    this.canvas.appendChild(polyline);
    this.clearSelection();
    this.updatePanel();
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      this.joinElements();
    }

    if (event.key === "Escape") {
      this.clearSelection();
      this.updatePanel();
    }
  }
}

window.JoinTool = JoinTool;
