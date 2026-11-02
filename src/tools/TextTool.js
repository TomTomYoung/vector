// TextTool.js
// テキスト入力ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
//
// 【使用する外部関数】
// - SvgUtils.createElement(): SVG要素作成

class TextTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
  }

  getTitle() {
    return "テキスト";
  }

  getInstructions() {
    return [
      "左クリック: テキストの配置位置を指定",
      "表示されるダイアログに内容を入力してOKで確定",
      "キャンセルするとテキストは作成されない",
    ];
  }

  updatePanel() {
    if (window.toolPropertiesPanel) {
      window.toolPropertiesPanel.updatePanel();
    }
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "text";
    this.updatePanel();
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

    this.updatePanel();
  }

  // テキスト要素を作成（SvgUtils.createElement を使用）
  createTextElement(point, content) {
    if (!content || content.trim() === "") return;

    const text = window.SvgUtils.createElement("text", {
      x: point.x,
      y: point.y,
      fill: this.currentStyle.fill === "none" ? this.currentStyle.stroke : this.currentStyle.fill,
      "font-family": "Arial",
      "font-size": "16px",
      "data-layer": window.currentLayerId,
      "data-text-tool": "true"
    });

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
