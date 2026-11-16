import {geometryExamples} from './geometryExamples.js';
import {createToolset} from '../model/tools.js';
import {createWorkbenchSession,WORKBENCH_STORAGE_KEY,WORKBENCH_TEXT_LIMIT} from '../adapters/workbenchSession.js';
const catalog=createToolset();
const el=id=>document.getElementById(id);
const select=el('tool'),input=el('input'),output=el('output'),status=el('status');
const options=window.vectorWorkbenchOptions??{};
const session=createWorkbenchSession({examples:geometryExamples,catalog,storage:()=>window.localStorage,
  key:options.storageKey??WORKBENCH_STORAGE_KEY,enabled:options.storage!==false});
const groups=new Map();
for(const [name,{group,label}] of Object.entries(geometryExamples)){
  if(!groups.has(group)){
    const category=document.createElement('optgroup');category.label=group;select.append(category);groups.set(group,category);
  }
  groups.get(group).append(new Option(label+' · '+name,name));
}
let worker,revision=0,importToken=0;
function stop(){worker?.terminate();worker=undefined;el('stop').disabled=true;}
function clearResult(){stop();output.textContent='';status.textContent='';}
function showStorage(){
  el('session-status').textContent=session.state.message;
  el('session-status').dataset.warning=String(session.state.warning);
}
function notice(message,warning=true){Object.assign(session.state,{message,warning});showStorage();}
function remember(){session.setInput(input.value);revision++;}
function save(){session.save();showStorage();}
function showAlgorithm(){
  const info=catalog.list(session.activeTool).find(item=>item.id===session.entry().implementation);
  el('algorithm').textContent=info.algorithm+' / 実装: '+info.source;
}
function showCurrent(){
  clearResult();select.value=session.activeTool;const entry=session.entry();input.value=entry.inputText;
  const picker=el('implementation');picker.replaceChildren(...catalog.list(select.value).map(item=>new Option(item.label,item.id)));picker.value=entry.implementation;
  showAlgorithm();showStorage();
}
select.onchange=()=>{remember();session.selectTool(select.value);showCurrent();save();};
input.oninput=()=>{remember();clearResult();save();};
el('implementation').onchange=()=>{remember();session.setImplementation(el('implementation').value);clearResult();showAlgorithm();save();};
el('reset').onclick=()=>{revision++;session.resetInput();showCurrent();save();};
function finish(message,value=''){stop();output.textContent=value;status.textContent=message;}
function execute(){
  remember();save();clearResult();let data;
  try{if(input.value.length>200000)throw Error('入力は200000文字までです。');data=JSON.parse(input.value);}
  catch(error){finish('入力 JSON を読めません。 '+error.message);return;}
  try{
    const current=new Worker(new URL('./geometryWorker.js',import.meta.url),{type:'module'});worker=current;
    current.onmessage=({data})=>{
      if(worker!==current)return;
      if(data.error)finish('入力を確認してください。 '+data.error);
      else finish({complete:'完了',invalid:'入力条件を満たしません。',
        incomplete:'未確定の区間が残っています。許容差または計算上限を確認してください。',
        unconverged:'拘束を満たす解に収束しませんでした。残差を確認してください。',
      }[data.outcome]??'完了',data.json);
    };
    current.onerror=event=>{if(worker===current)finish('演算を実行できません。 '+event.message);};
    status.textContent='計算中…';el('stop').disabled=false;
    current.postMessage({name:session.activeTool,input:data,implementation:session.entry().implementation});
  }catch(error){finish('演算を開始できません。 '+error.message);}
}
el('run').onclick=execute;
el('stop').onclick=()=>finish('中止しました。');
el('session-save').onclick=()=>{remember();save();};
el('session-load').onclick=()=>{if(session.load()){revision++;showCurrent();}else showStorage();};
el('session-reset').onclick=()=>{revision++;session.reset();showCurrent();};
el('session-export').onclick=()=>{
  remember();
  try{
    const text=session.exportText(),url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='vector-workbench-session.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);
    notice('全演算の入力・計算方式をJSONに書き出しました。',false);
  }catch(error){notice('JSONを書き出せません。'+error.message);}
};
el('session-import').onclick=()=>el('session-file').click();
el('session-file').onchange=async()=>{
  const file=el('session-file').files[0];if(!file)return;
  const token=++importToken,started=revision;
  try{
    if(file.size>4*WORKBENCH_TEXT_LIMIT)throw Error('保存データのファイルが大きすぎます。');
    const text=await file.text();
    if(token!==importToken)return;
    if(started!==revision){notice('読込中に入力・方式が変更されたため、現在の作業を維持しました。必要ならファイルを選び直してください。');return;}
    if(session.importText(text)){revision++;showCurrent();}else showStorage();
  }catch(error){if(token===importToken)notice('JSONを読み込めません。'+error.message);}
  finally{if(token===importToken)el('session-file').value='';}
};
el('session-save').disabled=el('session-load').disabled=!session.enabled;
session.load();showCurrent();
