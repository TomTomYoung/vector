// FilletTool.js
// フィレットツール（2つの線の間に円弧を作成）
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createElement(): SVG要素作成
// - GeometryUtils.distance(): 2点間距離
// - GeometryUtils.normalizeVector(): ベクトル正規化
// - GeometryUtils.dotProduct(): 内積計算

class FilletTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedLines = [];
    this.radius = 10;
  }

  getTitle() {
    return "フィレット";
  }

  getInstructions() {
    const count = this.selectedLines.length;
    if (count === 0) {
      return [
        "左クリック: 1本目の線を選択",
        "Esc: 選択解除",
      ];
    } else if (count === 1) {
      return [
        "左クリック: 2本目の線を選択（自動的にフィレット作成）",
        "Esc: 選択解除",
      ];
    }
    return [];
  }

  getToolProperties() {
    return [
      {
        type: "number",
        label: "半径",
        value: this.radius,
        min: 0.5,
        max: 1000,
        step: 0.5,
        onChange: (value) => {
          this.radius = value;
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
    this.clearSelection();
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (event.target === this.canvas) return;

    if (event.target.tagName === "line") {
      this.selectLine(event.target);
    }
  }

  selectLine(line) {
    if (this.selectedLines.includes(line)) {
      // 既に選択されている場合は解除
      this.deselectLine(line);
    } else if (this.selectedLines.length < 2) {
      // 新しく選択
      this.selectedLines.push(line);
      line.setAttribute("data-vector-highlight", "fillet");

      // パネルを更新
      this.updatePanel();

      // 2つ選択されたらフィレットを作成
      if (this.selectedLines.length === 2) {
        this.createFillet();
      }
    }
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  deselectLine(line) {
    const index = this.selectedLines.indexOf(line);
    if (index > -1) {
      this.selectedLines.splice(index, 1);
      line.removeAttribute("data-vector-highlight");
    }
  }

  clearSelection() {
    this.selectedLines.forEach((line) => {
      line.removeAttribute("data-vector-highlight");
    });
    this.selectedLines = [];
    this.updatePanel();
  }

  createFillet() {
    this.editCorner("fillet", this.selectedLines, {radius: this.radius});
    this.clearSelection();
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      this.clearSelection();
    }
  }
}

window.FilletTool = FilletTool;
