// GridManager.js
// グリッド関連機能

class GridManager {
  constructor() {
    this.init();
  }

  init() {
    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");

    // グリッド関連のボタンを追加
    this.createGridButtons(container);
  }

  createGridButtons(toolbar) {
    if (!toolbar) {
      return;
    }

    let group = document.getElementById("grid-controls-group");
    if (!group) {
      group = document.createElement("div");
      group.id = "grid-controls-group";
      group.className = "style-control-group";

      const heading = document.createElement("h4");
      heading.textContent = "表示・補助";
      group.appendChild(heading);

      const stack = document.createElement("div");
      stack.className = "button-stack";
      stack.id = "grid-button-stack";
      group.appendChild(stack);

      toolbar.appendChild(group);
    }

    const stack =
      document.getElementById("grid-button-stack") || group || toolbar;

    if (!document.getElementById("grid-btn")) {
      const gridBtn = document.createElement("button");
      gridBtn.id = "grid-btn";
      gridBtn.textContent = "グリッド";
      gridBtn.addEventListener("click", this.toggleGrid);
      stack.appendChild(gridBtn);
    }

    if (!document.getElementById("snap-btn")) {
      const snapBtn = document.createElement("button");
      snapBtn.id = "snap-btn";
      snapBtn.textContent = "グリッドスナップ";
      snapBtn.addEventListener("click", this.toggleSnap);
      stack.appendChild(snapBtn);
    }

    if (!document.getElementById("ortho-btn")) {
      const orthoBtn = document.createElement("button");
      orthoBtn.id = "ortho-btn";
      orthoBtn.textContent = "直交モード";
      orthoBtn.title = "水平・垂直線に拘束 (F8)";
      orthoBtn.addEventListener("click", this.toggleOrtho);
      stack.appendChild(orthoBtn);
    }
  }

  // グリッド表示の切り替え
  toggleGrid() {
    window.showGrid = !window.showGrid;
    document.getElementById("grid-btn").style.backgroundColor = window.showGrid
      ? "#ddd"
      : "";

    if (window.showGrid) {
      GridManager.createGrid();
    } else {
      GridManager.removeGrid();
    }
  }

  // スナップ機能の切り替え
  toggleSnap() {
    GridManager.setGridSnap(!window.snapToGrid);
  }

  static setGridSnap(enabled) {
    window.snapToGrid = enabled;
    const checkbox = document.getElementById("snap-grid");
    if (checkbox) checkbox.checked = enabled;
    if (window.snapManager) window.snapManager.snapEnabled.grid = enabled;
    document.getElementById("snap-btn").style.backgroundColor =
      window.snapToGrid ? "#ddd" : "";
  }

  // 直交モードの切り替え
  toggleOrtho() {
    window.orthoMode = !window.orthoMode;
    document.getElementById("ortho-btn").style.backgroundColor =
      window.orthoMode ? "#ddd" : "";
  }

  // グリッドの作成
  static createGrid() {
    GridManager.removeGrid(); // 既存のグリッドを削除

    const canvas = document.getElementById("canvas");
    const gridGroup = document.createElementNS(window.svgNS, "g");
    gridGroup.setAttribute("id", "grid");

    const width = parseInt(canvas.getAttribute("width"));
    const height = parseInt(canvas.getAttribute("height"));

    // 縦線
    for (let x = window.gridSize; x < width; x += window.gridSize) {
      const line = document.createElementNS(window.svgNS, "line");
      line.setAttribute("x1", x);
      line.setAttribute("y1", 0);
      line.setAttribute("x2", x);
      line.setAttribute("y2", height);
      line.setAttribute("stroke", "#ddd");
      line.setAttribute("stroke-width", 1);
      gridGroup.appendChild(line);
    }

    // 横線
    for (let y = window.gridSize; y < height; y += window.gridSize) {
      const line = document.createElementNS(window.svgNS, "line");
      line.setAttribute("x1", 0);
      line.setAttribute("y1", y);
      line.setAttribute("x2", width);
      line.setAttribute("y2", y);
      line.setAttribute("stroke", "#ddd");
      line.setAttribute("stroke-width", 1);
      gridGroup.appendChild(line);
    }

    // 一番背面に追加
    canvas.insertBefore(gridGroup, canvas.firstChild);
  }

  // グリッドの削除
  static removeGrid() {
    const grid = document.getElementById("grid");
    if (grid) {
      grid.parentNode.removeChild(grid);
    }
  }
}

window.GridManager = GridManager;
window.toggleGrid = GridManager.prototype.toggleGrid;
window.toggleSnap = GridManager.prototype.toggleSnap;
window.toggleOrtho = GridManager.prototype.toggleOrtho;
