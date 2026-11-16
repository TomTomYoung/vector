# 計算・描画の方式と参照資料

**現行の方式選択・換装と追加ツールは[実装・アルゴリズムの選択と換装](implementation-options.md)を参照してください。** 同日の拡張で計算119機能・GUI31ツールになり、計算・描画の方式を選べるようになりました。下記の一覧は拡張前の117機能・22ツールの標準方式と参照履歴を示し、追加方式と9ツールの対応は上記文書に記載しています。

このツールは、幾何計算を JavaScript の独立した関数で行い、作図結果を SVG の要素・パスに変換して表示します。二次・三次ベジェは SVG の曲線命令、任意次数ベジェは de Casteljau 法で求めた点を結ぶ折れ線です。SVG を画面の画素にする処理はブラウザーが担当します。

確認対象は 2026-11-15 時点の [実装 b1ecd59](https://github.com/TomTomYoung/vector/tree/b1ecd59a4b15253d9c9eddd0ed53288f98dec4ae) です。[登録された117機能](../src/model/tools.js)と[GUIの22ツール](../src/core/App.js)を対象に、標準実装の計算・描画・資料を対応づけています。`operations`、`tools`、`render` などを差し替えた場合は、その差し替え先の方式に従います。

[GUIツール](#gui)・[計算機能](#calculations)・[描画と補助表示](#rendering)・[参照履歴](#provenance)・[文献一覧](#references)・[数式と入出力](文章.md)・[利用方法](../src/model/README.md)

## 資料の位置づけ

**実装時参照**は、実装時に方式の確認に用いたことが確認できる資料です。**文書化時照合**は、今回コードと照合して方式を説明するために追加した資料です。後者は、以前の実装者がその論文を読んだという記録ではありません。**仕様参照**は、SVGなど外部に渡す表現の仕様です。各資料の扱いは[参照履歴](#provenance)にまとめています。

方式名が一致しても、論文のコード・最適化・数値保証をすべて実装しているとは限りません。個別の論文を特定できない初等公式や処理の組み合わせは、そのまま記載します。

<a id="gui"></a>
## GUIの各ツールは何を計算し、どう描くか

ツール名は [Appの登録名](../src/core/App.js)です。計算は主に [drawing.js](../src/model/drawing.js)、[construction.js](../src/model/construction.js)、[linear.js](../src/model/linear.js)、図形からSVGへの変換は [svgGeometry.js](../src/adapters/svgGeometry.js)にあります。以下のSVG表現は [S1](#s1) の仕様に対応します。

| ツール・登録名 | 計算 | 描画・画面への反映 |
| --- | --- | --- |
| 選択 `select` | 単体IDの選択・反転。範囲選択は候補の軸平行境界箱が選択矩形に完全包含されるかを判定 | [SelectTool](../src/tools/SelectTool.js)が既存SVG要素を選択し、枠・ハンドルを補助表示 |
| 線分 `line` | 始終点。直交時は水平・垂直の大きい変位側へ拘束 | SVG `line` |
| 矩形 `rectangle` | 2点の成分ごとの最小値と差の絶対値 | SVG `rect` |
| 円 `circle` | 中心から入力点までのユークリッド距離、または明示半径で円を構成。[元モデル編集](circle-editing.md)に対応 | SVG `circle`（代替描画は折れ線・三次ベジェ） |
| 円弧 `arc` | 3点の外心を行列式で求め、中間点を通る符号付き回転角を選ぶ。[3点の保存・再編集](arc-editing.md)に対応 | SVG `path` の `M A`。三次ベジェへの変換は行わない |
| 多角形 `polygon` | 入力頂点を順に保持 | SVG `polygon`。境界を閉じる処理はSVGに渡す |
| パス `path` | 直線モードは線分列。曲線モードは制御点2個と終点の3個ずつを三次区間にする | SVG `path` の `M L` / `M C`。余った点は `L` |
| スプライン `spline` | 隣接する通過点から接線と三次ベジェ制御点を構成。Cardinal / Catmull–Rom系の倍率調整版 [R3](#r3) | SVG `path` の `C`。2点だけなら `L`。[既定係数の説明](#spline-convention) |
| 二次ベジェ `quadraticBezier` | 3制御点を検証・保持。通常の描画経路ではサンプリングしない | SVG `path` の `Q` |
| 三次ベジェ `cubicBezier` | 4制御点を検証・保持。通常の描画経路ではサンプリングしない | SVG `path` の `C` |
| 任意次数ベジェ `nthBezier` | 制御点を保持し、描画時に de Casteljau 法 [R1](#r1)でパラメータを等分して評価 | SVG `path` の `M L …`。GUI既定80区間・81点の近似。[詳細](#bezier-rendering) |
| 折れ線 `polyline` | 入力点列を保持 | SVG `polyline` |
| 頂点インデックス `vertices` | 共有座標配列から番号順に点を取り出し、指定された線分・折れ線・多角形・ベジェ関数へ渡す | 指定方式のSVG表現を再利用。独立した曲線アルゴリズムは持たない |
| 文字 `text` | 位置と文字列を保持し、空白だけの入力を除く | SVG `text`。字形の描画はブラウザー |
| 寸法 `dimension` | 線形は距離・中点・`atan2`。角度は2方向の偏角差を一周内に正規化 | [DimensionTool](../src/tools/DimensionTool.js)がSVGの線・矢印・文字を組み合わせ、角度寸法には `A` を使用 |
| オフセット `offset` | 円は半径、矩形は各辺の位置を変更。線分・折れ線は各辺の単位法線で点をずらす | 元と同種のSVG要素を新規作成。これは下記 `offsetMiter` とは別の簡易方式 |
| トリム `trim` | 指定位置の直前・直後にある線分交点を点列上で探し、その間の区間を除く | [輪郭編集](../src/utils/linearEditing.js)で残る点列をSVGの線・折れ線等に書き戻す |
| 延長 `extend` | 端点から前方の境界線分への交点を列挙し、最初の交点を選ぶ | 同じ輪郭編集経路で端点を書き戻す |
| フィレット `fillet` | 2直線の交点、半角の三角関数、指定半径から接点と中心を求める。[元入力の保存・再編集](fillet-editing.md)に対応 | 既存2線分の端点を変更し、SVG `A` の円弧を追加 |
| 面取り `chamfer` | 2直線の交点から各辺方向へ指定距離だけ進んだ2点を求める。[元入力の保存・再編集](chamfer-editing.md)に対応 | 既存2線分の端点を変更し、SVG `line` を追加 |
| 分割 `split` | 点を各辺へ射影して最近位置を選び、その位置で点列を前後に分ける | 同じ輪郭編集経路で2片を書き戻す |
| 結合 `join` | 点列の端点同士を許容距離で照合し、必要に応じ反転して連結 | [JoinTool](../src/tools/JoinTool.js)が結果の点列をSVGに反映 |

### ベジェの計算と描画を分けて読む

<a id="bezier-rendering"></a>
`quadraticBezier` / `cubicBezier` / `nthBezier` 自体が返すのは制御点を持つ図形データです。点の評価は [bezier.js](../src/model/bezier.js) の `deCasteljau`、点列化は `sampleBezierPoints`、SVG文字列化は [utils/bezier.js](../src/utils/bezier.js)が担当します。

`sampleBezierPoints` を直接呼ぶ場合の既定値は60区間ですが、`bezierNPath` と [NthBezierTool](../src/tools/NthBezierTool.js)の既定値は80区間です。等間隔なのはパラメータ `t` であり、曲線上の距離ではありません。GUIの任意次数ベジェは次数が2・3でも `sampleCount` を渡すため折れ線になります。一般の `pathData` も `sampleCount` が明示された場合は折れ線経路を選びます。

後述の `flattenBezier` は許容誤差に応じた適応分割です。GUIの任意次数ベジェが自動でこの関数を使っているわけではありません。

<a id="spline-convention"></a>
### スプラインの名称と係数

区間 `A=Pᵢ` から `B=Pᵢ₊₁` に対して、前後の通過点を使い、三次ベジェの制御点を次のように決めます。端では存在しない隣接点を端点自身で補います。

$$
C_1=P_i+\frac{\tau}{6}(P_{i+1}-P_{i-1}),\qquad
C_2=P_{i+1}-\frac{\tau}{6}(P_{i+2}-P_i).
$$

ここで `τ = tension`、既定値は `0.5` です。この実装の `tension` は接線の倍率なので、大きくすると接線が長くなります。標準的な一様 Catmull–Rom の接線 `(Pᵢ₊₁−Pᵢ₋₁)/2` に対応するのは `tension=1` です。既定値ではその半分の接線になります。したがって既定動作は「Cardinal / Catmull–Rom系の倍率調整版」と記述します。[R3](#r3)は関連する原論文であり、今回の照合で追加した資料です。GUIのこのツールと、下記の B-spline / NURBS 評価関数は別です。

<a id="calculations"></a>
## 計算機能の方式

ここでは上の22機能以外の95機能をまとめます。全117機能は[演算室](../geometry.html)から実行できますが、現在の演算室は結果をJSON表示する画面です。以下の関数に固有の描画はなく、返された座標・図形・メッシュ等を描く処理は呼び出し側が用意します。`renderGeometry` が受け取れるのは対応済みの `kind` に限られ、三角形配列や領域セル群などを自動描画するものではありません。

### 基本量・アフィン変換・射影変換

[measurements.js](../src/model/measurements.js)・[affine.js](../src/model/affine.js)・[projective.js](../src/model/projective.js)・[construction.js](../src/model/construction.js)

| 関数 | 計算方式・資料との関係 |
| --- | --- |
| `reflectPoint` | 直線への直交射影を介した鏡映 |
| `polylineLength` | 隣接点間のユークリッド距離の総和 |
| `signedArea` | 基準頂点からの符号付き三角形面積の和。靴紐公式と同値 |
| `translationMatrix`, `rotationMatrix`, `scaleMatrix`, `shearMatrix`, `reflectionMatrix` | 2次元アフィン変換の6係数を構成 |
| `applyToPoint`, `applyToVector`, `transformPoints` | 行列と座標の積。ベクトルには平行移動を適用しない |
| `composeAffine`, `invertAffine`, `affineFromTriangles` | 行列積・行列式による逆行列・3点対応による変換 |
| `barycentricCoordinates`, `fromBarycentric` | 三角形の基底を解く重心座標と、その線形結合 |
| `pointFromPolar`, `polarCoordinates` | 三角関数、長さ、`atan2` による極座標変換 |
| `projectPoint`, `composeProjective`, `invertProjective` | 同次座標の3×3行列、行列積、余因子による逆行列、射影後の除算 |
| `homographyFromQuads` | 4点目の重心座標から各四角形の射影フレームを作り、`H = B A⁻¹` で対応づける |

この群は初等幾何・線形代数の公式として実装しています。特定論文に依拠した履歴は未確認です。ホモグラフィーは、対応点を大量に集めて解く DLT / SVD や RANSAC を実装したものではありません。SVGのアフィン変換表現については [S1](#s1) が仕様参照です。

### 交差・円・楕円・三角形

[intersections.js](../src/model/intersections.js)・[conics.js](../src/model/conics.js)

| 関数 | 計算方式 |
| --- | --- |
| `segmentContact`, `segmentDistance` | 外積で線分のパラメータを解き、共線時は区間の重なりを求める。離れていれば端点から相手線分への射影距離の最小値 |
| `lineCircleIntersections`, `circleIntersections`, `commonCircleTangents` | 直線方向への射影と平方根、中心間距離を用いた交点、共通接線の単位法線 |
| `clipSegmentToBox` | x・yそれぞれのスラブ内に入るパラメータ区間と `[0,1]` の共通部分。パラメトリックな区間クリッピング |
| `circleFromDiameter`, `circumcircle`, `triangleIncircle`, `triangleOrthocenter` | 中点・距離、外心、辺長で重みづけした内心、外心を用いた垂心の公式 |
| `perpendicularBisector`, `angleBisectors` | 中点と直交ベクトル、単位方向ベクトルの和と差 |
| `arcPoint`, `arcLength`, `chordLength`, `sectorArea`, `circularSegmentArea`, `arcBounds` | 円の三角関数表示と面積公式。境界箱には円弧内の軸方向の極値も含める |
| `ellipsePoint`, `ellipseTangent`, `ellipseArea`, `ellipseBounds`, `lineEllipseIntersections` | 回転した楕円の媒介変数表示・微分・極値。直線との交点は楕円座標系で二次方程式に帰着 |
| `regularPolygon` | 中心から等角度ごとの円周点を列挙 |

個別の原論文を参照した履歴は未確認です。上の公式・手順と、[既存の数式説明](文章.md)を実装の根拠として参照できます。線分クリッピングをCohen–Sutherlandの領域コード方式と呼ぶことはしません。

### 多角形・領域・三角形分割

[polygons.js](../src/model/polygons.js)・[clipCell.js](../src/model/clipCell.js)・[regions.js](../src/model/regions.js)・[mesh.js](../src/model/mesh.js)・[regionBoundary.js](../src/model/regionBoundary.js)・[constrainedMesh.js](../src/model/constrainedMesh.js)

| 関数 | 計算方式・参照資料 |
| --- | --- |
| `pointBounds`, `boxIntersection`, `boxUnion` | 成分ごとの最小・最大、区間の共通部分・包含箱 |
| `polygonCentroid` | 符号付き三角形面積による重心の加重平均 |
| `classifyPointInPolygon` | 境界判定後、水平線を横切る辺の向きを加算する winding number。`evenOdd` / `nonzero` の意味は [S1](#s1) |
| `convexHull` | 辞書順ソートと上下の鎖を構築する Andrew の monotone chain [R5](#r5)。[元入力の保存・再編集](convex-hull-editing.md)に対応 |
| `polygonCrossings`, `isSimplePolygon`, `isConvexPolygon` | 辺の全組み合わせの交差、符号付き面積、連続する辺の向きを検査。交差列挙は走査線法ではない |
| `triangulatePolygon` | 内部に他頂点のない凸の耳を除く ear clipping（耳切り法）[R7](#r7)。共線頂点を除去する場合がある |
| `intersectConvexPolygons` | `clipCell` で各辺の内側半平面を順次適用する Sutherland–Hodgman型クリッピング [R6](#r6) |
| `polygonBoolean` | 単純多角形を耳切りで三角形に分け、凸セルの半平面クリッピングで積・差・和・対称差を構成 [R6](#r6), [R7](#r7) |
| `voronoiCells` | 各点について全ての他点との垂直二等分線の近い側を選び、指定箱を順次クリップ。半平面交差による Voronoi セル |
| `delaunayTriangles` | 凸包の扇形分割に残りの点を挿入し、外接円判定による Lawson型の edge flipping（辺反転）[R8](#r8)。[元入力の保存・再編集](delaunay-editing.md)に対応 |
| `regionBoundary` | 頂点を許容距離で統合、辺上の頂点で分割、逆向き共有辺を相殺、残る辺を角度順に接続して閉路・穴・包含関係を復元 |
| `constrainedDelaunay` | 初期Delaunay分割、制約辺を横切る三角形帯の除去と両側の耳切り再分割、制約辺を固定した辺反転、穴・外部の flood fill [R7](#r7), [R8](#r8), [R9](#r9) |

`triangulatePolygon` は耳の候補ごとに残りの点を走査する素朴な実装です。[R7](#r7)の最適化された実装の計算量を、そのまま本実装の保証とは扱いません。`polygonBoolean` の出力は凸セル群です。外周・穴の輪郭が必要なら `regionBoundary` を続けて使います。領域演算全体や境界復元について、特定の一論文をそのまま移植したものと確認できる記録はありません。

`delaunayTriangles` は巨大な仮想外包三角形を使わず、凸包から開始します。Bowyer–Watsonの空洞除去方式ではありません。`voronoiCells` は Fortune の走査線方式ではありません。

`constrainedDelaunay` の資料 [R9](#r9)は、制約辺で囲んだ穴・外部の扱いの参照です。Triangleライブラリを呼び出してはいません。交差する制約は交点を入力頂点として与える必要があり、Steiner点を追加する品質改善やRuppert型の細分化は行いません。

`orientation` / `insideCircle` は [predicates.js](../src/model/predicates.js) の通常の浮動小数点演算です。後者は大きさに応じた許容値を使いますが、[R10](#r10)の Shewchuk 適応精度・厳密符号判定は未実装です。数学的なDelaunay性や位相の保証と、有限精度の実装上の判定は区別してください。

### 折れ線の加工

[polyline.js](../src/model/polyline.js)

| 関数 | 計算方式・参照資料 |
| --- | --- |
| `cumulativeLengths` | 各辺の長さの累積和 |
| `pointAtLength`, `resamplePolyline`, `slicePolyline` | 累積長の二分探索と辺内の線形補間。再標本化は折れ線上の等距離 |
| `simplifyPolyline` | 両端を結ぶ線分から最も遠い点で区間を分ける Ramer–Douglas–Peucker系 [R4](#r4)。再帰の代わりにスタックを使う |
| `dashPolyline` | 距離パターンと位相に従って点列を切り出す。SVGの `stroke-dasharray` を設定する関数ではない |
| `offsetMiter` | 隣接辺の左単位法線の和からmiter交点を構成。長さ比が `miterLimit` を超えれば `null` |

`simplifyPolyline` の誤差は無限直線ではなく有限線分までの距離です。`offsetMiter` は形状の自己交差除去や一般多角形のバッファ演算を行いません。SVGのmiter接合 [S1](#s1)とは幾何の考え方が対応しますが、これは座標を返す別の計算です。GUIの `offset` とも区別します。

### ベジェの解析・交点

[curveAnalysis.js](../src/model/curveAnalysis.js)・[bezierIntersections.js](../src/model/bezierIntersections.js)

| 関数 | 計算方式・参照資料 |
| --- | --- |
| `splitBezier`, `subBezier` | de Casteljau の補間三角形から左右の制御点を取り出す。部分曲線は分割を組み合わせる [R1](#r1) |
| `bezierDerivative`, `bezierTangent`, `bezierCurvature` | 制御点の差分から導関数を作って評価し、単位接線・符号付き曲率を算出 |
| `elevateBezier` | 隣接制御点の次数に応じた加重平均による1段階の次数上昇 |
| `hermiteToBezier`, `bezierToHermite` | 三次Hermiteの端点微分とベジェ制御点の相互変換。接線係数は1/3・3 |
| `rationalBezierPoint` | `(wx, wy, w)` の同次座標で de Casteljau 法を行い、最後に `w` で除算 |
| `bezierBounds` | 0〜3次について各座標の導関数の根と両端を評価する境界箱 |
| `flattenBezier` | 制御点から弦の線分までの距離を調べ、必要なら `t=0.5` で適応分割 [R1](#r1) |
| `bezierLengthBounds` | 弦長を下限、制御多角形長を上限として、差が小さくなるまで適応分割 [R1](#r1) |
| `arcToCubics` | 円弧を90度以下に分け、接線方向へ `k = (4/3) tan(Δθ/4)` 倍の半径を伸ばして三次ベジェ近似 |
| `bezierIntersections` | 制御点の境界箱・射影による除外、de Casteljau再分割、Newton補正。直線の場合はBernstein形式の根探索 [R1](#r1) |

導関数・次数上昇・Hermite変換・有理化は、ベジェの標準的な多項式・同次座標の式を実装しています。個別論文の参照履歴は未確認です。`arcToCubics` は近似であり、通常の円弧描画はこの関数を通らずSVGの `A` を使います。

`flattenBezier` / `bezierLengthBounds` は既定 `maxDepth=12`、指定可能な上限18です。上限に達した際は `withinTolerance` を確認します。浮動小数点の丸めを外向きに保証する区間演算は行っていません。

`bezierIntersections` は、直線と曲線では導関数の根で区間を分けて二分法を使い、一般の曲線同士では細分化した候補を2変数のNewton法で補正します。端点、点への退化、共線、次数上昇後の制御点一致による重複の判定も組み合わせています。全体は独自の組み合わせであり、de Casteljauの資料だけで交点解法全体の根拠・保証が与えられるわけではありません。fat-lineを使う Bézier clipping を実装したものとも区別します。`complete=false` / `unresolved` を確認し、一般の非線形再パラメータ化の重複など、未確定区間を解なしと扱わないでください。

### B-spline・NURBS

[splines.js](../src/model/splines.js)

| 関数 | 計算方式・参照資料 |
| --- | --- |
| `clampedKnots` | 両端を固定する一様ノット列の構成 |
| `bSplinePoint` | 対象ノット区間の局所制御点を段階的に補間する de Boor 法 [R2](#r2) |
| `nurbsPoint` | 同次座標上で de Boor 法を適用して重みで除算 [R2](#r2) |
| `insertSplineKnot` | 曲線形状を保つ単一ノット挿入（Boehm系）。有理曲線は重みつきで補間 [R2](#r2) |
| `bSplineDerivative` | ノット間隔で割った制御点差分を作り、次数を1下げて de Boor 法で評価 |

一つの内部ノットを挿入する実装であり、任意のノット除去・次数変更まで備えるものではありません。資料は今回のコード照合で追加しています。

### 点群の当てはめ・最小包含円

[pointSets.js](../src/model/pointSets.js)

| 関数 | 計算方式・参照資料 |
| --- | --- |
| `meanPoint` | 最初の点を基準に差分を平均して戻す算術平均 |
| `principalAxes` | 2×2共分散行列の固有値・固有方向を解析式で求めるPCA（主成分分析）[R11](#r11) |
| `fitLine` | 平均点を通り、最大主成分の方向を持つ直線。直交距離に対する最小二乗（TLS）[R11](#r11) |
| `fitCircle` | 中心化した座標で代数的最小二乗を解く Kåsa型円当てはめ [R12](#r12) |
| `closestPair` | 全点対の距離を比較する総当たり。分割統治による最近点対法ではない |
| `minimumEnclosingCircle` | 入力順の逐次追加。円外の点が現れると1点・2点・3点を支点とする円を三重ループで更新 |

`fitLine` は縦方向だけの誤差を最小にする `y=ax+b` の通常回帰とは異なります。`fitCircle` が最小化するのは円の方程式の残差の二乗和であり、返す `rms` は計算後の幾何距離から別に測った値です。[R12](#r12)との式の照合によってKåsa型と分類しました。過去にその論文を参考に実装したという意味ではありません。

直線当てはめ・円当てはめ・最小包含円の元の点群の保存と、計算・描画実装を選んで再計算する操作は [point-set-editing.md](point-set-editing.md) を参照してください。

`minimumEnclosingCircle` は入力順をランダム化していないため、Welzlのランダム化再帰法や期待線形時間の実装とは記載しません。特定論文を参照した履歴は未確認です。

### 寸法拘束

[constraints.js](../src/model/constraints.js) の `solveConstraints` は、固定頂点を未知変数から除き、距離・水平・垂直・一致・直交の残差と解析的Jacobianを作ります。反復では次の減衰付き正規方程式を部分ピボット付きGauss消去で解きます。

$$
(J^{\mathsf T}J+\lambda D)\Delta=-J^{\mathsf T}r,\qquad
D_{ii}=\max(10^{-6},(J^{\mathsf T}J)_{ii}).
$$

これは Levenberg–Marquardt（LM）系の減衰付き最小二乗法 [R13](#r13)です。残差二乗和が減少した試行を採用して `λ` を1/3にし、不採用・線形方程式の失敗では10倍にします。階数と自由度の評価にも消去法を使います。

実装時に参照したのは Ceres の説明 [R14](#r14)です。Ceres自体は使用しておらず、その信頼領域の予測改善比や大規模疎行列ソルバーをそのまま実装しているわけではありません。局所的な数値解法なので、`converged=false` を拘束の矛盾・解の不存在の証明にしないでください。

<a id="rendering"></a>
## 描画・補助表示・出力の担当範囲

[BaseTool](../src/core/BaseTool.js) がホストの実行関数に計算を依頼し、[editorHost](../src/adapters/editorHost.js) の標準 `render` が [renderGeometry](../src/adapters/svgGeometry.js) に図形を渡します。スタイル・画面操作・履歴は別の処理です。

| 対象 | 実装と参照 |
| --- | --- |
| 図形の表現 | `line`, `rect`, `circle`, `polyline`, `polygon`, `text`, `path` を生成。パスの `L/Q/C/A` は [S1](#s1) |
| 塗り・線幅・破線・線端・接合 | [style.js](../src/utils/style.js)などがSVG属性・CSSを設定。画素への変換はブラウザー。[S1](#s1) |
| 画面座標と図面座標 | [coordinates.js](../src/utils/coordinates.js) がSVGの座標変換行列と逆行列を使用。[S1](#s1) |
| グリッド表示 | [GridManager](../src/ui/GridManager.js)が一定間隔の縦横SVG `line` を背面に生成。既定間隔20。操作場所は画面の「表示・補助」→「グリッド」 |
| グリッドスナップ・直交 | [geometry.js](../src/utils/geometry.js)などで格子間隔の倍数へ丸め、または大きい変位側の水平・垂直に拘束。表示のオン・オフとスナップは別の状態 |
| SVG保存 | [FileManager](../src/ui/FileManager.js)が図面のSVGをシリアライズして保存 |
| PNG出力 | SVGをBlob URLで画像に読み込み、白背景のCanvas 2Dへ `drawImage` し、`toBlob` で出力。[S2](#s2) |
| 演算室 | [GeometryWorkbench](../src/ui/GeometryWorkbench.js)と[Worker](../src/ui/geometryWorker.js)で計算結果をJSON表示。専用の図形描画は現状なし |

アプリ自身がBresenham法、DDA、midpoint circleなどで画素を打つ実装はありません。ブラウザー内部のラスタライズ、アンチエイリアス、GPU処理の具体的なアルゴリズムは、このリポジトリからは特定しません。SVG規格へのリンクは、ブラウザーの内部実装まで保証するものではありません。

<a id="provenance"></a>
## 参照した資料の履歴

| 区分 | 対象・資料 | 確認できる範囲 |
| --- | --- | --- |
| 実装時参照 | `bezierIntersections`：MTU de Casteljau分割 [R1](#r1) | [PR #49](https://github.com/TomTomYoung/vector/pull/49)で分割の方式確認に用い、既存docにもリンクを記載。交点解法全体の移植元ではない |
| 実装時参照 | `constrainedDelaunay`：Triangleの制約辺・穴の説明 [R9](#r9) | PR #49で方式確認に用い、既存docにも記載。Triangleのソース移植・ライブラリ利用ではない |
| 実装時参照 | `solveConstraints`：Ceres非線形最小二乗 [R14](#r14) | PR #49で減衰付き最小二乗の確認に用い、既存docにも記載。Ceresのソース移植・ライブラリ利用ではない |
| 既存記載あり | ベジェ解析：MTUの分割説明 [R1](#r1) | PR #49より前のdocにもリンクあり。当初の実装時に読んだ範囲・時点までは未確認 |
| 文書化時照合 | [R2](#r2)〜[R8](#r8)、[R11](#r11)〜[R13](#r13) | 2026-11-15に現行コードと照合して関連資料として追加。以前からの参照履歴は未確認 |
| 比較資料 | Shewchukの適応精度述語 [R10](#r10) | 現行実装との違いを説明する資料。方式は未採用 |
| 仕様参照 | SVG・Canvas [S1](#s1), [S2](#s2) | 現行の出力形式・APIに対応する公式仕様。実装当時の閲覧履歴は未確認 |

今後、方式を追加・変更するときは、対象関数、計算方式、描画への渡し方、資料名・URL、実際の参照時点、資料との差を同時に更新してください。コードを転用する場合は、説明の参考と区別して、出典・転用範囲・ライセンスも記録します。

<a id="references"></a>
## 文献・公式仕様

以下は説明資料・原論文へのリンクです。原論文へのリンクは採用履歴を意味しません。出版社のページは本文の購読が必要な場合があります。リンク先を確認した日：2026-11-15。

<a id="s1"></a>
**S1 — W3C, Scalable Vector Graphics (SVG) 2.** [Paths](https://www.w3.org/TR/SVG2/paths.html)、[Basic Shapes](https://www.w3.org/TR/SVG2/shapes.html)、[Painting](https://www.w3.org/TR/SVG2/painting.html)、[Coordinate Systems](https://www.w3.org/TR/SVG2/coords.html)、[Text](https://www.w3.org/TR/SVG2/text.html)。SVGの表現・座標・塗りと線の公式仕様。

<a id="s2"></a>
**S2 — WHATWG, HTML Standard: The canvas element.** [公式仕様](https://html.spec.whatwg.org/multipage/canvas.html)。PNG出力で使う画像描画・ビットマップ出力のAPI。

<a id="r1"></a>
**R1 — C.-K. Shene, Subdividing a Bézier Curve.** Michigan Technological University、[講義資料](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/Bezier/bezier-sub.html)。de Casteljauの補間三角形と曲線分割の説明。原論文ではなく大学の解説資料。

<a id="r2"></a>
**R2 — de Boor法とB-splineのノット挿入。** C.-K. Shene, [De Boor's Algorithm](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/de-Boor.html)、[B-spline/NURBS Curves: Knot Insertion](https://pages.mtu.edu/~shene/COURSES/cs3621/NOTES/spline/NURBS-knot-insert.html)。ノット挿入の原論文は Wolfgang Boehm, *Inserting new knots into B-spline curves*, Computer-Aided Design 12(4), 199–201, 1980 ([出版社](https://www.sciencedirect.com/science/article/abs/pii/0010448580901542))。

<a id="r3"></a>
**R3 — Edwin Catmull, Raphael Rom, A Class of Local Interpolating Splines.** Computer Aided Geometric Design, 317–326, 1974 ([出版社](https://www.sciencedirect.com/science/chapter/edited-volume/pii/B9780120790500500205))。GUIスプラインの関連原論文。現行の既定接線倍率については本文の式を参照。

<a id="r4"></a>
**R4 — David H. Douglas, Thomas K. Peucker, Algorithms for the Reduction of the Number of Points Required to Represent a Digitized Line or Its Caricature.** The Canadian Cartographer 10(2), 112–122, 1973 ([DOI](https://doi.org/10.3138/FM57-6770-U75U-7727)、[原論文PDF](https://www2.ipcku.kansai-u.ac.jp/~yasumuro/M_InfoMedia/paper/Douglas73.pdf))。折れ線簡略化の関連原論文。

<a id="r5"></a>
**R5 — A. M. Andrew, Another efficient algorithm for convex hulls in two dimensions.** Information Processing Letters 9(5), 216–219, 1979 ([出版社](https://www.sciencedirect.com/science/article/abs/pii/0020019079900723))。凸包のmonotone chainの原論文。

<a id="r6"></a>
**R6 — Ivan E. Sutherland, Gary W. Hodgman, Reentrant polygon clipping.** Communications of the ACM 17(1), 32–42, 1974 ([DOI](https://doi.org/10.1145/360767.360802))。境界半平面を順次適用するクリッピングの原論文。

<a id="r7"></a>
**R7 — David Eberly, Triangulation by Ear Clipping.** 2002、改訂2024 ([著者公開PDF](https://www.geometrictools.com/Documentation/TriangulationByEarClipping.pdf))。耳切り法の解説。耳の存在については G. H. Meisters, *Polygons Have Ears*, 1975 ([著者所属大学の公開ページ](https://digitalcommons.unl.edu/mathfacpub/54/))。

<a id="r8"></a>
**R8 — C. L. Lawson, Software for C¹ Surface Interpolation.** 1977、JPL Publication 77-30 ([NASA公開ページ](https://ntrs.nasa.gov/citations/19770025881)、[原文PDF](https://ntrs.nasa.gov/api/citations/19770025881/downloads/19770025881.pdf))。局所的な辺交換と三角形網の関連文献。本文の曲面補間まで本ツールが実装しているという意味ではない。

<a id="r9"></a>
**R9 — Jonathan Richard Shewchuk, Triangle: Engineering a 2D Quality Mesh Generator and Delaunay Triangulator.** 1996 ([制約辺・穴の説明](https://www.cs.cmu.edu/~quake/tripaper/triangle3.html)、[Delaunay/CDTの説明](https://www.cs.cmu.edu/~quake/triangle.delaunay.html))。制約付き分割の実装時参照資料。

<a id="r10"></a>
**R10 — Jonathan Richard Shewchuk, Adaptive Precision Floating-Point Arithmetic and Fast Robust Geometric Predicates.** Discrete & Computational Geometry 18, 305–363, 1997 ([著者公開ページ](https://www.cs.cmu.edu/~quake/robust.html))。数値述語の比較資料。適応精度方式は未採用。

<a id="r11"></a>
**R11 — Karl Pearson, On Lines and Planes of Closest Fit to Systems of Points in Space.** Philosophical Magazine 2, 559–572, 1901 ([原論文公開ページ](https://zenodo.org/records/1430636))。直交距離に基づく当てはめと主成分の関連原論文。

<a id="r12"></a>
**R12 — A. Al-Sharadqah, N. Chernov, Error analysis for circle fitting algorithms.** Electronic Journal of Statistics 3, 886–911, 2009 ([著者プレプリント](https://arxiv.org/abs/0907.0421)、[PDF](https://arxiv.org/pdf/0907.0421))。Kåsa型代数的当てはめの目的関数は第4節。そこで参照される I. Kåsa, *A curve fitting procedure and its error analysis*, IEEE Transactions on Instrumentation and Measurement 25(1), 8–14, 1976 が関連原論文。

<a id="r13"></a>
**R13 — Levenberg–Marquardt法の原論文。** Kenneth Levenberg, *A method for the solution of certain non-linear problems in least squares*, Quarterly of Applied Mathematics 2, 164–168, 1944 ([DOI](https://doi.org/10.1090/qam/10666))。Donald W. Marquardt, *An Algorithm for Least-Squares Estimation of Nonlinear Parameters*, Journal of the Society for Industrial and Applied Mathematics 11(2), 431–441, 1963 ([出版社](https://epubs.siam.org/doi/10.1137/0111030))。

<a id="r14"></a>
**R14 — Ceres Solver, Solving Non-linear Least Squares.** [公式ドキュメント](https://ceres-solver.readthedocs.io/latest/nnls_solving.html)、特にLevenberg–Marquardtの節。寸法拘束の実装時参照資料。
