import {movePreset,sortPresets} from './presetOrder.js';
import {parseNamedConstructionInputs} from './namedConstructionInputs.js';
import {parseImplementationPreferences} from './implementationPreferences.js';
import {parseConstructionInputPresets,supportsConstructionInput,constructionInputMode,saveConstructionInput} from './constructionInputPresets.js';

function keys(value,expected){
  if(!value||typeof value!=='object'||Array.isArray(value))throw TypeError('作図セットの形式が不正です。');
  const proto=Object.getPrototypeOf(value);
  if((proto&&proto.constructor?.name!=='Object')||Object.keys(value).length!==expected.length||expected.some(k=>!Object.hasOwn(value,k)))throw TypeError('作図セットの形式が不正です。');
}
export function parseConstructionSets(value){
  if(value===undefined)return undefined;
  if(typeof value==='string'){if(value.length>2000000)throw RangeError('作図セットは2000000文字までです。');value=JSON.parse(value);}
  keys(value,['version','entries']);if(value.version!==1||!Array.isArray(value.entries)||value.entries.length>256)throw TypeError('作図セットの版・件数が不正です。');
  for(const item of value.entries)keys(item,['id','tool','name','input','methods']);
  // Reuse the tool-specific input validators, name uniqueness, ID and collection limits.
  const inputs=parseNamedConstructionInputs({version:1,entries:value.entries.map(({id,tool,name,input})=>({id,tool,name,entry:input}))});
  const entries=inputs.entries.map(({entry,...item},i)=>({...item,input:entry,methods:parseImplementationPreferences(value.entries[i].methods)}));
  const data={version:1,entries};if(JSON.stringify(data).length>2000000)throw RangeError('作図セットは2000000文字までです。');return data;
}

export function createConstructionSets(host,{createId=()=> 'set-'+crypto.randomUUID()}={}){
  let data;const chosen=new Map(),names=new Map();
  const state={message:'作図入力と全ツールの計算・描画方式を組にして保存できます。',warning:false};
  const status=(message,warning=false)=>Object.assign(state,{message,warning});
  const find=(next,tool,id)=>{const item=next.entries.find(e=>e.tool===tool&&e.id===id);if(!item)throw Error('選択した作図セットが見つかりません。');return item;};
  const exportInput=(controller,draft)=>{
    const fn=draft?controller?.exportInputDraftPreset:controller?.exportInputPreset;
    if(typeof fn!=='function')throw Error('この入力の保存には対応していません。');return fn.call(controller);
  };
  const mutate=(action,message)=>{
    try{const next=parseConstructionSets(data)??{version:1,entries:[]};action(next);const checked=parseConstructionSets(next);data=checked.entries.length?checked:undefined;status(message);return true;}
    catch(error){status('作図セットを変更できません。'+error.message,true);return false;}
  };
  return {state,
    get canRecord(){return typeof host.exportPreferences==='function';},
    get canRestore(){return typeof host.restorePreferencesAtomically==='function';},
    replaceRecords(value){const next=parseConstructionSets(value);data=next?.entries.length?next:undefined;},
    move(tool,id,direction){const selected=this.selectedId(tool),ok=mutate(next=>{movePreset(next.entries,id,direction,tool);},'記録の順序を変更しました。');if(ok){chosen.set(tool,selected);}return ok;},
    sort(tool){const selected=this.selectedId(tool),ok=mutate(next=>{sortPresets(next.entries,tool);},'記録を名前順に並べ替えました。');if(ok){chosen.set(tool,selected);}return ok;},
    snapshot:()=>parseConstructionSets(data),
    list(tool){return this.snapshot()?.entries.filter(e=>e.tool===tool)??[];},
    selectedId(tool){const items=data?.entries.filter(e=>e.tool===tool)??[];return items.some(e=>e.id===chosen.get(tool))?chosen.get(tool):items[0]?.id;},
    entry(tool,id=this.selectedId(tool)){return this.list(tool).find(e=>e.id===id);},
    nameDraft(tool){return names.get(tool)??this.entry(tool)?.name??'';},
    setNameDraft(tool,value){names.set(tool,value);},
    choose(tool,id){const item=this.entry(tool,id);if(!item)return false;chosen.set(tool,id);names.set(tool,item.name);status(item.name+'を選択しました。復元ボタンで入力と方式を適用できます。');return true;},
    open(value){const next=parseConstructionSets(value);data=next;chosen.clear();names.clear();status(next?'作図セットを読み込みました。明示的に復元して使用できます。':'作図セットはありません。');},
    add(tool,name,input,methods){
      let id;const ok=mutate(next=>{id=createId();next.entries.push({id,tool,name:typeof name==='string'?name.trim():name,input,methods});},'作図セットを追加しました。');
      if(ok){chosen.set(tool,id);names.set(tool,this.entry(tool,id).name);}return ok;
    },
    record(tool,name,controller,{draft=false}={}){
      try{return saveConstructionInput(controller,draft,input=>this.add(tool,name,input,host.exportPreferences()));}
      catch(error){status('作図セットを保存できません。'+error.message,true);return false;}
    },
    update(tool,id,controller,{draft=false}={}){
      try{return saveConstructionInput(controller,draft,input=>mutate(next=>{const item=find(next,tool,id);item.input=input;item.methods=host.exportPreferences();},'選択セットを現在の入力と全ツールの方式で更新しました。'));}
      catch(error){status('作図セットを保存できません。'+error.message,true);return false;}
    },
    rename(tool,id,name){const ok=mutate(next=>{find(next,tool,id).name=typeof name==='string'?name.trim():name;},'作図セットの名前を変更しました。');if(ok)names.set(tool,this.entry(tool,id).name);return ok;},
    duplicate(tool,id,name){const item=this.entry(tool,id);if(!item){status('複製する作図セットが見つかりません。',true);return false;}return this.add(tool,name,item.input,item.methods);},
    remove(tool,id){const ok=mutate(next=>{find(next,tool,id);next.entries=next.entries.filter(e=>e.id!==id);},'作図セットを削除しました。現在の入力と方式は維持します。');if(ok){if(chosen.get(tool)===id)chosen.delete(tool);names.delete(tool);}return ok;},
    restore(tool,id,controller){
      let restoreBefore,inputStarted=false;
      try{
        const item=this.entry(tool,id);if(!item)throw Error('作図セットが見つかりません。');
        if(!this.canRestore)throw Error('このホストは入力と方式の一括復元に対応していません。');
        if(!supportsConstructionInput(controller,item.input))throw Error('このツール・入力版は復元に未対応です。記録は保持しています。');
        if(controller.isActive===false)throw Error('復元する作図ツールを先に選択してください。');
        // Capture the complete draft for dual-mode controllers, including spline points.
        if(controller.captureInputRollback)restoreBefore=controller.captureInputRollback();
        else {
          const before=parseConstructionInputPresets({version:1,entries:{[tool]:exportInput(controller,typeof controller.exportInputDraftPreset==='function')}}).entries[tool];
          restoreBefore=()=>controller.restoreInputPreset(before);
        }
        const result=host.restorePreferencesAtomically(item.methods,()=>{inputStarted=true;controller.restoreInputPreset(item.input);});
        if(result.skipped.length){status('作図セットは復元していません。利用できない方式: '+result.skipped.map(s=>s.name+'/'+s.id+'（'+s.reason+'）').join('、')+'。現在の入力と方式は維持しています。',true);return false;}
        const mode=constructionInputMode(controller,item.input);
        status(item.name+'の入力と方式を復元しました。'+(mode==='parameters'?'入力点と対象の選択は維持します。':controller.inputPresetInstructions??'通常の確定操作で作図できます。')+(controller.implementationError?' '+controller.implementationError:''),!!controller.implementationError);return true;
      }catch(error){
        let rollback='';if(inputStarted)try{restoreBefore();}catch(failure){rollback=' 入力の巻戻しにも失敗しました: '+failure.message;}
        status('作図セットを復元できません。'+error.message+rollback,true);return false;
      }
    },
  };
}
