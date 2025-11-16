# ユーティリティモジュール

このディレクトリには、ベクターエディタプロジェクトで再利用可能な純粋関数とユーティリティが含まれています。

## 設計方針

### 1. **純粋関数モジュール**
- **依存関係なし**: 外部モジュールやグローバル変数に依存しない
- **明確な入出力**: 引数と戻り値の型が明確
- **副作用なし**: 関数の実行が外部状態を変更しない
- **テスト容易性**: ユニットテストが簡単に書ける

### 2. **契約仕様の記述**
各ファイルの先頭に以下の情報を記述：
- **目的**: モジュールの役割
- **依存関係**: 使用する外部モジュール（なしの場合はその旨を明記）
- **入力**: 引数の型と説明
- **出力**: 戻り値の型と説明
- **エクスポート関数**: 公開する関数のリスト
- **使用例**: 実際のコード例

---

## モジュール一覧

### 📐 geometry.js - 幾何計算
2D幾何計算の純粋関数を提供

**主な関数:**
- `distance(p1, p2)` - 2点間の距離
- `lineIntersection(line1, line2)` - 線分の交点
- `midpoint(p1, p2)` - 中点
- `rotate(point, center, angle)` - 点の回転
- `normalizeAngle(angle)` - 角度の正規化

**使用例:**
```javascript
const p1 = {x: 0, y: 0};
const p2 = {x: 3, y: 4};
const dist = window.GeometryUtils.distance(p1, p2); // => 5

const line1 = {x1: 0, y1: 0, x2: 10, y2: 10};
const line2 = {x1: 0, y1: 10, x2: 10, y2: 0};
const intersection = window.GeometryUtils.lineIntersection(line1, line2);
// => {x: 5, y: 5}
```

---

### 📍 coordinates.js - 座標変換・スナップ
座標系の変換とスナップ機能を提供

**主な関数:**
- `screenToSVG(svgElement, screenX, screenY)` - スクリーン→SVG座標
- `snapToGrid(point, gridSize)` - グリッドスナップ
- `snapToOrtho(startPoint, currentPoint)` - 直交スナップ
- `snapAngle(angle, snapDegrees)` - 角度スナップ

**使用例:**
```javascript
// グリッドスナップ
const point = {x: 23, y: 47};
const snapped = window.CoordinatesUtils.snapToGrid(point, 20);
// => {x: 20, y: 40}

// 直交スナップ
const start = {x: 0, y: 0};
const current = {x: 30, y: 10};
const ortho = window.CoordinatesUtils.snapToOrtho(start, current);
// => {x: 30, y: 0} (水平方向に拘束)
```

---

### 🎨 svg.js - SVG要素操作
SVG要素の作成・操作の共通処理を提供

**主な関数:**
- `createElement(tagName, attributes)` - SVG要素作成
- `setAttributes(element, attributes)` - 属性一括設定
- `createLine(x1, y1, x2, y2, attributes)` - 線分作成
- `createCircle(cx, cy, r, attributes)` - 円作成
- `createRect(x, y, width, height, attributes)` - 矩形作成

**使用例:**
```javascript
// 線分を作成
const line = window.SvgUtils.createLine(0, 0, 100, 100, {
  stroke: 'black',
  'stroke-width': 2
});
canvas.appendChild(line);

// 円を作成
const circle = window.SvgUtils.createCircle(50, 50, 30, {
  fill: 'red',
  stroke: 'black'
});
canvas.appendChild(circle);
```

---

### 🖌️ style.js - スタイル管理
描画スタイルの正規化と管理を提供

**主な関数:**
- `normalizeStyle(style)` - スタイルの正規化
- `applyStyle(element, style)` - 要素にスタイル適用
- `mergeStyles(...styles)` - 複数スタイルのマージ
- `hexToRgb(hex)` / `rgbToHex(r, g, b)` - 色変換

**定数:**
- `LINE_STYLES` - 線スタイルプリセット (solid, dashed, dotted, etc.)
- `LINE_CAPS` - 線端の形状 (butt, round, square)
- `LINE_JOINS` - 線の接合形状 (miter, round, bevel)

**使用例:**
```javascript
// スタイルを適用
const style = {
  stroke: '#ff0000',
  strokeWidth: 3,
  strokeDasharray: window.StyleUtils.LINE_STYLES.dashed
};

window.StyleUtils.applyStyle(element, style);

// 色変換
const rgb = window.StyleUtils.hexToRgb('#ff0000');
// => {r: 255, g: 0, b: 0}
```

---

## 使用方法

### 1. グローバルオブジェクトとしてアクセス

このプロジェクトでは、`index.js` がすべてのユーティリティをグローバルに公開しています：

```javascript
// geometry関数を使用
const dist = window.GeometryUtils.distance(p1, p2);

// coordinates関数を使用
const snapped = window.CoordinatesUtils.snapToGrid(point, 20);

// svg関数を使用
const line = window.SvgUtils.createLine(0, 0, 100, 100);

// style関数を使用
window.StyleUtils.applyStyle(element, { stroke: '#000' });
```

### 2. 統合オブジェクトとしてアクセス

```javascript
window.VectorUtils.geometry.distance(p1, p2);
window.VectorUtils.coordinates.snapToGrid(point, 20);
window.VectorUtils.svg.createLine(0, 0, 100, 100);
window.VectorUtils.style.applyStyle(element, style);
```

### 3. ES6モジュールとして使用（将来の拡張）

プロジェクトをES6モジュール化する場合：

```javascript
import { distance, midpoint } from './utils/geometry.js';
import { snapToGrid } from './utils/coordinates.js';
import { createElement } from './utils/svg.js';
import { applyStyle, LINE_STYLES } from './utils/style.js';

const dist = distance(p1, p2);
const snapped = snapToGrid(point, 20);
```

---

## リファクタリング実績

### ✅ 完了したリファクタリング

1. **SnapManager.js**
   - `distance()` → `GeometryUtils.distance()`
   - `lineLineIntersection()` → `GeometryUtils.lineIntersection()`
   - `getMidpoints()` の中点計算 → `GeometryUtils.midpoint()`
   - `snapToGrid()` → `CoordinatesUtils.snapToGrid()`

2. **ToolManager.js**
   - `snapToGrid()` → `CoordinatesUtils.snapToGrid()`

3. **BaseTool.js**
   - 依存関係を明記（将来的なリファクタリング用）

---

## テスト（今後の拡張）

ユーティリティ関数は純粋関数なので、テストが容易です：

```javascript
// geometry.jsのテスト例
test('distance calculates correctly', () => {
  const p1 = {x: 0, y: 0};
  const p2 = {x: 3, y: 4};
  expect(distance(p1, p2)).toBe(5);
});

// coordinates.jsのテスト例
test('snapToGrid snaps to nearest grid point', () => {
  const point = {x: 23, y: 47};
  const result = snapToGrid(point, 20);
  expect(result).toEqual({x: 20, y: 40});
});
```

---

## 今後の拡張予定

### フェーズ2: サービスクラスの依存性注入化

```
src/services/
  ├── HistoryService.js   # 履歴管理（グローバル変数を排除）
  ├── SnapService.js      # スナップ機能（DI化）
  └── LayerService.js     # レイヤー管理（DI化）
```

### フェーズ3: 完全なモジュール化

- グローバル変数の削除
- 依存性注入パターンの導入
- ES6モジュールへの完全移行

---

## 貢献ガイドライン

新しいユーティリティ関数を追加する場合：

1. **純粋関数として実装**: 副作用なし、グローバル変数不使用
2. **契約仕様を記述**: ファイル先頭に詳細なコメントを追加
3. **使用例を提供**: 実際のコード例を含める
4. **テストを追加**: ユニットテストを書く（推奨）
5. **このREADMEを更新**: 新しい関数をドキュメント化

---

## ライセンス

このプロジェクトのライセンスに従います。

---

## 変更履歴

- **2025-11-16**: 初版作成
  - geometry.js, coordinates.js, svg.js, style.js を追加
  - SnapManager.js, ToolManager.js, BaseTool.js をリファクタリング
