// CircleTool.js
// 円描画ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - GeometryUtils (window.GeometryUtils): 幾何計算
//
// 【使用する外部関数】
// - SvgUtils.createCircle(): 円要素作成
// - GeometryUtils.distance(): 2点間距離（半径計算）

class CircleTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
  }

  getTitle() {
    return "円";
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

    // 円を作成（SvgUtils.createCircle を使用）
    this.drawingObject = window.SvgUtils.createCircle(
      this.startPoint.x,
      this.startPoint.y,
      0
    );

    // スタイルを適用
    this.applyDefaultAttributes(this.drawingObject);

    this.canvas.appendChild(this.drawingObject);
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    if (!this.isActive || !this.isDrawing || !this.drawingObject) return;

    // 円の半径を計算（GeometryUtils.distance を使用）
    const radius = window.GeometryUtils.distance(this.startPoint, this.currentPoint);

    this.drawingObject.setAttribute("r", radius);
  }

  handleMouseUp(event) {
    if (!this.isActive || !this.isDrawing) return;

    // 極端に小さい円は作成しない
    const r = parseFloat(this.drawingObject.getAttribute("r"));

    if (r < 2) {
      this.canvas.removeChild(this.drawingObject);
    } else if (window.selectTool) {
      // 作成したオブジェクトを選択状態にする
      window.selectTool.selectObject(this.drawingObject);
    }

    this.isDrawing = false;
    this.drawingObject = null;
  }
}

// グローバルに公開
window.CircleTool = CircleTool;
