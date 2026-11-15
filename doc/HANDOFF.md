# vector 開発ハンドオフ

更新日: 2026-11-16（日本時間）。この文書は作業再開用です。実装と検証の基準は [master / 57f3602](https://github.com/TomTomYoung/vector/commit/57f3602cc363656cdf5cb3f93e8b42d61419ff4c) です。本ハンドオフの追加は文書変更のみで、アプリの動作を変更しません。

## 現在の到達点

リポジトリは [TomTomYoung/vector](https://github.com/TomTomYoung/vector)、開発・公開の基準ブランチは `master` です。[エディタ](https://tomtomyoung.github.io/vector/)と[演算室](https://tomtomyoung.github.io/vector/geometry.html)を GitHub Pages で公開しています。

計算は119機能、GUIは31ツールです。幾何計算をJavaScriptの独立関数に分離し、ホストを介して入力・演算・図形変換・SVG出力・保存を接続しています。SVGの画素化はブラウザーが担当します。

直近の依頼は、計算と描画のアルゴリズム・論文・実装元をdocから追えるようにすること、実装可能な代替方式を選択・換装できるようにすること、別ツールにする方が適したものは追加すること、ツールプロパティに使用方式を表示すること、現行システムと相性が悪い方式も統合条件とともに記録することでした。この範囲は下記PRで実装・統合・公開済みです。

[PR #49](https://github.com/TomTomYoung/vector/pull/49)で領域境界の復元、制約付き三角分割、ベジェ交点、寸法拘束の計算を追加しました。[PR #50](https://github.com/TomTomYoung/vector/pull/50)で各機能の計算・描画方式と文献・参照履歴を記録し、[PR #51](https://github.com/TomTomYoung/vector/pull/51)で方式選択・換装API、9作図ツール、使用方式の表示・保存を追加しました。

## 入口となる文書と画面

[implementation-options.md](implementation-options.md)は現行の方式一覧、画面操作、計算・描画の換装API、追加9ツール、制約、外部方式の統合条件です。まずこの文書を読むと現在の拡張範囲が分かります。

[algorithms.md](algorithms.md)は既存機能の計算と描画の対応、名前の付いたアルゴリズム、論文・一次資料、参照履歴です。この文書の117機能・22ツールの一覧はPR #51より前の標準実装を対象とし、追加方式と現在の119機能・31ツールへの差分は `implementation-options.md` にあります。[文章.md](文章.md)は数式と入出力、[model/README.md](../src/model/README.md)は計算関数の利用方法です。

GUIでは、ツールを選択するとツールプロパティに「実装・アルゴリズム」が表示されます。代替実装がある場合は「計算の実装」「描画の実装」を選択できます。選択図形に記録された方式は、次の作図に使う設定と分けて表示します。演算室でも計算方式を選択し、入力例を編集してWorkerで実行できます。

グリッド表示は、スタイル操作欄の「表示・補助」内の「グリッド」です。同じ場所に「グリッドスナップ」と「直交モード」があります。表示とスナップは別設定で、初期値はいずれもOFF、間隔は20図面単位です。実装は [GridManager.js](../src/ui/GridManager.js)、初期値は [App.js](../src/core/App.js)にあります。

## 実装済みの切替方式と追加ツール

計算の代替方式は、`spline` の一様・求心・弦長 Catmull–Rom、`offset` のmiter、`convexHull` のJarvis marchとBigInt厳密符号版Andrew、`clipSegmentToBox` のCohen–Sutherland、`delaunayTriangles` のBigInt厳密符号版です。各ツールの標準方式は引き続き選択できます。119機能すべてに方式の説明がありますが、すべてに複数の代替実装があるわけではありません。

描画の代替方式は、等分割de Casteljau・円の媒介変数表示、Bernstein直接評価、de Casteljau適応分割、円弧の三次ベジェ近似です。対応するツールだけに選択肢を出します。標準のSVG `Q` / `C` / `A` / `circle` 等も残しています。

追加GUIは `bSplineCurve`、`nurbsCurve`、`convexHull`、`triangulatePolygon`、`delaunayTriangles`、`voronoiCells`、`fitLine`、`fitCircle`、`minimumEnclosingCircle` の9種類です。クリックで点を追加し、Enterで確定、Backspaceで最後の点を削除、Escで取消します。B-spline・NURBSには次数、ノット列、描画分割数、NURBSには重みの入力があります。新しい計算エントリーは前2件で、後7件は既存計算をGUIへ接続しました。

## コードの所在と変更時の接続先

計算の入口は [tools.js](../src/model/tools.js)の `createToolset()` です。[implementationRegistry.js](../src/model/implementationRegistry.js)が登録・選択・実行・委譲履歴を扱い、[toolMetadata.js](../src/model/toolMetadata.js)が119機能の名称・アルゴリズム・実装元を持ちます。代替計算は [alternatives.js](../src/model/alternatives.js)、厳密な符号判定は [exactPredicates.js](../src/model/exactPredicates.js)、追加スプライン図形の検証とサンプリングは [splineCurves.js](../src/model/splineCurves.js)です。

描画方式の登録と図形変換は [renderStrategies.js](../src/adapters/renderStrategies.js)、SVG要素・パスへの出力は [svgGeometry.js](../src/adapters/svgGeometry.js)です。[editorHost.js](../src/adapters/editorHost.js)が計算と描画をつなぎ、使用方式を図形へ記録します。

GUI登録は [App.js](../src/core/App.js)、共通の作図・輪郭編集接続は [BaseTool.js](../src/core/BaseTool.js)、追加9ツールの共通コントローラーは [PointConstructionTool.js](../src/tools/PointConstructionTool.js)です。プロパティ表示と方式選択は [ToolPropertiesPanel.js](../src/ui/ToolPropertiesPanel.js)にあります。新しい通常スクリプトを使う場合は [index.html](../index.html)の読込順も更新します。

演算室の入力例は [geometryExamples.js](../src/ui/geometryExamples.js)、選択UIは [GeometryWorkbench.js](../src/ui/GeometryWorkbench.js)、実行と結果分類は [geometryWorker.js](../src/ui/geometryWorker.js)です。計算エントリーを追加した場合は入力例も追加し、登録数と全例の実行が一致するようにします。

保存と読込は [DrawingDocument.js](../src/core/DrawingDocument.js)、Undo/Redoは [HistoryManager.js](../src/ui/HistoryManager.js)です。`data-vector-implementation` のJSONに計算・描画の実装ID、説明、ソース、委譲先、描画設定、許容差未達の警告等を記録します。描画途中のプレビュー、グリッド、選択ハンドルは保存対象から除きます。履歴保存はイベント完了後のマイクロタスクでまとめる仕組みです。

## 維持する契約と既知の制約

`createToolset()` は従来どおり関数として呼べます。追加APIは `register`、`select`、`list`、`describe`、`selection`、`trace`。実装関数の引数は `(input, operations, execute)` です。第3引数の `execute` を使う委譲先には方式選択が伝わりますが、内部で直接importした関数へは波及しません。変更対象の戻り値と利用側の契約を確認します。

設定はエディタごとに独立し、初期設定には `window.vectorEditorOptions` を使います。`tools` や `render` を外部実装へ差し替えた場合、既定実装のアルゴリズム名を流用しません。関数内容を自動判定する機能はなく、計算の説明を指定する場合は `metadata` を渡します。

保存された方式情報は、図形の生成・輪郭編集時の記録です。入力点・全計算パラメーター・編集履歴を網羅する再計算モデルではありません。既存図形を選択して方式を変更しても、その図形を自動で再計算しません。方式選択状態のページ再読込後の自動復元もありません。SVGを読み込んで任意の実装コードを自動実行する仕組みにはしていません。

円を折れ線や三次ベジェで描くと、出力要素が `circle` から `path` になります。通常の選択・アフィン変換はできますが、円専用の半径編集一覧には入りません。タグ変更を伴う `render` 呼出しでは、返された新しい要素を保持する必要があります。外部描画実装は、対象コントローラーのSVG操作と整合する範囲を `supports` で指定します。

BigInt版は、binary64入力に対する向き・外接円の行列式の符号を厳密に計算します。Shewchukの適応的展開算術ではなく、交点座標の厳密構成でもありません。`orientation` の大きさを補間比 `f/(f-g)` に使う処理へ、-1/0/1の符号関数を一律に差し替えないでください。今回の接続先は凸包と非拘束Delaunayです。

B-spline・NURBSの追加作図は、次数1〜12、最大1000制御点、連続曲線、正の有限な重みに限定しています。内部ノットの重複度は次数以下です。既存の低水準評価関数とは契約が異なります。描画はサンプル点の折れ線であり、NURBSをそのままSVG曲線として保存するものではありません。

描画の等分割はパラメータ方向で、弧長の等分割ではありません。適応分割の許容差は図面単位です。上限に達して許容差を満たさなかった場合は警告を保持します。既存の交点探索の `complete`、拘束計算の `converged` も結果表示で区別し、計算打切りを成功扱いしない設計を維持します。

資料は「実装時参照」「文書化時照合」「仕様参照」を区別します。名前が同じという理由で論文の全手順・性能・保証を実装済みとしません。実装や選択肢を追加・変更した場合は、コード、表示メタデータ、入力例、方式文書の対応も更新します。

## 検証済みの範囲と再実行

基準コミット `57f3602` の[回帰テスト](https://github.com/TomTomYoung/vector/actions/runs/43725627940)は成功しています。Nodeの数値・モデル・編集テスト58件、実Chromeによるブラウザー操作19件が通過しました。PR時の[検証ログ](https://github.com/TomTomYoung/vector/actions/runs/43725528542)も参照できます。

ブラウザー検証には、31ボタンの起動、作図、座標・スナップ、輪郭編集、レイヤー、Undo/Redo、SVG保存・読込、PNG出力、外部ホスト差し替え、演算室Workerが含まれます。PR #51では、実装選択とその出力、許容差未達の表示、記録のSVG往復、9ツールの作図、未確定プレビューの除外、円からパスへの切替、外部描画実装、Workerへの方式伝達を追加確認しています。全アルゴリズムの全入力や全ブラウザーを網羅したものではありません。

ローカルの数値回帰は、リポジトリのルートで実行します。CIはNode 24を使います。npm installやビルドは不要です。

```sh
node --test tests/*.test.mjs
```

ブラウザー検証では、まず別ターミナルで静的サーバーを起動します。`file://` ではなくHTTPで開きます。

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

サーバーが動作している状態で次を実行します。実行ファイルが別名の場合は `CHROME_BIN`、対象URLを変える場合は `VECTOR_TEST_URL` で指定できます。

```sh
node tests/runBrowser.mjs
```

[tests/editor.html](../tests/editor.html)を通常のブラウザーで開いて結果を確認することもできます。現在の作業環境では以前Chromium起動時にソケット関連のEPERMが出たため、直近のブラウザー検証はGitHub Actions上で実施しました。これはアプリのテスト失敗とは区別します。ワークフローは [editor-tests.yml](../.github/workflows/editor-tests.yml)です。

基準コミットの[Pages公開処理](https://github.com/TomTomYoung/vector/actions/runs/43725627888)も成功しています。公開後、`index.html`、`geometry.html`、App、プロパティパネル、計算レジストリー、描画方式、新作図コントローラーのHTTP 200と、配信内容が基準コミットのファイルに一致することを確認済みです。

## 未導入の方式と次に着手できる項目

Clipper2 / Vatti系、CGAL Arrangement / DCEL、直線骨格、Shewchukの適応的厳密述語、厳密座標構成、Ruppert / Chew系の品質メッシュ、Loop–BlinnのGPU曲線描画、SolveSpace型の継続的拘束系、不連続・周期・負の重みを含む有理スプラインは、[統合条件をdocに記録](implementation-options.md)した段階です。これらの外部方式の導入は未実施です。今回のBigInt符号版や単発 `solveConstraints` と混同しないでください。

次回の実装候補は、元の制御点・計算パラメーターを保存して既存図形を別方式で再計算する機能、方式選択設定の保存・復元、パス化した円やスプラインを元のモデルから編集する機能です。いずれも未着手で、優先順はまだ指定されていません。入力・出力契約が大きく異なる外部方式については、現在のdocにある構造変更の条件を出発点にします。

直近依頼に対して、失敗したまま残っている回帰テストや公開処理はありません。作業を再開するときは、まず現在の `master` とこの文書の基準コミットとの差分を確認し、ここに記した未着手の候補を実装済みと扱わないようにしてください。
