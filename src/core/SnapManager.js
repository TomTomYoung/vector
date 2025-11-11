// SnapManager.js
// スナップ機能を管理（端点、中点、交点、グリッド）

class SnapManager {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.snapEnabled = {
      endpoint: true,
      midpoint: true,
      intersection: false,
      grid: false,
      nearest: false,
    };
    this.snapTolerance = 10; // ピクセル単位
    this.snapIndicator = null;

    this.init();
  }

  init() {
    this.createSnapControls();
    window.snapManager = this;
  }

  createSnapControls() {
    const toolbar = document.querySelector(".toolbar");

    // スナップ設定コンテナ
    const snapContainer = document.createElement("div");
    snapContainer.style.display = "inline-block";
    snapContainer.style.marginLeft = "15px";
    snapContainer.style.padding = "5px";
    snapContainer.style.background = "#f9f9f9";
    snapContainer.style.border = "1px solid #ddd";
    snapContainer.style.borderRadius = "3px";

    const snapLabel = document.createElement("span");
    snapLabel.textContent = "スナップ: ";
    snapLabel.style.marginRight = "5px";
    snapContainer.appendChild(snapLabel);

    // 端点スナップ
    const endpointCheckbox = this.createCheckbox("端点", "endpoint", true);
    snapContainer.appendChild(endpointCheckbox);

    // 中点スナップ
    const midpointCheckbox = this.createCheckbox("中点", "midpoint", true);
    snapContainer.appendChild(midpointCheckbox);

    // 交点スナップ
    const intersectionCheckbox = this.createCheckbox(
      "交点",
      "intersection",
      false
    );
    snapContainer.appendChild(intersectionCheckbox);

    // グリッドスナップ
    const gridCheckbox = this.createCheckbox("グリッド", "grid", false);
    snapContainer.appendChild(gridCheckbox);

    toolbar.appendChild(snapContainer);
  }

  createCheckbox(label, type, checked) {
    const container = document.createElement("label");
    container.style.marginRight = "10px";
    container.style.cursor = "pointer";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = checked;
    checkbox.style.marginRight = "3px";
    checkbox.addEventListener("change", (e) => {
      this.snapEnabled[type] = e.target.checked;
    });

    container.appendChild(checkbox);
    container.appendChild(document.createTextNode(label));

    return container;
  }

  // スナップ処理のメインメソッド
  snapPoint(point, excludeElement = null) {
    if (!point) return point;

    let snappedPoint = { ...point };
    let snapType = null;
    let minDistance = this.snapTolerance;

    // 端点スナップ
    if (this.snapEnabled.endpoint) {
      const endpointSnap = this.snapToEndpoint(
        point,
        minDistance,
        excludeElement
      );
      if (endpointSnap) {
        snappedPoint = endpointSnap.point;
        snapType = "endpoint";
        minDistance = endpointSnap.distance;
      }
    }

    // 中点スナップ
    if (this.snapEnabled.midpoint) {
      const midpointSnap = this.snapToMidpoint(
        point,
        minDistance,
        excludeElement
      );
      if (midpointSnap) {
        snappedPoint = midpointSnap.point;
        snapType = "midpoint";
        minDistance = midpointSnap.distance;
      }
    }

    // 交点スナップ
    if (this.snapEnabled.intersection) {
      const intersectionSnap = this.snapToIntersection(
        point,
        minDistance,
        excludeElement
      );
      if (intersectionSnap) {
        snappedPoint = intersectionSnap.point;
        snapType = "intersection";
        minDistance = intersectionSnap.distance;
      }
    }

    // グリッドスナップ
    if (this.snapEnabled.grid && window.snapToGrid) {
      const gridSnap = this.snapToGrid(point, minDistance);
      if (gridSnap) {
        snappedPoint = gridSnap.point;
        snapType = "grid";
        minDistance = gridSnap.distance;
      }
    }

    // スナップインジケータを表示
    if (snapType) {
      this.showSnapIndicator(snappedPoint, snapType);
    } else {
      this.hideSnapIndicator();
    }

    return snappedPoint;
  }

  // 端点スナップ
  snapToEndpoint(point, tolerance, excludeElement) {
    const elements = Array.from(this.canvas.children).filter(
      (el) =>
        el !== excludeElement &&
        !el.classList.contains("control-handle") &&
        !el.classList.contains("rotate-handle") &&
        !el.classList.contains("rotate-line") &&
        !el.classList.contains("snap-indicator")
    );

    let closestPoint = null;
    let minDist = tolerance;

    for (const el of elements) {
      const endpoints = this.getEndpoints(el);
      for (const ep of endpoints) {
        const dist = this.distance(point, ep);
        if (dist < minDist) {
          minDist = dist;
          closestPoint = ep;
        }
      }
    }

    return closestPoint
      ? { point: closestPoint, distance: minDist }
      : null;
  }

  // 中点スナップ
  snapToMidpoint(point, tolerance, excludeElement) {
    const elements = Array.from(this.canvas.children).filter(
      (el) =>
        el !== excludeElement &&
        !el.classList.contains("control-handle") &&
        !el.classList.contains("rotate-handle") &&
        !el.classList.contains("rotate-line") &&
        !el.classList.contains("snap-indicator")
    );

    let closestPoint = null;
    let minDist = tolerance;

    for (const el of elements) {
      const midpoints = this.getMidpoints(el);
      for (const mp of midpoints) {
        const dist = this.distance(point, mp);
        if (dist < minDist) {
          minDist = dist;
          closestPoint = mp;
        }
      }
    }

    return closestPoint
      ? { point: closestPoint, distance: minDist }
      : null;
  }

  // グリッドスナップ
  snapToGrid(point, tolerance) {
    const gridSize = window.gridSize || 20;
    const snappedX = Math.round(point.x / gridSize) * gridSize;
    const snappedY = Math.round(point.y / gridSize) * gridSize;
    const snappedPoint = { x: snappedX, y: snappedY };

    const dist = this.distance(point, snappedPoint);
    if (dist < tolerance) {
      return { point: snappedPoint, distance: dist };
    }
    return null;
  }

  // 交点スナップ
  snapToIntersection(point, tolerance, excludeElement) {
    const elements = Array.from(this.canvas.children).filter(
      (el) =>
        el !== excludeElement &&
        !el.classList.contains("control-handle") &&
        !el.classList.contains("rotate-handle") &&
        !el.classList.contains("rotate-line") &&
        !el.classList.contains("snap-indicator")
    );

    let closestPoint = null;
    let minDist = tolerance;

    // 全ての要素のペアで交点を計算
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const intersections = this.getIntersections(elements[i], elements[j]);
        for (const ip of intersections) {
          const dist = this.distance(point, ip);
          if (dist < minDist) {
            minDist = dist;
            closestPoint = ip;
          }
        }
      }
    }

    return closestPoint
      ? { point: closestPoint, distance: minDist }
      : null;
  }

  // 2つの要素の交点を計算
  getIntersections(el1, el2) {
    const intersections = [];

    // 直線同士の交点
    if (el1.tagName === "line" && el2.tagName === "line") {
      const p1 = {
        x: parseFloat(el1.getAttribute("x1")),
        y: parseFloat(el1.getAttribute("y1")),
      };
      const p2 = {
        x: parseFloat(el1.getAttribute("x2")),
        y: parseFloat(el1.getAttribute("y2")),
      };
      const p3 = {
        x: parseFloat(el2.getAttribute("x1")),
        y: parseFloat(el2.getAttribute("y1")),
      };
      const p4 = {
        x: parseFloat(el2.getAttribute("x2")),
        y: parseFloat(el2.getAttribute("y2")),
      };

      const intersection = this.lineLineIntersection(p1, p2, p3, p4);
      if (intersection) intersections.push(intersection);
    }

    // ポリライン同士の交点
    if (el1.tagName === "polyline" && el2.tagName === "polyline") {
      const points1 = el1
        .getAttribute("points")
        .trim()
        .split(/\s+/)
        .map((p) => {
          const [x, y] = p.split(",");
          return { x: parseFloat(x), y: parseFloat(y) };
        });
      const points2 = el2
        .getAttribute("points")
        .trim()
        .split(/\s+/)
        .map((p) => {
          const [x, y] = p.split(",");
          return { x: parseFloat(x), y: parseFloat(y) };
        });

      for (let i = 0; i < points1.length - 1; i++) {
        for (let j = 0; j < points2.length - 1; j++) {
          const intersection = this.lineLineIntersection(
            points1[i],
            points1[i + 1],
            points2[j],
            points2[j + 1]
          );
          if (intersection) intersections.push(intersection);
        }
      }
    }

    // 直線とポリラインの交点
    if (el1.tagName === "line" && el2.tagName === "polyline") {
      const p1 = {
        x: parseFloat(el1.getAttribute("x1")),
        y: parseFloat(el1.getAttribute("y1")),
      };
      const p2 = {
        x: parseFloat(el1.getAttribute("x2")),
        y: parseFloat(el1.getAttribute("y2")),
      };
      const points2 = el2
        .getAttribute("points")
        .trim()
        .split(/\s+/)
        .map((p) => {
          const [x, y] = p.split(",");
          return { x: parseFloat(x), y: parseFloat(y) };
        });

      for (let i = 0; i < points2.length - 1; i++) {
        const intersection = this.lineLineIntersection(
          p1,
          p2,
          points2[i],
          points2[i + 1]
        );
        if (intersection) intersections.push(intersection);
      }
    }

    if (el1.tagName === "polyline" && el2.tagName === "line") {
      return this.getIntersections(el2, el1);
    }

    return intersections;
  }

  // 2直線の交点を計算
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
    if (Math.abs(denom) < 0.0001) return null; // 平行

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    // 線分の範囲内にある交点のみ
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
      };
    }

    return null;
  }

  // 要素の端点を取得
  getEndpoints(element) {
    const points = [];

    switch (element.tagName) {
      case "line":
        points.push(
          { x: parseFloat(element.getAttribute("x1")), y: parseFloat(element.getAttribute("y1")) },
          { x: parseFloat(element.getAttribute("x2")), y: parseFloat(element.getAttribute("y2")) }
        );
        break;

      case "rect":
        const x = parseFloat(element.getAttribute("x"));
        const y = parseFloat(element.getAttribute("y"));
        const w = parseFloat(element.getAttribute("width"));
        const h = parseFloat(element.getAttribute("height"));
        points.push(
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h }
        );
        break;

      case "circle":
        const cx = parseFloat(element.getAttribute("cx"));
        const cy = parseFloat(element.getAttribute("cy"));
        const r = parseFloat(element.getAttribute("r"));
        points.push(
          { x: cx, y: cy - r },
          { x: cx + r, y: cy },
          { x: cx, y: cy + r },
          { x: cx - r, y: cy }
        );
        break;

      case "path":
        // pathの始点と終点を抽出（簡易版）
        const d = element.getAttribute("d");
        const matches = d.match(/M\s*([\d.]+)\s+([\d.]+)|L\s*([\d.]+)\s+([\d.]+)/g);
        if (matches && matches.length > 0) {
          const first = matches[0].match(/([\d.]+)/g);
          const last = matches[matches.length - 1].match(/([\d.]+)/g);
          if (first) points.push({ x: parseFloat(first[0]), y: parseFloat(first[1]) });
          if (last) points.push({ x: parseFloat(last[0]), y: parseFloat(last[1]) });
        }
        break;
    }

    return points;
  }

  // 要素の中点を取得
  getMidpoints(element) {
    const points = [];

    switch (element.tagName) {
      case "line":
        const x1 = parseFloat(element.getAttribute("x1"));
        const y1 = parseFloat(element.getAttribute("y1"));
        const x2 = parseFloat(element.getAttribute("x2"));
        const y2 = parseFloat(element.getAttribute("y2"));
        points.push({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 });
        break;

      case "rect":
        const x = parseFloat(element.getAttribute("x"));
        const y = parseFloat(element.getAttribute("y"));
        const w = parseFloat(element.getAttribute("width"));
        const h = parseFloat(element.getAttribute("height"));
        // 各辺の中点
        points.push(
          { x: x + w / 2, y }, // 上辺
          { x: x + w, y: y + h / 2 }, // 右辺
          { x: x + w / 2, y: y + h }, // 下辺
          { x, y: y + h / 2 } // 左辺
        );
        break;

      case "circle":
        // 円は端点を中点として扱う
        break;
    }

    return points;
  }

  // スナップインジケータを表示
  showSnapIndicator(point, type) {
    if (!this.snapIndicator) {
      this.snapIndicator = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g"
      );
      this.snapIndicator.classList.add("snap-indicator");

      // 中心マーク
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      circle.setAttribute("r", "5");
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", "#00ff00");
      circle.setAttribute("stroke-width", "2");

      this.snapIndicator.appendChild(circle);
      this.canvas.appendChild(this.snapIndicator);
    }

    const circle = this.snapIndicator.querySelector("circle");
    circle.setAttribute("cx", point.x);
    circle.setAttribute("cy", point.y);

    // タイプ別の色
    const colors = {
      endpoint: "#00ff00",
      midpoint: "#0080ff",
      grid: "#ff8000",
      intersection: "#ff00ff",
    };
    circle.setAttribute("stroke", colors[type] || "#00ff00");
  }

  hideSnapIndicator() {
    if (this.snapIndicator) {
      this.canvas.removeChild(this.snapIndicator);
      this.snapIndicator = null;
    }
  }

  distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

window.SnapManager = SnapManager;
