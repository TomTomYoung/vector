# 計算・描画方式の保存と復元

2026-11-16に、作図用の計算・描画実装の選択と描画設定の保存を追加しました。ツールプロパティで変更すると、このブラウザーに自動保存し、同じエディタを開き直したときに復元します。計算119機能・GUI31ツールは変わりません。

## 画面での操作

ツールプロパティの「実装・アルゴリズム」で「計算の実装」「描画の実装」や描画分割数・許容差・最大深さを変更します。B-spline・NURBSの作図欄にある描画分割数、NURBSの分母除外幅・検査深さも対象です。設定欄と次の作図が同じ復元値を使います。

同じ欄の「方式設定の保存・復元（全ツール）」に保存状態を表示します。「現在の方式設定を保存」は全ツールの現在値を保存し、「保存した方式設定を復元」はブラウザーに残っている値を読み込みます。「方式設定を初期値へ戻す」は、保存値を読む前の起動設定へ全ツールを戻して保存データを削除します。明示的な初期設定がなければ標準方式と既定の描画設定へ戻ります。

「方式設定JSONを書き出す」で `vector-implementation-settings.json` を取得できます。「方式設定JSONを読み込む」は互換性を確認して設定へ適用し、読み込めた値と現在の設定をブラウザーへ保存します。他のブラウザーへの移行や、複数の作図設定の保管に使えます。

ブラウザーの保存機能が無効、利用上限超過、または保存データが壊れている場合は理由を表示します。作図や画面内の方式変更は継続できます。保存に失敗した値は再読込後には復元されません。未登録のツール・実装、対応しない描画方式、範囲外の描画設定は項目ごとに通知して読み飛ばし、その項目の現在値を維持します。ファイル形式・版番号が不正な場合は設定全体を適用しません。

復元できなかった実装を自動導入する処理はありません。次の保存では現在有効な設定を書き込みます。未登録実装のIDを将来使いたい場合は、元のJSONを保管して対応実装の登録後に再読込してください。

## 保存範囲

保存するのは計算実装ID、描画実装ID、ツールごとの描画設定です。標準描画の分割数、許容差、最大深さ、NURBSの分母除外幅・検査ノード数上限に加え、登録した描画実装のJSONで表現できる追加設定も記録できます。

制御点、次数、ノット、重み、周期指定などの作図入力、未確定のプレビュー、色・レイヤー、図面本体は、この方式設定の保存対象には含めません。9つの点入力ツールの下書きは、別の[作図入力プリセット](construction-input-presets.md)へ明示的に記録できます。完成したB-spline・NURBSの入力モデルは従来どおりSVGに保存し、[曲線の再編集](spline-editing.md)から変更できます。個々の曲線を再編集するために一時選択した方式は、作図用の保存設定に混ぜません。

方式設定を復元しても既存図形を再計算しません。ブラウザー保存は、SVGの生成方式記録と別の設定です。[図面の方式プリセット](document-implementation-presets.md)を明示的に記録した場合は、そのスナップショットをSVG保存・読込とUndo/Redoで保持します。SVGを開いたことでブラウザーの方式設定を上書きすることはありません。図面を戻すUndoは、方式設定の変更を戻す操作ではありません。

保存先は `localStorage` です。同じオリジン・同じエディタの配置パスで共有し、別ブラウザー・別端末へ自動同期しません。`/vector/` と `/vector/index.html` は同じ保存先です。同じ保存先を使う複数タブでは最後に保存した全ツール設定が残ります。他のタブへ即座に反映する処理はなく、復元操作か再読込で読み直します。

## 初期設定と埋込先の指定

`window.vectorEditorOptions` の `selection`・`rendering` で明示したツールは、起動時には保存値より優先します。指定していないツールは保存値を使います。「保存した方式設定を復元」やJSON読込を明示的に操作した場合は保存値を適用できます。

```js
window.vectorEditorOptions = {
  selection: {spline: 'centripetal'},
  rendering: {cubicBezier: {id: 'adaptive', options: {tolerance: 0.1}}},
  preferences: {key: 'my-editor:drawing-settings'},
};
```

同じページに独立したエディタを埋め込む場合は、`preferences.key` を分けます。`preferences:false` で自動保存・復元と保存操作欄を無効にできます。省略時のキーは `vector:implementation-preferences:v1:` に、末尾の `index.html` を除いた配置パスを続けた値です。URLのクエリー・ハッシュは保存先を分けません。

`preferences.storage` には、`getItem`・`setItem`・`removeItem` を持つ保存先を返す関数を指定できます。アクセス時に例外を投げる保存先でも起動を止めず、画面に失敗を表示します。

## ホストAPIと保存形式

`createEditorHost()` 自体は保存先へアクセスしません。ブラウザーでの自動復元は `App`、GUI操作後の保存はプロパティパネルが接続します。直接 `host.selectImplementation()` / `host.selectRenderer()` を呼んだ場合は画面内の設定だけを変更し、必要な時に `toolManager.preferences.save()` を呼びます。この分離により、単独の計算利用と一時的な再編集を保存処理から独立させています。

```js
const settings = host.exportPreferences();
const result = host.restorePreferences(settings);
// result.applied: [{type, name, id}, ...]
// result.skipped: [{type, name, id, reason}, ...]
```

保存形式は次のデータです。実際の書出しでは、登録されている全ツールの現在値を含めます。

```json
{
  "version": 1,
  "calculation": {"spline": "centripetal"},
  "rendering": {
    "cubicBezier": {"id": "adaptive", "options": {"tolerance": 0.125, "maxDepth": 10}},
    "nurbsCurve": {"id": "default", "options": {"sampleCount": 120, "poleTolerance": 0.000001, "maxDepth": 20, "maxNodes": 65536}}
  }
}
```

部分的なJSONの復元では、指定されていないツールの現在値を維持します。指定した描画設定はそのツールの設定を置き換え、以前の設定にしかなかった値を持ち越しません。方式変更の通常APIである `selectRenderer` は従来どおり追加の設定値をマージします。

JSONの版は1、最大256000文字、入れ子は12階層までです。ツール名・実装IDは英数字・ハイフン・アンダースコアの1〜100文字に限定します。関数、非有限数、特殊なオブジェクト、プロトタイプ用のキーを設定へ保存しません。読込は選択と設定値の適用であり、幾何計算や外部コードを実行する処理ではありません。

外部 `execute` が選択一覧・登録一覧・選択操作のAPIを提供しない場合、その計算設定は復元対象にしません。`render` 関数自体の差し替えも描画レジストリーの設定とは別契約で、関数を保存・復元しません。外部描画関数を使うPointConstructionToolの入力欄は、その画面内の設定として引き続き使えます。

## 実装・検証・残る範囲

形式検証と保存先への接続は [implementationPreferences.js](../src/adapters/implementationPreferences.js)、レジストリーとの接続は [editorHost.js](../src/adapters/editorHost.js) と [renderStrategies.js](../src/adapters/renderStrategies.js)、起動時復元は [App.js](../src/core/App.js)です。操作欄は [ToolPropertiesPanel.js](../src/ui/ToolPropertiesPanel.js)、スプライン描画設定の接続は [PointConstructionTool.js](../src/tools/PointConstructionTool.js)です。

計算・描画アルゴリズムの追加や置換は今回行っていません。使用方式と参照資料は [implementation-options.md](implementation-options.md)、[algorithms.md](algorithms.md)、[spline-branches.md](spline-branches.md)で引き続き確認できます。

[implementationPreferences.test.mjs](../tests/implementationPreferences.test.mjs) は設定の往復、インスタンスの独立性、設定値の置換、未登録実装、不正データ、起動設定の優先、保存失敗、JSON読込、外部ホストを検証します。[editor.html](../tests/editor.html) に、GUI変更後の新しい画面への復元、実際の描画への反映、初期化、JSONファイル入出力、保存失敗、図形再編集との分離を追加しました。

[演算室の入力・計算方式・選択状態の保存と復元](workbench-session.md)は別の保存先で実装済みです。[図面ごとの方式プリセット](document-implementation-presets.md)も実装済みです。[4ツールの作図数値](drawing-parameter-presets.md)もSVGへ明示保存できます。[直線・ポリライン・ベジェ5ツールの下書き](linear-bezier-drafts.md)も実装済みです。対応18ツール以外の作図入力、自動クラウド同期、タブ間の即時同期は未実装です。

実装コミット `d9ef151` の[CI](https://github.com/TomTomYoung/vector/actions/runs/43770286494)で、数値・モデル・編集81件とブラウザー操作30件が全て成功しました。
