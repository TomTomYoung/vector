// FilletTool.js
// フィレットツール（2つの線の間に円弧を作成）
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
      const originalStroke = line.getAttribute("stroke") || "#000000";
      line.setAttribute("data-original-stroke", originalStroke);
      line.setAttribute("stroke", "#0080ff");
      line.setAttribute("stroke-width", "2");

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
      const originalStroke = line.getAttribute("data-original-stroke");
      line.setAttribute("stroke", originalStroke);
      line.removeAttribute("data-original-stroke");
    }
  }

  clearSelection() {
    this.selectedLines.forEach((line) => {
      const originalStroke = line.getAttribute("data-original-stroke");
      if (originalStroke) {
        line.setAttribute("stroke", originalStroke);
        line.removeAttribute("data-original-stroke");
      }
    });
    this.selectedLines = [];
    this.updatePanel();
  }

  createFillet() {
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
      console.log("平行な線はフィレットできません");
      this.clearSelection();
      return;
    }

    // 各線の方向ベクトルを計算
    const dir1 = this.normalize({
      x: p2.x - p1.x,
      y: p2.y - p1.y,
    });
    const dir2 = this.normalize({
      x: p4.x - p3.x,
      y: p4.y - p3.y,
    });

    // 交点から線分の端点への方向を調整
    // 交点に近い端点を基準に方向を決定
    const dist1_1 = this.distance(intersection, p1);
    const dist1_2 = this.distance(intersection, p2);
    if (dist1_2 < dist1_1) {
      dir1.x = -dir1.x;
      dir1.y = -dir1.y;
    }

    const dist2_1 = this.distance(intersection, p3);
    const dist2_2 = this.distance(intersection, p4);
    if (dist2_2 < dist2_1) {
      dir2.x = -dir2.x;
      dir2.y = -dir2.y;
    }

    // 2つの方向ベクトルの間の角度の二等分線方向
    const bisector = this.normalize({
      x: dir1.x + dir2.x,
      y: dir1.y + dir2.y,
    });

    // 角度を計算
    const angle = Math.acos(dir1.x * dir2.x + dir1.y * dir2.y);
    const halfAngle = angle / 2;

    // フィレット円の中心までの距離
    const centerDist = this.radius / Math.sin(halfAngle);

    // フィレット円の中心
    const center = {
      x: intersection.x + bisector.x * centerDist,
      y: intersection.y + bisector.y * centerDist,
    };

    // 各線との接点を計算
    const tangent1 = this.findTangentPoint(center, this.radius, p1, p2);
    const tangent2 = this.findTangentPoint(center, this.radius, p3, p4);

    if (!tangent1 || !tangent2) {
      console.log("接点を計算できませんでした");
      this.clearSelection();
      return;
    }

    // 円弧の角度を計算
    const startAngle = Math.atan2(tangent1.y - center.y, tangent1.x - center.x);
    const endAngle = Math.atan2(tangent2.y - center.y, tangent2.x - center.x);

    // 円弧を描く方向を決定（短い方）
    let angleDiff = endAngle - startAngle;
    if (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
    if (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
    const largeArcFlag = Math.abs(angleDiff) > Math.PI ? 1 : 0;
    const sweepFlag = angleDiff > 0 ? 1 : 0;

    this.saveState();

    // 円弧を作成
    const arc = document.createElementNS(this.svgNS, "path");
    const d = `M ${tangent1.x} ${tangent1.y} A ${this.radius} ${this.radius} 0 ${largeArcFlag} ${sweepFlag} ${tangent2.x} ${tangent2.y}`;
    arc.setAttribute("d", d);
    arc.setAttribute("stroke", line1.getAttribute("stroke"));
    arc.setAttribute("stroke-width", line1.getAttribute("stroke-width"));
    arc.setAttribute("fill", "none");
    arc.setAttribute("data-layer", window.currentLayerId);

    // 線分を接点まで短縮
    // line1の短縮
    const distToP1 = this.distance(tangent1, p1);
    const distToP2 = this.distance(tangent1, p2);
    if (distToP1 < distToP2) {
      line1.setAttribute("x1", tangent1.x);
      line1.setAttribute("y1", tangent1.y);
    } else {
      line1.setAttribute("x2", tangent1.x);
      line1.setAttribute("y2", tangent1.y);
    }

    // line2の短縮
    const distToP3 = this.distance(tangent2, p3);
    const distToP4 = this.distance(tangent2, p4);
    if (distToP3 < distToP4) {
      line2.setAttribute("x1", tangent2.x);
      line2.setAttribute("y1", tangent2.y);
    } else {
      line2.setAttribute("x2", tangent2.x);
      line2.setAttribute("y2", tangent2.y);
    }

    this.canvas.appendChild(arc);
    this.clearSelection();
  }

  // 円の中心と半径、直線の2点から接点を計算
  findTangentPoint(center, radius, p1, p2) {
    // 直線上で円の中心に最も近い点を見つける
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dirX = dx / len;
    const dirY = dy / len;

    // 円の中心から直線への垂線の足
    const v = {
      x: center.x - p1.x,
      y: center.y - p1.y,
    };
    const proj = v.x * dirX + v.y * dirY;
    const foot = {
      x: p1.x + dirX * proj,
      y: p1.y + dirY * proj,
    };

    // 垂線の足から円周上の点までの距離
    const distToCenter = this.distance(foot, center);
    if (Math.abs(distToCenter - radius) > 0.01) {
      // 接点が直線上にない場合、近似値を返す
      const ratio = radius / distToCenter;
      return {
        x: center.x + (foot.x - center.x) * ratio,
        y: center.y + (foot.y - center.y) * ratio,
      };
    }

    return foot;
  }

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

  normalize(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      this.clearSelection();
    }
  }
}

window.FilletTool = FilletTool;
