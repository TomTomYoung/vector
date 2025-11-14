// RectangleTool.js
// 長方形描画ツール
class RectangleTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.autoSelectAfterDraw = true;
  }

  getTitle() {
    return "長方形";
  }

  getInstructions() {
    return {
      items: [
        "左クリック+ドラッグ: 始点から終点までドラッグして長方形を描画",
        "マウスボタンを離す: 長方形を確定",
        "Esc: キャンセル",
      ],
    };
  }

  getToolProperties() {
    return [
      {
        type: "checkbox",
        label: "作成後に選択状態にする",
        checkLabel: "有効",
        value: this.autoSelectAfterDraw,
        onChange: (checked) => {
          this.autoSelectAfterDraw = checked;
        },
      },
    ];
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (!this.isActive) return;

    // 状態を保存
    this.saveState();

    // 描画開始
    this.isDrawing = true;

    // 長方形を作成
    this.drawingObject = document.createElementNS(this.svgNS, "rect");
    this.drawingObject.setAttribute("x", this.startPoint.x);
    this.drawingObject.setAttribute("y", this.startPoint.y);
    this.drawingObject.setAttribute("width", 0);
    this.drawingObject.setAttribute("height", 0);

    // スタイルを適用
    this.applyDefaultAttributes(this.drawingObject);

    this.canvas.appendChild(this.drawingObject);
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    if (!this.isActive || !this.isDrawing || !this.drawingObject) return;

    // 長方形のサイズを更新
    const width = this.currentPoint.x - this.startPoint.x;
    const height = this.currentPoint.y - this.startPoint.y;

    // 正または負の値を処理
    let x = this.startPoint.x;
    let y = this.startPoint.y;
    let w = Math.abs(width);
    let h = Math.abs(height);

    if (width < 0) x = this.currentPoint.x;
    if (height < 0) y = this.currentPoint.y;

    this.drawingObject.setAttribute("x", x);
    this.drawingObject.setAttribute("y", y);
    this.drawingObject.setAttribute("width", w);
    this.drawingObject.setAttribute("height", h);
  }

  handleMouseUp(event) {
    if (!this.isActive || !this.isDrawing) return;

    // サイズが極端に小さい長方形は作成しない
    const w = parseFloat(this.drawingObject.getAttribute("width"));
    const h = parseFloat(this.drawingObject.getAttribute("height"));

    if (w < 2 && h < 2) {
      this.canvas.removeChild(this.drawingObject);
    } else if (this.autoSelectAfterDraw && window.selectTool) {
      // 作成したオブジェクトを選択状態にする
      window.selectTool.selectObject(this.drawingObject);
    }

    this.isDrawing = false;
    this.drawingObject = null;
  }
}
