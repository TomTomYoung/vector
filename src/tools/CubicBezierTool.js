// CubicBezierTool.js

class CubicBezierTool extends BezierToolBase {
  constructor(canvas, toolManager) {
    super(canvas, toolManager, {
      method: 'cubicBezier',
      title: '3次ベジェ',
      toolAttribute: 'data-cubic-bezier-tool',
      instructions: [
        'クリックで制御点を4つ配置',
        '4点目を配置すると3次ベジェを確定',
        'Escでキャンセル',
      ],
    });
  }

  getRequiredPoints() {
    return 4;
  }
}

window.CubicBezierTool = CubicBezierTool;
