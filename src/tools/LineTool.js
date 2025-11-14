// LineTool.js
// 直線描画ツール
class LineTool extends BaseTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager);
    this.startPoint = null;
    this.currentLine = null;
    this.isDrawing = false;
    this.operationMode = "drag"; // "drag" または "twoClick"
    this.autoSelectAfterDraw = false;
  }

  getTitle() {
    return "直線";
  }

  getInstructions() {
    const items =
      this.operationMode === "twoClick"
        ? [
            "左クリック: 始点を設定",
            "マウス移動: 終点プレビューを更新",
            "左クリック（2回目）: 終点を確定して直線を作成",
            "F8: 直交モード（Ortho）切り替え",
            "Esc: キャンセル",
          ]
        : [
            "左クリック+ドラッグ: 始点から終点までドラッグして直線を作成",
            "F8: 直交モード（Ortho）切り替え",
            "Esc: キャンセル",
          ];

    return {
      items,
      controls: [
        {
          type: "select",
          label: "操作方法",
          value: this.operationMode,
          options: [
            { value: "drag", label: "ドラッグ" },
            { value: "twoClick", label: "クリック2回" },
          ],
          onChange: (value) => {
            this.operationMode = value;
            this.resetDrawingState();
            if (window.toolPropertiesPanel) {
              window.toolPropertiesPanel.updatePanel();
            }
          },
        },
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

  deactivate() {
    super.deactivate();
    this.resetDrawingState();
  }

  handleMouseDown(event) {
    super.handleMouseDown(event);

    if (event.button !== 0) {
      return;
    }

    const startPoint = this.getMousePosition(event);

    if (this.operationMode === "drag") {
      this.beginLine(startPoint);
      return;
    }

    if (!this.isDrawing) {
      this.beginLine(startPoint);
    } else {
      this.updateCurrentLineEnd(startPoint);
      this.finishLine();
    }
  }

  handleMouseMove(event) {
    super.handleMouseMove(event);

    if (this.isDrawing && this.currentLine) {
      const currentPoint = this.getMousePosition(event);
      this.updateCurrentLineEnd(currentPoint);
    }
  }

  handleMouseUp(event) {
    if (!this.isActive) return;

    if (this.operationMode === "drag") {
      if (this.isDrawing && this.currentLine) {
        const endPoint = this.getMousePosition(event);
        this.updateCurrentLineEnd(endPoint);
        this.finishLine();
      }

      super.handleMouseUp(event);
      return;
    }

    if (this.operationMode === "twoClick") {
      // 1回目のクリック後はマウスボタンを離してもプレビューを維持する
      if (this.isDrawing && this.currentLine) {
        return;
      }
    }

    super.handleMouseUp(event);
  }

  finishLine() {
    if (!this.currentLine) return;

    const finishedLine = this.currentLine;

    // 状態を保存
    this.saveState();

    if (this.autoSelectAfterDraw && finishedLine && window.selectTool) {
      window.selectTool.selectObject(finishedLine);
    }

    // 線を確定（既にキャンバスに追加されている）
    this.currentLine = null;
    this.startPoint = null;
    this.isDrawing = false;

    if (this.autoSelectAfterDraw && finishedLine && window.selectTool) {
      if (
        window.toolManager &&
        typeof window.toolManager.activateTemporaryTool === "function"
      ) {
        window.toolManager.activateTemporaryTool("select", {
          restoreTriggers: ["deselect", "cancel"],
        });
      }

      window.selectTool.selectObject(finishedLine);
    }
  }

  handleKeyDown(event) {
    // Escapeキーでキャンセル
    if (event.key === "Escape" && this.isDrawing) {
      this.resetDrawingState();
    }
  }

  beginLine(point) {
    this.resetDrawingState();

    this.startPoint = point;
    this.isDrawing = true;

    this.currentLine = document.createElementNS(this.svgNS, "line");
    this.currentLine.setAttribute("x1", this.startPoint.x);
    this.currentLine.setAttribute("y1", this.startPoint.y);
    this.currentLine.setAttribute("x2", this.startPoint.x);
    this.currentLine.setAttribute("y2", this.startPoint.y);
    this.currentLine.setAttribute("stroke", this.currentStyle.stroke);
    this.currentLine.setAttribute("stroke-width", this.currentStyle.strokeWidth);
    this.currentLine.setAttribute("fill", "none");
    this.currentLine.setAttribute("opacity", this.currentStyle.opacity);
    this.currentLine.setAttribute("data-layer", window.currentLayerId);

    this.canvas.appendChild(this.currentLine);
  }

  updateCurrentLineEnd(point) {
    if (!this.currentLine || !this.startPoint) return;

    let endX = point.x;
    let endY = point.y;

    if (window.orthoMode) {
      const dx = Math.abs(endX - this.startPoint.x);
      const dy = Math.abs(endY - this.startPoint.y);

      if (dx > dy) {
        endY = this.startPoint.y;
      } else {
        endX = this.startPoint.x;
      }
    }

    this.currentLine.setAttribute("x2", endX);
    this.currentLine.setAttribute("y2", endY);
  }

  resetDrawingState() {
    if (this.currentLine && this.currentLine.parentNode) {
      this.canvas.removeChild(this.currentLine);
    }
    this.currentLine = null;
    this.startPoint = null;
    this.isDrawing = false;
  }
}

window.LineTool = LineTool;
