class TrimTool extends BoundaryEditTool {
  constructor(canvas, toolManager) {
    super(canvas, toolManager, 'trim');
    this.editInstruction = '切り取る区間をクリックしてください。';
  }

  getTitle() { return 'トリム'; }
  get cuttingEdges() { return this.boundaryEdges; }
  addCuttingEdge(edge) { this.addBoundaryEdge(edge); }
  removeCuttingEdge(edge) { this.removeBoundaryEdge(edge); }
  clearCuttingEdges() { this.clearBoundaryEdges(); }
  trimElement(element, point) { return this.editAgainstBoundaries(element, point); }
}

window.TrimTool = TrimTool;
