// GridManager.js
// グリッド関連機能

class GridManager {
  constructor() {
    this.init();
  }

  init() {
    const toolbar = document.querySelector(".toolbar");

    // グリッド関連のボタンを追加
    this.createGridButtons(toolbar);
  }

  createGridButtons(toolbar) {
    const gridBtn = document.createElement("button");
    gridBtn.id = "grid-btn";
    gridBtn.textContent = "グリッド";
    gridBtn.addEventListener("click", this.toggleGrid);
    toolbar.appendChild(gridBtn);

    const snapBtn = document.createElement("button");
    snapBtn.id = "snap-btn";
    snapBtn.textContent = "スナップ";
    snapBtn.addEventListener("click", this.toggleSnap);
    toolbar.appendChild(snapBtn);
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
    window.snapToGrid = !window.snapToGrid;
    document.getElementById("snap-btn").style.backgroundColor =
      window.snapToGrid ? "#ddd" : "";
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
