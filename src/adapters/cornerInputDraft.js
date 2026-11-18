import {exportConstructionParameters,parseConstructionInputPresets} from './constructionInputPresets.js';
import {prepareDraftReference,resolveDraftReference} from './draftReference.js';

const attribute='data-vector-corner-draft-id';

function requireEditableLine(controller,line){
  if(line?.namespaceURI!=='http://www.w3.org/2000/svg'||line.localName!=='line'||
    !controller.canvas.contains(line)||!controller.selectTool.canSelect(line)){
    throw Error('1本目には図面内の表示中でロックされていない線分が必要です。');
  }
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
  const {id,commit}=prepareDraftReference(controller.canvas,attribute,line);
  const entry={version:3,input:{...parameters,firstLine:id}};
  return {entry,commit};
}

export function restore(name,controller,entry){
  if(!controller.isActive||entry?.version!==3)throw Error('対応する角加工ツールを先に選択してください。');
  const {firstLine,...parameters}=parseConstructionInputPresets({version:1,entries:{[name]:entry}}).entries[name].input;
  const lines=firstLine===null?[]:[resolveDraftReference(controller.canvas,attribute,firstLine)];
  if(lines.length)requireEditableLine(controller,lines[0]);
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
