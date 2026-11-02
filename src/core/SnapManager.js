// SnapManager.js
// スナップ機能を管理（端点、中点、交点、グリッド）
//
// 【依存関係】
// - GeometryUtils (window.GeometryUtils): 幾何計算ユーティリティ
// - CoordinatesUtils (window.CoordinatesUtils): 座標変換ユーティリティ
//
// 【使用する外部関数】
// - GeometryUtils.distance(p1, p2): 2点間の距離
// - GeometryUtils.lineIntersection(line1, line2): 線分交点
// - GeometryUtils.midpoint(p1, p2): 中点計算

class SnapManager {
  constructor(operations = {}) {
    this.geometry = {...window.GeometryUtils, ...operations};
    this.canvas = document.getElementById("canvas");
    this.snapEnabled = {
      endpoint: true,
      midpoint: true,
      intersection: false,
      grid: false,
      nearest: false,
      perpendicular: false,
      tangent: false,
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
    const target =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!target) {
      return;
    }

    let snapContainer = document.getElementById("snap-settings-group");
    if (!snapContainer) {
      snapContainer = document.createElement("div");
      snapContainer.id = "snap-settings-group";
      snapContainer.className = "style-control-group";

      const heading = document.createElement("h4");
      heading.textContent = "スナップ設定";
      snapContainer.appendChild(heading);

      const checkboxRow = document.createElement("div");
      checkboxRow.className = "inline-checkboxes";
      checkboxRow.id = "snap-checkbox-row";
      snapContainer.appendChild(checkboxRow);

      target.appendChild(snapContainer);
    }

    const checkboxRow =
      document.getElementById("snap-checkbox-row") || snapContainer;

    checkboxRow.innerHTML = "";

    // 端点スナップ
    const endpointCheckbox = this.createCheckbox(
      "端点",
      "endpoint",
      this.snapEnabled.endpoint
    );
    checkboxRow.appendChild(endpointCheckbox);

    // 中点スナップ
    const midpointCheckbox = this.createCheckbox(
      "中点",
      "midpoint",
      this.snapEnabled.midpoint
    );
    checkboxRow.appendChild(midpointCheckbox);

    // 交点スナップ
    const intersectionCheckbox = this.createCheckbox(
      "交点",
      "intersection",
      this.snapEnabled.intersection
    );
    checkboxRow.appendChild(intersectionCheckbox);

    // グリッドスナップ
    const gridCheckbox = this.createCheckbox(
      "グリッド",
      "grid",
      this.snapEnabled.grid
    );
    checkboxRow.appendChild(gridCheckbox);

    // 垂直スナップ
    const perpendicularCheckbox = this.createCheckbox(
      "垂直",
      "perpendicular",
      this.snapEnabled.perpendicular
    );
    checkboxRow.appendChild(perpendicularCheckbox);

    // 接線スナップ
    const tangentCheckbox = this.createCheckbox(
      "接線",
      "tangent",
      this.snapEnabled.tangent
    );
    checkboxRow.appendChild(tangentCheckbox);
  }

  createCheckbox(label, type, checked) {
    const container = document.createElement("label");
    container.style.cursor = "pointer";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "snap-" + type;
    checkbox.checked = checked;
    checkbox.addEventListener("change", (e) => {
      this.snapEnabled[type] = e.target.checked;
      if (type === "grid") GridManager.setGridSnap(e.target.checked);
    });

    container.appendChild(checkbox);
    container.appendChild(document.createTextNode(label));

    return container;
  }

  // スナップ処理のメインメソッド
  snapPoint(point, excludeElement = null, anchor = null) {
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
    if (window.snapToGrid) {
      const gridSnap = this.snapToGrid(point, minDistance);
      if (gridSnap) {
        snappedPoint = gridSnap.point;
        snapType = "grid";
        minDistance = gridSnap.distance;
      }
    }

    if (anchor && (this.snapEnabled.perpendicular || this.snapEnabled.tangent)) {
      const snap = this.snapFromAnchor(anchor, point, minDistance, excludeElement);
      if (snap) {
        snappedPoint = snap.point;
        snapType = snap.type;
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
        !el.classList.contains("translate-handle") &&
        !el.classList.contains("snap-indicator")
    );

    let closestPoint = null;
    let minDist = tolerance;

    for (const el of elements) {
      const endpoints = this.getEndpoints(el);
      for (const ep of endpoints) {
        const dist = this.geometry.distance(point, ep);
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
        !el.classList.contains("translate-handle") &&
        !el.classList.contains("snap-indicator")
    );

    let closestPoint = null;
    let minDist = tolerance;

    for (const el of elements) {
      const midpoints = this.getMidpoints(el);
      for (const mp of midpoints) {
        const dist = this.geometry.distance(point, mp);
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
    const snappedPoint = window.CoordinatesUtils.snapToGrid(point, gridSize);

    const dist = this.geometry.distance(point, snappedPoint);
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
        !el.classList.contains("translate-handle") &&
        !el.classList.contains("snap-indicator")
    );

    let closestPoint = null;
    let minDist = tolerance;

    // 全ての要素のペアで交点を計算
    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const intersections = this.getIntersections(elements[i], elements[j]);
        for (const ip of intersections) {
          const dist = this.geometry.distance(point, ip);
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

      const line1 = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
      const line2 = { x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y };
      const intersection = this.geometry.lineIntersection(line1, line2);
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
          const line1 = {
            x1: points1[i].x, y1: points1[i].y,
            x2: points1[i + 1].x, y2: points1[i + 1].y
          };
          const line2 = {
            x1: points2[j].x, y1: points2[j].y,
            x2: points2[j + 1].x, y2: points2[j + 1].y
          };
          const intersection = this.geometry.lineIntersection(line1, line2);
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
        const line1 = { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
        const line2 = {
          x1: points2[i].x, y1: points2[i].y,
          x2: points2[i + 1].x, y2: points2[i + 1].y
        };
        const intersection = this.geometry.lineIntersection(line1, line2);
        if (intersection) intersections.push(intersection);
      }
    }

    if (el1.tagName === "polyline" && el2.tagName === "line") {
      return this.getIntersections(el2, el1);
    }

    return intersections;
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
        const mid = this.geometry.midpoint(
          { x: x1, y: y1 },
          { x: x2, y: y2 }
        );
        points.push(mid);
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
      tangent: "#00ffff",
      perpendicular: "#ffff00",
    };
    circle.setAttribute("stroke", colors[type] || "#00ff00");
  }

  hideSnapIndicator() {
    if (this.snapIndicator) {
      this.canvas.removeChild(this.snapIndicator);
      this.snapIndicator = null;
    }
  }

  // Construct from the fixed start of the segment. The pointer only chooses
  // the nearest candidate. Tangency is preserved under affine transforms.
  snapFromAnchor(anchor, pointer, tolerance, exclude) {
    let closest = null;
    const accept = (point, type) => {
      const d = this.geometry.distance(pointer, point);
      if (d < tolerance) {
        tolerance = d;
        closest = {point, type};
      }
    };
    const canvasMatrix = this.canvas.getScreenCTM();
    const origin = new DOMPoint(anchor.x, anchor.y);
    for (const el of this.canvas.querySelectorAll("line, polyline, path, circle")) {
      if (el === exclude || el.closest(DrawingDocument.helpers + ", defs") || !el.getClientRects().length) continue;
      const matrix = canvasMatrix.inverse().multiply(el.getScreenCTM());
      if (el.tagName === "circle" && this.snapEnabled.tangent) {
        if (Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < Number.EPSILON) continue;
        const local = origin.matrixTransform(matrix.inverse());
        const center = {x: el.cx.baseVal.value, y: el.cy.baseVal.value};
        const contacts = this.geometry.circleTangentPoints(local, center, el.r.baseVal.value);
        // Starting on the circle would snap to the drawing anchor itself.
        if (contacts.length < 2) continue;
        for (const contact of contacts) {
          accept(new DOMPoint(contact.x, contact.y).matrixTransform(matrix), "tangent");
        }
      } else if (this.snapEnabled.perpendicular) {
        const points = window.VectorUtils.linearEditing.localPoints(el).map(p =>
          new DOMPoint(p.x, p.y).matrixTransform(matrix));
        for (let i = 1; i < points.length; i++) {
          const foot = this.geometry.projectOnLine(anchor, points[i - 1], points[i]);
          if (foot && foot.t >= 0 && foot.t <= 1) accept(foot.point, "perpendicular");
        }
      }
    }
    return closest;
  }
}

window.SnapManager = SnapManager;
