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
    saveBtn.textContent = "SVG保存";
    saveBtn.addEventListener("click", this.saveSVG);
    toolbar.appendChild(saveBtn);

    const loadBtn = document.createElement("button");
    loadBtn.id = "load-btn";
    loadBtn.textContent = "読み込み";
    loadBtn.addEventListener("click", this.loadSVG);
    toolbar.appendChild(loadBtn);

    const exportPNGBtn = document.createElement("button");
    exportPNGBtn.id = "export-png-btn";
    exportPNGBtn.textContent = "PNG出力";
    exportPNGBtn.addEventListener("click", this.exportPNG);
    toolbar.appendChild(exportPNGBtn);
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

  // PNGとして出力
  exportPNG() {
    // 選択状態を解除
    if (window.selectTool) {
      window.selectTool.deselectObject();
    }

    const canvas = document.getElementById("canvas");

    // SVGのクローンを作成
    const svgCopy = canvas.cloneNode(true);

    // SVGの幅と高さを取得
    const width = parseInt(canvas.getAttribute("width"));
    const height = parseInt(canvas.getAttribute("height"));

    // SVGデータをテキストに変換
    const svgData = new XMLSerializer().serializeToString(svgCopy);

    // SVGをBase64エンコード
    const svgBlob = new Blob([svgData], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);

    // Imageオブジェクトに読み込む
    const img = new Image();
    img.onload = function () {
      // Canvasに描画
      const pngCanvas = document.createElement("canvas");
      pngCanvas.width = width;
      pngCanvas.height = height;
      const ctx = pngCanvas.getContext("2d");

      // 背景を白で塗りつぶし
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, width, height);

      // SVG画像を描画
      ctx.drawImage(img, 0, 0);

      // PNGとしてダウンロード
      pngCanvas.toBlob(function (blob) {
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = "drawing.png";
        link.click();

        // リソースの解放
        URL.revokeObjectURL(pngUrl);
        URL.revokeObjectURL(url);
      });
    };

    img.src = url;
  }
}

window.FileManager = FileManager;
window.saveSVG = FileManager.prototype.saveSVG;
window.loadSVG = FileManager.prototype.loadSVG;
window.exportPNG = FileManager.prototype.exportPNG;
