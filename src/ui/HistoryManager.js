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
    window.undo = this.undo;
    window.redo = this.redo;
    window.saveState = this.saveState;
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
      undoBtn.addEventListener("click", this.undo);
      stack.appendChild(undoBtn);
    }

    if (!document.getElementById("redo-btn")) {
      const redoBtn = document.createElement("button");
      redoBtn.id = "redo-btn";
      redoBtn.textContent = "やり直し";
      redoBtn.disabled = true;
      redoBtn.addEventListener("click", this.redo);
      stack.appendChild(redoBtn);
    }
  }

  // 状態を保存する関数
  saveState() {
    const canvas = document.getElementById("canvas");

    // 現在の状態をクローン
    const state = canvas.cloneNode(true);

    // アンドゥスタックに追加
    window.undoStack.push(state);

    // スタックが大きくなりすぎないように制限
    if (window.undoStack.length > window.MAX_STACK_SIZE) {
      window.undoStack.shift(); // 最も古い状態を削除
    }

    // リドゥスタックをクリア（新しい操作をしたため）
    window.redoStack = [];

    // ボタンの状態を更新
    HistoryManager.updateUndoRedoButtons();
  }

  // アンドゥ関数
  undo() {
    if (window.undoStack.length === 0) return;

    const canvas = document.getElementById("canvas");

    // 現在の状態をリドゥスタックに保存
    const currentState = canvas.cloneNode(true);
    window.redoStack.push(currentState);

    // 一つ前の状態を復元
    const previousState = window.undoStack.pop();

    // キャンバスをクリア
    while (canvas.firstChild) {
      canvas.removeChild(canvas.firstChild);
    }

    // 前の状態を復元
    Array.from(previousState.childNodes).forEach((node) => {
      canvas.appendChild(node.cloneNode(true));
    });

    // 選択を解除
    window.selectedObject = null;
    if (window.selectTool) {
      window.selectTool.deselectObject();
    }

    // ボタンの状態を更新
    HistoryManager.updateUndoRedoButtons();
  }

  // リドゥ関数
  redo() {
    if (window.redoStack.length === 0) return;

    const canvas = document.getElementById("canvas");

    // 現在の状態をアンドゥスタックに保存
    const currentState = canvas.cloneNode(true);
    window.undoStack.push(currentState);

    // 次の状態を復元
    const nextState = window.redoStack.pop();

    // キャンバスをクリア
    while (canvas.firstChild) {
      canvas.removeChild(canvas.firstChild);
    }

    // 次の状態を復元
    Array.from(nextState.childNodes).forEach((node) => {
      canvas.appendChild(node.cloneNode(true));
    });

    // 選択を解除
    window.selectedObject = null;
    if (window.selectTool) {
      window.selectTool.deselectObject();
    }

    // ボタンの状態を更新
    HistoryManager.updateUndoRedoButtons();
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
