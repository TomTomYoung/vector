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
    if (this.selectedLines.length !== 2) return;

    const line1 = this.selectedLines[0];
    const line2 = this.selectedLines[1];

    const p1 = {
      x: parseFloat(line1.getAttribute("x1")),
      y: parseFloat(line1.getAttribute("y1")),
    };
    const p2 = {
      x: parseFloat(line1.getAttribute("x2")),
      y: parseFloat(line1.getAttribute("y2")),
    };
    const p3 = {
      x: parseFloat(line2.getAttribute("x1")),
      y: parseFloat(line2.getAttribute("y1")),
    };
    const p4 = {
      x: parseFloat(line2.getAttribute("x2")),
      y: parseFloat(line2.getAttribute("y2")),
    };

    // 2直線の交点を計算（無限延長）
    const intersection = this.lineLineIntersectionInfinite(p1, p2, p3, p4);
    if (!intersection) {
      console.log("平行な線は面取りできません");
      this.clearSelection();
      return;
    }

    // 各線の方向ベクトルを正規化（GeometryUtils.normalizeVector を使用）
    const dir1 = window.GeometryUtils.normalizeVector({
      x: p2.x - p1.x,
      y: p2.y - p1.y,
    });
    const dir2 = window.GeometryUtils.normalizeVector({
      x: p4.x - p3.x,
      y: p4.y - p3.y,
    });

    // 交点から線分の端点への方向を調整（GeometryUtils.distance を使用）
    const dist1_1 = window.GeometryUtils.distance(intersection, p1);
    const dist1_2 = window.GeometryUtils.distance(intersection, p2);
    if (dist1_2 < dist1_1) {
      dir1.x = -dir1.x;
      dir1.y = -dir1.y;
    }

    const dist2_1 = window.GeometryUtils.distance(intersection, p3);
    const dist2_2 = window.GeometryUtils.distance(intersection, p4);
    if (dist2_2 < dist2_1) {
      dir2.x = -dir2.x;
      dir2.y = -dir2.y;
    }

    // 面取りの端点を計算
    const chamferPoint1 = {
      x: intersection.x + dir1.x * this.distance1,
      y: intersection.y + dir1.y * this.distance1,
    };

    const chamferPoint2 = {
      x: intersection.x + dir2.x * this.distance2,
      y: intersection.y + dir2.y * this.distance2,
    };

    this.saveState();

    // 面取り線を作成（SvgUtils.createLine を使用）
    const chamferLine = window.SvgUtils.createLine(
      chamferPoint1.x,
      chamferPoint1.y,
      chamferPoint2.x,
      chamferPoint2.y,
      {
        stroke: line1.getAttribute("stroke"),
        "stroke-width": line1.getAttribute("stroke-width"),
        fill: "none",
        "data-layer": window.currentLayerId
      }
    );

    // 線分を面取り点まで短縮（GeometryUtils.distance を使用）
    // line1の短縮
    const distToP1 = window.GeometryUtils.distance(chamferPoint1, p1);
    const distToP2 = window.GeometryUtils.distance(chamferPoint1, p2);
    if (distToP1 < distToP2) {
      line1.setAttribute("x1", chamferPoint1.x);
      line1.setAttribute("y1", chamferPoint1.y);
    } else {
      line1.setAttribute("x2", chamferPoint1.x);
      line1.setAttribute("y2", chamferPoint1.y);
    }

    // line2の短縮
    const distToP3 = window.GeometryUtils.distance(chamferPoint2, p3);
    const distToP4 = window.GeometryUtils.distance(chamferPoint2, p4);
    if (distToP3 < distToP4) {
      line2.setAttribute("x1", chamferPoint2.x);
      line2.setAttribute("y1", chamferPoint2.y);
    } else {
      line2.setAttribute("x2", chamferPoint2.x);
      line2.setAttribute("y2", chamferPoint2.y);
    }

    this.canvas.appendChild(chamferLine);
    this.clearSelection();
  }

  // 2直線の交点を計算（無限延長）
  lineLineIntersectionInfinite(p1, p2, p3, p4) {
    const x1 = p1.x,
      y1 = p1.y;
    const x2 = p2.x,
      y2 = p2.y;
    const x3 = p3.x,
      y3 = p3.y;
    const x4 = p4.x,
      y4 = p4.y;

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      this.clearSelection();
    }
  }
}

window.ChamferTool = ChamferTool;
