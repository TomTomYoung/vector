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

    // キャンバスのサイズを設定（ビューポートに合わせる）
    this.adjustCanvasSize();
    window.addEventListener("resize", this.adjustCanvasSize);

    // キーボードイベントの設定
    this.setupKeyboardEvents();

    // ツールマネージャーの初期化
    this.toolManager = new ToolManager(canvas);
    window.toolManager = this.toolManager;

    // UIコンポーネントの初期化 - レイヤーパネルを最初に初期化
    this.layerPanel = new LayerPanel();
    this.stylePanel = new StylePanel();
    this.historyManager = new HistoryManager();
    this.alignmentPanel = new AlignmentPanel();
    this.gridManager = new GridManager();
    this.fileManager = new FileManager();
    this.zoomPanManager = new ZoomPanManager();
    this.snapManager = new SnapManager();

    // ツールの登録
    this.registerTools();

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

    const textTool = new TextTool(canvas, this.toolManager);
    this.toolManager.registerTool("text", textTool);
  }

  // キーボードイベントの設定
  setupKeyboardEvents() {
    document.addEventListener("keydown", (event) => {
      // テキスト入力中は無視
      if (
        event.target.tagName === "INPUT" ||
        event.target.tagName === "TEXTAREA" ||
        event.target.isContentEditable
      ) {
        return;
      }

      // Delete or Backspace キーで削除
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (window.selectTool) {
          window.selectTool.deleteSelectedObjects();
        }
      }

      // Ctrl+Z / Cmd+Z で元に戻す
      if ((event.ctrlKey || event.metaKey) && event.key === "z") {
        event.preventDefault();
        if (window.undo) {
          window.undo();
        }
      }

      // Ctrl+Y / Cmd+Shift+Z でやり直し
      if (
        ((event.ctrlKey || event.metaKey) && event.key === "y") ||
        ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === "z")
      ) {
        event.preventDefault();
        if (window.redo) {
          window.redo();
        }
      }

      // Ctrl+C / Cmd+C でコピー
      if ((event.ctrlKey || event.metaKey) && event.key === "c") {
        event.preventDefault();
        if (window.selectTool) {
          window.selectTool.copySelectedObjects();
        }
      }

      // Ctrl+V / Cmd+V でペースト
      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        event.preventDefault();
        if (window.selectTool) {
          window.selectTool.pasteObjects();
        }
      }

      // Ctrl+X / Cmd+X でカット
      if ((event.ctrlKey || event.metaKey) && event.key === "x") {
        event.preventDefault();
        if (window.selectTool) {
          window.selectTool.cutSelectedObjects();
        }
      }

      // Ctrl+A / Cmd+A で全選択
      if ((event.ctrlKey || event.metaKey) && event.key === "a") {
        event.preventDefault();
        if (window.selectTool) {
          window.selectTool.selectAll();
        }
      }

      // F8キーで直交モードを切り替え
      if (event.key === "F8") {
        event.preventDefault();
        if (window.toggleOrtho) {
          window.toggleOrtho();
        }
      }
    });
  }
}

window.App = App;
