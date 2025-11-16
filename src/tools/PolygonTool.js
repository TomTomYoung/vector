// PolygonTool.js
// 多角形描画ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
//
// 【使用する外部関数】
// - SvgUtils.createElement(): SVG要素作成
// - SvgUtils.createLine(): 線分要素作成

class PolygonTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.polygonPoints = []; // 頂点を保存する配列
    this.tempLine = null; // 一時的なガイドライン
  }

  getTitle() {
    return "多角形";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";
  }

  deactivate() {
    super.deactivate();
    // 描画中の多角形があればキャンセル
    this.cancelPolygon();
  }

  cancel() {
    this.cancelPolygon();
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (!this.isActive) return;

    // クリックで頂点を追加
    this.handlePolygonClick(this.startPoint);
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    if (!this.isActive) return;

    // 多角形描画中のガイドライン更新
    if (this.polygonPoints.length > 0) {
      this.updateTemporaryLine(
        this.polygonPoints[this.polygonPoints.length - 1],
        this.currentPoint
      );
    }
  }

  handleDblClick(event) {
    if (!this.isActive) return;

    // 多角形を完成させる
    if (this.polygonPoints.length >= 3) {
      this.finishPolygon();
    } else {
      this.cancelPolygon();
    }
  }

  handleKeyDown(event) {
    if (!this.isActive) return;

    // ESCキーでキャンセル
    if (event.key === "Escape") {
      this.cancelPolygon();
    }
  }

  // 多角形描画のクリック処理
  handlePolygonClick(point) {
    // 状態保存は最初のクリック時のみ
    if (!this.drawingObject) {
      this.saveState();
    }

    if (!this.drawingObject) {
      // 新しい多角形を開始（SvgUtils.createElement を使用）
      this.drawingObject = window.SvgUtils.createElement("polygon");

      // スタイルを適用
      this.applyDefaultAttributes(this.drawingObject);

      this.canvas.appendChild(this.drawingObject);

      // 一時的なガイドラインを作成（SvgUtils.createLine を使用）
      this.tempLine = window.SvgUtils.createLine(0, 0, 0, 0, {
        stroke: "#000000",
        "stroke-width": 1,
        "stroke-dasharray": "4 4"
      });
      this.canvas.appendChild(this.tempLine);

      this.polygonPoints = []; // 頂点配列を初期化
    }

    // 頂点を追加
    this.polygonPoints.push({ ...point });

    // ポリゴンのパスを更新
    this.updatePolygonPath();
  }

  // 多角形のパスを更新
  updatePolygonPath() {
    if (!this.drawingObject || this.polygonPoints.length === 0) return;

    // 頂点をSVG形式に変換
    const pointsStr = this.polygonPoints.map((p) => `${p.x},${p.y}`).join(" ");
    this.drawingObject.setAttribute("points", pointsStr);
  }

  // ガイドラインの更新
  updateTemporaryLine(start, end) {
    if (!this.tempLine) return;

    this.tempLine.setAttribute("x1", start.x);
    this.tempLine.setAttribute("y1", start.y);
    this.tempLine.setAttribute("x2", end.x);
    this.tempLine.setAttribute("y2", end.y);
  }

  // 多角形を完成させる
  finishPolygon() {
    if (!this.drawingObject || this.polygonPoints.length < 3) {
      // 頂点が不足している場合はキャンセル
      this.cancelPolygon();
      return;
    }

    // ガイドラインを削除
    if (this.tempLine) {
      this.canvas.removeChild(this.tempLine);
      this.tempLine = null;
    }

    // 作成したオブジェクトを選択状態にする
    if (window.selectTool) {
      window.selectTool.selectObject(this.drawingObject);
    }

    // 描画を完了
    this.isDrawing = false;
    const createdObject = this.drawingObject;
    this.drawingObject = null;
    this.polygonPoints = [];

    return createdObject;
  }

  // 多角形描画をキャンセル
  cancelPolygon() {
    if (this.drawingObject) {
      this.canvas.removeChild(this.drawingObject);
    }

    if (this.tempLine) {
      this.canvas.removeChild(this.tempLine);
    }

    this.drawingObject = null;
    this.tempLine = null;
    this.polygonPoints = [];
  }
}

// グローバルに公開
window.PolygonTool = PolygonTool;
