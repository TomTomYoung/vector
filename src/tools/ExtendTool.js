class ExtendTool extends BoundaryEditTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager, 'extend');
    this.editInstruction = '境界線まで延長する線をクリックしてください。';
  }

  getTitle() { return '延長'; }
  extendElement(element) { return this.editAgainstBoundaries(element); }
}

window.ExtendTool = ExtendTool;
