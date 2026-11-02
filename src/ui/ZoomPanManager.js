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
    const toolbar =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");

    if (!toolbar) {
      return;
    }

    let group = document.getElementById("zoom-controls-group");
    if (!group) {
      group = document.createElement("div");
      group.id = "zoom-controls-group";
      group.className = "style-control-group";

      const heading = document.createElement("h4");
      heading.textContent = "ズーム・ビュー";
      group.appendChild(heading);

      const stack = document.createElement("div");
      stack.className = "button-stack";
      stack.id = "zoom-button-stack";
      group.appendChild(stack);

      const status = document.createElement("div");
      status.className = "zoom-status";
      status.id = "zoom-status";
      status.textContent = "表示倍率: 100%";
      group.appendChild(status);

      toolbar.appendChild(group);
    }

    const stack =
      document.getElementById("zoom-button-stack") || group || toolbar;

    if (!document.getElementById("zoom-in-btn")) {
      const zoomInBtn = document.createElement("button");
      zoomInBtn.id = "zoom-in-btn";
      zoomInBtn.textContent = "ズーム +";
      zoomInBtn.addEventListener("click", () => this.zoomIn());
      stack.appendChild(zoomInBtn);
    }

    if (!document.getElementById("zoom-out-btn")) {
      const zoomOutBtn = document.createElement("button");
      zoomOutBtn.id = "zoom-out-btn";
      zoomOutBtn.textContent = "ズーム -";
      zoomOutBtn.addEventListener("click", () => this.zoomOut());
      stack.appendChild(zoomOutBtn);
    }

    if (!document.getElementById("zoom-reset-btn")) {
      const zoomResetBtn = document.createElement("button");
      zoomResetBtn.id = "zoom-reset-btn";
      zoomResetBtn.textContent = "100%";
      zoomResetBtn.addEventListener("click", () => this.resetZoom());
      stack.appendChild(zoomResetBtn);
    }

    const status = document.getElementById("zoom-status");
    if (status) {
      this.zoomDisplay = status;
    }
  }

  handleWheel(event) {
    // Ctrl/Cmdキーが押されている時のみズーム
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      const previous = this.zoom;
      this.zoom = Math.max(0.1, Math.min(10, previous * (event.deltaY > 0 ? 0.9 : 1.1)));
      // The bounding rect already contains the pan offset.
      this.panX += mouseX * (1 - this.zoom / previous);
      this.panY += mouseY * (1 - this.zoom / previous);
      this.updateTransform();
    }
  }

  handleKeyDown(event) {
    if (event.code === "Space" && !event.repeat && !ToolManager.isEditingField(event.target)) {
      event.preventDefault();
      this.previousCursor = this.canvas.style.cursor;
      this.spacePressed = true;
      this.canvas.style.cursor = "grab";
    }
  }

  handleKeyUp(event) {
    if (event.code === "Space") {
      this.spacePressed = false;
      this.isPanning = false;
      this.canvas.style.cursor = this.previousCursor || "";
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
      } else {
        this.canvas.style.cursor = this.previousCursor || "";
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
      this.zoomDisplay.textContent = `表示倍率: ${Math.round(
        this.zoom * 100
      )}%`;
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
