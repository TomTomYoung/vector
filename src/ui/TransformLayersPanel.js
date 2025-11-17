/**
 * アフィン変換レイヤーを管理するUIパネル
 */
class TransformLayersPanel {
  constructor() {
    this.panel = null;
    this.transformManager = null;
    this.selectedLayerId = null;
    this.onApplyCallback = null;
    this.currentElement = null; // 現在選択されている要素

    this.init();
  }

  init() {
    this.createPanel();
  }

  createPanel() {
    // 既存のパネルコンテナを取得
    const panelContainer = document.getElementById('transform-layers-panel');
    if (panelContainer) {
      this.panel = panelContainer;
      this.panel.innerHTML = '';
    } else {
      this.panel = document.createElement('div');
      this.panel.id = 'transform-layers-panel';
      this.panel.className = 'side-panel';
      document.body.appendChild(this.panel);
    }

    this.updatePanel();
  }

  /**
   * TransformManagerを設定
   */
  setTransformManager(manager, onApply, element = null) {
    // 既存のリスナーを削除
    if (this.transformManager) {
      this.transformManager.removeChangeListener(this.boundUpdatePanel);
    }

    this.transformManager = manager;
    this.onApplyCallback = onApply;
    this.currentElement = element;
    this.selectedLayerId = null;

    // 新しいリスナーを追加
    if (this.transformManager) {
      this.boundUpdatePanel = () => {
        this.updatePanel();
        if (this.onApplyCallback) {
          this.onApplyCallback(this.transformManager.compose());
        }
      };
      this.transformManager.addChangeListener(this.boundUpdatePanel);
    }

    this.updatePanel();
  }

  /**
   * パネルを更新
   */
  updatePanel() {
    if (!this.panel) return;

    this.panel.innerHTML = '';

    // タイトル
    const title = document.createElement('h3');
    title.textContent = 'アフィン変換レイヤー';
    title.style.cssText = `
      margin: 0 0 15px 0;
      padding: 10px;
      background: #2a2a2a;
      font-size: 14px;
      font-weight: bold;
      border-bottom: 2px solid #444;
    `;
    this.panel.appendChild(title);

    if (!this.transformManager) {
      const message = document.createElement('p');
      message.textContent = 'オブジェクトを選択してください';
      message.style.cssText = 'color: #999; padding: 10px; font-size: 12px;';
      this.panel.appendChild(message);
      return;
    }

    // コンテンツコンテナ
    const content = document.createElement('div');
    content.style.cssText = 'padding: 10px;';
    this.panel.appendChild(content);

    // レイヤー追加ボタン群
    this.createAddLayerButtons(content);

    // レイヤーリスト
    this.createLayerList(content);
  }

  /**
   * レイヤー追加ボタン群を作成
   */
  createAddLayerButtons(container) {
    const buttonGroup = document.createElement('div');
    buttonGroup.style.cssText = `
      display: flex;
      gap: 5px;
      margin-bottom: 15px;
      flex-wrap: wrap;
    `;

    const buttonStyle = `
      flex: 1;
      min-width: 60px;
      padding: 8px 10px;
      background: #444;
      color: #fff;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
      transition: background 0.2s;
    `;

    // 回転レイヤー追加
    const rotateBtn = document.createElement('button');
    rotateBtn.textContent = '+ 回転';
    rotateBtn.style.cssText = buttonStyle;
    rotateBtn.onmouseover = () => rotateBtn.style.background = '#555';
    rotateBtn.onmouseout = () => rotateBtn.style.background = '#444';
    rotateBtn.onclick = () => this.addLayer('rotate');
    buttonGroup.appendChild(rotateBtn);

    // スケールレイヤー追加
    const scaleBtn = document.createElement('button');
    scaleBtn.textContent = '+ スケール';
    scaleBtn.style.cssText = buttonStyle;
    scaleBtn.onmouseover = () => scaleBtn.style.background = '#555';
    scaleBtn.onmouseout = () => scaleBtn.style.background = '#444';
    scaleBtn.onclick = () => this.addLayer('scale');
    buttonGroup.appendChild(scaleBtn);

    // 移動レイヤー追加
    const translateBtn = document.createElement('button');
    translateBtn.textContent = '+ 移動';
    translateBtn.style.cssText = buttonStyle;
    translateBtn.onmouseover = () => translateBtn.style.background = '#555';
    translateBtn.onmouseout = () => translateBtn.style.background = '#444';
    translateBtn.onclick = () => this.addLayer('translate');
    buttonGroup.appendChild(translateBtn);

    container.appendChild(buttonGroup);
  }

  /**
   * レイヤーリストを作成
   */
  createLayerList(container) {
    const layers = this.transformManager.getLayers();

    if (layers.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.textContent = 'レイヤーがありません';
      emptyMessage.style.cssText = 'color: #999; font-size: 12px; text-align: center; padding: 20px;';
      container.appendChild(emptyMessage);
      return;
    }

    const listContainer = document.createElement('div');
    listContainer.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    layers.forEach((layer, index) => {
      const layerElement = this.createLayerElement(layer, index);
      listContainer.appendChild(layerElement);
    });

    container.appendChild(listContainer);
  }

  /**
   * 個別のレイヤー要素を作成
   */
  createLayerElement(layer, index) {
    const isSelected = layer.id === this.selectedLayerId;
    const isExpanded = isSelected;

    const layerDiv = document.createElement('div');
    layerDiv.style.cssText = `
      background: ${isSelected ? '#3a3a3a' : '#2a2a2a'};
      border: 1px solid ${isSelected ? '#555' : '#444'};
      border-radius: 4px;
      padding: 8px;
      transition: all 0.2s;
    `;

    // ヘッダー部分
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: ${isExpanded ? '8px' : '0'};
    `;

    // 有効/無効チェックボックス
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = layer.enabled;
    checkbox.style.cssText = 'cursor: pointer;';
    checkbox.onclick = (e) => {
      e.stopPropagation();
      this.transformManager.toggleLayer(layer.id);
    };
    header.appendChild(checkbox);

    // レイヤー名
    const nameLabel = document.createElement('span');
    nameLabel.textContent = `${index + 1}. ${layer.name}`;
    nameLabel.style.cssText = `
      flex: 1;
      font-size: 12px;
      color: ${layer.enabled ? '#fff' : '#888'};
      cursor: pointer;
    `;
    nameLabel.onclick = () => {
      this.selectedLayerId = this.selectedLayerId === layer.id ? null : layer.id;
      this.updatePanel();
    };
    nameLabel.ondblclick = (e) => {
      e.stopPropagation();
      const currentName = layer.name;
      const newName = prompt('レイヤー名を入力:', currentName);
      if (newName !== null && newName.trim() !== '') {
        layer.name = newName.trim();
        this.transformManager.notifyChange();
      }
    };
    nameLabel.title = 'ダブルクリックで名前を編集';
    header.appendChild(nameLabel);

    // 上へボタン
    const upBtn = this.createIconButton('▲', () => {
      this.transformManager.moveLayerUp(layer.id);
    }, index === 0);
    header.appendChild(upBtn);

    // 下へボタン
    const downBtn = this.createIconButton('▼', () => {
      this.transformManager.moveLayerDown(layer.id);
    }, index === this.transformManager.getLayerCount() - 1);
    header.appendChild(downBtn);

    // 削除ボタン
    const deleteBtn = this.createIconButton('×', () => {
      if (confirm(`レイヤー「${layer.name}」を削除しますか？`)) {
        this.transformManager.removeLayer(layer.id);
        if (this.selectedLayerId === layer.id) {
          this.selectedLayerId = null;
        }
      }
    });
    deleteBtn.style.color = '#f88';
    header.appendChild(deleteBtn);

    layerDiv.appendChild(header);

    // 展開時の詳細パラメータ
    if (isExpanded) {
      const details = this.createLayerDetails(layer);
      layerDiv.appendChild(details);
    }

    return layerDiv;
  }

  /**
   * アイコンボタンを作成
   */
  createIconButton(text, onClick, disabled = false) {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      width: 24px;
      height: 24px;
      padding: 0;
      background: #444;
      color: #fff;
      border: none;
      border-radius: 3px;
      cursor: ${disabled ? 'not-allowed' : 'pointer'};
      font-size: 10px;
      opacity: ${disabled ? '0.3' : '1'};
      transition: background 0.2s;
    `;
    if (!disabled) {
      btn.onclick = onClick;
      btn.onmouseover = () => btn.style.background = '#555';
      btn.onmouseout = () => btn.style.background = '#444';
    }
    return btn;
  }

  /**
   * レイヤーの詳細パラメータ部分を作成
   */
  createLayerDetails(layer) {
    const details = document.createElement('div');
    details.style.cssText = `
      background: #252525;
      border-radius: 4px;
      padding: 10px;
      font-size: 11px;
    `;

    // 原点（回転とスケールのみ）
    if (layer.type === 'rotate' || layer.type === 'scale') {
      // 原点リセットボタン
      const resetOriginBtn = document.createElement('button');
      resetOriginBtn.textContent = '原点を中心にリセット';
      resetOriginBtn.style.cssText = `
        width: 100%;
        padding: 6px;
        margin-bottom: 8px;
        background: #3a7bc8;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
        transition: background 0.2s;
      `;
      resetOriginBtn.onmouseover = () => resetOriginBtn.style.background = '#4a8bd8';
      resetOriginBtn.onmouseout = () => resetOriginBtn.style.background = '#3a7bc8';
      resetOriginBtn.onclick = () => {
        if (this.currentElement) {
          try {
            const bbox = this.currentElement.getBBox();
            const ctm = this.currentElement.getCTM();
            const centerLocal = {
              x: bbox.x + bbox.width / 2,
              y: bbox.y + bbox.height / 2
            };

            if (ctm) {
              const pt = this.currentElement.ownerSVGElement.createSVGPoint();
              pt.x = centerLocal.x;
              pt.y = centerLocal.y;
              const transformed = pt.matrixTransform(ctm);
              layer.origin.x = transformed.x;
              layer.origin.y = transformed.y;
            } else {
              layer.origin.x = centerLocal.x;
              layer.origin.y = centerLocal.y;
            }
            this.transformManager.notifyChange();
          } catch (e) {
            console.warn('Failed to reset origin:', e);
          }
        }
      };
      details.appendChild(resetOriginBtn);

      details.appendChild(this.createPropertyRow('原点 X',
        Math.round(layer.origin.x * 10) / 10,
        (value) => {
          layer.origin.x = parseFloat(value) || 0;
          this.transformManager.notifyChange();
        }, 'number', 0.1));

      details.appendChild(this.createPropertyRow('原点 Y',
        Math.round(layer.origin.y * 10) / 10,
        (value) => {
          layer.origin.y = parseFloat(value) || 0;
          this.transformManager.notifyChange();
        }, 'number', 0.1));
    }

    // タイプ別パラメータ
    switch (layer.type) {
      case 'rotate':
        details.appendChild(this.createPropertyRow('角度 (°)', layer.angle, (value) => {
          layer.angle = parseFloat(value) || 0;
          this.transformManager.notifyChange();
        }, 'number', 1));
        break;

      case 'scale':
        details.appendChild(this.createPropertyRow('スケール X', layer.scaleX, (value) => {
          layer.scaleX = parseFloat(value) || 1;
          this.transformManager.notifyChange();
        }, 'number', 0.01));

        details.appendChild(this.createPropertyRow('スケール Y', layer.scaleY, (value) => {
          layer.scaleY = parseFloat(value) || 1;
          this.transformManager.notifyChange();
        }, 'number', 0.01));
        break;

      case 'translate':
        details.appendChild(this.createPropertyRow('移動 X', layer.translateX, (value) => {
          layer.translateX = parseFloat(value) || 0;
          this.transformManager.notifyChange();
        }, 'number', 0.1));

        details.appendChild(this.createPropertyRow('移動 Y', layer.translateY, (value) => {
          layer.translateY = parseFloat(value) || 0;
          this.transformManager.notifyChange();
        }, 'number', 0.1));
        break;
    }

    return details;
  }

  /**
   * プロパティ行を作成
   */
  createPropertyRow(label, value, onChange, type = 'number', step = 1) {
    const row = document.createElement('div');
    row.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    `;

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.style.cssText = 'color: #ccc; font-size: 11px;';
    row.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    input.step = step;
    input.style.cssText = `
      width: 80px;
      padding: 4px 6px;
      background: #1a1a1a;
      color: #fff;
      border: 1px solid #444;
      border-radius: 3px;
      font-size: 11px;
    `;
    input.oninput = (e) => onChange(e.target.value);
    row.appendChild(input);

    return row;
  }

  /**
   * レイヤーを追加
   */
  addLayer(type) {
    if (!this.transformManager) return;
    if (!window.VectorUtils || !window.VectorUtils.TransformLayer) {
      console.error('VectorUtils.TransformLayer is not available');
      return;
    }

    // 選択オブジェクトの中心を原点として取得
    let origin = { x: 0, y: 0 };
    if (this.currentElement) {
      try {
        const bbox = this.currentElement.getBBox();
        const ctm = this.currentElement.getCTM();

        // バウンディングボックスの中心をローカル座標で計算
        const centerLocal = {
          x: bbox.x + bbox.width / 2,
          y: bbox.y + bbox.height / 2
        };

        // CTMを使ってグローバル座標に変換
        if (ctm) {
          const pt = this.currentElement.ownerSVGElement.createSVGPoint();
          pt.x = centerLocal.x;
          pt.y = centerLocal.y;
          const transformed = pt.matrixTransform(ctm);
          origin = { x: transformed.x, y: transformed.y };
        } else {
          origin = centerLocal;
        }
      } catch (e) {
        console.warn('Failed to get element center:', e);
      }
    }

    const layer = new window.VectorUtils.TransformLayer(type, {
      origin: origin
    });

    this.transformManager.addLayer(layer);
    this.selectedLayerId = layer.id;
  }

  /**
   * パネルを表示
   */
  show() {
    if (this.panel) {
      this.panel.style.display = 'block';
    }
  }

  /**
   * パネルを非表示
   */
  hide() {
    if (this.panel) {
      this.panel.style.display = 'none';
    }
  }

  /**
   * パネルを破棄
   */
  destroy() {
    if (this.transformManager) {
      this.transformManager.removeChangeListener(this.boundUpdatePanel);
    }
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
  }
}
