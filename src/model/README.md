# 演算とツールを使う

[各機能の計算方式・GUIの描画方式・論文と参照履歴](../../doc/algorithms.md)

[実装の登録・選択API、ツールプロパティ、新作図ツール、導入に構造変更が必要な方式](../../doc/implementation-options.md)

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

## 平面幾何を単独で使う

`affine.js`・`projective.js` は座標変換、`intersections.js`・`conics.js` は交差・円・楕円、`polygons.js`・`regions.js`・`mesh.js` は輪郭・領域・点群の分割を扱います。距離で折れ線を扱う入口は `polyline.js`、曲線の解析とノット編集は `curveAnalysis.js`・`splines.js`、点群の当てはめは `pointSets.js` です。どれも描画先やブラウザを必要としません。

全ての名前付き機能は `toolNames` から列挙でき、作図エディタの「演算室を開く」から JSON の例を個別に実行できます。領域演算は凸セル群、曲線長は上下限、三角形分割は目的に応じて座標または元の頂点番号を返します。[各機能の入出力・数式・退化条件](../../doc/文章.md#拡張88件)

## 領域復元・交点・制約を組み合わせる

全121機能に、次の4つを含みます。演算室の「領域復元・交点・拘束」から入力例を実行できます。B-spline・NURBSの作図データを返す追加2機能は上記の方式選択文書を参照してください。

- `regionBoundary.js` の `regionBoundary({cells,tolerance?})` は、内部が重ならない凸セル群から外周・穴・包含関係と面積を復元します。
- `bezierIntersections.js` の `bezierIntersections({first,second,...})` は、制御点列から交点と重複区間を返します。`complete: false` のときは `unresolved` に未確定のパラメータ区間が残ります。一般の非線形再パラメータ化による重なりは未確定になる場合があります。
- `constrainedMesh.js` の `constrainedDelaunay({points,edges?,holes?,clipExterior?})` は、制約辺を維持して穴・外部を除き、元頂点番号の三角形・辺・隣接関係を返します。制約の交点は入力頂点として指定します。
- `constraints.js` の `solveConstraints({points,fixed?,constraints?,...})` は、距離・水平・垂直・一致・直交を数値的に解きます。固定頂点を保ち、拘束ごとの残差と `converged` を返します。未収束を解の不存在とは解釈しません。

[入出力・数式・許容差・計算上限](../../doc/文章.md#612-領域交点三角形分割寸法拘束を組み合わせる)

## ノット削除

[splineKnotRemoval.js](splineKnotRemoval.js) の `removeSplineKnot({points,degree,knots?,weights?,t,tolerance?})` は、非周期B-spline・全区間の分母を検証できるNURBSから既存の内部ノットを1個削除します。結果は制御点・次数・ノット・任意の重みと `removal: {t,tolerance,errorBound,denominator?}`、削除不能では `null` です。許容差の既定値は1e-7。再挿入した制御点から偏差上限を推定し、許容差内の候補だけ返します。[計算・API・換装・参照資料・制約](../../doc/spline-knot-removal.md)を参照してください。

低水準のノット削除は、周期展開した非周期評価用配列に対応するため制御点3012個まで受け付けます。作図・再編集の元制御点は1000個までです。周期曲線への接続、単一削除の2回または3回の呼出しと最終偏差検証は [periodic-knot-removal.md](../../doc/periodic-knot-removal.md) に記載しています。

零・正負混在の重み、分母検証の固定上限、返す検証記録、極を含む場合の制約は [signed-knot-removal.md](../../doc/signed-knot-removal.md) を参照してください。

B-spline・NURBSの形状を保つ `elevateSplineDegree` は非周期・周期に対応します。区間ベジェ化とBernstein次数上げを用い、検証済みの編集入力を返します。[契約・限界・参照資料](../../doc/spline-degree-elevation.md)を参照してください。
