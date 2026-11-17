import {movePreset,sortPresets} from './presetOrder.js';
import {parseConstructionInputPresets,validateConstructionInputData,supportsConstructionInput,constructionInputMode} from './constructionInputPresets.js';

const object = v => v!==null && typeof v==='object' && !Array.isArray(v);
const key = v => typeof v==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) && !['__proto__','constructor','prototype'].includes(v);
const fail = () => {throw TypeError('名前付き作図入力の形式が不正です。');};
const keys = (value, expected) => {if(!object(value)||Object.keys(value).length!==expected.length||expected.some(k=>!Object.hasOwn(value,k)))fail();};
function label(value) {
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>100||/[\u0000-\u001f\u007f]/.test(value))
    throw RangeError('記録名は前後の空白・改行を除いた1〜100文字で指定してください。');
  return value;
}

// This sibling field leaves the existing constructionInputs v1 schema intact.
export function parseNamedConstructionInputs(value) {
  if(value===undefined)return undefined;
  if(typeof value==='string'){if(value.length>2000000)throw RangeError('名前付き作図入力は2000000文字までです。');value=JSON.parse(value);}
  validateConstructionInputData(value);keys(value,['version','entries']);
  if(value.version!==1||!Array.isArray(value.entries)||value.entries.length>256)fail();
  const ids=new Set(),names=new Set();
  for(const item of value.entries){
    keys(item,['id','tool','name','entry']);if(!key(item.id)||!key(item.tool)||ids.has(item.id))fail();ids.add(item.id);
    label(item.name);const identity=item.tool+'\0'+item.name;
    if(names.has(identity))throw Error('同じツールに同名の記録があります。別の名前を指定してください。');names.add(identity);
    parseConstructionInputPresets({version:1,entries:{[item.tool]:item.entry}});
  }
  const text=JSON.stringify(value);if(text.length>2000000)throw RangeError('名前付き作図入力は2000000文字までです。');
  return JSON.parse(text);
}

export function createNamedConstructionInputs({createId=()=> 'preset-'+crypto.randomUUID()}={}) {
  let data;
  const chosen=new Map(),nameDrafts=new Map();
  const state={message:'複数の作図入力を名前付きで図面に記録できます。',warning:false};
  const status=(message,warning=false)=>Object.assign(state,{message,warning});
  const find=(next,tool,id)=>{const item=next.entries.find(e=>e.tool===tool&&e.id===id);if(!item)throw Error('選択した記録が見つかりません。');return item;};
  const exporter=(controller,draft)=>{
    const fn=draft?controller?.exportInputDraftPreset:controller?.exportInputPreset;
    if(typeof fn!=='function')throw Error('このツールは指定した入力の記録に対応していません。');return fn.call(controller);
  };
  const mutate=(action,message)=>{
    try{
      const next=parseNamedConstructionInputs(data)??{version:1,entries:[]};action(next);
      const checked=parseNamedConstructionInputs(next);data=checked.entries.length?checked:undefined;status(message);return true;
    }catch(error){status('記録を変更できません。'+error.message,true);return false;}
  };
  return {state,
    replaceRecords(value){const next=parseNamedConstructionInputs(value);data=next?.entries.length?next:undefined;},
    move(tool,id,direction){const selected=this.selectedId(tool),ok=mutate(next=>{movePreset(next.entries,id,direction,tool);},'記録の順序を変更しました。');if(ok){chosen.set(tool,selected);}return ok;},
    sort(tool){const selected=this.selectedId(tool),ok=mutate(next=>{sortPresets(next.entries,tool);},'記録を名前順に並べ替えました。');if(ok){chosen.set(tool,selected);}return ok;},
    snapshot:()=>parseNamedConstructionInputs(data),
    list(tool){return this.snapshot()?.entries.filter(e=>e.tool===tool)??[];},
    selectedId(tool){const items=data?.entries.filter(e=>e.tool===tool)??[];return items.some(e=>e.id===chosen.get(tool))?chosen.get(tool):items[0]?.id;},
    entry(tool,id=this.selectedId(tool)){return this.list(tool).find(e=>e.id===id);},
    nameDraft(tool){return nameDrafts.get(tool)??this.entry(tool)?.name??'';},
    setNameDraft(tool,value){nameDrafts.set(tool,value);},
    choose(tool,id){const item=this.entry(tool,id);if(!item)return false;chosen.set(tool,id);nameDrafts.set(tool,item.name);status(item.name+'を選択しました。復元操作で入力を適用できます。');return true;},
    open(value){const next=parseNamedConstructionInputs(value);data=next;chosen.clear();nameDrafts.clear();status(next?'名前付き作図入力を読み込みました。選択・復元して使用できます。':'名前付き作図入力の記録はありません。');},
    add(tool,name,entry){
      let id;
      const ok=mutate(next=>{id=createId();next.entries.push({id,tool,name:typeof name==='string'?name.trim():name,entry});},'名前付きの記録を追加しました。');
      if(ok){chosen.set(tool,id);nameDrafts.set(tool,this.entry(tool,id).name);}return ok;
    },
    record(tool,name,controller,{draft=false}={}){
      try{return this.add(tool,name,exporter(controller,draft));}
      catch(error){status('入力を記録できません。'+error.message,true);return false;}
    },
    update(tool,id,controller,{draft=false}={}){
      return mutate(next=>{find(next,tool,id).entry=exporter(controller,draft);},'選択した記録を現在の入力で更新しました。');
    },
    rename(tool,id,name){
      const ok=mutate(next=>{find(next,tool,id).name=typeof name==='string'?name.trim():name;},'選択した記録の名前を変更しました。');
      if(ok)nameDrafts.set(tool,this.entry(tool,id).name);return ok;
    },
    duplicate(tool,id,name){
      const item=this.entry(tool,id);if(!item){status('複製する記録が見つかりません。',true);return false;}return this.add(tool,name,item.entry);
    },
    remove(tool,id){
      const ok=mutate(next=>{find(next,tool,id);next.entries=next.entries.filter(e=>e.id!==id);},'選択した記録を削除しました。現在の下書きは維持します。');
      if(ok){if(chosen.get(tool)===id)chosen.delete(tool);nameDrafts.delete(tool);}return ok;
    },
    restore(tool,id,controller){
      try{
        const item=this.entry(tool,id);if(!item)throw Error('選択した記録が見つかりません。');
        if(!supportsConstructionInput(controller,item.entry))throw Error('このツール・入力版は復元に未対応です。記録は保持しています。');
        controller.restoreInputPreset(item.entry);
        const message=constructionInputMode(controller,item.entry)==='parameters'?'の数値設定を復元しました。入力点と対象選択は維持します。':'を下書きへ復元しました。'+(controller.inputPresetInstructions??'通常の確定操作で作図できます。');
        status(item.name+message+(controller.implementationError?' '+controller.implementationError:''),!!controller.implementationError);return true;
      }catch(error){status('入力を復元できません。'+error.message,true);return false;}
    },
  };
}
