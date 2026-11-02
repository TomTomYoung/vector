// ExtendTool.js
// 延長ツール（線分を境界まで延長する）
//
// 【依存関係】
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - GeometryUtils.distance(): 2点間距離
// - GeometryUtils.vectorLength(): ベクトルの長さ

class ExtendTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.boundaryEdges = [];
    this.mode = "select"; // 'select' or 'extend'
  }

  getTitle() {
    return "延長";
  }

  getInstructions() {
    if (this.mode === "select") {
      const base = ["左クリック: 境界となる線・ポリライン・直線だけの開いたパスを選択"];
      if (this.boundaryEdges.length > 0) {
        base.push("Enter: 選択した境界で延長モードに切り替え");
        base.push("再クリック: 境界選択を解除");
      } else {
        base.push("複数の境界を選択可能 (クリックで追加)");
      }
      base.push("Esc: 選択を全てクリア");
      return base;
    }

    return [
      "左クリック: 境界まで延長したい線分を選択",
      "Esc: 境界選択に戻ってやり直し",
    ];
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.createExtendControls();
    this.updatePanel();
  }

  deactivate() {
    super.deactivate();
    this.removeExtendControls();
    this.clearBoundaryEdges();
    this.mode = "select";
    this.updatePanel();
  }

  createExtendControls() {
    if (document.getElementById("extend-controls")) return;

    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    const controls = document.createElement("div");
    controls.id = "extend-controls";
    controls.className = "style-control-group";

    const heading = document.createElement("h4");
    heading.textContent = "延長操作";
    controls.appendChild(heading);

    const info = document.createElement("p");
    info.className = "control-info";
    info.textContent = "境界辺を選択してEnter、その後延長する線をクリック";
    controls.appendChild(info);

    container.appendChild(controls);
  }

  removeExtendControls() {
    const controls = document.getElementById("extend-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (event.target === this.canvas) return;

    if (this.mode === "select") {
      // 境界辺を選択
      if (this.boundaryEdges.includes(event.target)) {
        // 既に選択されている場合は解除
        this.removeBoundaryEdge(event.target);
      } else {
        this.addBoundaryEdge(event.target);
      }
    } else if (this.mode === "extend") {
      // 延長実行
      this.extendElement(event.target);
    }
  }

  addBoundaryEdge(element) {
    if (window.VectorUtils.linearEditing.localPoints(element).length < 2) return;

    this.boundaryEdges.push(element);
    element.setAttribute("data-vector-highlight", "extend");

    this.updatePanel();
  }

  removeBoundaryEdge(element) {
    const index = this.boundaryEdges.indexOf(element);
    if (index > -1) {
      this.boundaryEdges.splice(index, 1);
    }

    element.removeAttribute("data-vector-highlight");

    this.updatePanel();
  }

  clearBoundaryEdges() {
    [...this.boundaryEdges].forEach((edge) => {
      this.removeBoundaryEdge(edge);
    });
    this.boundaryEdges = [];

    this.updatePanel();
  }

  extendElement(element) {
    this.editOutline("extend", element, this.boundaryEdges);
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      // 境界辺選択モードから延長モードへ
      if (this.mode === "select" && this.boundaryEdges.length > 0) {
        this.mode = "extend";
        const info = document.querySelector("#extend-controls span");
        if (info) {
          info.textContent = "延長する線をクリック (Escでリセット)";
        }
        this.updatePanel();
      }
    }

    if (event.key === "Escape") {
      this.clearBoundaryEdges();
      this.mode = "select";
      const info = document.querySelector("#extend-controls span");
      if (info) {
        info.textContent = "境界辺を選択してEnter、その後延長する線をクリック";
      }
      this.updatePanel();
    }
  }
}

window.ExtendTool = ExtendTool;
