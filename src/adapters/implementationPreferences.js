const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validName = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !['__proto__','prototype','constructor'].includes(value);
const fail = () => {throw new TypeError('方式設定の形式が不正です。');};

// Only data is persisted. No functions, non-finite values, prototypes or executable imports.
export function parseImplementationPreferences(value) {
  if (typeof value === 'string') {
    if (value.length > 256000) throw new RangeError('方式設定は256000文字までです。');
    value = JSON.parse(value);
  }
  let entries = 0;
  function check(item, depth = 0) {
    if (depth > 12 || ++entries > 20000) fail();
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return;
    if (typeof item === 'number') {if (!Number.isFinite(item)) fail();return;}
    if (Array.isArray(item)) {item.forEach(v => check(v,depth+1));return;}
    if (!record(item)) fail();
    const proto = Object.getPrototypeOf(item);
    if (proto && proto.constructor?.name !== 'Object') fail();
    for (const [key,v] of Object.entries(item)) {
      if (['__proto__','prototype','constructor'].includes(key)) fail();
      check(v,depth+1);
    }
  }
  check(value);
  if (!record(value) || value.version !== 1 || !record(value.calculation) || !record(value.rendering)) fail();
  for (const [name,id] of Object.entries(value.calculation)) if (!validName(name) || !validName(id)) fail();
  for (const [name,entry] of Object.entries(value.rendering)) {
    if (!validName(name) || !record(entry) || !validName(entry.id) || !record(entry.options)) fail();
  }
  const text = JSON.stringify({version:1,calculation:value.calculation,rendering:value.rendering});
  if (text.length > 256000) throw new RangeError('方式設定は256000文字までです。');
  return JSON.parse(text);
}

// Browser storage is injected so hosts, numerical tools and embedded editors stay independent.
export function createImplementationPreferences(host, {key, storage, preserve = {}}) {
  let initial;
  const state = {message:'方式設定は変更時にこのブラウザーへ自動保存します。',warning:false};
  const status = (message,warning=false) => Object.assign(state,{message,warning});
  try {initial=host.exportPreferences();}
  catch(error) {status('このホストの方式設定は保存・復元できません。'+error.message,true);}
  const describe = result => result.skipped.length ? '一部の方式設定を復元できません: '+result.skipped.map(s=>s.name+'/'+s.id+'（'+s.reason+'）').join('、') : '方式設定を復元しました。';
  function restore(value, startup) {
    value = parseImplementationPreferences(value);
    if (startup) for (const type of ['calculation','rendering']) for (const name of preserve[type] ?? []) delete value[type][name];
    const result = host.restorePreferences(value);
    status(describe(result),!!result.skipped.length);
    return result;
  }
  return {key,state,
    load(startup=false) {
      if (!initial) return null;
      try {
        const value = storage().getItem(key);
        if (value === null) {status('保存した方式設定はありません。変更時に自動保存します。');return null;}
        return restore(value,startup);
      } catch (error) {status('方式設定を読み込めません。現在の設定を使用します。'+error.message,true);return null;}
    },
    save() {
      try {storage().setItem(key,JSON.stringify(parseImplementationPreferences(host.exportPreferences())));status('方式設定をこのブラウザーに保存しました。');return true;}
      catch (error) {status('方式設定を保存できません。現在の画面では有効ですが、再読込後には復元されません。'+error.message,true);return false;}
    },
    reset() {
      let result;
      try {
        if (!initial) throw Error('初期設定を取得できません。');
        result = host.restorePreferences(initial);
      } catch (error) {status('初期設定へ戻せません。'+error.message,true);return null;}
      try {storage().removeItem(key);status('方式設定を起動時の初期値に戻し、保存設定を削除しました。');}
      catch (error) {status('画面は初期設定へ戻しましたが、保存設定を削除できません。再読込時に以前の設定が復元される場合があります。'+error.message,true);}
      return result;
    },
    exportText: () => JSON.stringify(parseImplementationPreferences(host.exportPreferences()),null,2),
    importText(text) {
      try {
        const result = restore(text,false),message=state.message;
        if (this.save()) status(message+(result.skipped.length ? ' 読み込めた項目と現在の設定を保存しました。' : ' このブラウザーに保存しました。'),!!result.skipped.length);
        else status(message+' '+state.message,true);
        return result;
      } catch (error) {status('方式設定を読み込めません。'+error.message,true);return null;}
    },
  };
}
