// TextTool.js
// テキスト入力ツール
class TextTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
  }

  getTitle() {
    return "テキスト";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "text";
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (!this.isActive) return;

    // 状態を保存
    this.saveState();

    // テキスト入力のプロンプト
    const textContent = prompt("テキストを入力してください:");
    if (textContent) {
      this.createTextElement(this.startPoint, textContent);
    }
  }

  // テキスト要素を作成
  createTextElement(point, content) {
    if (!content || content.trim() === "") return;

    const text = document.createElementNS(this.svgNS, "text");
    text.setAttribute("x", point.x);
    text.setAttribute("y", point.y);
    text.setAttribute(
      "fill",
      document.getElementById("fill-color")?.value || "#000000"
    );
    text.setAttribute("font-family", "Arial"); // 将来的にフォント選択UIを追加可能
    text.setAttribute("font-size", "16px"); // 将来的にサイズ選択UIを追加可能

    // レイヤー情報を設定
    if (window.currentLayerId) {
      text.setAttribute("data-layer", window.currentLayerId);
    }

    text.textContent = content;

    this.canvas.appendChild(text);

    // 作成したオブジェクトを選択状態にする
    if (window.selectTool) {
      window.selectTool.selectObject(text);
    }

    return text;
  }
}

// グローバルに公開
window.TextTool = TextTool;
