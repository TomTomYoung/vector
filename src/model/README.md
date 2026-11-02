# 演算とツールを使う

各ツールは ES モジュールの関数です。点は `{x, y}`、角度はラジアン、長さは入力座標と同じ単位です。結果をどこに書くか、いつ確定するか、履歴を取るかは呼び出し元が決めます。

## 演算を直接使う

```js
import {splitAt, split} from "./linear.js";

const points = [{x: 0, y: 0}, {x: 20, y: 0}, {x: 20, y: 10}];
const pieces = splitAt(points, 0.5); // 最初の線分の中点で分割
const same = split({points, point: {x: 10, y: 0}}); // 別の演算で求めた座標も渡せる
```

分割・トリム・延長は残る点列を配列で返します。変更がなければ空配列です。トリムと延長の `boundaries` は同じ座標系の点列の配列です。マウスでの分割に使う許容距離 `tolerance` と端点の除外幅 `endMargin` は呼び出し側が指定できます。

## ツールを組み合わせる

```js
import {createToolset} from "./tools.js";
import {circle} from "./drawing.js";

const run = createToolset({
  operations: {distance: (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)},
  tools: {
    diameter(input, ops) { return 2 * circle(input, ops).radius; },
  },
});
const value = run("diameter", {center: {x: 0, y: 0}, point: {x: 3, y: 4}}); // 14
```

`createToolset` は任意です。各ツールを直接 import して `tool(input, operations?)` で呼べます。登録する関数には第3引数に同じ組み合わせの `run(name, input)` が渡ります。たとえば `vertices` はインデックスを座標に戻し、指定された線・多角形・ベジェのツールを呼びます。

- `drawing.js` は線分、矩形、円、円弧、点列、パス、スプライン、ベジェ、テキスト、寸法、選択、頂点インデックスを扱います。ベジェの結果は制御点、円弧の結果は中心・半径・両端点・符号付き回転角です。サンプリングだけを行う場合は `bezier.js` の `sampleBezierPoints` を使えます。
- `measurements.js` の `polylineLength` は点列の全長または周長、`signedArea` は頂点順を保った符号付き面積を返します。`construction.js` の `reflectPoint` は2点を通る直線に対する鏡像を返します。[数式と入出力](../../doc/文章.md)
- `construction.js` の `offset` は新しい図形を返します。`chamfer` と `fillet` は元の2線分を置き換える点列と、新しく間をつなぐ図形を返します。
- `linear.js` の `join` は端点でつながる点列をまとめます。`nearestPosition`、`splitAt`、`extendEnd` は演算の段階で個別に使えます。

## 既存エディタに接続する

起動前に `window.vectorEditorOptions` を設定すると、標準エディタにも同じ差し替えが効きます。自分で起動する場合は同じオプションを `new App(options)` に渡せます。

```js
window.vectorEditorOptions = {
  operations: {distance: (a, b) => Math.hypot(a.x - b.x, a.y - b.y)},
  // 独自のイベントから図面座標を返す
  readPoint(canvas, event) {
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(canvas.getScreenCTM().inverse());
  },
};
```

- 演算1個は `operations`、ツール1個は `tools` の同名関数で交換します。
- 呼び出し役を一式換えるには `execute(name, input)` を渡します。入力の解釈と出力の型は元のツールに合わせます。新しいホストは直接関数を呼んで独自の型に変換できます。
- ブラウザでの入力変換は `readPoint`、スナップは `snap`、作図時の履歴保存は `save`、描画は `render(shape, target?, options?)`、曲線の文字列化は `encodePath`、既存輪郭への編集反映は `editOutline` が担当します。通常のエディタで `render` を置き換える場合には、編集対象の要素を返します。
- マウスやキーの操作手順を換えるには `controllers` に対象ツールのクラスを、画面側のツール管理を換えるには `createManager(canvas, host)` にマネージャーを作る関数を渡します。既存 UI の履歴・パネル・ファイル操作はブラウザ側にあります。
