import {exportConstructionParameters,parseConstructionInputPresets} from './constructionInputPresets.js';

const attribute='data-vector-corner-draft-id';

function requireEditableLine(controller,line){
  if(line?.namespaceURI!=='http://www.w3.org/2000/svg'||line.localName!=='line'||
    !controller.canvas.contains(line)||!controller.selectTool.canSelect(line)){
    throw Error('1本目には図面内の表示中でロックされていない線分が必要です。');
  }
}

function matches(canvas,id){
  return Array.from(canvas.querySelectorAll('['+attribute+']')).filter(el=>el.getAttribute(attribute)===id);
}

function setSelection(name,controller,lines){
  for(const old of controller.selectedLines)old.removeAttribute('data-vector-highlight');
  controller.selectedLines=lines;
  for(const line of lines)line.setAttribute('data-vector-highlight',name);
}

export function prepare(name,controller){
  if(!controller.isActive)throw Error('記録する角加工ツールを先に選択してください。');
  const parameters=exportConstructionParameters(name,controller).input;
  if(controller.selectedLines.length>1)throw Error('1本目の線分を選んだ段階で記録してください。');
  const line=controller.selectedLines[0];
  if(!line)return {entry:{version:3,input:{...parameters,firstLine:null}}};
  requireEditableLine(controller,line);
  const existing=line.getAttribute(attribute),id=existing??crypto.randomUUID();
  const found=matches(controller.canvas,id);
  if(existing ? found.length!==1 || found[0]!==line : found.length!==0)throw Error('1本目の線分の参照IDが重複しています。');
  const entry={version:3,input:{...parameters,firstLine:id}};
  return {entry,commit:existing?undefined:()=>line.setAttribute(attribute,id)};
}

export function restore(name,controller,entry){
  if(!controller.isActive||entry?.version!==3)throw Error('対応する角加工ツールを先に選択してください。');
  const {firstLine,...parameters}=parseConstructionInputPresets({version:1,entries:{[name]:entry}}).entries[name].input;
  const lines=firstLine===null?[]:matches(controller.canvas,firstLine);
  if(firstLine!==null){
    if(lines.length!==1)throw Error('記録した1本目の線分が図面内に見つからないか、参照IDが重複しています。');
    requireEditableLine(controller,lines[0]);
  }
  Object.assign(controller,parameters);
  setSelection(name,controller,lines);
  controller.implementationError='';
}

// A failed set restore must also recover a live selection that never had a saved ID.
export function captureRollback(name,controller){
  const parameters=exportConstructionParameters(name,controller).input;
  const lines=controller.selectedLines.slice(),error=controller.implementationError;
  return ()=>{
    Object.assign(controller,parameters);
    setSelection(name,controller,lines);
    controller.implementationError=error;
  };
}
