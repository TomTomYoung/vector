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
      instructions.push("もう一度選択するまで追加のオフセットを作成");
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

    if (event.target === this.canvas) {
      if (this.selectedElement) {
        this.unhighlightElement(this.selectedElement);
        this.selectedElement = null;
        this.updatePanel();
      }
      return;
    }

    // 最初のクリック: オブジェクトを選択
    if (!this.selectedElement) {
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
    const vector = { x: x2 - x1, y: y2 - y1 };
    const len = window.GeometryUtils.vectorLength(vector);

    // 垂直方向の単位ベクトル
    const perpX = -vector.y / len;
    const perpY = vector.x / len;

    // クリック点がどちら側にあるかを判定
    const side = (clickPoint.x - x1) * perpX + (clickPoint.y - y1) * perpY;
    const direction = side > 0 ? 1 : -1;

    // オフセット
    const offsetX = perpX * this.offsetDistance * direction;
    const offsetY = perpY * this.offsetDistance * direction;

    // 新しい線を作成（SvgUtils.createLine を使用）
    const newLine = window.SvgUtils.createLine(
      x1 + offsetX,
      y1 + offsetY,
      x2 + offsetX,
      y2 + offsetY,
      {
        stroke: line.getAttribute("stroke"),
        "stroke-width": line.getAttribute("stroke-width"),
        fill: "none",
        "data-layer": window.currentLayerId
      }
    );

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

      const vector = { x: p2.x - p1.x, y: p2.y - p1.y };
      const len = window.GeometryUtils.vectorLength(vector);

      const perpX = -vector.y / len;
      const perpY = vector.x / len;

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

    // 新しいポリラインを作成（SvgUtils.createElement を使用）
    const newPointsStr = newPoints.map((p) => `${p.x},${p.y}`).join(" ");
    const newPolyline = window.SvgUtils.createElement("polyline", {
      points: newPointsStr,
      stroke: polyline.getAttribute("stroke"),
      "stroke-width": polyline.getAttribute("stroke-width"),
      fill: "none",
      "data-layer": window.currentLayerId
    });

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

    // 新しい矩形を作成（SvgUtils.createRect を使用）
    const newRect = window.SvgUtils.createRect(
      x - offset,
      y - offset,
      width + 2 * offset,
      height + 2 * offset,
      {
        stroke: rect.getAttribute("stroke"),
        "stroke-width": rect.getAttribute("stroke-width"),
        fill: rect.getAttribute("fill") || "none",
        "data-layer": window.currentLayerId
      }
    );

    this.canvas.appendChild(newRect);
  }

  offsetCircle(circle, clickPoint) {
    const cx = parseFloat(circle.getAttribute("cx"));
    const cy = parseFloat(circle.getAttribute("cy"));
    const r = parseFloat(circle.getAttribute("r"));

    // クリック点が円の外側か内側か（GeometryUtils.distance を使用）
    const dist = window.GeometryUtils.distance(
      { x: cx, y: cy },
      clickPoint
    );
    const isOutside = dist > r;

    const newR = isOutside ? r + this.offsetDistance : r - this.offsetDistance;

    if (newR <= 0) return; // 負の半径は作成しない

    // 新しい円を作成（SvgUtils.createCircle を使用）
    const newCircle = window.SvgUtils.createCircle(cx, cy, newR, {
      stroke: circle.getAttribute("stroke"),
      "stroke-width": circle.getAttribute("stroke-width"),
      fill: circle.getAttribute("fill") || "none",
      "data-layer": window.currentLayerId
    });

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
