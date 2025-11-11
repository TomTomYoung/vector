// ZoomPanManager.js
// ズームとパン機能を管理

class ZoomPanManager {
  constructor() {
    this.canvas = document.getElementById("canvas");
    this.container = document.querySelector(".canvas-container");
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.startPanX = 0;
    this.startPanY = 0;
    this.spacePressed = false;

    this.init();
  }

  init() {
    // ズームボタンを追加
    this.createZoomButtons();

    // マウスホイールでズーム
    this.canvas.addEventListener("wheel", this.handleWheel.bind(this));

    // スペースキー + ドラッグでパン
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));
    this.canvas.addEventListener("mousedown", this.handlePanStart.bind(this));
    this.canvas.addEventListener("mousemove", this.handlePanMove.bind(this));
    this.canvas.addEventListener("mouseup", this.handlePanEnd.bind(this));
    this.canvas.addEventListener("mouseleave", this.handlePanEnd.bind(this));

    // グローバルアクセス用
    window.zoomPanManager = this;
  }

  createZoomButtons() {
    const toolbar = document.querySelector(".toolbar");

    // ズームインボタン
    const zoomInBtn = document.createElement("button");
    zoomInBtn.textContent = "ズーム +";
    zoomInBtn.addEventListener("click", () => this.zoomIn());
    toolbar.appendChild(zoomInBtn);

    // ズームアウトボタン
    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.textContent = "ズーム -";
    zoomOutBtn.addEventListener("click", () => this.zoomOut());
    toolbar.appendChild(zoomOutBtn);

    // ズームリセットボタン
    const zoomResetBtn = document.createElement("button");
    zoomResetBtn.textContent = "100%";
    zoomResetBtn.addEventListener("click", () => this.resetZoom());
    toolbar.appendChild(zoomResetBtn);

    // ズーム表示
    this.zoomDisplay = document.createElement("span");
    this.zoomDisplay.textContent = " 100%";
    this.zoomDisplay.style.marginLeft = "10px";
    toolbar.appendChild(this.zoomDisplay);
  }

  handleWheel(event) {
    // Ctrl/Cmdキーが押されている時のみズーム
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // ズーム前のマウス位置（キャンバス座標系）
      const beforeX = (mouseX - this.panX) / this.zoom;
      const beforeY = (mouseY - this.panY) / this.zoom;

      // ズーム変更
      const delta = event.deltaY > 0 ? 0.9 : 1.1;
      this.zoom *= delta;
      this.zoom = Math.max(0.1, Math.min(10, this.zoom));

      // ズーム後のマウス位置を維持するようにパンを調整
      const afterX = (mouseX - this.panX) / this.zoom;
      const afterY = (mouseY - this.panY) / this.zoom;
      this.panX += (afterX - beforeX) * this.zoom;
      this.panY += (afterY - beforeY) * this.zoom;

      this.updateTransform();
    }
  }

  handleKeyDown(event) {
    if (event.code === "Space" && !event.repeat) {
      this.spacePressed = true;
      this.canvas.style.cursor = "grab";
    }
  }

  handleKeyUp(event) {
    if (event.code === "Space") {
      this.spacePressed = false;
      this.isPanning = false;
      if (window.toolManager && window.toolManager.currentTool) {
        this.canvas.style.cursor =
          window.toolManager.currentTool.canvas.style.cursor || "default";
      }
    }
  }

  handlePanStart(event) {
    if (this.spacePressed) {
      event.preventDefault();
      this.isPanning = true;
      this.startPanX = event.clientX - this.panX;
      this.startPanY = event.clientY - this.panY;
      this.canvas.style.cursor = "grabbing";
    }
  }

  handlePanMove(event) {
    if (this.isPanning && this.spacePressed) {
      event.preventDefault();
      this.panX = event.clientX - this.startPanX;
      this.panY = event.clientY - this.startPanY;
      this.updateTransform();
    }
  }

  handlePanEnd(event) {
    if (this.isPanning) {
      this.isPanning = false;
      if (this.spacePressed) {
        this.canvas.style.cursor = "grab";
      } else if (window.toolManager && window.toolManager.currentTool) {
        this.canvas.style.cursor =
          window.toolManager.currentTool.canvas.style.cursor || "default";
      }
    }
  }

  zoomIn() {
    this.zoom *= 1.2;
    this.zoom = Math.min(10, this.zoom);
    this.updateTransform();
  }

  zoomOut() {
    this.zoom *= 0.8;
    this.zoom = Math.max(0.1, this.zoom);
    this.updateTransform();
  }

  resetZoom() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.updateTransform();
  }

  updateTransform() {
    this.canvas.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
    this.canvas.style.transformOrigin = "0 0";

    // ズーム表示を更新
    if (this.zoomDisplay) {
      this.zoomDisplay.textContent = ` ${Math.round(this.zoom * 100)}%`;
    }
  }

  // 現在のズーム・パン状態を取得
  getTransform() {
    return {
      zoom: this.zoom,
      panX: this.panX,
      panY: this.panY,
    };
  }

  // ズーム・パン状態を設定
  setTransform(zoom, panX, panY) {
    this.zoom = zoom;
    this.panX = panX;
    this.panY = panY;
    this.updateTransform();
  }
}

window.ZoomPanManager = ZoomPanManager;
