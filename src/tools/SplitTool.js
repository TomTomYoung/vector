// SplitTool.js
// 分割ツール（線を指定点で分割）
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createLine(), createElement(): SVG要素作成
// - GeometryUtils.distance(): 2点間距離

class SplitTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
  }

  getTitle() {
    return "分割";
  }

  getInstructions() {
    return [
      "線またはポリライン上をクリック: クリック位置で分割",
      "端点付近では分割されないので少し離してクリック",
      "直線だけの開いたパスにも対応。曲線・閉じたパスは対象外",
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
    this.createSplitControls();
    this.updatePanel();
  }

  deactivate() {
    super.deactivate();
    this.removeSplitControls();
    this.updatePanel();
  }

  createSplitControls() {
    if (document.getElementById("split-controls")) return;

    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    const controls = document.createElement("div");
    controls.id = "split-controls";
    controls.className = "style-control-group";

    const heading = document.createElement("h4");
    heading.textContent = "分割操作";
    controls.appendChild(heading);

    const info = document.createElement("p");
    info.className = "control-info";
    info.textContent = "線上をクリックして分割";
    controls.appendChild(info);

    container.appendChild(controls);
  }

  removeSplitControls() {
    const controls = document.getElementById("split-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    const clickPoint = this.getMousePosition(event);

    window.VectorUtils.linearEditing.split(event.target, this.canvas, clickPoint);
    this.updatePanel();
  }
}

window.SplitTool = SplitTool;
