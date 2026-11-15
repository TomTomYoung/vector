# 不連続・周期・有理スプライン

2026-11-16に、既存のB-spline・NURBS作図を拡張しました。内部ノットの不連続、零・負の重み、一様ノットの周期曲線を扱います。元の曲線データと描画の状態を保存します。[方式選択の全体像](implementation-options.md)、[開発ハンドオフ](HANDOFF.md)も参照してください。

## 画面での操作

[エディタ](../index.html)でB-splineまたはNURBSを選択し、クリックで制御点を追加してEnterで確定します。次数の既定値は3で、4点以上が必要です。次数は1〜12、入力制御点は最大1000点です。

「周期曲線」の「一様ノットで閉じる」をONにすると、先頭の次数個の制御点と重みを末尾に循環し、一様ノットを自動生成します。最初の点を末尾へ手作業で追加する必要はありません。このモードでは手入力のノット欄を隠し、OFFへ戻すと元の入力値を再表示します。次数2以上では通常の折れ線の閉鎖とは異なり、継ぎ目の接線も連続になる周期構成を用います。分母が零となる場合の滑らかさは保証しません。

周期指定がOFFなら、内部ノットを次数+1回重ねることで別の枝へ分離できます。例えば次数1、制御点4個に対するノット `0,0,0.5,0.5,1,1` は、最初の2点と次の2点を独立した線分にします。離れた枝を結ぶ線は追加しません。次数+1を超える重複、ノット数の不一致、非有限値、減少するノット列は拒否します。

NURBSの重みには零・負の値を入力できます。全て零の入力は拒否します。「分母の除外幅」は最大絶対重みで正規化した分母に対する値で、既定 `1e-8`、範囲 `1e-14`〜`0.1` です。「分母検査の最大深さ」は既定18、範囲0〜24です。

分母零付近や、深さ・処理上限によって判定が終わらない区間は描画から省略します。描画できる枝を確定した場合は、プロパティと保存記録に省略を明示します。全区間が描画対象外なら確定せず、入力点を残して設定の変更を待ちます。部分描画の初期の塗りはなしにし、開いた枝を塗りの境界で結ばないようにします。

## 計算と描画の手順

計算は [splineCurves.js](../src/model/splineCurves.js)、描画接続は [renderStrategies.js](../src/adapters/renderStrategies.js)です。低水準の既存 `bSplinePoint` / `nurbsPoint` の契約は変更していません。

制御点を `(w*x, w*y, w)` の同次座標にし、非零長の各ノット区間 `[a,b]` を極形式（blossom）のde Boor計算でベジェ制御点に変換します。次数 `p` の区間の `j` 番目の制御点は、極形式に `a` を `p-j` 個、`b` を `j` 個与えた値です。区間の左右を個別に評価するため、次数+1重複のノットでは片側極限を保持できます。[参照B1](#b1)、[B2](#b2)を実装時に照合しました。

有理曲線の分母 `W(t)` は、その区間の同次ベジェ制御点の重みをBernstein係数とする多項式です。係数が全て除外幅より大きい、または全て負の除外幅より小さい区間では、分母が零へ近づかないと判定して描画します。それ以外は同次座標のde Casteljau分割で左右へ分けます。端点の符号だけによる判定では、偶数重根や区間内の2個の根を見逃すため、この方法は使っていません。

判定できた区間内ではパラメータ方向に等分割して点を評価し、同じ連続した枝に属する区間を連結します。不連続ノットまたは省略区間を挟むとSVGの `M` から新しいサブパスを始めます。周期曲線の全区間を描画でき、枝が1本のときだけ `Z` で閉じます。

描画の分割数は全パラメータ幅に対する目安で、既定80、範囲2〜10000です。ノット区間・分母検査の分割点も追加するため、最終的な線分数はこの値を超える場合があります。弧長等分割や画面上の誤差保証ではありません。

## JavaScriptと演算室の入力例

[演算室](../geometry.html)の `bSplineCurve` / `nurbsCurve` に次のオブジェクトを入力できます。演算室が返すのは検証済みの曲線データです。分母検査と枝の描画はエディタの描画段階で行います。

不連続な2本の一次曲線:

```json
{"points":[{"x":0,"y":0},{"x":1,"y":2},{"x":10,"y":4},{"x":11,"y":6}],"degree":1,"knots":[0,0,0.5,0.5,1,1]}
```

一様周期B-spline:

```json
{"points":[{"x":100,"y":100},{"x":250,"y":100},{"x":250,"y":250},{"x":100,"y":250}],"degree":3,"periodic":true}
```

分母に重根を持つNURBS:

```json
{"points":[{"x":0,"y":0},{"x":1,"y":2},{"x":2,"y":0}],"degree":2,"weights":[1,-1,1]}
```

分離した枝・省略区間をJavaScriptから取得する場合:

```js
import {nurbsCurve, sampleSplineBranches} from './src/model/splineCurves.js';
const shape = nurbsCurve({
  points: [{x: 0, y: 0}, {x: 1, y: 2}, {x: 2, y: 0}],
  degree: 2, weights: [1, -1, 1],
});
const result = sampleSplineBranches(shape, {
  sampleCount: 80, poleTolerance: 1e-8, maxDepth: 18, maxNodes: 32768,
});
// result.branches: [{from, to, points}, ...]
// result.omitted: [{from, to, reason}, ...]
// result.complete: 省略区間がなければtrue
// result.closed: 全区間を描ける1本の周期曲線ならtrue
```

`sampleSplineBranches` と `splineBezierSpans` は、`bSplineCurve` / `nurbsCurve` が返す有効な `splineCurve` データを入力とします。`sampleSplineCurve(shape, count)` は旧来の単一配列用の入口として残していますが、複数の枝または省略区間がある場合は例外にし、間隙を消して1本の点列にはしません。

`maxNodes` は全曲線で共有する検査ノード数の上限で、既定32768、範囲1〜200000です。GUIには深さと除外幅を表示し、ノード上限はAPI・初期描画設定で変更できます。`host.selectRenderer('nurbsCurve','default',{poleTolerance:1e-8,maxDepth:20,maxNodes:65536})` の形式も使えます。

`omitted.reason` は `near-zero`（分母係数の範囲が除外幅内）、`unresolved`（深さ上限またはパラメータ分割の数値限界）、`budget`（ノード数上限）、`numeric`（有限座標に変換できない）です。`complete` は分母検査による省略の有無を表し、曲線近似の誤差保証ではありません。

## 保存とプロパティ表示

[editorHost.js](../src/adapters/editorHost.js)が `data-vector-spline` に `{version:1, model:...}` を保存します。`model` は制御点・次数・ノット・重みと、周期指定時の `periodic`・元の制御点数 `controlCount` を含みます。周期曲線では評価用に末尾へ追加した制御点と重みも保存します。

`data-vector-implementation` には従来の計算・描画方式に加え、`parameters` に次数・周期指定・元の点数、`sampling` に枝数・省略区間・設定値・処理ノード数を保存します。保存SVGを開いた場合も、選択図形の記録に省略の情報を表示できます。元のモデルを使った再編集UIや、任意の外部SVGから元モデルを復元する機能は今回の実装範囲に含みません。

## 残る制約

周期指定は制御点・重みの循環と自動一様ノットに限定します。APIで `periodic:true` と `knots` を同時指定した場合は拒否します。任意の非一様周期ノットの入力・継ぎ目編集は未実装です。

零重みの入力点は有限な座標であり、無限遠の同次制御点を独立に入力する契約はありません。分母零が分子と相殺できる可除特異点でも、相殺を証明してつなぐ処理はせず、その付近を省略します。無限遠を横断する射影的な曲線編集も未実装です。

計算はbinary64です。Bernstein係数範囲の判定は厳密な区間算術や代数的根分離ではありません。除外幅と処理上限は保守的な描画判断で、根の位置や個数を完全に保証するものではありません。極の近くでは座標が非常に大きくなることがあります。値が非有限になる区間は省略します。

## 実装時に参照した一次資料

<a id="b1"></a>
**B1 — Carlo H. Séquin, Blossoms and Splines, UC Berkeley CS284.** [講義資料](https://people.eecs.berkeley.edu/~sequin/CS284/TEXT/blossoms.htm)。極形式の対称性と、`a`・`b`の繰り返しで区間ベジェ制御点を得る関係を照合しました。

<a id="b2"></a>
**B2 — C.-K. Shene, De Boor's Algorithm, Michigan Technological University.** [講義資料](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/de-Boor.html)。局所制御点からのde Boor計算と、NURBSを同次座標へ上げて評価・射影する手順を参照しました。

**B3 — C.-K. Shene, B-spline Curves: Closed Curves.** [講義資料](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/B-spline/bspline-curve-closed.html)。一様ノットと制御点の循環による閉曲線構成を参照しました。今回のパラメータ領域は実装の `U[p]`〜`U[N]` と継ぎ目テストで確認しています。

**B4 — C.-K. Shene, Modifying Weights / Subdividing a Bézier Curve.** [重み](https://pages.mtu.edu/~shene/COURSES/cs3621/LAB/curve/weight.html)・[分割](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/Bezier/bezier-sub.html)。零・負の重みの意味とde Casteljau分割を参照しました。分母の除外幅、処理上限、省略記録、SVGサブパスへの接続は本リポジトリの設計です。

## 検証対象

[splineBranches.test.mjs](../tests/splineBranches.test.mjs)で次数1〜12の区間ベジェ化と既存de Boor評価の一致、不連続点の片側端点、周期の位置・接線、重みの尺度不変性、重根・近接する2根、零分母区間、深さ・処理上限、入力の非破壊性を検証します。[editor.html](../tests/editor.html)には、不連続曲線の保存とUndo/Redo、周期プロパティ操作、負の重みの省略表示とSVG往復の検証を追加しています。
