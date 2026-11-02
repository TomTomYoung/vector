// TrimTool.js
// トリムツール（線分を切り取る）
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createLine(): 線分要素作成
// - GeometryUtils.lineIntersection(): 線分交点計算
// - GeometryUtils.distance(): 2点間距離

class TrimTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.cuttingEdges = [];
    this.mode = "select"; // 'select' or 'trim'
  }

  getTitle() {
    return "トリム";
  }

  getInstructions() {
    const instructions = ["対象: 線・ポリライン・直線だけの開いたパス"];

    if (this.mode === "select") {
      instructions.push("左クリック: 切断に使う線分を選択 (複数可)");
      instructions.push("Enter: 選択した線分でトリムモードに切り替え");
      if (this.cuttingEdges.length > 0) {
        instructions.push(`選択中の切断辺: ${this.cuttingEdges.length} 本`);
      }
    } else {
      instructions.push("左クリック: 削除したい区間をクリック");
      instructions.push("切断辺を追加したい場合はEscでリセットして再選択");
    }

    instructions.push("Esc: 選択をクリアして切断辺の選び直し");

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
    this.createTrimControls();
    this.updatePanel();
  }

  deactivate() {
    super.deactivate();
    this.removeTrimControls();
    this.clearCuttingEdges();
    this.mode = "select";
  }

  createTrimControls() {
    if (document.getElementById("trim-controls")) return;

    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    const controls = document.createElement("div");
    controls.id = "trim-controls";
    controls.className = "style-control-group";

    const heading = document.createElement("h4");
    heading.textContent = "トリム操作";
    controls.appendChild(heading);

    const info = document.createElement("p");
    info.className = "control-info";
    info.textContent = "切断辺を選択してEnter、その後トリムする部分をクリック";
    controls.appendChild(info);

    container.appendChild(controls);
  }

  updateTrimInfoText(message) {
    const info = document.querySelector("#trim-controls .control-info");
    if (info) {
      info.textContent = message;
    }
  }

  removeTrimControls() {
    const controls = document.getElementById("trim-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (event.target === this.canvas) return;

    if (this.mode === "select") {
      // 切断辺を選択
      if (this.cuttingEdges.includes(event.target)) {
        // 既に選択されている場合は解除
        this.removeCuttingEdge(event.target);
      } else {
        this.addCuttingEdge(event.target);
      }
    } else if (this.mode === "trim") {
      // トリム実行
      this.trimElement(event.target, this.getMousePosition(event));
    }
  }

  addCuttingEdge(element) {
    if (window.VectorUtils.linearEditing.localPoints(element).length < 2) return;

    this.cuttingEdges.push(element);
    element.setAttribute("data-vector-highlight", "trim");
    this.updatePanel();
  }

  removeCuttingEdge(element) {
    const index = this.cuttingEdges.indexOf(element);
    if (index > -1) {
      this.cuttingEdges.splice(index, 1);
    }

    element.removeAttribute("data-vector-highlight");
    this.updatePanel();
  }

  clearCuttingEdges() {
    [...this.cuttingEdges].forEach((edge) => {
      this.removeCuttingEdge(edge);
    });
    this.cuttingEdges = [];
  }

  trimElement(element, clickPoint) {
    this.editOutline("trim", element, this.cuttingEdges, clickPoint);
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      // 切断辺選択モードからトリムモードへ
      if (this.mode === "select" && this.cuttingEdges.length > 0) {
        this.mode = "trim";
        this.updateTrimInfoText("トリムする部分をクリック (Escでリセット)");
        this.updatePanel();
      }
    }

    if (event.key === "Escape") {
      this.clearCuttingEdges();
      this.mode = "select";
      this.updateTrimInfoText("切断辺を選択してEnter、その後トリムする部分をクリック");
      this.updatePanel();
    }
  }
}

window.TrimTool = TrimTool;
