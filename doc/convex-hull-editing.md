# 凸包の元入力保存・再編集

更新日: 2026-11-16（日本時間）。凸包 `convexHull` の作図時の全入力点を保存し、選択ツールから再計算します。

## 操作と計算方式

凸包ツールで点をクリックしてEnterで確定すると、外周頂点に使わなかった内部点、重複点、辺の途中の点を含めて入力順の点群を保存します。選択ツールで凸包を選び、ツールプロパティの「元の点群から再計算」から「点群を再編集」を押します。

座標欄で点を追加・削除でき、番号付きハンドルで各入力点を移動できます。内部点を外側へ動かせば新しい外周頂点になり、外周点を内側へ戻せば境界を再構成します。入力した点列をそのまま外周として結ぶ操作ではありません。ハンドル間の灰色の補助線は入力順を示し、青い破線のプレビューが計算した凸包です。

計算方式は既存の `default`（Andrew monotone chain）、`jarvis`（Jarvis march）、`exact`（Andrew + BigInt厳密符号）から選択できます。プロパティに現在の実装名・アルゴリズム・実装元・描画方式・入力点数・外周頂点数を表示し、最初の生成方式も保持します。再編集の方式選択は次の作図用の設定を変更しません。

プレビューは適用前の図形を保持し、「適用」の1回をUndoの1段階にします。Redo・SVG保存と読込に全入力点と使用方式を引き継ぎます。図形の外観・変形・レイヤー・親内順序・子要素・選択を保持します。数値欄とハンドルはローカル座標で対応し、親グループの回転・反転・せん断・縦横別拡縮・ズームを扱います。グリッド・Shift・直交モードは図面座標で作用します。

ドラッグ中のEsc・操作取消・取得喪失・フォーカス喪失ではその移動だけを戻します。ドラッグしていないときのEsc、取消、ツール・選択の変更は再編集全体を終了します。補助表示は保存しません。

## 入力と失敗時の扱い

入力は有限な座標の3〜1000点です。計算結果が外周頂点3点未満になる重複点だけの配置や一直線の配置は、多角形として適用しません。入力として有効な有限点のハンドルは残し、点を動かして修正できます。幾何計算関数自体が返す点や線分の凸包を、別のSVGタグへ自動変換する実装は未導入です。

元図形の座標・保存元データ・方式記録が途中で変わった場合、ロック・削除・選択変更、未登録実装、計算失敗、非対応の描画結果では上書きしません。非可逆変換ではハンドルとプレビューを除去します。多角形ツールで外周頂点を直接変更した場合は点群との関連を解除し、輪郭編集として記録します。外部からの `points`・`d` 属性変更は保存時の形状との照合で拒否します。過去の多角形SVGの外周だけから、失われた内部点を推定しません。

## 計算・描画と参照履歴

Andrew法は [polygons.js](../src/model/polygons.js)、Jarvis marchは [alternatives.js](../src/model/alternatives.js)、BigIntの符号計算は [exactPredicates.js](../src/model/exactPredicates.js)、選択登録は [implementationRegistry.js](../src/model/implementationRegistry.js) を使用します。既存の計算本体を再編集へ接続したもので、新しい凸包計算法は追加していません。

名前付きの計算法と資料・参照履歴は [Andrew法 R5](algorithms.md#r5)、[Jarvis march A2](implementation-options.md#a2)、[BigInt版の範囲](implementation-options.md) を継承します。今回の元入力保存と編集UIに追加の論文や外部コードを参照・移植していません。BigInt版はbinary64入力の行列式の符号を厳密に求める実装で、Shewchukの適応的展開算術や厳密な座標構成ではありません。既存の重複点判定・座標表現を含めた全手順の厳密幾何を新たに保証するものではありません。

標準描画は外周頂点をSVG `polygon` で閉じ、画素化はブラウザーが行います。曲線のサンプリング分割数は使用しないため、凸包の再編集欄には分割数入力を表示しません。登録した外部描画実装が閉じたSVG `path` を返す場合も再編集できます。グループ・円・線分・閉じていないパスはこの契約の対象外です。

## 保存形式と換装API

既存の `data-vector-pointset` version 1を拡張し、`method: convexHull`、`input: {points}`、`result: [外周頂点...]`、`geometry: {tag: polygon, points}` または `{tag: path, d}` を保存します。`points`・`d` は描画後の属性文字列と照合します。従来の直線当てはめ・円当てはめ・最小包含円の保存形式は維持します。

`data-vector-implementation.parameters` に `pointCount` と `hullVertexCount` を保存します。現在の計算・描画ID、アルゴリズム、実装元、委譲先、描画設定と、任意の `pointSetEdit.origin` を保持します。計算へ渡す点群はコピーし、外部実装が一時配列を並べ替えても元入力の順序を保存します。

計算は `registerImplementation('convexHull', {id, label, algorithm, run})` で換装します。入力は `{points}`、戻り値は外周順の有限な座標配列です。再編集は3〜1000点の結果を扱い、`null`・例外・範囲外・非有限の結果を適用しません。外部実装の出力について、全入力点の包含や凸性まで独立に証明する検査は行いません。描画は `registerRenderer` で登録し、`supports('convexHull')` とSVG `polygon` または閉じた `path` の出力を満たす必要があります。

保存・照合・形状変換は [pointSetSource.js](../src/adapters/pointSetSource.js)、描画と方式記録は [editorHost.js](../src/adapters/editorHost.js)、UIは [PointSetEditor.js](../src/ui/PointSetEditor.js)、点のドラッグは [SplineControlHandles.js](../src/ui/SplineControlHandles.js)、新規作図は [PointConstructionTool.js](../src/tools/PointConstructionTool.js) を使用します。

## 残る範囲

点・線分へ退化した凸包の保存表示、増分更新のデータ構造、各入力点と他図形の継続的な拘束、点群ファイルの入出力、3次元凸包、任意の外部SVGからの全入力復元は未導入です。[Delaunay三角分割の元入力保存・再編集](delaunay-editing.md)も実装済みです。[Voronoi図の元入力保存・再編集](voronoi-editing.md)も実装済みです。多角形三角分割への展開は未導入です。
