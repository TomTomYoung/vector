// The SVG artwork and its editable metadata, shared by file I/O and undo.
class DrawingDocument {
  static helpers = "#grid, .control-handle, .rotate-handle, .rotate-line, .translate-handle, .marquee-selection, .snap-indicator, [data-tool-layer='vertices-handles']";
  static metadata = "metadata[data-vector-document]";
  static sizeAttributes = ["width", "height", "viewBox", "preserveAspectRatio"];

  static capture() {
    const canvas = document.getElementById("canvas");
    const svg = canvas.cloneNode(false);
    // Pan, zoom and cursor belong to the editor viewport.
    svg.removeAttribute("style");
    const tool = window.toolManager?.activeTool;
    const previews = new Set([tool?.drawingObject, tool?.currentLine, tool?.currentPath,
      tool?.currentPolyline, tool?.currentSpline, tool?.currentArc, tool?.currentDimension,
      tool?.previewCircle, tool?.previewElement, tool?.previewLine, tool?.tempLine]);
    for (const child of canvas.children) {
      if (!previews.has(child) && !child.matches(this.helpers)) svg.appendChild(child.cloneNode(true));
    }
    for (const el of svg.querySelectorAll("[data-vector-selected], [data-vector-highlight]")) {
      el.removeAttribute("data-vector-selected");
      el.removeAttribute("data-vector-highlight");
    }
    const metadata = document.createElementNS(canvas.namespaceURI, "metadata");
    metadata.setAttribute("data-vector-document", "1");
    metadata.textContent = JSON.stringify({
      layers: window.layers, currentLayerId: window.currentLayerId,
      vertices: window.verticesTool?.verticesObject
    });
    svg.prepend(metadata);
    return svg;
  }

  static serialize() {
    return new XMLSerializer().serializeToString(this.capture());
  }

  static defaultLayer(id) {
    return {id, name: "レイヤー " + id, visible: true, locked: false, color: "#000000", lineStyle: "solid", lineWidth: "2"};
  }

  static open(text) {
    const root = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
    if (root.localName !== "svg" || root.namespaceURI !== "http://www.w3.org/2000/svg") {
      throw new Error("有効なSVGを指定してください。");
    }
    const meta = Array.from(root.children).find(el => el.matches(this.metadata));
    const state = meta ? JSON.parse(meta.textContent) : {};
    if (!state || typeof state !== "object" || (meta && meta.getAttribute("data-vector-document") !== "1")) {
      throw new Error("この編集データの形式には対応していません。");
    }
    meta?.remove();
    // Older editor exports may include the grid and selection handles.
    if (meta || root.id === "canvas") root.querySelectorAll(this.helpers).forEach(el => el.remove());
    const layers = new Map();
    if (state.layers !== undefined && !Array.isArray(state.layers)) throw new Error("レイヤー情報が不正です。");
    for (const layer of state.layers || []) {
      if (!Number.isSafeInteger(layer?.id) || layer.id < 1 || layers.has(layer.id)) throw new Error("レイヤーIDが不正です。");
      layers.set(layer.id, {...this.defaultLayer(layer.id), ...layer});
    }
    // Legacy drawings contain only data-layer on the figures.
    for (const el of root.querySelectorAll("[data-layer]")) {
      const id = Number(el.getAttribute("data-layer"));
      if (Number.isSafeInteger(id) && id > 0 && !layers.has(id)) layers.set(id, this.defaultLayer(id));
    }
    if (!layers.size) layers.set(1, this.defaultLayer(1));
    if (state.vertices && !VerticesTool.isValidModel(state.vertices)) throw new Error("頂点の編集データが不正です。");

    // Validate the complete new document before replacing the current one.
    const canvas = document.getElementById("canvas");
    const nodes = Array.from(root.children, el => document.importNode(el, true));
    window.toolManager.activateTool("select");
    window.selectTool.deselectObject("internal");
    window.snapManager.hideSnapIndicator();
    canvas.replaceChildren(...nodes);
    for (const name of this.sizeAttributes) {
      if (root.hasAttribute(name)) canvas.setAttribute(name, root.getAttribute(name));
      else canvas.removeAttribute(name);
    }
    if (!canvas.hasAttribute("width")) canvas.setAttribute("width", "800");
    if (!canvas.hasAttribute("height")) canvas.setAttribute("height", "600");
    window.layers = Array.from(layers.values());
    window.currentLayerId = layers.has(state.currentLayerId) ? state.currentLayerId : window.layers[0].id;
    window.verticesTool.restoreModel(state.vertices);
    window.updateLayerList();
    if (window.showGrid) GridManager.createGrid();
    window.toolPropertiesPanel.updatePanel();
  }
}

window.DrawingDocument = DrawingDocument;
