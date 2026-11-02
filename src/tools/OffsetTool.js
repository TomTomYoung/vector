// OffsetTool.js
// オフセット（平行線）ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createElement(), createLine(), createCircle(), createRect(): SVG要素作成
// - GeometryUtils.vectorLength(): ベクトルの長さ
// - GeometryUtils.distance(): 2点間距離

class OffsetTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedElement = null;
    this.offsetDistance = 10;
  }

  getTitle() {
    return "オフセット";
  }

  getInstructions() {
    const instructions = ["ツールプロパティの『オフセット距離』で離れ幅を設定"];

    if (!this.selectedElement) {
      instructions.push("左クリック: オフセットする線分・図形を選択");
      instructions.push("対応図形: 線分 / ポリライン / 矩形 / 円");
    } else {
      instructions.push("左クリック: 選択図形の外側/内側をクリックして方向を決定");
      instructions.push("指定した側に複製を作成し、次の図形を選択");
    }

    instructions.push("Esc: 選択解除");

    return instructions;
  }

  getToolProperties() {
    return [
      {
        type: "number",
        label: "オフセット距離",
        value: this.offsetDistance,
        min: 0.5,
        max: 1000,
        step: 0.5,
        onChange: (value) => {
          this.offsetDistance = value;
        },
      },
    ];
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
  }

  deactivate() {
    super.deactivate();
    this.selectedElement = null;
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    // The second click is normally on empty canvas, on the desired side.
    if (!this.selectedElement) {
      if (!["line", "polyline", "rect", "circle"].includes(event.target.tagName) ||
          event.target.closest(DrawingDocument.helpers)) return;
      this.selectedElement = event.target;
      this.highlightElement(this.selectedElement);
      this.updatePanel();
    } else {
      // 2回目のクリック: オフセット方向を決定
      const point = this.getMousePosition(event);
      this.createOffset(point);
      this.unhighlightElement(this.selectedElement);
      this.selectedElement = null;
      this.updatePanel();
    }
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  highlightElement(element) {
    element.setAttribute("data-vector-highlight", "offset");
  }

  unhighlightElement(element) {
    element.removeAttribute("data-vector-highlight");
  }

  createOffset(point) {
    const source = this.selectedElement;
    const host = this.toolManager.host;
    const toLocal = source.getScreenCTM().inverse().multiply(this.canvas.getScreenCTM());
    const local = new DOMPoint(point.x, point.y).matrixTransform(toLocal);
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) return;
    const shape = host.readShape(source);
    const copy = shape && this.draw("offset", {shape, point: local, amount: this.offsetDistance});
    if (!copy) return;
    window.SvgUtils.setAttributes(copy, {
      stroke: source.getAttribute("stroke"), "stroke-width": source.getAttribute("stroke-width"),
      fill: ["circle", "rectangle"].includes(shape.kind) ? source.getAttribute("fill") || "none" : "none",
      transform: source.getAttribute("transform"), "data-layer": window.currentLayerId,
    });
    this.saveState();
    source.parentNode.appendChild(copy);
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      if (this.selectedElement) {
        this.unhighlightElement(this.selectedElement);
        this.selectedElement = null;
      }
    }
  }
}

window.OffsetTool = OffsetTool;
