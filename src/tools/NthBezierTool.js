// NthBezierTool.js

class NthBezierTool extends BezierToolBase {
  constructor(canvas, toolManager) {
    super(canvas, toolManager, {
      method: 'bezierN',
      title: 'n次ベジェ',
    });
    this.degree = 4;
    this.sampleCount = 80;
  }

  getRequiredPoints() {
    return this.degree + 1;
  }

  getBezierParams() {
    return { degree: this.degree, sampleCount: this.sampleCount };
  }

  getInstructions() {
    return [
      'クリックで制御点を追加',
      `現在の次数: ${this.degree}（必要制御点: ${this.getRequiredPoints()}）`,
      '必要数の点を配置するとベジェを確定',
      'Escでキャンセル',
    ];
  }

  getToolProperties() {
    return [
      {
        type: 'number',
        label: '次数 (n)',
        value: this.degree,
        min: 2,
        max: 12,
        step: 1,
        onChange: (value) => {
          const nextDegree = Math.max(2, Math.round(value || 2));
          if (nextDegree !== this.degree) {
            this.degree = nextDegree;
            this.cancelDrawing();
            this.requestToolPanelRefresh();
          }
        },
      },
      {
        type: 'number',
        label: 'サンプル数',
        value: this.sampleCount,
        min: 10,
        max: 400,
        step: 5,
        onChange: (value) => {
          this.sampleCount = Math.max(10, Math.round(value || 10));
        },
      },
    ];
  }
}

window.NthBezierTool = NthBezierTool;
