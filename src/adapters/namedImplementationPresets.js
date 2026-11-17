import {parseImplementationPreferences} from './implementationPreferences.js';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
const fail=()=>{throw TypeError('名前付き方式プリセットの形式が不正です。');};
function keys(value,expected){
  if(!object(value))fail();
  const proto=Object.getPrototypeOf(value);
  if((proto&&proto.constructor?.name!=='Object')||Object.keys(value).length!==expected.length||expected.some(k=>!Object.hasOwn(value,k)))fail();
}
function label(value){
  if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>100||/[\u0000-\u001f\u007f]/.test(value))
    throw RangeError('記録名は前後の空白・改行を除いた1〜100文字で指定してください。');
  return value;
}

// The existing single implementationPreset and named construction inputs stay independent.
export function parseNamedImplementationPresets(value){
  if(value===undefined)return undefined;
  if(typeof value==='string'){if(value.length>2000000)throw RangeError('名前付き方式プリセットは2000000文字までです。');value=JSON.parse(value);}
  keys(value,['version','entries']);if(value.version!==1||!Array.isArray(value.entries)||value.entries.length>256)fail();
  const ids=new Set(),names=new Set(),entries=[];
  for(const item of value.entries){
    keys(item,['id','name','preset']);if(!validId(item.id)||ids.has(item.id))fail();ids.add(item.id);label(item.name);
    if(names.has(item.name))throw Error('同名の記録があります。別の名前を指定してください。');names.add(item.name);
    entries.push({id:item.id,name:item.name,preset:parseImplementationPreferences(item.preset)});
  }
  const data={version:1,entries};if(JSON.stringify(data).length>2000000)throw RangeError('名前付き方式プリセットは2000000文字までです。');
  return data;
}

export function createNamedImplementationPresets(host,{createId=()=> 'methods-'+crypto.randomUUID()}={}){
  let data,chosen,nameDraft;
  const state={message:'全ツールの計算・描画方式を名前付きで複数記録できます。',warning:false};
  const status=(message,warning=false)=>Object.assign(state,{message,warning});
  const find=(next,id)=>{const item=next.entries.find(e=>e.id===id);if(!item)throw Error('選択した記録が見つかりません。');return item;};
  const mutate=(action,message)=>{
    try{
      const next=parseNamedImplementationPresets(data)??{version:1,entries:[]};action(next);
      const checked=parseNamedImplementationPresets(next);data=checked.entries.length?checked:undefined;status(message);return true;
    }catch(error){status('方式の記録を変更できません。'+error.message,true);return false;}
  };
  return {state,
    get canRecord(){return typeof host.exportPreferences==='function';},
    get canApply(){return typeof host.restorePreferences==='function';},
    snapshot:()=>parseNamedImplementationPresets(data),
    list(){return this.snapshot()?.entries??[];},
    selectedId(){return data?.entries.some(e=>e.id===chosen)?chosen:data?.entries[0]?.id;},
    entry(id=this.selectedId()){return this.list().find(e=>e.id===id);},
    nameDraft(){return nameDraft??this.entry()?.name??'';},
    setNameDraft(value){nameDraft=value;},
    choose(id){const item=this.entry(id);if(!item)return false;chosen=id;nameDraft=item.name;status(item.name+'を選択しました。適用ボタンで方式を切り替えられます。');return true;},
    open(value){const next=parseNamedImplementationPresets(value);data=next;chosen=undefined;nameDraft=undefined;status(next?'名前付き方式プリセットを読み込みました。適用操作で使用できます。':'名前付き方式プリセットはありません。');},
    add(name,preset){
      let id;const ok=mutate(next=>{id=createId();next.entries.push({id,name:typeof name==='string'?name.trim():name,preset});},'名前付き方式プリセットを追加しました。');
      if(ok){chosen=id;nameDraft=this.entry(id).name;}return ok;
    },
    record(name){
      try{return this.add(name,host.exportPreferences());}
      catch(error){status('方式を記録できません。'+error.message,true);return false;}
    },
    update(id){return mutate(next=>{find(next,id).preset=host.exportPreferences();},'選択記録を現在の全ツールの方式で更新しました。');},
    rename(id,name){
      const ok=mutate(next=>{find(next,id).name=typeof name==='string'?name.trim():name;},'方式の記録名を変更しました。');
      if(ok)nameDraft=this.entry(id).name;return ok;
    },
    duplicate(id,name){const item=this.entry(id);if(!item){status('複製する記録が見つかりません。',true);return false;}return this.add(name,item.preset);},
    remove(id){
      const ok=mutate(next=>{find(next,id);next.entries=next.entries.filter(e=>e.id!==id);},'方式の記録を削除しました。現在使用中の方式は維持します。');
      if(ok){if(chosen===id)chosen=undefined;nameDraft=undefined;}return ok;
    },
    apply(id=this.selectedId()){
      try{
        const item=this.entry(id);if(!item)throw Error('適用する記録が見つかりません。');
        const result=host.restorePreferences(item.preset),skipped=result.skipped.map(s=>s.name+'/'+s.id+'（'+s.reason+'）');
        status(item.name+'の方式を'+result.applied.length+'項目適用しました。'+(skipped.length?'適用できない項目: '+skipped.join('、')+'。':'')+'既存図形とブラウザーの保存設定は変更していません。',!!skipped.length);return result;
      }catch(error){status('方式を適用できません。'+error.message,true);return null;}
    },
  };
}
