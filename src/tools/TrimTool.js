// TrimTool.js
// トリムツール（線分を切り取る）
class TrimTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.cuttingEdges = [];
    this.mode = "select"; // 'select' or 'trim'
  }

  getTitle() {
    return "トリム";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
    this.createTrimControls();
  }

  deactivate() {
    super.deactivate();
    this.removeTrimControls();
    this.clearCuttingEdges();
    this.mode = "select";
  }

  createTrimControls() {
    if (document.getElementById("trim-controls")) return;

    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    const controls = document.createElement("div");
    controls.id = "trim-controls";
    controls.className = "style-control-group";

    const heading = document.createElement("h4");
    heading.textContent = "トリム操作";
    controls.appendChild(heading);

    const info = document.createElement("p");
    info.className = "control-info";
    info.textContent = "切断辺を選択してEnter、その後トリムする部分をクリック";
    controls.appendChild(info);

    container.appendChild(controls);
  }

  removeTrimControls() {
    const controls = document.getElementById("trim-controls");
    if (controls) {
      controls.remove();
    }
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (event.target === this.canvas) return;

    if (this.mode === "select") {
      // 切断辺を選択
      if (this.cuttingEdges.includes(event.target)) {
        // 既に選択されている場合は解除
        this.removeCuttingEdge(event.target);
      } else {
        this.addCuttingEdge(event.target);
      }
    } else if (this.mode === "trim") {
      // トリム実行
      this.trimElement(event.target, this.getMousePosition(event));
    }
  }

  addCuttingEdge(element) {
    if (
      element.tagName !== "line" &&
      element.tagName !== "polyline" &&
      element.tagName !== "path"
    ) {
      return;
    }

    this.cuttingEdges.push(element);
    element.setAttribute("data-cutting-edge", "true");
    const originalStroke = element.getAttribute("stroke") || "#000000";
    element.setAttribute("data-original-stroke", originalStroke);
    element.setAttribute("stroke", "#ff0000");
    element.setAttribute("stroke-width", "2");
  }

  removeCuttingEdge(element) {
    const index = this.cuttingEdges.indexOf(element);
    if (index > -1) {
      this.cuttingEdges.splice(index, 1);
    }

    if (element.hasAttribute("data-cutting-edge")) {
      const originalStroke = element.getAttribute("data-original-stroke");
      element.setAttribute("stroke", originalStroke);
      element.removeAttribute("data-cutting-edge");
      element.removeAttribute("data-original-stroke");
    }
  }

  clearCuttingEdges() {
    this.cuttingEdges.forEach((edge) => {
      this.removeCuttingEdge(edge);
    });
    this.cuttingEdges = [];
  }

  trimElement(element, clickPoint) {
    if (this.cuttingEdges.length === 0) return;
    if (this.cuttingEdges.includes(element)) return; // 切断辺自体はトリムしない

    if (element.tagName === "line") {
      this.trimLine(element, clickPoint);
    }
  }

  trimLine(line, clickPoint) {
    const x1 = parseFloat(line.getAttribute("x1"));
    const y1 = parseFloat(line.getAttribute("y1"));
    const x2 = parseFloat(line.getAttribute("x2"));
    const y2 = parseFloat(line.getAttribute("y2"));

    // 切断辺との交点を見つける
    const intersections = [];

    this.cuttingEdges.forEach((edge) => {
      if (edge.tagName === "line") {
        const ex1 = parseFloat(edge.getAttribute("x1"));
        const ey1 = parseFloat(edge.getAttribute("y1"));
        const ex2 = parseFloat(edge.getAttribute("x2"));
        const ey2 = parseFloat(edge.getAttribute("y2"));

        const intersection = this.lineLineIntersection(
          { x: x1, y: y1 },
          { x: x2, y: y2 },
          { x: ex1, y: ey1 },
          { x: ex2, y: ey2 }
        );

        if (intersection) {
          intersections.push(intersection);
        }
      }
    });

    if (intersections.length === 0) return;

    // クリック点に最も近い2つの交点を見つける
    intersections.sort((a, b) => {
      const distA = Math.sqrt(
        Math.pow(a.x - clickPoint.x, 2) + Math.pow(a.y - clickPoint.y, 2)
      );
      const distB = Math.sqrt(
        Math.pow(b.x - clickPoint.x, 2) + Math.pow(b.y - clickPoint.y, 2)
      );
      return distA - distB;
    });

    // 線分をパラメータtで表現（0 <= t <= 1）
    const getT = (point) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      if (Math.abs(dx) > Math.abs(dy)) {
        return (point.x - x1) / dx;
      } else {
        return (point.y - y1) / dy;
      }
    };

    const clickT = getT(clickPoint);
    const intersectionTs = intersections.map((p) => ({
      t: getT(p),
      point: p,
    }));

    // クリック点を含む区間を見つける
    intersectionTs.push({ t: 0, point: { x: x1, y: y1 } });
    intersectionTs.push({ t: 1, point: { x: x2, y: y2 } });
    intersectionTs.sort((a, b) => a.t - b.t);

    // クリック点が含まれる区間を削除
    for (let i = 0; i < intersectionTs.length - 1; i++) {
      if (intersectionTs[i].t <= clickT && clickT <= intersectionTs[i + 1].t) {
        // この区間を削除
        this.saveState();

        // 元の線を削除
        line.parentNode.removeChild(line);

        // 残りの区間を新しい線分として作成
        for (let j = 0; j < intersectionTs.length - 1; j++) {
          if (j === i) continue; // 削除する区間はスキップ

          const newLine = document.createElementNS(this.svgNS, "line");
          newLine.setAttribute("x1", intersectionTs[j].point.x);
          newLine.setAttribute("y1", intersectionTs[j].point.y);
          newLine.setAttribute("x2", intersectionTs[j + 1].point.x);
          newLine.setAttribute("y2", intersectionTs[j + 1].point.y);
          newLine.setAttribute("stroke", line.getAttribute("stroke"));
          newLine.setAttribute("stroke-width", line.getAttribute("stroke-width"));
          newLine.setAttribute("fill", "none");
          newLine.setAttribute("data-layer", window.currentLayerId);

          this.canvas.appendChild(newLine);
        }

        break;
      }
    }
  }

  lineLineIntersection(p1, p2, p3, p4) {
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
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
      };
    }

    return null;
  }

  handleKeyDown(event) {
    if (event.key === "Enter") {
      // 切断辺選択モードからトリムモードへ
      if (this.mode === "select" && this.cuttingEdges.length > 0) {
        this.mode = "trim";
        const info = document.querySelector("#trim-controls span");
        if (info) {
          info.textContent = "トリムする部分をクリック (Escでリセット)";
        }
      }
    }

    if (event.key === "Escape") {
      this.clearCuttingEdges();
      this.mode = "select";
      const info = document.querySelector("#trim-controls span");
      if (info) {
        info.textContent = "切断辺を選択してEnter、その後トリムする部分をクリック";
      }
    }
  }
}

window.TrimTool = TrimTool;
