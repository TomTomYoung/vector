export const selectionDefaults = Object.freeze({radius:6, shape:'rectangle', match:'contain'});

export function parseSelectionPreferences(value) {
  if (typeof value === 'string') value = JSON.parse(value);
  if (!value || value.version !== 1 || !Number.isFinite(value.radius) || value.radius < 0 || value.radius > 100 ||
      !['rectangle','circle','line','lasso'].includes(value.shape) || !['contain','touch'].includes(value.match)) {
    throw new TypeError('選択設定の形式が不正です。');
  }
  return {radius:value.radius, shape:value.shape, match:value.match};
}

// Operation preferences are deliberately separate from SVG documents and Undo.
export function createSelectionPreferences({key='vector:selection:v1', storage=()=>localStorage, enabled=true}={}) {
  let value = {...selectionDefaults};
  const state = {message:enabled?'選択設定はこのブラウザーに自動保存します。':'選択設定の保存は無効です。', warning:false};
  if (enabled) try {
    const saved = storage().getItem(key);
    if (saved !== null) value = parseSelectionPreferences(saved);
  } catch {Object.assign(state,{message:'保存した選択設定を読み込めません。初期値を使用します。',warning:true});}
  return {state, get value(){return {...value};},
    set(patch) {
      value = parseSelectionPreferences({...value,...patch,version:1});
      if (enabled) try {
        storage().setItem(key,JSON.stringify({version:1,...value}));
        Object.assign(state,{message:'選択設定をこのブラウザーに保存しました。',warning:false});
      } catch {Object.assign(state,{message:'選択設定を保存できません。この画面では有効です。',warning:true});}
      return this.value;
    },
  };
}
