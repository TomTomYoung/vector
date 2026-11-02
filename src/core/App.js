// App.js
// アプリケーションの初期化とコンポーネント間の連携を担当

class App {
  constructor() {
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
    this.toolManager = new ToolManager(canvas);
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
    if (window.saveState) {
      window.saveState();
    }
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

    // 各ツールのインスタンス化と登録
    const selectTool = new SelectTool(canvas, this.toolManager);
    this.toolManager.registerTool("select", selectTool);
    window.selectTool = selectTool;

    const lineTool = new LineTool(canvas, this.toolManager);
    this.toolManager.registerTool("line", lineTool);

    const rectangleTool = new RectangleTool(canvas, this.toolManager);
    this.toolManager.registerTool("rectangle", rectangleTool);

    const circleTool = new CircleTool(canvas, this.toolManager);
    this.toolManager.registerTool("circle", circleTool);

    const arcTool = new ArcTool(canvas, this.toolManager);
    this.toolManager.registerTool("arc", arcTool);

    const polygonTool = new PolygonTool(canvas, this.toolManager);
    this.toolManager.registerTool("polygon", polygonTool);

    const pathTool = new PathTool(canvas, this.toolManager);
    this.toolManager.registerTool("path", pathTool);

    const splineTool = new SplineTool(canvas, this.toolManager);
    this.toolManager.registerTool("spline", splineTool);

    const quadraticBezierTool = new QuadraticBezierTool(canvas, this.toolManager);
    this.toolManager.registerTool("quadraticBezier", quadraticBezierTool);

    const cubicBezierTool = new CubicBezierTool(canvas, this.toolManager);
    this.toolManager.registerTool("cubicBezier", cubicBezierTool);

    const nthBezierTool = new NthBezierTool(canvas, this.toolManager);
    this.toolManager.registerTool("nthBezier", nthBezierTool);

    const polylineTool = new PolylineTool(canvas, this.toolManager);
    this.toolManager.registerTool("polyline", polylineTool);

    const verticesTool = new VerticesTool(canvas, this.toolManager);
    this.toolManager.registerTool("vertices", verticesTool);
    window.verticesTool = verticesTool;

    const textTool = new TextTool(canvas, this.toolManager);
    this.toolManager.registerTool("text", textTool);

    const dimensionTool = new DimensionTool(canvas, this.toolManager);
    this.toolManager.registerTool("dimension", dimensionTool);

    const offsetTool = new OffsetTool(canvas, this.toolManager);
    this.toolManager.registerTool("offset", offsetTool);

    const trimTool = new TrimTool(canvas, this.toolManager);
    this.toolManager.registerTool("trim", trimTool);

    const extendTool = new ExtendTool(canvas, this.toolManager);
    this.toolManager.registerTool("extend", extendTool);

    const filletTool = new FilletTool(canvas, this.toolManager);
    this.toolManager.registerTool("fillet", filletTool);

    const chamferTool = new ChamferTool(canvas, this.toolManager);
    this.toolManager.registerTool("chamfer", chamferTool);

    const splitTool = new SplitTool(canvas, this.toolManager);
    this.toolManager.registerTool("split", splitTool);

    const joinTool = new JoinTool(canvas, this.toolManager);
    this.toolManager.registerTool("join", joinTool);
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
