// FileManager.js
// ファイル保存・読み込み機能

class FileManager {
  constructor() {
    this.init();
  }

  init() {
    const toolbar = document.querySelector(".toolbar");

    // 保存と読み込みボタンを追加
    this.createSaveLoadButtons(toolbar);
  }

  createSaveLoadButtons(toolbar) {
    const saveBtn = document.createElement("button");
    saveBtn.id = "save-btn";
    saveBtn.textContent = "保存";
    saveBtn.addEventListener("click", this.saveSVG);
    toolbar.appendChild(saveBtn);

    const loadBtn = document.createElement("button");
    loadBtn.id = "load-btn";
    loadBtn.textContent = "読み込み";
    loadBtn.addEventListener("click", this.loadSVG);
    toolbar.appendChild(loadBtn);
  }

  // SVGを保存
  saveSVG() {
    // 選択状態を解除
    if (window.selectTool) {
      window.selectTool.deselectObject();
    }

    const canvas = document.getElementById("canvas");

    // SVGのクローンを作成
    const svgCopy = canvas.cloneNode(true);

    // SVGデータをテキストに変換
    const svgData = new XMLSerializer().serializeToString(svgCopy);

    // ダウンロード用のリンクを作成
    const blob = new Blob([svgData], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "drawing.svg";
    link.click();

    // リソースの解放
    URL.revokeObjectURL(url);
  }

  // SVGを読み込み
  loadSVG() {
    // ファイル選択ダイアログを表示
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".svg";

    input.onchange = function (event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (e) {
        const svgContent = e.target.result;
        const canvas = document.getElementById("canvas");

        // キャンバスをクリア
        while (canvas.firstChild) {
          canvas.removeChild(canvas.firstChild);
        }

        // SVGを解析
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");

        // 要素をインポート
        const svgRoot = svgDoc.documentElement;
        for (let i = 0; i < svgRoot.children.length; i++) {
          const node = svgRoot.children[i];
          const importedNode = document.importNode(node, true);
          canvas.appendChild(importedNode);
        }

        // 状態を保存
        if (window.saveState) {
          window.saveState();
        }
      };

      reader.readAsText(file);
    };

    input.click();
  }
}

window.FileManager = FileManager;
window.saveSVG = FileManager.prototype.saveSVG;
window.loadSVG = FileManager.prototype.loadSVG;
