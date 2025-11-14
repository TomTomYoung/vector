// DimensionTool.js
// 寸法線描画ツール
class DimensionTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.points = [];
    this.dimensionType = "linear"; // 'linear' or 'angular'
    this.currentDimension = null;
  }

  getTitle() {
    return "寸法";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.createDimensionTypeSelector();
  }

  deactivate() {
    super.deactivate();
    this.removeDimensionTypeSelector();
    if (this.currentDimension) {
      this.canvas.removeChild(this.currentDimension);
      this.currentDimension = null;
    }
    this.points = [];
  }

  createDimensionTypeSelector() {
    if (document.getElementById("dimension-type-controls")) return;

    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    const controls = document.createElement("div");
    controls.id = "dimension-type-controls";
    controls.className = "style-control-group";

    const heading = document.createElement("h4");
    heading.textContent = "寸法タイプ";
    controls.appendChild(heading);

    const selector = document.createElement("select");
    selector.id = "dimension-type-selector";

    const linearOption = document.createElement("option");
    linearOption.value = "linear";
    linearOption.textContent = "長さ寸法";
    selector.appendChild(linearOption);

    const angularOption = document.createElement("option");
    angularOption.value = "angular";
    angularOption.textContent = "角度寸法";
    selector.appendChild(angularOption);

    selector.addEventListener("change", (e) => {
      this.dimensionType = e.target.value;
      this.points = [];
      if (this.currentDimension) {
        this.canvas.removeChild(this.currentDimension);
        this.currentDimension = null;
      }
    });

    selector.value = this.dimensionType;

    controls.appendChild(selector);
    container.appendChild(controls);
  }

  removeDimensionTypeSelector() {
    const controls = document.getElementById("dimension-type-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);
    const point = this.getMousePosition(event);

    if (this.dimensionType === "linear") {
      this.handleLinearDimension(point);
    } else {
      this.handleAngularDimension(point);
    }
  }

  handleLinearDimension(point) {
    this.points.push(point);

    if (this.points.length === 1) {
      // 開始点を設定
      this.createPreviewLine();
    } else if (this.points.length === 2) {
      // 終点を設定して寸法線を作成
      this.createLinearDimension();
      this.points = [];
    }
  }

  handleAngularDimension(point) {
    this.points.push(point);

    if (this.points.length === 3) {
      // 3点で角度寸法を作成
      this.createAngularDimension();
      this.points = [];
    }
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    if (this.points.length === 1 && this.currentDimension) {
      const point = this.getMousePosition(event);
      this.updatePreviewLine(point);
    }
  }

  createPreviewLine() {
    if (this.currentDimension) {
      this.canvas.removeChild(this.currentDimension);
    }

    this.currentDimension = document.createElementNS(this.svgNS, "g");
    this.canvas.appendChild(this.currentDimension);
  }

  updatePreviewLine(endPoint) {
    if (!this.currentDimension) return;

    this.currentDimension.innerHTML = "";

    const startPoint = this.points[0];

    // 寸法線
    const line = document.createElementNS(this.svgNS, "line");
    line.setAttribute("x1", startPoint.x);
    line.setAttribute("y1", startPoint.y);
    line.setAttribute("x2", endPoint.x);
    line.setAttribute("y2", endPoint.y);
    line.setAttribute("stroke", "#ff0000");
    line.setAttribute("stroke-width", "1");
    line.setAttribute("stroke-dasharray", "5,5");
    this.currentDimension.appendChild(line);
  }

  createLinearDimension() {
    this.saveState();

    const p1 = this.points[0];
    const p2 = this.points[1];

    const group = document.createElementNS(this.svgNS, "g");
    group.setAttribute("data-layer", window.currentLayerId);
    group.classList.add("dimension");

    // 寸法線
    const line = document.createElementNS(this.svgNS, "line");
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);
    line.setAttribute("stroke", "#ff0000");
    line.setAttribute("stroke-width", "1.5");
    group.appendChild(line);

    // 矢印
    const arrowSize = 8;
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    // 始点の矢印
    const arrow1 = this.createArrow(p1, angle, arrowSize);
    group.appendChild(arrow1);

    // 終点の矢印
    const arrow2 = this.createArrow(p2, angle + Math.PI, arrowSize);
    group.appendChild(arrow2);

    // 寸法値
    const distance = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    );
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    const text = document.createElementNS(this.svgNS, "text");
    text.setAttribute("x", midX);
    text.setAttribute("y", midY - 5);
    text.setAttribute("fill", "#ff0000");
    text.setAttribute("font-size", "14");
    text.setAttribute("font-family", "Arial");
    text.setAttribute("text-anchor", "middle");
    text.textContent = distance.toFixed(1);
    group.appendChild(text);

    this.canvas.appendChild(group);

    if (this.currentDimension) {
      this.canvas.removeChild(this.currentDimension);
      this.currentDimension = null;
    }
  }

  createAngularDimension() {
    this.saveState();

    const p1 = this.points[0]; // 第1辺の始点
    const p2 = this.points[1]; // 頂点
    const p3 = this.points[2]; // 第2辺の終点

    const group = document.createElementNS(this.svgNS, "g");
    group.setAttribute("data-layer", window.currentLayerId);
    group.classList.add("dimension");

    // 2つの辺の角度を計算
    const angle1 = Math.atan2(p1.y - p2.y, p1.x - p2.x);
    const angle2 = Math.atan2(p3.y - p2.y, p3.x - p2.x);
    let angleDiff = angle2 - angle1;

    // 角度を0-360度に正規化
    while (angleDiff < 0) angleDiff += 2 * Math.PI;
    while (angleDiff > 2 * Math.PI) angleDiff -= 2 * Math.PI;

    const angleDeg = (angleDiff * 180) / Math.PI;

    // 円弧の半径
    const arcRadius = 30;

    // 円弧を描画
    const arc = document.createElementNS(this.svgNS, "path");
    const startAngle = angle1;
    const endAngle = angle2;

    const x1 = p2.x + arcRadius * Math.cos(startAngle);
    const y1 = p2.y + arcRadius * Math.sin(startAngle);
    const x2 = p2.x + arcRadius * Math.cos(endAngle);
    const y2 = p2.y + arcRadius * Math.sin(endAngle);

    const largeArcFlag = angleDiff > Math.PI ? 1 : 0;

    const arcPath = `M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
    arc.setAttribute("d", arcPath);
    arc.setAttribute("stroke", "#ff0000");
    arc.setAttribute("stroke-width", "1.5");
    arc.setAttribute("fill", "none");
    group.appendChild(arc);

    // 角度テキスト
    const textAngle = angle1 + angleDiff / 2;
    const textRadius = arcRadius + 15;
    const textX = p2.x + textRadius * Math.cos(textAngle);
    const textY = p2.y + textRadius * Math.sin(textAngle);

    const text = document.createElementNS(this.svgNS, "text");
    text.setAttribute("x", textX);
    text.setAttribute("y", textY);
    text.setAttribute("fill", "#ff0000");
    text.setAttribute("font-size", "14");
    text.setAttribute("font-family", "Arial");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dominant-baseline", "middle");
    text.textContent = angleDeg.toFixed(1) + "°";
    group.appendChild(text);

    this.canvas.appendChild(group);
  }

  createArrow(point, angle, size) {
    const arrow = document.createElementNS(this.svgNS, "polygon");

    const x1 = point.x;
    const y1 = point.y;
    const x2 = x1 + size * Math.cos(angle + Math.PI / 6);
    const y2 = y1 + size * Math.sin(angle + Math.PI / 6);
    const x3 = x1 + size * Math.cos(angle - Math.PI / 6);
    const y3 = y1 + size * Math.sin(angle - Math.PI / 6);

    arrow.setAttribute("points", `${x1},${y1} ${x2},${y2} ${x3},${y3}`);
    arrow.setAttribute("fill", "#ff0000");

    return arrow;
  }

  handleKeyDown(event) {
    if (event.key === "Escape") {
      this.points = [];
      if (this.currentDimension) {
        this.canvas.removeChild(this.currentDimension);
        this.currentDimension = null;
      }
    }
  }
}

window.DimensionTool = DimensionTool;
