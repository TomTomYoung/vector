// App.js
// アプリケーションの初期化とコンポーネント間の連携を担当

class App {
  constructor() {
    this.globalVariables = {
      svgNS: "http://www.w3.org/2000/svg",
      selectedObject: null,
      selectedObjects: [],
      showGrid: false,
      snapToGrid: false,
      gridSize: 20,
      layers: [{ id: 1, name: "レイヤー 1", visible: true }],
      currentLayerId: 1,
      undoStack: [],
      redoStack: [],
      MAX_STACK_SIZE: 20,
    };

    // グローバル変数を window オブジェクトに設定
    Object.entries(this.globalVariables).forEach(([key, value]) => {
      window[key] = value;
    });
  }

  init() {
    const canvas = document.getElementById("canvas");

    // ツールマネージャーの初期化
    this.toolManager = new ToolManager(canvas);
    window.toolManager = this.toolManager;

    // 各UIコンポーネントの初期化
    this.stylePanel = new StylePanel();
    this.gridManager = new GridManager();
    this.layerPanel = new LayerPanel();
    this.historyManager = new HistoryManager();
    this.alignmentPanel = new AlignmentPanel();
    this.fileManager = new FileManager();

    // ツールの登録
    this.registerTools();

    // 初期ツールの選択
    this.toolManager.activateTool("select");
  }

  registerTools() {
    const canvas = document.getElementById("canvas");

    // 各ツールのインスタンス化と登録
    const selectTool = new SelectTool(canvas, this.toolManager);
    this.toolManager.registerTool("select", selectTool);
    window.selectTool = selectTool;

    const rectangleTool = new RectangleTool(canvas, this.toolManager);
    this.toolManager.registerTool("rectangle", rectangleTool);

    const circleTool = new CircleTool(canvas, this.toolManager);
    this.toolManager.registerTool("circle", circleTool);

    const polygonTool = new PolygonTool(canvas, this.toolManager);
    this.toolManager.registerTool("polygon", polygonTool);

    const textTool = new TextTool(canvas, this.toolManager);
    this.toolManager.registerTool("text", textTool);

    const pathTool = new PathTool(canvas, this.toolManager);
    this.toolManager.registerTool("path", pathTool);
  }
}

window.App = App;
