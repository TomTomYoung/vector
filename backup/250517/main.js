// main.js
// ベクターエディタのメインコード

// ページ読み込み完了時の処理
document.addEventListener("DOMContentLoaded", function () {
  // クラスのインポートは、HTMLで<script>タグを使って行う必要があります。
  // ここではすでにインポートされていると仮定して進めます。

  // グローバル変数の初期化
  initializeGlobalVariables();

  // ツールマネージャーの作成
  const canvas = document.getElementById("canvas");
  const toolManager = new ToolManager(canvas);
  window.toolManager = toolManager;

  // ツールの登録
  registerTools(toolManager);

  // その他の機能の初期化
  initializeStyles();
  initializeGrid();
  initializeLayers();
  initializeUndoRedo();
  initializeAlignment();

  // 初期ツールの選択
  toolManager.activateTool("select");
});

// グローバル変数の初期化
function initializeGlobalVariables() {
  window.svgNS = "http://www.w3.org/2000/svg";
  window.selectedObject = null;
  window.selectedObjects = [];
  window.showGrid = false;
  window.snapToGrid = false;
  window.gridSize = 20;
  window.layers = [{ id: 1, name: "レイヤー 1", visible: true }];
  window.currentLayerId = 1;
  window.undoStack = [];
  window.redoStack = [];
  window.MAX_STACK_SIZE = 20;
}

// ツールの登録
function registerTools(toolManager) {
  const canvas = document.getElementById("canvas");

  // 選択ツール
  const selectTool = new SelectTool(canvas, toolManager);
  toolManager.registerTool("select", selectTool);
  window.selectTool = selectTool; // グローバルからアクセスできるようにする

  // 長方形ツール
  const rectangleTool = new RectangleTool(canvas, toolManager);
  toolManager.registerTool("rectangle", rectangleTool);

  // 円ツール
  const circleTool = new CircleTool(canvas, toolManager);
  toolManager.registerTool("circle", circleTool);

  // 多角形ツール
  const polygonTool = new PolygonTool(canvas, toolManager);
  toolManager.registerTool("polygon", polygonTool);

  // テキストツール
  const textTool = new TextTool(canvas, toolManager);
  toolManager.registerTool("text", textTool);

  // パスツール
  const pathTool = new PathTool(canvas, toolManager);
  toolManager.registerTool("path", pathTool);
}

// スタイル設定の初期化
function initializeStyles() {
  const toolbar = document.querySelector(".toolbar");
  const deleteBtn = document.getElementById("delete-btn");

  if (!deleteBtn) {
    // 削除ボタンが存在しない場合は作成
    const deleteButton = document.createElement("button");
    deleteButton.id = "delete-btn";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", deleteSelectedObject);
    toolbar.appendChild(deleteButton);
  }

  // スタイル設定用のコントロールを追加
  const styleControls = document.createElement("div");
  styleControls.style.marginLeft = "15px";
  styleControls.style.display = "flex";
  styleControls.style.alignItems = "center";

  // 塗りつぶし色
  const fillColorLabel = document.createElement("label");
  fillColorLabel.textContent = "塗り:";
  fillColorLabel.style.marginRight = "5px";

  const fillColorInput = document.createElement("input");
  fillColorInput.type = "color";
  fillColorInput.id = "fill-color";
  fillColorInput.value = "#ffffff";
  fillColorInput.style.marginRight = "10px";
  fillColorInput.addEventListener("change", updateSelectedObjectStyle);

  // 線の色
  const strokeColorLabel = document.createElement("label");
  strokeColorLabel.textContent = "線:";
  strokeColorLabel.style.marginRight = "5px";

  const strokeColorInput = document.createElement("input");
  strokeColorInput.type = "color";
  strokeColorInput.id = "stroke-color";
  strokeColorInput.value = "#000000";
  strokeColorInput.style.marginRight = "10px";
  strokeColorInput.addEventListener("change", updateSelectedObjectStyle);

  // 線の太さ
  const strokeWidthLabel = document.createElement("label");
  strokeWidthLabel.textContent = "線幅:";
  strokeWidthLabel.style.marginRight = "5px";

  const strokeWidthSelect = document.createElement("select");
  strokeWidthSelect.id = "stroke-width";
  strokeWidthSelect.style.marginRight = "10px";
  strokeWidthSelect.addEventListener("change", updateSelectedObjectStyle);

  const widths = [1, 2, 3, 5, 8];
  widths.forEach((width) => {
    const option = document.createElement("option");
    option.value = width;
    option.textContent = `${width}px`;
    if (width === 2) option.selected = true;
    strokeWidthSelect.appendChild(option);
  });

  // 透明度
  const opacityLabel = document.createElement("label");
  opacityLabel.textContent = "透明度:";
  opacityLabel.style.marginRight = "5px";

  const opacityInput = document.createElement("input");
  opacityInput.type = "range";
  opacityInput.min = "0";
  opacityInput.max = "1";
  opacityInput.step = "0.1";
  opacityInput.value = "1";
  opacityInput.id = "opacity-input";
  opacityInput.style.width = "80px";
  opacityInput.style.marginRight = "10px";
  opacityInput.addEventListener("change", updateSelectedObjectStyle);

  // コントロールを追加
  styleControls.appendChild(fillColorLabel);
  styleControls.appendChild(fillColorInput);
  styleControls.appendChild(strokeColorLabel);
  styleControls.appendChild(strokeColorInput);
  styleControls.appendChild(strokeWidthLabel);
  styleControls.appendChild(strokeWidthSelect);
  styleControls.appendChild(opacityLabel);
  styleControls.appendChild(opacityInput);

  // ツールバーに追加
  if (deleteBtn) {
    toolbar.insertBefore(styleControls, deleteBtn);
  } else {
    toolbar.appendChild(styleControls);
  }
}

// グリッド機能の初期化
function initializeGrid() {
  const toolbar = document.querySelector(".toolbar");

  // グリッド関連のボタンを追加
  const gridBtn = document.createElement("button");
  gridBtn.id = "grid-btn";
  gridBtn.textContent = "グリッド";
  gridBtn.addEventListener("click", toggleGrid);
  toolbar.appendChild(gridBtn);

  const snapBtn = document.createElement("button");
  snapBtn.id = "snap-btn";
  snapBtn.textContent = "スナップ";
  snapBtn.addEventListener("click", toggleSnap);
  toolbar.appendChild(snapBtn);
}

// レイヤー機能の初期化
function initializeLayers() {
  // レイヤーパネルを作成
  const layerPanel = document.createElement("div");
  layerPanel.style.position = "absolute";
  layerPanel.style.right = "10px";
  layerPanel.style.top = "60px";
  layerPanel.style.width = "150px";
  layerPanel.style.background = "white";
  layerPanel.style.border = "1px solid #ccc";
  layerPanel.style.padding = "10px";
  layerPanel.style.zIndex = "100";
  layerPanel.innerHTML = `
        <h3>レイヤー</h3>
        <div id="layer-list"></div>
        <button id="add-layer">レイヤー追加</button>
    `;
  document.body.appendChild(layerPanel);

  // レイヤー追加ボタンのイベント処理
  document.getElementById("add-layer").addEventListener("click", () => {
    const newLayerId =
      window.layers.length > 0
        ? Math.max(...window.layers.map((layer) => layer.id)) + 1
        : 1;

    window.layers.push({
      id: newLayerId,
      name: `レイヤー ${newLayerId}`,
      visible: true,
    });

    window.currentLayerId = newLayerId;
    updateLayerList();
  });

  // レイヤー一覧を更新
  updateLayerList();
}

// アンドゥ・リドゥ機能の初期化
function initializeUndoRedo() {
  const toolbar = document.querySelector(".toolbar");

  // アンドゥ/リドゥボタンを追加
  const undoBtn = document.createElement("button");
  undoBtn.id = "undo-btn";
  undoBtn.textContent = "元に戻す";
  undoBtn.disabled = true;
  undoBtn.addEventListener("click", undo);
  toolbar.appendChild(undoBtn);

  const redoBtn = document.createElement("button");
  redoBtn.id = "redo-btn";
  redoBtn.textContent = "やり直し";
  redoBtn.disabled = true;
  redoBtn.addEventListener("click", redo);
  toolbar.appendChild(redoBtn);

  // グローバル関数として公開
  window.undo = undo;
  window.redo = redo;
  window.saveState = saveState;
}

// 整列機能の初期化
function initializeAlignment() {
  const toolbar = document.querySelector(".toolbar");

  // 整列ボタンを追加
  const alignLeftBtn = document.createElement("button");
  alignLeftBtn.textContent = "左揃え";
  alignLeftBtn.addEventListener("click", () => alignObjects("left"));
  toolbar.appendChild(alignLeftBtn);

  const alignCenterBtn = document.createElement("button");
  alignCenterBtn.textContent = "中央揃え";
  alignCenterBtn.addEventListener("click", () => alignObjects("center"));
  toolbar.appendChild(alignCenterBtn);

  const alignRightBtn = document.createElement("button");
  alignRightBtn.textContent = "右揃え";
  alignRightBtn.addEventListener("click", () => alignObjects("right"));
  toolbar.appendChild(alignRightBtn);

  const alignTopBtn = document.createElement("button");
  alignTopBtn.textContent = "上揃え";
  alignTopBtn.addEventListener("click", () => alignObjects("top"));
  toolbar.appendChild(alignTopBtn);

  const alignMiddleBtn = document.createElement("button");
  alignMiddleBtn.textContent = "垂直中央揃え";
  alignMiddleBtn.addEventListener("click", () => alignObjects("middle"));
  toolbar.appendChild(alignMiddleBtn);

  const alignBottomBtn = document.createElement("button");
  alignBottomBtn.textContent = "下揃え";
  alignBottomBtn.addEventListener("click", () => alignObjects("bottom"));
  toolbar.appendChild(alignBottomBtn);

  // グループ関連のボタンを追加
  const groupBtn = document.createElement("button");
  groupBtn.textContent = "グループ化";
  groupBtn.addEventListener("click", groupObjects);
  toolbar.appendChild(groupBtn);

  const ungroupBtn = document.createElement("button");
  ungroupBtn.textContent = "グループ解除";
  ungroupBtn.addEventListener("click", ungroupObjects);
  toolbar.appendChild(ungroupBtn);
}

// 保存・読み込み機能の初期化
function initializeSaveLoad() {
  const toolbar = document.querySelector(".toolbar");

  // 保存と読み込みボタンを追加
  const saveBtn = document.createElement("button");
  saveBtn.id = "save-btn";
  saveBtn.textContent = "保存";
  saveBtn.addEventListener("click", saveSVG);
  toolbar.appendChild(saveBtn);

  const loadBtn = document.createElement("button");
  loadBtn.id = "load-btn";
  loadBtn.textContent = "読み込み";
  loadBtn.addEventListener("click", loadSVG);
  toolbar.appendChild(loadBtn);
}

// グリッド表示の切り替え
function toggleGrid() {
  window.showGrid = !window.showGrid;
  document.getElementById("grid-btn").style.backgroundColor = window.showGrid
    ? "#ddd"
    : "";

  if (window.showGrid) {
    createGrid();
  } else {
    removeGrid();
  }
}

// スナップ機能の切り替え
function toggleSnap() {
  window.snapToGrid = !window.snapToGrid;
  document.getElementById("snap-btn").style.backgroundColor = window.snapToGrid
    ? "#ddd"
    : "";
}

// グリッドの作成
function createGrid() {
  removeGrid(); // 既存のグリッドを削除

  const canvas = document.getElementById("canvas");
  const gridGroup = document.createElementNS(window.svgNS, "g");
  gridGroup.setAttribute("id", "grid");

  const width = parseInt(canvas.getAttribute("width"));
  const height = parseInt(canvas.getAttribute("height"));

  // 縦線
  for (let x = window.gridSize; x < width; x += window.gridSize) {
    const line = document.createElementNS(window.svgNS, "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", 0);
    line.setAttribute("x2", x);
    line.setAttribute("y2", height);
    line.setAttribute("stroke", "#ddd");
    line.setAttribute("stroke-width", 1);
    gridGroup.appendChild(line);
  }

  // 横線
  for (let y = window.gridSize; y < height; y += window.gridSize) {
    const line = document.createElementNS(window.svgNS, "line");
    line.setAttribute("x1", 0);
    line.setAttribute("y1", y);
    line.setAttribute("x2", width);
    line.setAttribute("y2", y);
    line.setAttribute("stroke", "#ddd");
    line.setAttribute("stroke-width", 1);
    gridGroup.appendChild(line);
  }

  // 一番背面に追加
  canvas.insertBefore(gridGroup, canvas.firstChild);
}

// グリッドの削除
function removeGrid() {
  const grid = document.getElementById("grid");
  if (grid) {
    grid.parentNode.removeChild(grid);
  }
}

// 選択中のオブジェクトを削除する関数
function deleteSelectedObject() {
  if (!window.selectedObject) return; // 選択オブジェクトがなければ何もしない

  saveState(); // 削除前に現在の状態を保存

  // キャンバスから選択オブジェクトを削除
  const canvas = document.getElementById("canvas");
  if (canvas.contains(window.selectedObject)) {
    canvas.removeChild(window.selectedObject);
  }

  // 選択状態をクリア
  window.selectTool.deselectObject();
  window.selectedObjects = [];
}

// 選択したオブジェクトのスタイルを更新
function updateSelectedObjectStyle() {
  if (!window.selectedObject) return;

  saveState(); // 状態を保存

  window.selectedObject.setAttribute(
    "fill",
    document.getElementById("fill-color").value
  );
  window.selectedObject.setAttribute(
    "stroke",
    document.getElementById("stroke-color").value
  );
  window.selectedObject.setAttribute(
    "stroke-width",
    document.getElementById("stroke-width").value
  );
  window.selectedObject.setAttribute(
    "opacity",
    document.getElementById("opacity-input").value
  );
}

// レイヤー一覧を更新
function updateLayerList() {
  const layerList = document.getElementById("layer-list");
  layerList.innerHTML = "";

  window.layers.forEach((layer) => {
    const layerItem = document.createElement("div");
    layerItem.style.padding = "5px";
    layerItem.style.marginBottom = "5px";
    layerItem.style.backgroundColor =
      layer.id === window.currentLayerId ? "#e6f2ff" : "#f5f5f5";
    layerItem.style.cursor = "pointer";
    layerItem.style.display = "flex";
    layerItem.style.alignItems = "center";

    const visibilityCheckbox = document.createElement("input");
    visibilityCheckbox.type = "checkbox";
    visibilityCheckbox.checked = layer.visible;
    visibilityCheckbox.addEventListener("change", () => {
      layer.visible = visibilityCheckbox.checked;
      updateLayerVisibility();
    });

    const nameSpan = document.createElement("span");
    nameSpan.textContent = layer.name;
    nameSpan.style.marginLeft = "5px";
    nameSpan.style.flex = "1";

    layerItem.appendChild(visibilityCheckbox);
    layerItem.appendChild(nameSpan);

    layerItem.addEventListener("click", (e) => {
      if (e.target !== visibilityCheckbox) {
        window.currentLayerId = layer.id;
        updateLayerList();
      }
    });

    layerList.appendChild(layerItem);
  });
}

// レイヤーの表示/非表示を更新
function updateLayerVisibility() {
  // 各オブジェクトに data-layer 属性を設定する処理が必要
  document.querySelectorAll("[data-layer]").forEach((el) => {
    const layerId = parseInt(el.getAttribute("data-layer"));
    const layer = window.layers.find((l) => l.id === layerId);

    if (layer) {
      el.style.display = layer.visible ? "inline" : "none";
    }
  });
}

// 状態を保存する関数
function saveState() {
  const canvas = document.getElementById("canvas");

  // 現在の状態をクローン
  const state = canvas.cloneNode(true);

  // アンドゥスタックに追加
  window.undoStack.push(state);

  // スタックが大きくなりすぎないように制限
  if (window.undoStack.length > window.MAX_STACK_SIZE) {
    window.undoStack.shift(); // 最も古い状態を削除
  }

  // リドゥスタックをクリア（新しい操作をしたため）
  window.redoStack = [];

  // ボタンの状態を更新
  updateUndoRedoButtons();
}

// アンドゥ関数
function undo() {
  if (window.undoStack.length === 0) return;

  const canvas = document.getElementById("canvas");

  // 現在の状態をリドゥスタックに保存
  const currentState = canvas.cloneNode(true);
  window.redoStack.push(currentState);

  // 一つ前の状態を復元
  const previousState = window.undoStack.pop();

  // キャンバスをクリア
  while (canvas.firstChild) {
    canvas.removeChild(canvas.firstChild);
  }

  // 前の状態を復元
  Array.from(previousState.childNodes).forEach((node) => {
    canvas.appendChild(node.cloneNode(true));
  });

  // 選択を解除
  window.selectedObject = null;
  if (window.selectTool) {
    window.selectTool.deselectObject();
  }

  // ボタンの状態を更新
  updateUndoRedoButtons();
}

// リドゥ関数
function redo() {
  if (window.redoStack.length === 0) return;

  const canvas = document.getElementById("canvas");

  // 現在の状態をアンドゥスタックに保存
  const currentState = canvas.cloneNode(true);
  window.undoStack.push(currentState);

  // 次の状態を復元
  const nextState = window.redoStack.pop();

  // キャンバスをクリア
  while (canvas.firstChild) {
    canvas.removeChild(canvas.firstChild);
  }

  // 次の状態を復元
  Array.from(nextState.childNodes).forEach((node) => {
    canvas.appendChild(node.cloneNode(true));
  });

  // 選択を解除
  window.selectedObject = null;
  if (window.selectTool) {
    window.selectTool.deselectObject();
  }

  // ボタンの状態を更新
  updateUndoRedoButtons();
}

// アンドゥ/リドゥボタンの状態を更新
function updateUndoRedoButtons() {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");

  if (undoBtn) undoBtn.disabled = window.undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = window.redoStack.length === 0;
}

// 整列機能の実装
function alignObjects(alignType) {
  if (window.selectedObjects.length <= 1) return;

  saveState(); // 状態を保存

  // 選択されたオブジェクトのバウンディングボックスを取得
  const bounds = window.selectedObjects.map((obj) => getBoundingBox(obj));

  // 整列の基準値を計算
  let referenceValue;

  switch (alignType) {
    case "left":
      referenceValue = Math.min(...bounds.map((b) => b.x));
      window.selectedObjects.forEach((obj, i) => {
        alignObjectHorizontally(obj, referenceValue, "left", bounds[i]);
      });
      break;
    case "center":
      referenceValue =
        bounds.reduce((sum, b) => sum + (b.x + b.width / 2), 0) / bounds.length;
      window.selectedObjects.forEach((obj, i) => {
        alignObjectHorizontally(obj, referenceValue, "center", bounds[i]);
      });
      break;
    case "right":
      referenceValue = Math.max(...bounds.map((b) => b.x + b.width));
      window.selectedObjects.forEach((obj, i) => {
        alignObjectHorizontally(obj, referenceValue, "right", bounds[i]);
      });
      break;
    case "top":
      referenceValue = Math.min(...bounds.map((b) => b.y));
      window.selectedObjects.forEach((obj, i) => {
        alignObjectVertically(obj, referenceValue, "top", bounds[i]);
      });
      break;
    case "middle":
      referenceValue =
        bounds.reduce((sum, b) => sum + (b.y + b.height / 2), 0) /
        bounds.length;
      window.selectedObjects.forEach((obj, i) => {
        alignObjectVertically(obj, referenceValue, "middle", bounds[i]);
      });
      break;
    case "bottom":
      referenceValue = Math.max(...bounds.map((b) => b.y + b.height));
      window.selectedObjects.forEach((obj, i) => {
        alignObjectVertically(obj, referenceValue, "bottom", bounds[i]);
      });
      break;
  }

  // コントロールポイントを更新
  if (window.selectedObject && window.selectTool) {
    window.selectTool.addControlPoints();
  }
}

// 水平方向の整列
function alignObjectHorizontally(obj, reference, alignType, bounds) {
  if (obj.tagName === "rect") {
    let newX = bounds.x;
    if (alignType === "center") {
      newX = reference - bounds.width / 2;
    } else if (alignType === "right") {
      newX = reference - bounds.width;
    } else {
      newX = reference;
    }
    obj.setAttribute("x", newX);
  } else if (obj.tagName === "circle") {
    let newCX = bounds.x + bounds.width / 2;
    if (alignType === "left") {
      newCX = reference + bounds.width / 2;
    } else if (alignType === "right") {
      newCX = reference - bounds.width / 2;
    } else {
      newCX = reference;
    }
    obj.setAttribute("cx", newCX);
  } else if (obj.tagName === "polygon") {
    // 多角形の場合
    const points = obj.getAttribute("points").trim().split(" ");
    const dx =
      alignType === "left"
        ? reference - bounds.x
        : alignType === "right"
        ? reference - (bounds.x + bounds.width)
        : reference - (bounds.x + bounds.width / 2);

    const newPoints = points
      .map((point) => {
        const [x, y] = point.split(",").map(parseFloat);
        return `${x + dx},${y}`;
      })
      .join(" ");

    obj.setAttribute("points", newPoints);
  } else if (obj.tagName === "text") {
    // テキストの場合
    let newX = bounds.x;
    if (alignType === "center") {
      newX = reference - bounds.width / 2;
    } else if (alignType === "right") {
      newX = reference - bounds.width;
    } else {
      newX = reference;
    }
    obj.setAttribute("x", newX);
  } else if (obj.tagName === "path") {
    // パスの場合（未実装）
  }
}

// 垂直方向の整列
function alignObjectVertically(obj, reference, alignType, bounds) {
  if (obj.tagName === "rect") {
    let newY = bounds.y;
    if (alignType === "middle") {
      newY = reference - bounds.height / 2;
    } else if (alignType === "bottom") {
      newY = reference - bounds.height;
    } else {
      newY = reference;
    }
    obj.setAttribute("y", newY);
  } else if (obj.tagName === "circle") {
    let newCY = bounds.y + bounds.height / 2;
    if (alignType === "top") {
      newCY = reference + bounds.height / 2;
    } else if (alignType === "bottom") {
      newCY = reference - bounds.height / 2;
    } else {
      newCY = reference;
    }
    obj.setAttribute("cy", newCY);
  } else if (obj.tagName === "polygon") {
    // 多角形の場合
    const points = obj.getAttribute("points").trim().split(" ");
    const dy =
      alignType === "top"
        ? reference - bounds.y
        : alignType === "bottom"
        ? reference - (bounds.y + bounds.height)
        : reference - (bounds.y + bounds.height / 2);

    const newPoints = points
      .map((point) => {
        const [x, y] = point.split(",").map(parseFloat);
        return `${x},${y + dy}`;
      })
      .join(" ");

    obj.setAttribute("points", newPoints);
  } else if (obj.tagName === "text") {
    // テキストの場合
    let newY = bounds.y;
    if (alignType === "middle") {
      newY = reference - bounds.height / 2;
    } else if (alignType === "bottom") {
      newY = reference - bounds.height;
    } else {
      newY = reference;
    }
    obj.setAttribute("y", newY);
  } else if (obj.tagName === "path") {
    // パスの場合（未実装）
  }
}

// オブジェクトのバウンディングボックスを取得する関数
function getBoundingBox(obj) {
  if (!obj) return null;

  if (window.selectTool) {
    return window.selectTool.getBoundingBox(obj);
  }

  // 選択ツールが利用できない場合のフォールバック
  if (obj.tagName === "rect") {
    return {
      x: parseFloat(obj.getAttribute("x")),
      y: parseFloat(obj.getAttribute("y")),
      width: parseFloat(obj.getAttribute("width")),
      height: parseFloat(obj.getAttribute("height")),
    };
  } else if (obj.tagName === "circle") {
    const cx = parseFloat(obj.getAttribute("cx"));
    const cy = parseFloat(obj.getAttribute("cy"));
    const r = parseFloat(obj.getAttribute("r"));
    return {
      x: cx - r,
      y: cy - r,
      width: r * 2,
      height: r * 2,
    };
  }

  // デフォルト値
  return { x: 0, y: 0, width: 0, height: 0 };
}

// オブジェクトのグループ化
function groupObjects() {
  if (window.selectedObjects.length <= 1) return;

  saveState(); // 状態を保存

  const canvas = document.getElementById("canvas");

  // グループ要素を作成
  const group = document.createElementNS(window.svgNS, "g");
  group.setAttribute("data-layer", window.currentLayerId);

  // 選択されたオブジェクトをグループに移動
  window.selectedObjects.forEach((obj) => {
    // 元の親からオブジェクトを削除
    obj.parentNode.removeChild(obj);

    // グループにオブジェクトを追加
    group.appendChild(obj);

    // 選択表示を解除
    obj.removeAttribute("stroke-dasharray");
  });

  // グループをキャンバスに追加
  canvas.appendChild(group);

  // 選択を更新
  window.selectedObjects = [group];
  window.selectedObject = group;

  // グループを選択状態にする
  group.setAttribute("stroke-dasharray", "5 5");

  // コントロールポイントを更新
  if (window.selectTool) {
    window.selectTool.addControlPoints();
  }
}

// グループ解除
function ungroupObjects() {
  if (!window.selectedObject || window.selectedObject.tagName !== "g") return;

  saveState(); // 状態を保存

  const canvas = document.getElementById("canvas");
  const group = window.selectedObject;
  const layerId = group.getAttribute("data-layer") || window.currentLayerId;

  // グループ内の要素をキャンバスに移動
  const childNodes = Array.from(group.childNodes);
  window.selectedObjects = [];

  childNodes.forEach((node) => {
    // グループから要素を削除
    group.removeChild(node);

    // レイヤー属性を設定
    node.setAttribute("data-layer", layerId);

    // キャンバスに直接追加
    canvas.appendChild(node);

    // 新しい選択対象として追加
    window.selectedObjects.push(node);
    node.setAttribute("stroke-dasharray", "5 5");
  });

  // 空になったグループを削除
  canvas.removeChild(group);

  // 最後の要素を現在の選択オブジェクトにする
  window.selectedObject =
    window.selectedObjects.length > 0
      ? window.selectedObjects[window.selectedObjects.length - 1]
      : null;

  // コントロールポイントを更新
  if (window.selectedObject && window.selectTool) {
    window.selectTool.addControlPoints();
  }
}

// SVGを保存
function saveSVG() {
  // 選択状態を解除
  if (window.selectTool) {
    window.selectTool.deselectObject();
  }

  const canvas = document.getElementById("canvas");

  // SVGのクローンを作成
  const svgCopy = canvas.cloneNode(true);

  // SVGデータをテキストに変換
  const svgData = new XMLSerializer().serializeToString(svgCopy);

  // ダウンロード用のリンクを作成
  const blob = new Blob([svgData], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "drawing.svg";
  link.click();

  // リソースの解放
  URL.revokeObjectURL(url);
}

// SVGを読み込み
function loadSVG() {
  // ファイル選択ダイアログを表示
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".svg";

  input.onchange = function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
      const svgContent = e.target.result;
      const canvas = document.getElementById("canvas");

      // キャンバスをクリア
      while (canvas.firstChild) {
        canvas.removeChild(canvas.firstChild);
      }

      // SVGを解析
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svgContent, "image/svg+xml");

      // 要素をインポート
      const svgRoot = svgDoc.documentElement;
      for (let i = 0; i < svgRoot.children.length; i++) {
        const node = svgRoot.children[i];
        const importedNode = document.importNode(node, true);
        canvas.appendChild(importedNode);
      }

      // 状態を保存
      saveState();
    };

    reader.readAsText(file);
  };

  input.click();
}
