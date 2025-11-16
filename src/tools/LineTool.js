// LineTool.js
// 直線描画ツール
//
// 【依存関係】
// - SvgUtils (window.SvgUtils): SVG要素作成
// - CoordinatesUtils (window.CoordinatesUtils): 座標スナップ
// - StyleUtils (window.StyleUtils): スタイル適用
//
// 【使用する外部関数】
// - SvgUtils.createElement(): SVG要素作成
// - CoordinatesUtils.snapToOrtho(): 直交スナップ
// - StyleUtils.applyStyle(): スタイル適用

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

    // SvgUtils.createLine を使用
    this.currentLine = window.SvgUtils.createLine(
      this.startPoint.x,
      this.startPoint.y,
      this.startPoint.x,
      this.startPoint.y,
      {
        fill: "none",
        "data-layer": window.currentLayerId
      }
    );

    this.applyLineAppearance(this.currentLine);
    this.canvas.appendChild(this.currentLine);
  }

  updateCurrentLineEnd(point) {
    if (!this.currentLine || !this.startPoint) return;

    let endPoint = point;

    // 直交モード: CoordinatesUtils.snapToOrtho を使用
    if (window.orthoMode) {
      endPoint = window.CoordinatesUtils.snapToOrtho(this.startPoint, point);
    }

    this.currentLine.setAttribute("x2", endPoint.x);
    this.currentLine.setAttribute("y2", endPoint.y);
  }

  onCommonPropertiesChanged(properties) {
    if (!this.currentLine) {
      return;
    }

    this.applyLineAppearance(this.currentLine, properties);
  }

  resetDrawingState() {
    if (this.currentLine && this.currentLine.parentNode) {
      this.canvas.removeChild(this.currentLine);
    }
    this.currentLine = null;
    this.startPoint = null;
    this.isDrawing = false;
  }

  applyLineAppearance(line, properties = null) {
    if (!line) return;

    const style = properties
      ? {
          stroke: properties.strokeColor,
          strokeWidth: properties.strokeWidth,
          strokeDasharray: window.StyleUtils.LINE_STYLES[properties.strokeStyle] || 'none',
          opacity: 1,
          fill: "none"
        }
      : {
          ...this.currentStyle,
          strokeDasharray: window.StyleUtils.LINE_STYLES[this.currentStyle.strokeStyle] || 'none',
          fill: "none"
        };

    // StyleUtils.applyStyle を使用
    window.StyleUtils.applyStyle(line, style);
  }
}

window.LineTool = LineTool;
