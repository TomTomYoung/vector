/**
 * 単一のアフィン変換レイヤー
 */
export class TransformLayer {
  constructor(type, options = {}) {
    this.id = options.id || `layer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = options.name || this.getDefaultName(type);
    this.type = type; // 'rotate', 'scale', 'translate'
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.origin = options.origin || { x: 0, y: 0 }; // 回転・スケールの原点

    // 変換パラメータ
    switch (type) {
      case 'rotate':
        this.angle = options.angle || 0;
        break;
      case 'scale':
        this.scaleX = options.scaleX || 1;
        this.scaleY = options.scaleY || 1;
        break;
      case 'translate':
        this.translateX = options.translateX || 0;
        this.translateY = options.translateY || 0;
        break;
    }
  }

  getDefaultName(type) {
    const names = {
      rotate: '回転',
      scale: 'スケール',
      translate: '移動'
    };
    return names[type] || type;
  }

  /**
   * このレイヤーのDOMMatrixを生成
   */
  toMatrix() {
    if (!this.enabled) {
      return new DOMMatrix(); // 無効な場合は単位行列
    }

    switch (this.type) {
      case 'rotate':
        return new DOMMatrix()
          .translate(this.origin.x, this.origin.y)
          .rotate(this.angle)
          .translate(-this.origin.x, -this.origin.y);

      case 'scale':
        return new DOMMatrix()
          .translate(this.origin.x, this.origin.y)
          .scale(this.scaleX, this.scaleY)
          .translate(-this.origin.x, -this.origin.y);

      case 'translate':
        return new DOMMatrix()
          .translate(this.translateX, this.translateY);

      default:
        return new DOMMatrix();
    }
  }

  /**
   * レイヤーをクローン
   */
  clone() {
    const options = {
      id: `${this.id}_copy`,
      name: `${this.name} (コピー)`,
      enabled: this.enabled,
      origin: { ...this.origin }
    };

    switch (this.type) {
      case 'rotate':
        options.angle = this.angle;
        break;
      case 'scale':
        options.scaleX = this.scaleX;
        options.scaleY = this.scaleY;
        break;
      case 'translate':
        options.translateX = this.translateX;
        options.translateY = this.translateY;
        break;
    }

    return new TransformLayer(this.type, options);
  }

  /**
   * シリアライズ
   */
  serialize() {
    const data = {
      id: this.id,
      name: this.name,
      type: this.type,
      enabled: this.enabled,
      origin: { ...this.origin }
    };

    switch (this.type) {
      case 'rotate':
        data.angle = this.angle;
        break;
      case 'scale':
        data.scaleX = this.scaleX;
        data.scaleY = this.scaleY;
        break;
      case 'translate':
        data.translateX = this.translateX;
        data.translateY = this.translateY;
        break;
    }

    return data;
  }

  /**
   * デシリアライズ
   */
  static deserialize(data) {
    return new TransformLayer(data.type, data);
  }
}

/**
 * 複数のアフィン変換レイヤーを管理するマネージャー
 */
export class TransformManager {
  constructor(baseMatrix = new DOMMatrix()) {
    this.baseMatrix = baseMatrix;
    this.layers = [];
    this.listeners = new Set();
  }

  /**
   * 変更通知リスナーを追加
   */
  addChangeListener(listener) {
    this.listeners.add(listener);
  }

  /**
   * 変更通知リスナーを削除
   */
  removeChangeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * 変更を通知
   */
  notifyChange() {
    this.listeners.forEach(listener => listener(this));
  }

  /**
   * レイヤーを追加
   */
  addLayer(layer, index = -1) {
    if (index < 0 || index >= this.layers.length) {
      this.layers.push(layer);
    } else {
      this.layers.splice(index, 0, layer);
    }
    this.notifyChange();
    return layer;
  }

  /**
   * レイヤーを削除
   */
  removeLayer(layerId) {
    const index = this.layers.findIndex(l => l.id === layerId);
    if (index !== -1) {
      this.layers.splice(index, 1);
      this.notifyChange();
      return true;
    }
    return false;
  }

  /**
   * レイヤーを取得
   */
  getLayer(layerId) {
    return this.layers.find(l => l.id === layerId);
  }

  /**
   * レイヤーのインデックスを取得
   */
  getLayerIndex(layerId) {
    return this.layers.findIndex(l => l.id === layerId);
  }

  /**
   * レイヤーを上に移動
   */
  moveLayerUp(layerId) {
    const index = this.getLayerIndex(layerId);
    if (index > 0) {
      const layer = this.layers[index];
      this.layers.splice(index, 1);
      this.layers.splice(index - 1, 0, layer);
      this.notifyChange();
      return true;
    }
    return false;
  }

  /**
   * レイヤーを下に移動
   */
  moveLayerDown(layerId) {
    const index = this.getLayerIndex(layerId);
    if (index >= 0 && index < this.layers.length - 1) {
      const layer = this.layers[index];
      this.layers.splice(index, 1);
      this.layers.splice(index + 1, 0, layer);
      this.notifyChange();
      return true;
    }
    return false;
  }

  /**
   * レイヤーの順序を変更
   */
  reorderLayer(layerId, newIndex) {
    const oldIndex = this.getLayerIndex(layerId);
    if (oldIndex === -1 || newIndex < 0 || newIndex >= this.layers.length) {
      return false;
    }

    const layer = this.layers[oldIndex];
    this.layers.splice(oldIndex, 1);
    this.layers.splice(newIndex, 0, layer);
    this.notifyChange();
    return true;
  }

  /**
   * レイヤーの有効/無効を切り替え
   */
  toggleLayer(layerId) {
    const layer = this.getLayer(layerId);
    if (layer) {
      layer.enabled = !layer.enabled;
      this.notifyChange();
      return true;
    }
    return false;
  }

  /**
   * レイヤーを更新
   */
  updateLayer(layerId, updates) {
    const layer = this.getLayer(layerId);
    if (layer) {
      Object.assign(layer, updates);
      this.notifyChange();
      return true;
    }
    return false;
  }

  /**
   * すべてのレイヤーをクリア
   */
  clearLayers() {
    this.layers = [];
    this.notifyChange();
  }

  /**
   * すべてのレイヤーを合成して最終的なDOMMatrixを生成
   */
  compose() {
    let result = this.baseMatrix;

    for (const layer of this.layers) {
      if (layer.enabled) {
        result = layer.toMatrix().multiply(result);
      }
    }

    return result;
  }

  /**
   * レイヤーのコピーを作成
   */
  duplicateLayer(layerId) {
    const layer = this.getLayer(layerId);
    if (layer) {
      const newLayer = layer.clone();
      const index = this.getLayerIndex(layerId);
      this.addLayer(newLayer, index + 1);
      return newLayer;
    }
    return null;
  }

  /**
   * シリアライズ
   */
  serialize() {
    return {
      baseMatrix: {
        a: this.baseMatrix.a,
        b: this.baseMatrix.b,
        c: this.baseMatrix.c,
        d: this.baseMatrix.d,
        e: this.baseMatrix.e,
        f: this.baseMatrix.f
      },
      layers: this.layers.map(l => l.serialize())
    };
  }

  /**
   * デシリアライズ
   */
  static deserialize(data) {
    const manager = new TransformManager();
    const m = data.baseMatrix;
    manager.baseMatrix = new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
    manager.layers = data.layers.map(l => TransformLayer.deserialize(l));
    return manager;
  }

  /**
   * レイヤー数を取得
   */
  getLayerCount() {
    return this.layers.length;
  }

  /**
   * すべてのレイヤーを取得
   */
  getLayers() {
    return [...this.layers];
  }
}
