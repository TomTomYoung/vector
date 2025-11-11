// OffsetTool.js
// オフセット（平行線）ツール
class OffsetTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedElement = null;
    this.offsetDistance = 10;
  }

  getTitle() {
    return "オフセット";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.createOffsetControls();
  }

  deactivate() {
    super.deactivate();
    this.removeOffsetControls();
    this.selectedElement = null;
  }

  createOffsetControls() {
    if (document.getElementById("offset-controls")) return;

    const toolbar = document.querySelector(".toolbar");
    const controls = document.createElement("div");
    controls.id = "offset-controls";
    controls.style.display = "inline-block";
    controls.style.marginLeft = "10px";

    const label = document.createElement("span");
    label.textContent = "距離: ";
    controls.appendChild(label);

    const input = document.createElement("input");
    input.type = "number";
    input.id = "offset-distance";
    input.value = this.offsetDistance;
    input.min = "1";
    input.step = "1";
    input.style.width = "60px";
    input.addEventListener("change", (e) => {
      this.offsetDistance = parseFloat(e.target.value);
    });
    controls.appendChild(input);

    toolbar.appendChild(controls);
  }

  removeOffsetControls() {
    const controls = document.getElementById("offset-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (event.target === this.canvas) {
      this.selectedElement = null;
      return;
    }

    // 最初のクリック: オブジェクトを選択
    if (!this.selectedElement) {
      this.selectedElement = event.target;
      this.highlightElement(this.selectedElement);
    } else {
      // 2回目のクリック: オフセット方向を決定
      const point = this.getMousePosition(event);
      this.createOffset(point);
      this.unhighlightElement(this.selectedElement);
      this.selectedElement = null;
    }
  }

  highlightElement(element) {
    element.setAttribute("data-offset-highlight", "true");
    const originalStroke = element.getAttribute("stroke") || "#000000";
    element.setAttribute("data-original-stroke", originalStroke);
    element.setAttribute("stroke", "#00ff00");
    element.setAttribute("stroke-width", "2");
  }

  unhighlightElement(element) {
    if (element.hasAttribute("data-offset-highlight")) {
      const originalStroke = element.getAttribute("data-original-stroke");
      element.setAttribute("stroke", originalStroke);
      element.removeAttribute("data-offset-highlight");
      element.removeAttribute("data-original-stroke");
    }
  }

  createOffset(clickPoint) {
    if (!this.selectedElement) return;

    this.saveState();

    const tagName = this.selectedElement.tagName;

    if (tagName === "line") {
      this.offsetLine(this.selectedElement, clickPoint);
    } else if (tagName === "polyline") {
      this.offsetPolyline(this.selectedElement, clickPoint);
    } else if (tagName === "rect") {
      this.offsetRectangle(this.selectedElement, clickPoint);
    } else if (tagName === "circle") {
      this.offsetCircle(this.selectedElement, clickPoint);
    }
  }

  offsetLine(line, clickPoint) {
    const x1 = parseFloat(line.getAttribute("x1"));
    const y1 = parseFloat(line.getAttribute("y1"));
    const x2 = parseFloat(line.getAttribute("x2"));
    const y2 = parseFloat(line.getAttribute("y2"));

    // 線分の方向ベクトル
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);

    // 垂直方向の単位ベクトル
    const perpX = -dy / len;
    const perpY = dx / len;

    // クリック点がどちら側にあるかを判定
    const side = (clickPoint.x - x1) * perpX + (clickPoint.y - y1) * perpY;
    const direction = side > 0 ? 1 : -1;

    // オフセット
    const offsetX = perpX * this.offsetDistance * direction;
    const offsetY = perpY * this.offsetDistance * direction;

    // 新しい線を作成
    const newLine = document.createElementNS(this.svgNS, "line");
    newLine.setAttribute("x1", x1 + offsetX);
    newLine.setAttribute("y1", y1 + offsetY);
    newLine.setAttribute("x2", x2 + offsetX);
    newLine.setAttribute("y2", y2 + offsetY);
    newLine.setAttribute("stroke", line.getAttribute("stroke"));
    newLine.setAttribute("stroke-width", line.getAttribute("stroke-width"));
    newLine.setAttribute("fill", "none");
    newLine.setAttribute("data-layer", window.currentLayerId);

    this.canvas.appendChild(newLine);
  }

  offsetPolyline(polyline, clickPoint) {
    const pointsStr = polyline.getAttribute("points");
    const points = pointsStr
      .trim()
      .split(/\s+/)
      .map((p) => {
        const [x, y] = p.split(",");
        return { x: parseFloat(x), y: parseFloat(y) };
      });

    if (points.length < 2) return;

    // 簡易的に: 各線分を個別にオフセット
    const newPoints = [];

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);

      const perpX = -dy / len;
      const perpY = dx / len;

      // 最初の線分でクリック位置から方向を判定
      let direction = 1;
      if (i === 0) {
        const side = (clickPoint.x - p1.x) * perpX + (clickPoint.y - p1.y) * perpY;
        direction = side > 0 ? 1 : -1;
      }

      const offsetX = perpX * this.offsetDistance * direction;
      const offsetY = perpY * this.offsetDistance * direction;

      if (i === 0) {
        newPoints.push({
          x: p1.x + offsetX,
          y: p1.y + offsetY,
        });
      }

      newPoints.push({
        x: p2.x + offsetX,
        y: p2.y + offsetY,
      });
    }

    // 新しいポリラインを作成
    const newPolyline = document.createElementNS(this.svgNS, "polyline");
    const newPointsStr = newPoints.map((p) => `${p.x},${p.y}`).join(" ");
    newPolyline.setAttribute("points", newPointsStr);
    newPolyline.setAttribute("stroke", polyline.getAttribute("stroke"));
    newPolyline.setAttribute("stroke-width", polyline.getAttribute("stroke-width"));
    newPolyline.setAttribute("fill", "none");
    newPolyline.setAttribute("data-layer", window.currentLayerId);

    this.canvas.appendChild(newPolyline);
  }

  offsetRectangle(rect, clickPoint) {
    const x = parseFloat(rect.getAttribute("x"));
    const y = parseFloat(rect.getAttribute("y"));
    const width = parseFloat(rect.getAttribute("width"));
    const height = parseFloat(rect.getAttribute("height"));

    const centerX = x + width / 2;
    const centerY = y + height / 2;

    // クリック点が中心より外側か内側か
    const isOutside =
      Math.abs(clickPoint.x - centerX) > width / 2 ||
      Math.abs(clickPoint.y - centerY) > height / 2;

    const offset = isOutside ? this.offsetDistance : -this.offsetDistance;

    // 新しい矩形を作成
    const newRect = document.createElementNS(this.svgNS, "rect");
    newRect.setAttribute("x", x - offset);
    newRect.setAttribute("y", y - offset);
    newRect.setAttribute("width", width + 2 * offset);
    newRect.setAttribute("height", height + 2 * offset);
    newRect.setAttribute("stroke", rect.getAttribute("stroke"));
    newRect.setAttribute("stroke-width", rect.getAttribute("stroke-width"));
    newRect.setAttribute("fill", rect.getAttribute("fill") || "none");
    newRect.setAttribute("data-layer", window.currentLayerId);

    this.canvas.appendChild(newRect);
  }

  offsetCircle(circle, clickPoint) {
    const cx = parseFloat(circle.getAttribute("cx"));
    const cy = parseFloat(circle.getAttribute("cy"));
    const r = parseFloat(circle.getAttribute("r"));

    // クリック点が円の外側か内側か
    const dist = Math.sqrt(
      Math.pow(clickPoint.x - cx, 2) + Math.pow(clickPoint.y - cy, 2)
    );
    const isOutside = dist > r;

    const newR = isOutside ? r + this.offsetDistance : r - this.offsetDistance;

    if (newR <= 0) return; // 負の半径は作成しない

    // 新しい円を作成
    const newCircle = document.createElementNS(this.svgNS, "circle");
    newCircle.setAttribute("cx", cx);
    newCircle.setAttribute("cy", cy);
    newCircle.setAttribute("r", newR);
    newCircle.setAttribute("stroke", circle.getAttribute("stroke"));
    newCircle.setAttribute("stroke-width", circle.getAttribute("stroke-width"));
    newCircle.setAttribute("fill", circle.getAttribute("fill") || "none");
    newCircle.setAttribute("data-layer", window.currentLayerId);

    this.canvas.appendChild(newCircle);
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
