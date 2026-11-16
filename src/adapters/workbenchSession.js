export const WORKBENCH_STORAGE_KEY='vector.geometry-workbench.v1';
export const WORKBENCH_TEXT_LIMIT=2000000;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&(!Object.getPrototypeOf(value)||Object.getPrototypeOf(value).constructor?.name==='Object');
const name=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
const fail=()=>{throw Error('演算室の保存データの形式が不正です。');};
function serialize(value) {
  const text=JSON.stringify(value,null,2);
  if(text.length>WORKBENCH_TEXT_LIMIT)throw Error('演算室の保存データは2000000文字までです。');
  return text;
}

// Input remains text: incomplete JSON drafts are data and are never evaluated here.
export function parseWorkbenchSession(value) {
  if(typeof value==='string'){
    if(value.length>WORKBENCH_TEXT_LIMIT)throw Error('演算室の保存データは2000000文字までです。');
    value=JSON.parse(value);
  }
  if(!plain(value)||value.version!==1||!name(value.activeTool)||!plain(value.entries)||
      Object.keys(value).some(k=>!['version','activeTool','entries'].includes(k))||Object.keys(value.entries).length>256)fail();
  const entries={};
  for(const [tool,entry] of Object.entries(value.entries)){
    if(!name(tool)||!plain(entry)||!name(entry.implementation)||typeof entry.inputText!=='string'||entry.inputText.length>200000||
        Object.keys(entry).some(k=>!['implementation','inputText'].includes(k)))fail();
    entries[tool]={implementation:entry.implementation,inputText:entry.inputText};
  }
  const result={version:1,activeTool:value.activeTool,entries};serialize(result);return result;
}

export function createWorkbenchSession({examples,catalog,storage,key=WORKBENCH_STORAGE_KEY,enabled=true}) {
  const initial={version:1,activeTool:'segmentContact',entries:Object.fromEntries(Object.entries(examples).map(([tool,example])=>
    [tool,{implementation:catalog.describe(tool).id,inputText:JSON.stringify(example.input,null,2)}]))};
  if(!Object.hasOwn(initial.entries,initial.activeTool))initial.activeTool=Object.keys(initial.entries)[0];
  let current=parseWorkbenchSession(initial);
  const state={message:'入力・計算方式は演算ごとにこのブラウザーへ自動保存します。',warning:false};
  const status=(message,warning=false)=>Object.assign(state,{message,warning});
  const known=tool=>Object.hasOwn(initial.entries,tool);
  function prepare(value) {
    const source=parseWorkbenchSession(value),entries={...current.entries},applied=[],skipped=[];
    for(const [tool,entry] of Object.entries(source.entries)){
      if(!known(tool)){skipped.push(tool+'（未登録の演算）');continue;}
      if(!catalog.list(tool).some(item=>item.id===entry.implementation)){skipped.push(tool+'/'+entry.implementation+'（未登録の計算方式）');continue;}
      entries[tool]={...entry};applied.push(tool);
    }
    const activeTool=known(source.activeTool)?source.activeTool:current.activeTool;
    if(!known(source.activeTool))skipped.push(source.activeTool+'（選択中の演算が未登録）');
    const next={version:1,activeTool,entries};parseWorkbenchSession(next);
    return {next,applied,skipped};
  }
  function restore(value) {
    const {next,applied,skipped}=prepare(value);current=next;
    status(skipped.length?'一部を復元できません: '+skipped.join('、'):'演算室の入力・計算方式を復元しました。実行ボタンで再計算できます。',!!skipped.length);
    return {applied,skipped};
  }
  const session={key,enabled,state,
    get activeTool(){return current.activeTool;},
    entry(tool=current.activeTool){if(!known(tool))throw Error('未登録の演算です。');return {...current.entries[tool]};},
    selectTool(tool){if(!known(tool))throw Error('未登録の演算です。');current.activeTool=tool;},
    setInput(text){if(typeof text!=='string')throw Error('入力は文字列で指定してください。');current.entries[current.activeTool]={...current.entries[current.activeTool],inputText:text};},
    setImplementation(id){if(!catalog.list(current.activeTool).some(item=>item.id===id))throw Error('未登録の計算方式です。');current.entries[current.activeTool]={...current.entries[current.activeTool],implementation:id};},
    resetInput(){current.entries[current.activeTool]={...current.entries[current.activeTool],inputText:initial.entries[current.activeTool].inputText};},
    exportText(){return serialize(parseWorkbenchSession(current));},
    save(){
      if(!enabled){status('この画面ではブラウザーへの自動保存を無効にしています。JSON書出しは利用できます。');return false;}
      try{storage().setItem(key,this.exportText());status('入力・計算方式をこのブラウザーに保存しました。');return true;}
      catch(error){status('保存できません。現在の作業は継続できますが、再読込後には復元されません。'+error.message,true);return false;}
    },
    load(){
      if(!enabled){status('この画面ではブラウザー保存を無効にしています。');return null;}
      try{const value=storage().getItem(key);if(value===null){status('保存した入力・計算方式はありません。変更時に自動保存します。');return null;}return restore(value);}
      catch(error){status('保存内容を復元できません。現在の入力・方式を維持します。'+error.message,true);return null;}
    },
    importText(text){
      try{
        const result=restore(text),message=state.message,warning=state.warning;
        if(!enabled)status(message+' この画面ではブラウザーへの自動保存は無効です。',warning);
        else if(this.save())status(message+' このブラウザーに保存しました。',warning);
        else status(message+' '+state.message,true);
        return result;
      }catch(error){status('保存データを読み込めません。現在の入力・方式を維持します。'+error.message,true);return null;}
    },
    reset(){
      current=parseWorkbenchSession(initial);
      if(!enabled){status('全演算を入力例と初期の計算方式へ戻しました。');return;}
      try{storage().removeItem(key);status('全演算を入力例と初期の計算方式へ戻し、保存内容を削除しました。');}
      catch(error){status('画面は初期値に戻しましたが、保存内容を削除できません。再読込時に以前の内容が戻る場合があります。'+error.message,true);}
    },
  };
  return session;
}
