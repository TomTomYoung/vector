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
      "パス要素の分割は現在未対応",
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

    if (event.target.tagName === "line") {
      this.splitLine(event.target, clickPoint);
    } else if (event.target.tagName === "polyline") {
      this.splitPolyline(event.target, clickPoint);
    } else if (event.target.tagName === "path") {
      this.splitPath(event.target, clickPoint);
    }

    this.updatePanel();
  }

  splitLine(line, clickPoint) {
    const x1 = parseFloat(line.getAttribute("x1"));
    const y1 = parseFloat(line.getAttribute("y1"));
    const x2 = parseFloat(line.getAttribute("x2"));
    const y2 = parseFloat(line.getAttribute("y2"));

    // クリック点が線分上にあるかチェック
    const distToLine = this.pointToLineDistance(clickPoint, { x: x1, y: y1 }, { x: x2, y: y2 });
    if (distToLine > 5) return; // 線から離れすぎている

    // クリック点を線分上に投影
    const splitPoint = this.projectPointToLine(clickPoint, { x: x1, y: y1 }, { x: x2, y: y2 });

    // 端点に近すぎる場合は分割しない（GeometryUtils.distance を使用）
    const distToP1 = window.GeometryUtils.distance(splitPoint, { x: x1, y: y1 });
    const distToP2 = window.GeometryUtils.distance(splitPoint, { x: x2, y: y2 });
    if (distToP1 < 5 || distToP2 < 5) return;

    this.saveState();

    // 元の線の属性を取得
    const stroke = line.getAttribute("stroke");
    const strokeWidth = line.getAttribute("stroke-width");
    const layerId = line.getAttribute("data-layer");

    // 元の線を削除
    line.parentNode.removeChild(line);

    // 2つの新しい線分を作成（SvgUtils.createLine を使用）
    const line1 = window.SvgUtils.createLine(x1, y1, splitPoint.x, splitPoint.y, {
      stroke: stroke,
      "stroke-width": strokeWidth,
      fill: "none",
      "data-layer": layerId
    });

    const line2 = window.SvgUtils.createLine(splitPoint.x, splitPoint.y, x2, y2, {
      stroke: stroke,
      "stroke-width": strokeWidth,
      fill: "none",
      "data-layer": layerId
    });

    this.canvas.appendChild(line1);
    this.canvas.appendChild(line2);
  }

  splitPolyline(polyline, clickPoint) {
    const pointsStr = polyline.getAttribute("points").trim();
    const points = pointsStr.split(/\s+/).map((p) => {
      const [x, y] = p.split(",");
      return { x: parseFloat(x), y: parseFloat(y) };
    });

    // クリック点に最も近い線分を見つける
    let minDist = Infinity;
    let segmentIndex = -1;
    let splitPoint = null;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dist = this.pointToLineDistance(clickPoint, p1, p2);

      if (dist < minDist) {
        minDist = dist;
        segmentIndex = i;
        splitPoint = this.projectPointToLine(clickPoint, p1, p2);
      }
    }

    if (minDist > 5 || segmentIndex === -1) return; // 線から離れすぎている

    // 端点に近すぎる場合は分割しない（GeometryUtils.distance を使用）
    const distToP1 = window.GeometryUtils.distance(splitPoint, points[segmentIndex]);
    const distToP2 = window.GeometryUtils.distance(splitPoint, points[segmentIndex + 1]);
    if (distToP1 < 5 || distToP2 < 5) return;

    this.saveState();

    // 元のポリラインの属性を取得
    const stroke = polyline.getAttribute("stroke");
    const strokeWidth = polyline.getAttribute("stroke-width");
    const layerId = polyline.getAttribute("data-layer");

    // 元のポリラインを削除
    polyline.parentNode.removeChild(polyline);

    // 2つの新しいポリラインを作成
    const points1 = points.slice(0, segmentIndex + 1);
    points1.push(splitPoint);

    const points2 = [splitPoint];
    points2.push(...points.slice(segmentIndex + 1));

    // 2つの新しいポリラインを作成（SvgUtils.createElement を使用）
    const polyline1 = window.SvgUtils.createElement("polyline", {
      points: points1.map((p) => `${p.x},${p.y}`).join(" "),
      stroke: stroke,
      "stroke-width": strokeWidth,
      fill: "none",
      "data-layer": layerId
    });

    const polyline2 = window.SvgUtils.createElement("polyline", {
      points: points2.map((p) => `${p.x},${p.y}`).join(" "),
      stroke: stroke,
      "stroke-width": strokeWidth,
      fill: "none",
      "data-layer": layerId
    });

    this.canvas.appendChild(polyline1);
    this.canvas.appendChild(polyline2);
  }

  splitPath(path, clickPoint) {
    // pathの分割は複雑なため、ここでは簡易実装をスキップ
    console.log("パス要素の分割は未実装です");
  }

  // 点から線分までの距離を計算
  pointToLineDistance(point, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = window.GeometryUtils.vectorLength({ x: dx, y: dy });
    if (len === 0) return window.GeometryUtils.distance(point, p1);

    // 線分のパラメータt (0 <= t <= 1)
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (len * len)
      )
    );

    const projection = {
      x: p1.x + t * dx,
      y: p1.y + t * dy,
    };

    return window.GeometryUtils.distance(point, projection);
  }

  // 点を線分上に投影
  projectPointToLine(point, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = window.GeometryUtils.vectorLength({ x: dx, y: dy });
    if (len === 0) return { ...p1 };

    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / (len * len)
      )
    );

    return {
      x: p1.x + t * dx,
      y: p1.y + t * dy,
    };
  }
}

window.SplitTool = SplitTool;
