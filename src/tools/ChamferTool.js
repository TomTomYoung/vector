// ChamferTool.js
// 面取りツール（2つの線の間に斜線を作成）
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createLine(): 線分要素作成
// - GeometryUtils.distance(): 2点間距離
// - GeometryUtils.normalizeVector(): ベクトル正規化

class ChamferTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedLines = [];
    this.distance1 = 10;
    this.distance2 = 10;
  }

  getTitle() {
    return "面取り";
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
        "左クリック: 2本目の線を選択（自動的に面取り作成）",
        "Esc: 選択解除",
      ];
    }
    return [];
  }

  getToolProperties() {
    return [
      {
        type: "number",
        label: "距離1",
        value: this.distance1,
        min: 0.5,
        max: 1000,
        step: 0.5,
        onChange: (value) => {
          this.distance1 = value;
        },
      },
      {
        type: "number",
        label: "距離2",
        value: this.distance2,
        min: 0.5,
        max: 1000,
        step: 0.5,
        onChange: (value) => {
          this.distance2 = value;
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
      line.setAttribute("data-vector-highlight", "chamfer");

      // パネルを更新
      this.updatePanel();

      // 2つ選択されたら面取りを作成
      if (this.selectedLines.length === 2) {
        this.createChamfer();
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

  createChamfer() {
    this.editCorner("chamfer", this.selectedLines, {distance1: this.distance1, distance2: this.distance2});
    this.clearSelection();
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      this.clearSelection();
    }
  }
}

window.ChamferTool = ChamferTool;
