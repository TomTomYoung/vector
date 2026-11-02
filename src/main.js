// main.js
// ベクターエディタのエントリーポイント

// ページ読み込み完了時の処理
document.addEventListener("DOMContentLoaded", function () {
  // アプリケーションの初期化
  const app = new App(window.vectorEditorOptions);
  app.init();
});
