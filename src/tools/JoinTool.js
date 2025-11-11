// JoinTool.js
// 結合ツール（複数の線を1つのポリラインに結合）
class JoinTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.selectedElements = [];
  }

  getTitle() {
    return "結合";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.createJoinControls();
  }

  deactivate() {
    super.deactivate();
    this.removeJoinControls();
    this.clearSelection();
  }

  createJoinControls() {
    if (document.getElementById("join-controls")) return;

    const toolbar = document.querySelector(".toolbar");
    const controls = document.createElement("div");
    controls.id = "join-controls";
    controls.style.display = "inline-block";
    controls.style.marginLeft = "10px";

    const info = document.createElement("span");
    info.textContent = "線を選択 (Enterで結合、Escでクリア)";
    info.style.fontSize = "12px";
    info.style.color = "#666";
    controls.appendChild(info);

    toolbar.appendChild(controls);
  }

  removeJoinControls() {
    const controls = document.getElementById("join-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (event.target === this.canvas) return;

    if (event.target.tagName === "line" || event.target.tagName === "polyline") {
      this.toggleSelection(event.target);
    }
  }

  toggleSelection(element) {
    if (this.selectedElements.includes(element)) {
      this.deselectElement(element);
    } else {
      this.selectElement(element);
    }
  }

  selectElement(element) {
    this.selectedElements.push(element);
    const originalStroke = element.getAttribute("stroke") || "#000000";
    element.setAttribute("data-original-stroke", originalStroke);
    element.setAttribute("stroke", "#00ff00");
    element.setAttribute("stroke-width", "2");

    this.updateInfo();
  }

  deselectElement(element) {
    const index = this.selectedElements.indexOf(element);
    if (index > -1) {
      this.selectedElements.splice(index, 1);
      const originalStroke = element.getAttribute("data-original-stroke");
      element.setAttribute("stroke", originalStroke);
      element.removeAttribute("data-original-stroke");
    }

    this.updateInfo();
  }

  clearSelection() {
    this.selectedElements.forEach((element) => {
      const originalStroke = element.getAttribute("data-original-stroke");
      if (originalStroke) {
        element.setAttribute("stroke", originalStroke);
        element.removeAttribute("data-original-stroke");
      }
    });
    this.selectedElements = [];
    this.updateInfo();
  }

  updateInfo() {
    const info = document.querySelector("#join-controls span");
    if (info) {
      info.textContent = `線を選択 (${this.selectedElements.length}個選択中、Enterで結合、Escでクリア)`;
    }
  }

  joinElements() {
    if (this.selectedElements.length < 2) {
      console.log("少なくとも2つの線を選択してください");
      return;
    }

    // 全ての要素を点の配列に変換
    const segments = this.selectedElements.map((el) => this.elementToPoints(el));

    // 連結された線を見つけて順序付け
    const orderedPoints = this.orderSegments(segments);

    if (orderedPoints.length === 0) {
      console.log("選択した線は連結されていません");
      return;
    }

    this.saveState();

    // 元の要素の属性を取得（最初の要素から）
    const firstElement = this.selectedElements[0];
    const stroke = firstElement.getAttribute("stroke");
    const strokeWidth = firstElement.getAttribute("stroke-width");
    const layerId = firstElement.getAttribute("data-layer");

    // 元の要素を削除
    this.selectedElements.forEach((el) => {
      el.parentNode.removeChild(el);
    });

    // 新しいポリラインを作成
    const polyline = document.createElementNS(this.svgNS, "polyline");
    polyline.setAttribute("points", orderedPoints.map((p) => `${p.x},${p.y}`).join(" "));
    polyline.setAttribute("stroke", stroke);
    polyline.setAttribute("stroke-width", strokeWidth);
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("data-layer", layerId);

    this.canvas.appendChild(polyline);
    this.clearSelection();
  }

  elementToPoints(element) {
    if (element.tagName === "line") {
      return [
        {
          x: parseFloat(element.getAttribute("x1")),
          y: parseFloat(element.getAttribute("y1")),
        },
        {
          x: parseFloat(element.getAttribute("x2")),
          y: parseFloat(element.getAttribute("y2")),
        },
      ];
    } else if (element.tagName === "polyline") {
      const pointsStr = element.getAttribute("points").trim();
      return pointsStr.split(/\s+/).map((p) => {
        const [x, y] = p.split(",");
        return { x: parseFloat(x), y: parseFloat(y) };
      });
    }
    return [];
  }

  orderSegments(segments) {
    if (segments.length === 0) return [];

    const tolerance = 0.1; // 端点が一致するための許容誤差

    // 最初のセグメントから始める
    let orderedPoints = [...segments[0]];
    let usedIndices = [0];
    let changed = true;

    while (changed && usedIndices.length < segments.length) {
      changed = false;

      for (let i = 0; i < segments.length; i++) {
        if (usedIndices.includes(i)) continue;

        const segment = segments[i];
        const firstPoint = orderedPoints[0];
        const lastPoint = orderedPoints[orderedPoints.length - 1];

        // セグメントの始点が現在の終点と一致するか
        if (this.distance(lastPoint, segment[0]) < tolerance) {
          orderedPoints.push(...segment.slice(1));
          usedIndices.push(i);
          changed = true;
          break;
        }
        // セグメントの終点が現在の終点と一致するか
        else if (this.distance(lastPoint, segment[segment.length - 1]) < tolerance) {
          orderedPoints.push(...segment.slice(0, -1).reverse());
          usedIndices.push(i);
          changed = true;
          break;
        }
        // セグメントの終点が現在の始点と一致するか
        else if (this.distance(firstPoint, segment[segment.length - 1]) < tolerance) {
          orderedPoints.unshift(...segment.slice(0, -1));
          usedIndices.push(i);
          changed = true;
          break;
        }
        // セグメントの始点が現在の始点と一致するか
        else if (this.distance(firstPoint, segment[0]) < tolerance) {
          orderedPoints.unshift(...segment.slice(1).reverse());
          usedIndices.push(i);
          changed = true;
          break;
        }
      }
    }

    // 全てのセグメントを使用できなかった場合は失敗
    if (usedIndices.length < segments.length) {
      return [];
    }

    return orderedPoints;
  }

  distance(p1, p2) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      this.joinElements();
    }

    if (event.key === "Escape") {
      this.clearSelection();
    }
  }
}

window.JoinTool = JoinTool;
