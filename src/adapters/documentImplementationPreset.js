import {parseImplementationPreferences} from './implementationPreferences.js';

// An optional, inert snapshot carried by a drawing. Loading never selects methods.
export function parseDocumentImplementationPreset(value) {
  return value === undefined ? undefined : parseImplementationPreferences(value);
}

export function createDocumentImplementationPreset(host) {
  let preset;
  const state = {message:'この図面には方式プリセットがありません。',warning:false};
  const status = (message,warning=false) => Object.assign(state,{message,warning});
  return {state,
    get canRecord() {return typeof host.exportPreferences === 'function';},
    get canApply() {return typeof host.restorePreferences === 'function';},
    snapshot() {return parseDocumentImplementationPreset(preset);},
    open(value) {
      const next = parseDocumentImplementationPreset(value);
      preset = next;
      status(next ? '図面の方式プリセットを読み込みました。適用すると次の作図に使用します。' : 'この図面には方式プリセットがありません。');
    },
    record() {
      try {
        const next = parseImplementationPreferences(host.exportPreferences());
        preset = next;
        status('現在の全ツールの方式を図面に記録しました。SVG保存で持ち出せます。');
        return true;
      } catch(error) {status('図面の方式を記録できません。'+error.message,true);return false;}
    },
    apply() {
      try {
        if (!preset) throw Error('この図面には方式プリセットがありません。');
        const result = host.restorePreferences(this.snapshot());
        const skipped = result.skipped.map(s=>s.name+'/'+s.id+'（'+s.reason+'）');
        status('図面の方式を'+result.applied.length+'項目適用しました。'+
          (skipped.length ? '適用できない項目: '+skipped.join('、')+'。' : '')+
          '既存図形とブラウザーの保存設定は変更していません。',!!skipped.length);
        return result;
      } catch(error) {status('図面の方式を適用できません。'+error.message,true);return null;}
    },
    clear() {
      preset = undefined;
      status('図面の方式プリセットを削除しました。現在使用中の方式は維持します。');
    },
  };
}
