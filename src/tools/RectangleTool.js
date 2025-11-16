// RectangleTool.js
// 長方形描画ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
//
// 【使用する外部関数】
// - SvgUtils.createRect(): 矩形要素作成

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

    // 長方形を作成（SvgUtils.createRect を使用）
    this.drawingObject = window.SvgUtils.createRect(0, 0, 0, 0, {
      transform: `translate(${this.startPoint.x}, ${this.startPoint.y})`
    });

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

    this.drawingObject.setAttribute("width", w);
    this.drawingObject.setAttribute("height", h);
    this.drawingObject.setAttribute("transform", `translate(${x}, ${y})`);
  }

  handleMouseUp(event) {
    if (!this.isActive || !this.isDrawing) return;

    // サイズが極端に小さい長方形は作成しない
    const w = parseFloat(this.drawingObject.getAttribute("width"));
    const h = parseFloat(this.drawingObject.getAttribute("height"));
    const finishedRect = this.drawingObject;

    if (w < 2 && h < 2) {
      this.canvas.removeChild(this.drawingObject);
    }

    this.isDrawing = false;
    this.drawingObject = null;

    if (finishedRect && !(w < 2 && h < 2)) {
      if (this.autoSelectAfterDraw && window.selectTool) {
        if (
          window.toolManager &&
          typeof window.toolManager.activateTemporaryTool === "function"
        ) {
          window.toolManager.activateTemporaryTool("select", {
            restoreTriggers: ["deselect", "cancel"],
          });
        }

        window.selectTool.selectObject(finishedRect);
      }
    }
  }
}
