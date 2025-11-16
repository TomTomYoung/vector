// QuadraticBezierTool.js

class QuadraticBezierTool extends BezierToolBase {
  constructor(canvas, toolManager) {
    super(canvas, toolManager, {
      method: 'quadraticBezier',
      title: '2次ベジェ',
      toolAttribute: 'data-quadratic-bezier-tool',
      instructions: [
        'クリックで制御点を3つ配置',
        '3点目を置いた時点で2次ベジェを確定',
        'Escで入力中のカーブをキャンセル',
      ],
    });
  }

  getRequiredPoints() {
    return 3;
  }
}

window.QuadraticBezierTool = QuadraticBezierTool;
