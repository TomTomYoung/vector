// ToolManager.js
// ツール管理クラス
class ToolManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.svgNS = "http://www.w3.org/2000/svg";
    this.tools = {};
    this.activeTool = null;
    this.activeToolName = "";
    this.toolbar = document.querySelector(".toolbar");

    // イベントリスナー
    this.canvas.addEventListener("mousedown", this.handleMouseDown.bind(this));
    this.canvas.addEventListener("mousemove", this.handleMouseMove.bind(this));
    this.canvas.addEventListener("mouseup", this.handleMouseUp.bind(this));
    this.canvas.addEventListener(
      "mouseleave",
      this.handleMouseLeave.bind(this)
    );
    this.canvas.addEventListener("dblclick", this.handleDblClick.bind(this));

    // キーボードイベント
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
  }

  // ツール登録
  registerTool(name, toolInstance) {
    this.tools[name] = toolInstance;

    // ツールボタンを作成
    const button = document.createElement("button");
    button.id = `${name}-tool`;
    button.textContent = toolInstance.getTitle();
    button.addEventListener("click", () => this.activateTool(name));

    // ボタンの位置を指定（オプション）
    const deleteBtn = document.getElementById("delete-btn");
    if (deleteBtn) {
      this.toolbar.insertBefore(button, deleteBtn);
    } else {
      this.toolbar.appendChild(button);
    }

    return button;
  }

  // ツール有効化
  activateTool(name) {
    if (!this.tools[name]) {
      console.error(`Tool "${name}" not found`);
      return;
    }

    // 以前のツールを無効化
    if (this.activeTool) {
      this.activeTool.deactivate();
    }

    this.activeTool = this.tools[name];
    this.activeToolName = name;
    this.activeTool.activate();

    // ボタンUI更新
    this.updateToolButtons();
  }

  // ツールボタンの見た目を更新
  updateToolButtons() {
    document.querySelectorAll(".toolbar button").forEach((btn) => {
      btn.style.backgroundColor = "";
    });

    const activeButton = document.getElementById(`${this.activeToolName}-tool`);
    if (activeButton) {
      activeButton.style.backgroundColor = "#ddd";
    }
  }

  // マウスイベントハンドラー
  handleMouseDown(event) {
    if (this.activeTool) {
      this.activeTool.handleMouseDown(event);
    }
  }

  handleMouseMove(event) {
    if (this.activeTool) {
      this.activeTool.handleMouseMove(event);
    }
  }

  handleMouseUp(event) {
    if (this.activeTool) {
      this.activeTool.handleMouseUp(event);
    }
  }

  handleMouseLeave(event) {
    if (this.activeTool) {
      this.activeTool.handleMouseLeave(event);
    }
  }

  handleDblClick(event) {
    if (this.activeTool) {
      this.activeTool.handleDblClick(event);
    }
  }

  handleKeyDown(event) {
    if (this.activeTool) {
      this.activeTool.handleKeyDown(event);
    }

    // 共通キーボードショートカット
    if (event.ctrlKey && event.key === "z") {
      // Ctrl+Z: アンドゥ
      event.preventDefault();
      if (window.undo) window.undo();
    } else if (event.ctrlKey && event.key === "y") {
      // Ctrl+Y: リドゥ
      event.preventDefault();
      if (window.redo) window.redo();
    } else if (event.key === "Delete") {
      // Del: 選択オブジェクト削除
      if (window.selectedObject && window.deleteSelectedObject) {
        window.deleteSelectedObject();
      }
    } else if (event.key === "Escape") {
      // Esc: ツール操作キャンセル
      if (this.activeTool) {
        this.activeTool.cancel();
      }
    }
  }

  // ヘルパーメソッド
  getMousePosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  // グリッドへのスナップ
  snapToGrid(point) {
    if (!window.snapToGrid) return point;

    const gridSize = window.gridSize || 20;
    return {
      x: Math.round(point.x / gridSize) * gridSize,
      y: Math.round(point.y / gridSize) * gridSize,
    };
  }
}

// グローバルに公開
window.ToolManager = ToolManager;
