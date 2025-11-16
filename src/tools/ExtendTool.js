// ExtendTool.js
// 延長ツール（線分を境界まで延長する）
//
// 【依存関係】
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - GeometryUtils.distance(): 2点間距離
// - GeometryUtils.vectorLength(): ベクトルの長さ

class ExtendTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.boundaryEdges = [];
    this.mode = "select"; // 'select' or 'extend'
  }

  getTitle() {
    return "延長";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.createExtendControls();
  }

  deactivate() {
    super.deactivate();
    this.removeExtendControls();
    this.clearBoundaryEdges();
    this.mode = "select";
  }

  createExtendControls() {
    if (document.getElementById("extend-controls")) return;

    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    const controls = document.createElement("div");
    controls.id = "extend-controls";
    controls.className = "style-control-group";

    const heading = document.createElement("h4");
    heading.textContent = "延長操作";
    controls.appendChild(heading);

    const info = document.createElement("p");
    info.className = "control-info";
    info.textContent = "境界辺を選択してEnter、その後延長する線をクリック";
    controls.appendChild(info);

    container.appendChild(controls);
  }

  removeExtendControls() {
    const controls = document.getElementById("extend-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (event.target === this.canvas) return;

    if (this.mode === "select") {
      // 境界辺を選択
      if (this.boundaryEdges.includes(event.target)) {
        // 既に選択されている場合は解除
        this.removeBoundaryEdge(event.target);
      } else {
        this.addBoundaryEdge(event.target);
      }
    } else if (this.mode === "extend") {
      // 延長実行
      this.extendElement(event.target);
    }
  }

  addBoundaryEdge(element) {
    if (
      element.tagName !== "line" &&
      element.tagName !== "polyline" &&
      element.tagName !== "path"
    ) {
      return;
    }

    this.boundaryEdges.push(element);
    element.setAttribute("data-boundary-edge", "true");
    const originalStroke = element.getAttribute("stroke") || "#000000";
    element.setAttribute("data-original-stroke", originalStroke);
    element.setAttribute("stroke", "#00ff00");
    element.setAttribute("stroke-width", "2");
  }

  removeBoundaryEdge(element) {
    const index = this.boundaryEdges.indexOf(element);
    if (index > -1) {
      this.boundaryEdges.splice(index, 1);
    }

    if (element.hasAttribute("data-boundary-edge")) {
      const originalStroke = element.getAttribute("data-original-stroke");
      element.setAttribute("stroke", originalStroke);
      element.removeAttribute("data-boundary-edge");
      element.removeAttribute("data-original-stroke");
    }
  }

  clearBoundaryEdges() {
    this.boundaryEdges.forEach((edge) => {
      this.removeBoundaryEdge(edge);
    });
    this.boundaryEdges = [];
  }

  extendElement(element) {
    if (this.boundaryEdges.length === 0) return;
    if (this.boundaryEdges.includes(element)) return; // 境界辺自体は延長しない

    if (element.tagName === "line") {
      this.extendLine(element);
    }
  }

  extendLine(line) {
    const x1 = parseFloat(line.getAttribute("x1"));
    const y1 = parseFloat(line.getAttribute("y1"));
    const x2 = parseFloat(line.getAttribute("x2"));
    const y2 = parseFloat(line.getAttribute("y2"));

    // 線分の方向ベクトル（GeometryUtils.vectorLength を使用）
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = window.GeometryUtils.vectorLength({ x: dx, y: dy });
    const dirX = dx / len;
    const dirY = dy / len;

    // 両端を無限に延長した場合の境界辺との交点を探す
    let bestStart = null;
    let bestEnd = null;
    let minDistStart = Infinity;
    let minDistEnd = Infinity;

    this.boundaryEdges.forEach((edge) => {
      if (edge.tagName === "line") {
        const ex1 = parseFloat(edge.getAttribute("x1"));
        const ey1 = parseFloat(edge.getAttribute("y1"));
        const ex2 = parseFloat(edge.getAttribute("x2"));
        const ey2 = parseFloat(edge.getAttribute("y2"));

        // 無限延長線との交点を計算
        const intersection = this.lineLineIntersectionInfinite(
          { x: x1, y: y1 },
          { x: x2, y: y2 },
          { x: ex1, y: ey1 },
          { x: ex2, y: ey2 }
        );

        if (intersection) {
          // 交点が線分のどちら側にあるか判定
          const toIntersection = {
            x: intersection.x - x1,
            y: intersection.y - y1,
          };
          const dot = toIntersection.x * dirX + toIntersection.y * dirY;

          if (dot < 0) {
            // 始点側（GeometryUtils.distance を使用）
            const dist = window.GeometryUtils.distance(intersection, { x: x1, y: y1 });
            if (dist < minDistStart) {
              minDistStart = dist;
              bestStart = intersection;
            }
          } else if (dot > len) {
            // 終点側（GeometryUtils.distance を使用）
            const dist = window.GeometryUtils.distance(intersection, { x: x2, y: y2 });
            if (dist < minDistEnd) {
              minDistEnd = dist;
              bestEnd = intersection;
            }
          }
        }
      }
    });

    // 延長を適用
    if (bestStart || bestEnd) {
      this.saveState();

      if (bestStart) {
        line.setAttribute("x1", bestStart.x);
        line.setAttribute("y1", bestStart.y);
      }
      if (bestEnd) {
        line.setAttribute("x2", bestEnd.x);
        line.setAttribute("y2", bestEnd.y);
      }
    }
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
    if (Math.abs(denom) < 0.0001) return null; // 平行

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    // 境界辺は線分範囲内、延長する線は無限延長
    if (u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
      };
    }

    return null;
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      // 境界辺選択モードから延長モードへ
      if (this.mode === "select" && this.boundaryEdges.length > 0) {
        this.mode = "extend";
        const info = document.querySelector("#extend-controls span");
        if (info) {
          info.textContent = "延長する線をクリック (Escでリセット)";
        }
      }
    }

    if (event.key === "Escape") {
      this.clearBoundaryEdges();
      this.mode = "select";
      const info = document.querySelector("#extend-controls span");
      if (info) {
        info.textContent = "境界辺を選択してEnter、その後延長する線をクリック";
      }
    }
  }
}

window.ExtendTool = ExtendTool;
