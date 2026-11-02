// App.js
// アプリケーションの初期化とコンポーネント間の連携を担当

class App {
  constructor({host,
    createManager = (canvas, host) => new ToolManager(canvas, host), controllers = {}, ...stages} = {}) {
    this.host = host ?? window.VectorUtils.createEditorHost(stages);
    this.createManager = createManager;
    this.controllers = controllers;
    this.globalVariables = {
      svgNS: "http://www.w3.org/2000/svg",
      selectedObject: null,
      selectedObjects: [],
      clipboard: [], // コピーしたオブジェクトを保存
      showGrid: false,
      snapToGrid: false,
      gridSize: 20,
      orthoMode: false, // 直交モード
      layers: [DrawingDocument.defaultLayer(1)],
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

    // キャンバスのサイズを設定（ビューポートに合わせる）
    this.adjustCanvasSize();
    window.addEventListener("resize", this.adjustCanvasSize);

    // キーボードイベントの設定

    // ツールマネージャーの初期化
    this.toolManager = this.createManager(canvas, this.host);
    window.toolManager = this.toolManager;
    this.setupKeyboardEvents();

    // UIコンポーネントの初期化 - レイヤーパネルを最初に初期化
    this.layerPanel = new LayerPanel();
    this.historyManager = new HistoryManager();
    this.alignmentPanel = new AlignmentPanel();
    this.gridManager = new GridManager();
    this.fileManager = new FileManager();
    this.zoomPanManager = new ZoomPanManager();
    this.snapManager = new SnapManager();

    // ツールの登録
    this.registerTools();

    // ツールプロパティパネルの初期化
    this.toolPropertiesPanel = new ToolPropertiesPanel(this.toolManager);
    window.toolPropertiesPanel = this.toolPropertiesPanel;

    // 初期ツールの選択
    this.toolManager.activateTool("select");

    // 初期状態を保存
    this.host.save();
  }

  // キャンバスサイズの調整
  adjustCanvasSize() {
    const canvas = document.getElementById("canvas");
    // ここでは固定サイズを維持していますが、必要に応じて調整可能
    // 例: canvas.setAttribute("width", window.innerWidth * 0.8);
    // 例: canvas.setAttribute("height", window.innerHeight * 0.7);
  }

  registerTools() {
    const canvas = document.getElementById("canvas");

    const controllers = {
      select: SelectTool,
      line: LineTool,
      rectangle: RectangleTool,
      circle: CircleTool,
      arc: ArcTool,
      polygon: PolygonTool,
      path: PathTool,
      spline: SplineTool,
      quadraticBezier: QuadraticBezierTool,
      cubicBezier: CubicBezierTool,
      nthBezier: NthBezierTool,
      polyline: PolylineTool,
      vertices: VerticesTool,
      text: TextTool,
      dimension: DimensionTool,
      offset: OffsetTool,
      trim: TrimTool,
      extend: ExtendTool,
      fillet: FilletTool,
      chamfer: ChamferTool,
      split: SplitTool,
      join: JoinTool,
      ...this.controllers,
    };
    for (const [name, Controller] of Object.entries(controllers)) {
      const controller = new Controller(canvas, this.toolManager);
      this.toolManager.registerTool(name, controller);
      if (name === "select") window.selectTool = controller;
      if (name === "vertices") window.verticesTool = controller;
    }
  }

  // キーボードイベントの設定
  setupKeyboardEvents() {
    document.addEventListener("keydown", (event) => {
      if (event.defaultPrevented || ToolManager.isEditingField(event.target)) return;
      const command = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const actions = {
        z: event.shiftKey ? window.redo : window.undo,
        y: window.redo,
        c: () => window.selectTool.copySelectedObjects(),
        v: () => window.selectTool.pasteObjects(),
        x: () => window.selectTool.cutSelectedObjects(),
        a: () => window.selectTool.selectAll(),
      };
      let action = command && !event.altKey && Object.hasOwn(actions, key) ? actions[key] : null;
      if (key === "delete" || key === "backspace") action = () => window.selectTool.deleteSelectedObjects();
      if (key === "f8") action = window.toggleOrtho;
      if (action) {
        event.preventDefault();
        action();
      }
    });
  }
}

window.App = App;
