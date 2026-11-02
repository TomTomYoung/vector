// HistoryManager.js
// アンドゥ・リドゥ機能

class HistoryManager {
  constructor() {
    this.init();
  }

  init() {
    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");

    // アンドゥ/リドゥボタンを追加
    this.createUndoRedoButtons(container);

    // グローバル関数として公開
    window.undo = this.undo.bind(this);
    window.redo = this.redo.bind(this);
    window.saveState = this.saveState.bind(this);
  }

  createUndoRedoButtons(toolbar) {
    if (!toolbar) {
      return;
    }

    let group = document.getElementById("history-controls-group");
    if (!group) {
      group = document.createElement("div");
      group.id = "history-controls-group";
      group.className = "style-control-group";

      const heading = document.createElement("h4");
      heading.textContent = "履歴";
      group.appendChild(heading);

      const stack = document.createElement("div");
      stack.className = "button-stack";
      stack.id = "history-button-stack";
      group.appendChild(stack);

      toolbar.appendChild(group);
    }

    const stack =
      document.getElementById("history-button-stack") || group || toolbar;

    if (!document.getElementById("undo-btn")) {
      const undoBtn = document.createElement("button");
      undoBtn.id = "undo-btn";
      undoBtn.textContent = "元に戻す";
      undoBtn.disabled = true;
      undoBtn.addEventListener("click", () => this.undo());
      stack.appendChild(undoBtn);
    }

    if (!document.getElementById("redo-btn")) {
      const redoBtn = document.createElement("button");
      redoBtn.id = "redo-btn";
      redoBtn.textContent = "やり直し";
      redoBtn.disabled = true;
      redoBtn.addEventListener("click", () => this.redo());
      stack.appendChild(redoBtn);
    }
  }

  // Legacy tools call saveState both before and after editing. Capture the
  // completed event once, keeping transient handles and previews out of history.
  saveState() {
    if (this.restoring || this.pending) return;
    this.pending = true;
    queueMicrotask(() => this.flush());
  }

  flush() {
    if (!this.pending) return;
    this.pending = false;
    const next = DrawingDocument.serialize();
    if (next === this.current) return;
    if (this.current !== undefined) {
      window.undoStack.push(this.current);
      if (window.undoStack.length > window.MAX_STACK_SIZE) window.undoStack.shift();
    }
    this.current = next;
    window.redoStack.length = 0;
    HistoryManager.updateUndoRedoButtons();
  }

  step(from, to) {
    this.flush();
    if (!from.length) return;
    this.restoring = true;
    try {
      const next = from[from.length - 1];
      DrawingDocument.open(next);
      from.pop();
      to.push(this.current);
      this.current = next;
      HistoryManager.updateUndoRedoButtons();
    } finally {
      this.restoring = false;
    }
  }

  undo() {
    this.step(window.undoStack, window.redoStack);
  }

  redo() {
    this.step(window.redoStack, window.undoStack);
  }

  // アンドゥ/リドゥボタンの状態を更新
  static updateUndoRedoButtons() {
    const undoBtn = document.getElementById("undo-btn");
    const redoBtn = document.getElementById("redo-btn");

    if (undoBtn) undoBtn.disabled = window.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = window.redoStack.length === 0;
  }
}

window.HistoryManager = HistoryManager;
