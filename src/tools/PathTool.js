// PathTool.js
// パス描画ツール
class PathTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.pathPoints = []; // パスの頂点配列
    this.currentPath = null; // 現在描画中のパス
    this.pathMode = "line"; // 'line' または 'bezier'
    this.tempLine = null; // ガイドライン
  }

  getTitle() {
    return "パス";
  }

  activate() {
    super.activate();
    this.canvas.style.cursor = "crosshair";

    // モード選択ボタンが存在しない場合は作成
    if (!document.getElementById("path-mode-btn")) {
      this.createModeButton();
    }
  }

  deactivate() {
    super.deactivate();
    // 描画中のパスがあれば完成させる
    if (this.currentPath && this.pathPoints.length >= 2) {
      this.finishPath();
    } else if (this.currentPath) {
      this.cancelPath();
    }
  }

  cancel() {
    this.cancelPath();
  }

  // パスモード切替ボタンを作成
  createModeButton() {
    const container =
      document.getElementById("style-controls-container") ||
      document.querySelector(".toolbar");
    if (!container) {
      return;
    }

    let group = document.getElementById("path-mode-controls");
    if (!group) {
      group = document.createElement("div");
      group.id = "path-mode-controls";
      group.className = "style-control-group";

      const heading = document.createElement("h4");
      heading.textContent = "パスモード";
      group.appendChild(heading);

      const stack = document.createElement("div");
      stack.className = "button-stack";
      stack.id = "path-mode-stack";
      group.appendChild(stack);

      container.appendChild(group);
    }

    if (document.getElementById("path-mode-btn")) {
      return;
    }

    const pathModeBtn = document.createElement("button");
    pathModeBtn.id = "path-mode-btn";
    pathModeBtn.textContent = "ベジェモード";
    pathModeBtn.addEventListener("click", () => {
      this.pathMode = this.pathMode === "line" ? "bezier" : "line";
      pathModeBtn.textContent =
        this.pathMode === "line" ? "ベジェモード" : "直線モード";

      // 描画中のパスがあれば更新
      if (this.currentPath) {
        this.updatePathData();
      }
    });

    const stack = document.getElementById("path-mode-stack") || group;
    stack.appendChild(pathModeBtn);
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (!this.isActive) return;

    // パスのクリック処理
    this.handlePathClick(this.startPoint);
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    if (!this.isActive) return;

    // パス描画中のガイドライン更新
    if (this.pathPoints.length > 0 && this.tempLine) {
      this.updateTemporaryLine(
        this.pathPoints[this.pathPoints.length - 1],
        this.currentPoint
      );
    }
  }

  handleDblClick(event) {
    if (!this.isActive) return;

    // パスを完成させる
    if (this.pathPoints.length >= 2) {
      this.finishPath();
    } else {
      this.cancelPath();
    }
  }

  handleKeyDown(event) {
    if (!this.isActive) return;

    // ESCキーでキャンセル
    if (event.key === "Escape") {
      this.cancelPath();
    }
  }

  // パスのクリック処理
  handlePathClick(point) {
    // 状態保存は最初のクリック時のみ
    if (!this.currentPath) {
      this.saveState();
    }

    if (!this.currentPath) {
      // 新しいパスを開始
      this.pathPoints = [];
      this.currentPath = document.createElementNS(this.svgNS, "path");
      this.currentPath.setAttribute("fill", "none");
      this.currentPath.setAttribute(
        "stroke",
        document.getElementById("stroke-color")?.value || "#000000"
      );
      this.currentPath.setAttribute(
        "stroke-width",
        document.getElementById("stroke-width")?.value || "2"
      );

      // レイヤー情報を設定
      if (window.currentLayerId) {
        this.currentPath.setAttribute("data-layer", window.currentLayerId);
      }

      this.canvas.appendChild(this.currentPath);

      // ガイドライン作成
      this.tempLine = document.createElementNS(this.svgNS, "line");
      this.tempLine.setAttribute("stroke", "#000000");
      this.tempLine.setAttribute("stroke-width", 1);
      this.tempLine.setAttribute("stroke-dasharray", "4 4");
      this.canvas.appendChild(this.tempLine);
    }

    // 頂点を追加
    this.pathPoints.push({ ...point });

    // パスを更新
    this.updatePathData();
  }

  // パスデータの更新
  updatePathData() {
    if (!this.currentPath || this.pathPoints.length === 0) return;

    let d = `M ${this.pathPoints[0].x} ${this.pathPoints[0].y}`;

    if (this.pathMode === "line") {
      // 直線パス
      for (let i = 1; i < this.pathPoints.length; i++) {
        d += ` L ${this.pathPoints[i].x} ${this.pathPoints[i].y}`;
      }
    } else {
      // ベジェ曲線パス（簡易版）
      for (let i = 1; i < this.pathPoints.length; i++) {
        if (i % 3 === 1) {
          // 制御点1と制御点2と終点で1つのベジェ曲線
          const cp1 = this.pathPoints[i];

          if (i + 2 < this.pathPoints.length) {
            const cp2 = this.pathPoints[i + 1];
            const endPoint = this.pathPoints[i + 2];
            d += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${endPoint.x} ${endPoint.y}`;
          } else {
            // 制御点が足りない場合は直線
            d += ` L ${this.pathPoints[i].x} ${this.pathPoints[i].y}`;
          }
        } else if (i % 3 === 0) {
          // 終点はすでに処理済み
          continue;
        } else if (i % 3 === 2 && i + 1 >= this.pathPoints.length) {
          // 最後の制御点の場合は直線で結ぶ
          d += ` L ${this.pathPoints[i].x} ${this.pathPoints[i].y}`;
        }
      }
    }

    this.currentPath.setAttribute("d", d);
  }

  // ガイドラインの更新
  updateTemporaryLine(start, end) {
    if (!this.tempLine) return;

    this.tempLine.setAttribute("x1", start.x);
    this.tempLine.setAttribute("y1", start.y);
    this.tempLine.setAttribute("x2", end.x);
    this.tempLine.setAttribute("y2", end.y);
  }

  // パスを完成させる
  finishPath() {
    if (!this.currentPath || this.pathPoints.length < 2) {
      // 点が不足している場合はキャンセル
      this.cancelPath();
      return;
    }

    // ガイドラインを削除
    if (this.tempLine) {
      this.canvas.removeChild(this.tempLine);
      this.tempLine = null;
    }

    // 作成したオブジェクトを選択状態にする
    if (window.selectTool) {
      window.selectTool.selectObject(this.currentPath);
    }

    // 描画を完了
    const createdPath = this.currentPath;
    this.currentPath = null;
    this.pathPoints = [];

    return createdPath;
  }

  // パス描画をキャンセル
  cancelPath() {
    if (this.currentPath) {
      this.canvas.removeChild(this.currentPath);
    }

    if (this.tempLine) {
      this.canvas.removeChild(this.tempLine);
    }

    this.currentPath = null;
    this.tempLine = null;
    this.pathPoints = [];
  }
}

// グローバルに公開
window.PathTool = PathTool;
