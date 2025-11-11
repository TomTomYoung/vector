// SplitTool.js
// 分割ツール（線を指定点で分割）
class SplitTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
  }

  getTitle() {
    return "分割";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.createSplitControls();
  }

  deactivate() {
    super.deactivate();
    this.removeSplitControls();
  }

  createSplitControls() {
    if (document.getElementById("split-controls")) return;

    const toolbar = document.querySelector(".toolbar");
    const controls = document.createElement("div");
    controls.id = "split-controls";
    controls.style.display = "inline-block";
    controls.style.marginLeft = "10px";

    const info = document.createElement("span");
    info.textContent = "線上をクリックして分割";
    info.style.fontSize = "12px";
    info.style.color = "#666";
    controls.appendChild(info);

    toolbar.appendChild(controls);
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

    // 端点に近すぎる場合は分割しない
    const distToP1 = this.distance(splitPoint, { x: x1, y: y1 });
    const distToP2 = this.distance(splitPoint, { x: x2, y: y2 });
    if (distToP1 < 5 || distToP2 < 5) return;

    this.saveState();

    // 元の線の属性を取得
    const stroke = line.getAttribute("stroke");
    const strokeWidth = line.getAttribute("stroke-width");
    const layerId = line.getAttribute("data-layer");

    // 元の線を削除
    line.parentNode.removeChild(line);

    // 2つの新しい線分を作成
    const line1 = document.createElementNS(this.svgNS, "line");
    line1.setAttribute("x1", x1);
    line1.setAttribute("y1", y1);
    line1.setAttribute("x2", splitPoint.x);
    line1.setAttribute("y2", splitPoint.y);
    line1.setAttribute("stroke", stroke);
    line1.setAttribute("stroke-width", strokeWidth);
    line1.setAttribute("fill", "none");
    line1.setAttribute("data-layer", layerId);

    const line2 = document.createElementNS(this.svgNS, "line");
    line2.setAttribute("x1", splitPoint.x);
    line2.setAttribute("y1", splitPoint.y);
    line2.setAttribute("x2", x2);
    line2.setAttribute("y2", y2);
    line2.setAttribute("stroke", stroke);
    line2.setAttribute("stroke-width", strokeWidth);
    line2.setAttribute("fill", "none");
    line2.setAttribute("data-layer", layerId);

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

    // 端点に近すぎる場合は分割しない
    const distToP1 = this.distance(splitPoint, points[segmentIndex]);
    const distToP2 = this.distance(splitPoint, points[segmentIndex + 1]);
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

    const polyline1 = document.createElementNS(this.svgNS, "polyline");
    polyline1.setAttribute("points", points1.map((p) => `${p.x},${p.y}`).join(" "));
    polyline1.setAttribute("stroke", stroke);
    polyline1.setAttribute("stroke-width", strokeWidth);
    polyline1.setAttribute("fill", "none");
    polyline1.setAttribute("data-layer", layerId);

    const polyline2 = document.createElementNS(this.svgNS, "polyline");
    polyline2.setAttribute("points", points2.map((p) => `${p.x},${p.y}`).join(" "));
    polyline2.setAttribute("stroke", stroke);
    polyline2.setAttribute("stroke-width", strokeWidth);
    polyline2.setAttribute("fill", "none");
    polyline2.setAttribute("data-layer", layerId);

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
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return this.distance(point, p1);

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

    return this.distance(point, projection);
  }

  // 点を線分上に投影
  projectPointToLine(point, p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
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

  distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }
}

window.SplitTool = SplitTool;
