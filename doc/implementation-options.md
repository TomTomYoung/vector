# 実装・アルゴリズムの選択と換装

このツールは、計算を独立した JavaScript 関数で行い、描画前の変換を経て SVG に出力します。画素化はブラウザーが担当します。計算方式と描画方式を別々に登録・選択でき、ツールプロパティから現在の方式、実装ファイル、選択図形に保存された方式を確認できます。

2026-11-15 の拡張後は計算119機能、GUI31ツールです。既存117機能の数式と文献は[計算・描画の方式と参照資料](algorithms.md)、入出力は[最小演算と最小機能](文章.md)にあります。この文書では、追加実装、切り替えの入口、既存システムへの導入に構造変更が必要な方式を説明します。

## 画面から使う

[エディタ](../index.html)でツールを選び、ツールプロパティの「実装・アルゴリズム」を開きます。「計算の実装」「描画の実装」は、選択肢があるツールで表示されます。選択後の作図・編集から適用され、対応する作図中のプレビューも更新されます。既存図形を選択しただけでは再計算しません。

選択図形の欄には、現在の選択設定とは別に、その図形の生成・編集時の方式を表示します。保存SVGの `data-vector-implementation` 属性に計算・描画のID、名称、アルゴリズム、ソース、委譲先の記録、描画設定を残し、SVG読込・Undo/Redoでも保持します。旧SVGに記録がなければ記録なしと表示します。これは生成・輪郭編集の記録であり、後の移動・アフィン変換や任意の外部編集の全履歴ではありません。

ツールごとの方式の選択状態はエディタのインスタンス内に保持します。ページ再読込後の初期選択は `vectorEditorOptions` で指定できます。保存SVGの記録を読み込んでも、そのIDに対応する実行コードを自動的に導入・実行することはありません。

[演算室](../geometry.html)にも「計算の実装」を追加しています。119機能の入力JSON、実装名、アルゴリズム、ソースを確認し、選択方式を Worker で実行できます。

## 同じツールで切り替えられる計算

| 対象 | 実装ID | 計算方法と違い |
| --- | --- | --- |
| スプライン `spline` | `default` | 従来の Cardinal / Catmull–Rom 系接線倍率調整。既定 `tension=0.5`。GUIに倍率欄を追加 |
| 同上 | `uniform` | 一様 Catmull–Rom。従来関数を `tension=1` で実行 |
| 同上 | `centripetal` | 求心 Catmull–Rom。隣接点間距離の平方根でパラメータ間隔を決定、α=0.5 [A1](#a1) |
| 同上 | `chordal` | 弦長 Catmull–Rom。隣接点間距離で間隔を決定、α=1 [A1](#a1) |
| オフセット `offset` | `default` / `miter` | 従来の辺ごとの簡易移動 / 隣接辺の法線からmiter交点を構成。既定上限比10。円・矩形は従来計算 |
| 凸包 `convexHull` | `default` / `jarvis` / `exact` | Andrew monotone chain / Jarvis march [A2](#a2) / AndrewとBigInt厳密符号の組合せ |
| 線分の矩形切取 `clipSegmentToBox` | `default` / `cohen-sutherland` | 区間・slab判定 / Cohen–Sutherlandの領域コード判定 [A3](#a3)。演算室から実行 |
| Delaunay `delaunayTriangles` | `default` / `exact` | 点挿入とLawson辺反転 / 同じ構造で向き・外接円の符号をBigIntで厳密判定 |

実装は [alternatives.js](../src/model/alternatives.js)、登録は [implementationRegistry.js](../src/model/implementationRegistry.js)です。求心・弦長版は連続重複点を除き、両端に反射した仮想点を置きます。この端点処理は本実装の選択です。一様版の端点複製とは端の接線が異なります。接線倍率欄は `default` に適用し、他の3方式はそれぞれの定義を使います。

`miter` は、クリック位置と最初の非零長辺から符号を決めて既存の `offsetMiter` に渡します。上限を超える鋭い角ではmiterを制限します。自己交差を整理して複数の閉領域に分ける処理や、丸い継ぎ目を生成する処理は含みません。

[exactPredicates.js](../src/model/exactPredicates.js)は、入力された有限のbinary64値を2進有理数として読み、共通指数の整数に変換してBigIntで行列式の符号を計算します。浮動小数点の丸めで符号が消える例を扱えますが、Shewchukの適応的展開算術を移植したものではありません。入力前に失われた精度や交点の座標計算は復元しません。全手順の厳密幾何を保証するものでもありません。

## 同じツールで切り替えられる描画

| 実装ID | 主な対象 | SVGへ変換する方法 |
| --- | --- | --- |
| `default` | 全ツール | 二次ベジェは `Q`、三次・スプラインは `C`、円弧は `A`、円は `circle`。任意次数ベジェはde Casteljauの等分割点列 |
| `sampled` | ベジェ、パス、スプライン、頂点インデックス、円・円弧系 | ベジェはde Casteljau、円弧は媒介変数表示で等分割し `M/L` |
| `bernstein` | ベジェ、パス、スプライン、頂点インデックス | Bernstein基底の加重和を直接評価し `M/L`。64次まで |
| `adaptive` | 同上 | de Casteljauで再帰分割し、制御点の弦からの距離が許容差以内になった区間を `L` にする |
| `cubic` | 円、円弧、フィレット、円当てはめ、最小包含円 | 円弧を90度以下に分割し、制御点距離 `4/3 tan(Δθ/4)` で三次ベジェ近似、`C` にする |

実装は [renderStrategies.js](../src/adapters/renderStrategies.js)、最終的なSVG出力は [svgGeometry.js](../src/adapters/svgGeometry.js)です。適応分割と円弧変換は既存の [curveAnalysis.js](../src/model/curveAnalysis.js)を再利用します。de Casteljau、Bernstein、円弧近似の文献・照合履歴は[既存文献一覧](algorithms.md#references)にあります。パスの直線区間はそのまま保ち、曲線区間のみ変換します。

等分割はパラメータ方向の分割で、等距離の点列ではありません。分割数は2〜10000、既定80です。適応分割の許容差は図面座標単位で既定0.25、最大深さは0〜18で既定12です。上限に達して許容差を満たさない場合は図形の記録に警告を残します。画面上のピクセル誤差を保証する設定ではありません。

円を折れ線または三次ベジェへ変換するとSVG要素は `path` になります。通常の選択・アフィン変換はできますが、`circle` の半径を編集する既存の円専用一覧には入りません。円専用編集を維持したい場合は標準SVGを選びます。

## 新しく追加した作図ツール

入力構造の異なる方式は専用ツールとして追加しました。[PointConstructionTool](../src/tools/PointConstructionTool.js)を共用し、クリックで点を追加、Enterで確定、Backspaceで直前の点を削除、Escで取消できます。作図途中の点・プレビューはSVG保存から除きます。

| ツール・登録名 | 計算 | 描画 |
| --- | --- | --- |
| B-spline `bSplineCurve` | 制御点・次数・ノットを検証し、de Boorで評価 | 等分割パラメータとノット位置をサンプルしSVG折れ線 |
| NURBS `nurbsCurve` | 同次座標による重み付きde Boor評価 | 同上 |
| 凸包 `convexHull` | Andrew / Jarvis / 厳密符号版から選択 | 凸包のSVG多角形 |
| 多角形三角分割 `triangulatePolygon` | Ear clipping。入力順が多角形の辺順 | 三角形のSVGグループ |
| Delaunay三角分割 `delaunayTriangles` | 点挿入・Lawson辺反転。厳密符号版も選択可 | 三角形インデックスを入力点に戻してSVGグループ |
| Voronoi分割 `voronoiCells` | 各母点の領域を垂直二等分線の半平面で逐次切取 | 図面範囲で切り取ったセルのSVGグループ |
| 直線当てはめ `fitLine` | 重心・共分散の主方向（直交最小二乗） | 入力点の射影範囲を線分化 |
| 円当てはめ `fitCircle` | 代数的最小二乗の正規方程式 | SVG円。折れ線・三次ベジェにも切替可 |
| 最小包含円 `minimumEnclosingCircle` | 境界の1・2・3点を順次更新する増分構成 | 同上 |

後ろの7機能は既存計算をGUIから利用可能にしたものです。各方式の資料は[計算機能一覧](algorithms.md#calculations)を参照してください。三角分割やVoronoiの計算結果をそのまま `renderGeometry` に渡すのではなく、このコントローラーが図形データへ変換します。

新しい2機能は [splineCurves.js](../src/model/splineCurves.js)にあります。入力は `{points, degree, knots?}`、NURBSはさらに `weights?` です。次数は1〜12、制御点は次数より多く最大1000点、座標は有限数です。ノットを省略すると端を固定した一様ノット列、重みを省略すると全て1にします。GUIではカンマ区切りで指定できます。

戻り値は `{kind: 'splineCurve', points, degree, knots, weights?}`、無効入力は `null` です。描画範囲は `knots[degree]` から `knots[points.length]`。内部ノットの重複度は次数以下、NURBS重みは正の有限数に制限します。分割数はGUIで指定でき、既定80です。これは連続した単一区間の作図用契約です。既存の低水準 `bSplinePoint` / `nurbsPoint` の契約を狭める変更ではありません。[de Boorの解説](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/de-Boor.html)を実装時に照合し、既存評価関数を再利用しています。

## 計算実装を登録・換装する

`createToolset()` の戻り値は従来と同じ呼び出し可能な関数で、登録・選択APIを追加しています。

```js
import {createToolset} from './src/model/tools.js';
const run = createToolset({selection: {spline: 'centripetal'}});
run.list('spline');       // 選択できる実装の説明
run.describe('spline');   // 現在の実装
run.select('spline', 'chordal');
const path = run('spline', {points: [{x: 0, y: 0}, {x: 20, y: 10}, {x: 30, y: 0}]});
// この1回だけ別方式。通常の選択は変わらない
run('spline', {points: [{x: 0, y: 0}, {x: 20, y: 10}]}, {implementation: 'uniform'});

run.register('circle', {
  id: 'fixed', label: '固定半径', algorithm: '指定された半径を使う',
  source: 'https://example.com/my-circle.js',
  run: ({center, radius}) => ({kind: 'circle', center, radius}),
});
run.select('circle', 'fixed');
run('circle', {center: {x: 0, y: 0}, radius: 10});
```

登録時は対象ツールが存在し、IDが重複せず、`id`・`label`・`algorithm`・`run` が必要です。ソースは任意ですが、利用者が追える場所を指定してください。初期登録は `implementations: {circle: [entry]}`、ツールそのものの追加・既定実装の置換は従来の `tools: {name: fn}` で行えます。

各関数は `(input, operations, execute)` で呼ばれます。`vertices` などが第3引数の `execute` を使って委譲すると選択方式が伝わります。`run.trace()` は直近の実行とその委譲を返します。関数内部から直接importした別の関数には、このディスパッチャーによる方式選択は波及しません。補助演算の差し替えは従来どおり `operations` を使い、説明には差し替えられた演算名を表示します。任意関数の内部アルゴリズムを自動解析する機能ではありません。

`tools` で差し替えた関数の説明は `metadata: {name: {label, algorithm, source}}` で渡せます。未指定なら外部実装・情報未指定と表示し、従来の方式名を流用しません。既定119機能の説明は [toolMetadata.js](../src/model/toolMetadata.js)にあり、実装追加・変更時に合わせて更新します。

## エディタの初期設定と描画換装

起動前に指定します。既存の入力・保存・コントローラー差し替えAPIも引き続き使えます。

```js
window.vectorEditorOptions = {
  selection: {spline: 'centripetal', convexHull: 'exact'},
  rendering: {
    cubicBezier: {id: 'adaptive', options: {tolerance: 0.1, maxDepth: 14}},
    circle: 'cubic',
  },
};
```

起動後は `window.toolManager.host` に対して `implementations(name)`、`selectImplementation(name,id)`、`registerImplementation(name,entry)`、`renderers(name)`、`selectRenderer(name,id,options?)`、`registerRenderer(entry)` を呼べます。

```js
const host = window.toolManager.host;
host.registerRenderer({
  id: 'circle-diameter', label: '直径表示',
  algorithm: '円データを水平直径の線分へ変換',
  source: 'https://example.com/my-renderer.js',
  supports: name => name === 'fitCircle',
  prepare: shape => ({kind: 'segment',
    start: {x: shape.center.x - shape.radius, y: shape.center.y},
    end: {x: shape.center.x + shape.radius, y: shape.center.y}}),
});
host.selectRenderer('fitCircle', 'circle-diameter');
```

描画実装は `id`・`label`・`algorithm`・`supports(name)`・`prepare(shape,options)` を持ちます。`prepare` はSVGアダプターが扱える図形、または `{kind:'group',children:[...]}` を返します。初期登録は `renderers: [entry]`。SVG以外へ出力する場合は従来の `render` を置換できますが、既存コントローラーはSVG DOMを操作するため、Canvas/WebGLの描画先はコントローラーやホストとの調整も必要です。

同じSVG要素を更新する際にタグが変わる場合、`render` の戻り値が新しい要素です。呼び出し側はこの戻り値を保持する必要があります。`supports` には入力・出力契約を確認できたツールだけを指定します。計算実装の戻り値も既存ツールの契約と一致させるか、別のコントローラーを登録してください。

## 構造が異なり、追加の統合設計が必要な方式

以下は調査した候補です。この節の外部ライブラリ・アルゴリズムを導入済みとするものではありません。利用する場合はライセンス・配布方式もその実装に合わせて確認します。

| 方式・一次資料 | 現行システムとの違い・必要な変更 |
| --- | --- |
| [Clipper2](https://angusj.com/clipper2/Docs/Overview.htm)、Vatti系の多角形演算 | 整数座標へ変換して処理するため、スケール、丸め、上限を共有する契約が必要。複数輪郭と穴を持つ出力を単一SVG多角形へ戻せない場合があり、領域データ・塗り規則・編集UIを接続する必要がある。現在の `polygonBoolean` や単純miterの関数名だけを置換しても同じ契約にはならない |
| [CGAL Arrangement / DCEL](https://doc.cgal.org/latest/Arrangement_on_surface_2/) | 頂点・半辺・面の接続を保持する構造。現状の点列を都度計算する方式に導入するには、交点分割、曲線の単調部分、位相IDの更新、SVGと永続トポロジーの対応が必要 |
| [Straight skeleton](https://doc.cgal.org/latest/Straight_skeleton_2/index.html) | 波面の辺消滅・分裂イベントを処理し、骨格と内側オフセットを生成。各辺の法線移動だけでは扱えず、穴、イベント順、退化配置、複数輪郭の入出力を追加する必要がある |
| [Shewchukの適応的厳密述語](https://www.cs.cmu.edu/~quake/robust.html)と厳密構成 | 符号判定と座標の構成は別。現在の `orientation` は行列式の大きさを補間比にも利用するため、全てを符号だけ返す関数へ置き換えられない。符号専用APIと数値量のAPIを分離し、交点にも保証が必要なら座標表現を変更する |
| [Triangleの品質メッシュ・Ruppert / Chew系の細分化](https://www.cs.cmu.edu/~quake/triangle.q.html) | 最小角度等のためSteiner点を追加。現状のDelaunayが元の入力点番号を返す契約では、新頂点を表せない。生成点、境界分割、属性、停止条件を含むメッシュデータとUIが必要 |
| [Loop–BlinnのGPU曲線描画](https://www.microsoft.com/en-us/research/publication/resolution-independent-curve-rendering-using-programmable-graphics-hardware/) | 三角形・シェーダーで曲線を描く方式。SVG文字列生成の差し替えだけで完結せず、WebGL/WebGPU描画面、ヒット判定、座標変換、選択ハンドル、SVG書き出しの別経路が必要 |
| [SolveSpaceの拘束系](https://solvespace.com/tech.pl)・[ライブラリAPI](https://solvespace.com/library.pl) | 現在の `solveConstraints` は渡された問題を解く単発関数。継続的な寸法・幾何拘束には、エンティティとパラメーターの安定ID、拘束グラフ、操作時の再計算、履歴、矛盾説明のUI、保存形式を連携させる必要がある |
| 不連続ノット、負・零の重み、周期的な有理スプライン | 今回の単一連続曲線・正の重みの作図契約とは異なる。内部不連続ではSVGのサブパスを分離し、分母零付近を処理する必要がある。周期曲線には継ぎ目の制御点・ノットと編集状態の管理が必要。[de Boor](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/de-Boor.html)、[有理ノット挿入](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/NURBS-knot-insert.html)を基礎資料とする |

具体例として、[constrainedMesh.js](../src/model/constrainedMesh.js)や半平面切取は `f/(f-g)` のような比を使います。ここへ -1/0/1 だけを返す厳密符号関数を一律に渡すと交点が変わります。今回のBigInt方式は、符号だけを必要とする凸包と非拘束Delaunayに限定して組み込んでいます。

## 追加実装で参照・照合した資料

資料の意味は[参照履歴の区別](algorithms.md#provenance)に従います。既存機能に新しいGUIを付けたことと、その既存機能の実装時に文献が読まれたことは別です。

<a id="a1"></a>
**A1 — Cem Yuksel, Scott Schaefer, John Keyser, Parameterization and Applications of Catmull–Rom Curves, Computer-Aided Design, 2011.** [著者ページ・論文](https://www.cemyuksel.com/research/catmullrom_param/)。今回の求心・弦長版の実装時参照。αによるパラメータ間隔と三次ベジェ制御点を確認しました。論文の性質を、端点処理や全体の自己交差に対する無条件の保証として表示していません。

<a id="a2"></a>
**A2 — R. A. Jarvis, On the identification of the convex hull of a finite set of points in the plane, Information Processing Letters 2, 18–21, 1973.** [出版社](https://www.sciencedirect.com/science/article/abs/pii/0020019073900203)。今回の実装方式・書誌の照合。実装は向きの比較によるgift wrappingで、同一直線上の候補は遠い点を選びます。公開抄録で確認できる内容を用いており、非公開の本文や著者コードを移植したとの記録ではありません。

<a id="a3"></a>
**A3 — Dimitrios Matthes, Vasileios Drakopoulos, Line Clipping in 2D: Overview, Techniques and Algorithms, Journal of Imaging 8(10), 286, 2022.** [著者論文全文](https://pmc.ncbi.nlm.nih.gov/articles/PMC9605407/)。今回のCohen–Sutherland実装の方式照合。領域コードによる矩形切取を説明する資料です。Cohen–Sutherlandの原論文として扱っていません。

Bernstein直接評価、BigIntの2進整数化、登録API、SVGグループ化は本リポジトリの実装です。BigInt版の比較対象としてShewchukの一次資料を確認していますが、同アルゴリズムの実装とは表示していません。上の外部システム資料は統合条件の調査に用いたもので、外部コードを取り込んだことを示すものではありません。

## 検証

[implementations.test.mjs](../tests/implementations.test.mjs)で方式選択の独立性、委譲、Catmull–Romの補間、凸包の一致、矩形切取の境界、丸めで消える行列式の符号、Delaunayの空円条件、Bernsteinとde Casteljauの一致、適応分割の許容差と上限、NURBSの円弧と無効入力を検証します。[editor.html](../tests/editor.html)では実際のプロパティ操作、9ツールの作図、記録のSVG往復、円からパスへの切替、外部実装、Workerへの選択伝達を確認します。
