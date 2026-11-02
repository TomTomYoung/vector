// ArcTool.js
// 円弧描画ツール（3点指定：始点、通過点、終点）
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createElement(), createCircle(): SVG要素作成
// - GeometryUtils.distance(): 2点間距離
// - GeometryUtils.normalizeAngle(): 角度正規化

class ArcTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.points = []; // 始点、通過点、終点
    this.currentArc = null;
    this.previewCircle = null;
  }

  getTitle() {
    return "円弧";
  }

  getInstructions() {
    const stepPrompts = [
      "左クリック: 円弧の始点を指定",
      "左クリック: 円弧が通過する2点目を指定",
      "左クリック: 円弧の終点を指定して確定",
    ];

    const instructions = ["3点を順番にクリックして円弧を作成"];
    instructions.push(stepPrompts[Math.min(this.points.length, 2)]);

    if (this.points.length === 1) {
      instructions.push("マウス移動: 半径プレビューを確認");
    }
    if (this.points.length === 2) {
      instructions.push("マウス移動: 3点目に応じた円弧をプレビュー");
    }

    instructions.push("Esc: 入力中の円弧をキャンセル");

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
    this.updatePanel();
  }

  deactivate() {
    super.deactivate();
    this.cancelArc();
  }

  cancelArc() {
    if (this.currentArc) {
      this.canvas.removeChild(this.currentArc);
      this.currentArc = null;
    }
    if (this.previewCircle) {
      this.canvas.removeChild(this.previewCircle);
      this.previewCircle = null;
    }
    this.points = [];
    this.updatePanel();
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);
    const point = this.getMousePosition(event);

    if (this.points.length === 0) {
      // 始点
      this.points.push(point);
      this.createPreviewCircle(point);
    } else if (this.points.length === 1) {
      // 通過点
      this.points.push(point);
      this.updatePreview();
    } else if (this.points.length === 2) {
      // 終点
      this.points.push(point);
      this.finishArc();
    }

    this.updatePanel();
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);
    const point = this.getMousePosition(event);

    if (this.points.length === 1) {
      // 始点から現在位置までの円をプレビュー（GeometryUtils.distance を使用）
      const radius = window.GeometryUtils.distance(this.points[0], point);
      if (this.previewCircle) {
        this.previewCircle.setAttribute("r", radius);
      }
    } else if (this.points.length === 2) {
      // 3点から円弧を計算してプレビュー
      this.updateArcPreview(point);
    }
  }

  createPreviewCircle(center) {
    // SvgUtils.createCircle を使用
    this.previewCircle = window.SvgUtils.createCircle(center.x, center.y, 0, {
      stroke: "#999",
      "stroke-width": "1",
      "stroke-dasharray": "5,5",
      fill: "none"
    });
    this.canvas.appendChild(this.previewCircle);
  }

  updatePreview() {
    if (this.previewCircle) {
      this.canvas.removeChild(this.previewCircle);
      this.previewCircle = null;
    }
  }

  updateArcPreview(endPoint) {
    if (this.currentArc) {
      this.currentArc.remove();
      this.currentArc = null;
    }

    const arcData = this.calculateArc(
      this.points[0],
      this.points[1],
      endPoint
    );
    if (!arcData) return;

    // SvgUtils.createElement を使用
    this.currentArc = window.SvgUtils.createElement("path", {
      d: arcData.path,
      stroke: this.currentStyle.stroke,
      "stroke-width": this.currentStyle.strokeWidth,
      fill: "none",
      opacity: this.currentStyle.opacity
    });
    this.canvas.appendChild(this.currentArc);
  }

  finishArc() {
    if (this.points.length !== 3) return;

    const arcData = this.calculateArc(
      this.points[0],
      this.points[1],
      this.points[2]
    );
    if (!arcData) {
      this.cancelArc();
      return;
    }

    // 状態を保存
    this.saveState();

    this.currentArc?.remove();
    const arc = window.SvgUtils.createElement("path", {d: arcData.path});
    this.applyDefaultAttributes(arc);
    arc.setAttribute("fill", "none");
    arc.setAttribute("data-arc-tool", "true");
    this.canvas.appendChild(arc);
    this.currentArc = null;

    this.points = [];
    if (this.previewCircle) {
      this.canvas.removeChild(this.previewCircle);
      this.previewCircle = null;
    }

    this.updatePanel();
  }

  calculateArc(p1, p2, p3) {
    // 3点から円弧を計算
    // 円の中心を求める
    const center = this.calculateCircleCenter(p1, p2, p3);
    if (!center) return null;

    // GeometryUtils.distance を使用
    const radius = window.GeometryUtils.distance(center, p1);

    // 各点の角度を計算
    const angle1 = Math.atan2(p1.y - center.y, p1.x - center.x);
    const angle2 = Math.atan2(p2.y - center.y, p2.x - center.x);
    const angle3 = Math.atan2(p3.y - center.y, p3.x - center.x);

    // 円弧の方向を判定
    const largeArc = this.isLargeArc(angle1, angle2, angle3) ? 1 : 0;
    const sweep = this.getSweepFlag(angle1, angle2, angle3) ? 1 : 0;

    // SVG pathコマンドを生成
    const path = `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${p3.x} ${p3.y}`;

    return { path, center, radius };
  }

  calculateCircleCenter(p1, p2, p3) {
    // 3点から円の中心を計算
    const ax = p1.x;
    const ay = p1.y;
    const bx = p2.x;
    const by = p2.y;
    const cx = p3.x;
    const cy = p3.y;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 0.0001) return null; // 3点が一直線上

    const ux =
      ((ax * ax + ay * ay) * (by - cy) +
        (bx * bx + by * by) * (cy - ay) +
        (cx * cx + cy * cy) * (ay - by)) /
      d;
    const uy =
      ((ax * ax + ay * ay) * (cx - bx) +
        (bx * bx + by * by) * (ax - cx) +
        (cx * cx + cy * cy) * (bx - ax)) /
      d;

    return { x: ux, y: uy };
  }

  isLargeArc(a1, a2, a3) {
    // 円弧が180度以上かどうか（GeometryUtils.normalizeAngle を使用）
    const diff = window.GeometryUtils.normalizeAngle(a3 - a1);
    return Math.abs(diff) > Math.PI;
  }

  getSweepFlag(a1, a2, a3) {
    // 時計回りか反時計回りか
    const cross =
      (a2 - a1) * Math.sin(a3 - a2) - (a3 - a2) * Math.sin(a2 - a1);
    return cross > 0;
  }

  handleKeyDown(event) {
    // Escapeキーでキャンセル
    if (event.key === "Escape") {
      this.cancelArc();
    }
  }

  handleKeyDown(event) {
    if (event.key === "Escape" && this.points.length > 0) {
      this.cancelArc();
    }
  }
}

window.ArcTool = ArcTool;
