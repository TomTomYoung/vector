import {parseDocumentImplementationPreset} from './documentImplementationPreset.js';
import {parseConstructionInputPresets} from './constructionInputPresets.js';
import {parseNamedConstructionInputs} from './namedConstructionInputs.js';
import {parseNamedImplementationPresets} from './namedImplementationPresets.js';
import {parseConstructionSets} from './constructionSets.js';

const parsers={inputs:parseNamedConstructionInputs,methods:parseNamedImplementationPresets,sets:parseConstructionSets};
const trimName=(name,length=100)=>{let s=name.slice(0,length);if(/[\uD800-\uDBFF]$/.test(s))s=s.slice(0,-1);return s;};

export function presetImportRecords(state){
  if(!state||typeof state!=='object'||Array.isArray(state))throw TypeError('記録情報の形式が不正です。');
  const legacyMethods=parseDocumentImplementationPreset(state.implementationPreset),legacyInputs=parseConstructionInputPresets(state.constructionInputs);
  const inputs=parseNamedConstructionInputs(state.namedConstructionInputs),methods=parseNamedImplementationPresets(state.namedImplementationPresets),sets=parseConstructionSets(state.constructionSets),rows=[];
  const add=(kind,name,tool,payload,origin)=>rows.push({key:'record-'+rows.length,kind,name,tool,payload,origin});
  if(legacyMethods)add('methods','図面の方式',null,{preset:legacyMethods},'従来の方式記録');
  for(const [tool,entry] of Object.entries(legacyInputs?.entries??{}))add('inputs',trimName('入力 '+tool),tool,{entry},'従来の入力記録');
  for(const item of methods?.entries??[])add('methods',item.name,null,{preset:item.preset},'名前付き方式');
  for(const item of inputs?.entries??[])add('inputs',item.name,item.tool,{entry:item.entry},'名前付き入力');
  for(const item of sets?.entries??[])add('sets',item.name,item.tool,{input:item.input,methods:item.methods},'作図セット');
  return rows;
}

// Parse a detached XML document; never insert or render source SVG nodes.
export function readPresetSVG(text){
  if(typeof text!=='string'||text.length>16000000)throw RangeError('取込元SVGは16000000文字までです。');
  const doc=new DOMParser().parseFromString(text,'image/svg+xml'),root=doc.documentElement;
  if(doc.doctype||root.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg'||doc.querySelector('parsererror'))throw Error('有効なSVGを指定してください。');
  const metas=Array.from(root.children).filter(el=>el.namespaceURI===root.namespaceURI&&el.localName==='metadata'&&el.hasAttribute('data-vector-document'));
  if(metas.length>1||metas.some(el=>el.getAttribute('data-vector-document')!=='1'))throw Error('図面メタデータの形式が不正です。');
  if(!metas.length)return [];
  if(metas[0].textContent.length>10000000)throw RangeError('記録情報が大きすぎます。');
  return presetImportRecords(JSON.parse(metas[0].textContent));
}

export function planPresetImport(records,selection,current,{createId=()=> 'import-'+crypto.randomUUID()}={}){
  if(!Array.isArray(selection)||!selection.length)throw Error('取り込む記録を選択してください。');
  const next=Object.fromEntries(Object.entries(parsers).map(([kind,parse])=>[kind,parse(current[kind])??{version:1,entries:[]}])),chosen=new Set(),added=[];
  for(const choice of selection){
    if(!choice||chosen.has(choice.key))throw Error('選択した記録が重複しています。');chosen.add(choice.key);
    const row=records.find(r=>r.key===choice.key);if(!row||!Object.hasOwn(parsers,row.kind))throw Error('選択した記録が見つかりません。');
    const collection=next[row.kind];let id;
    for(let i=0;i<32;i++){const value=createId();if(!collection.entries.some(e=>e.id===value)){id=value;break;}}
    if(id===undefined)throw Error('一意な記録IDを作成できません。');
    const name=typeof choice.name==='string'?choice.name.trim():choice.name;
    // Validate the requested name and entry before generating a collision suffix.
    const entry={id,...(row.kind==='methods'?{}:{tool:row.tool}),name,...row.payload};
    parsers[row.kind]({version:1,entries:[entry]});
    const occupied=value=>collection.entries.some(e=>e.name===value&&(row.kind==='methods'||e.tool===row.tool));
    for(let n=2;occupied(entry.name);n++){const suffix=' ('+n+')';entry.name=trimName(name,100-suffix.length)+suffix;}
    collection.entries.push(entry);added.push({key:choice.key,kind:row.kind,tool:row.tool,name:entry.name,id});
  }
  // Validate all resulting collections before the caller commits any of them.
  for(const [kind,parse] of Object.entries(parsers))next[kind]=parse(next[kind]);
  return {next,added,kinds:[...new Set(added.map(e=>e.kind))]};
}

export function commitPresetImport(plan,stores){
  const before=Object.fromEntries(plan.kinds.map(kind=>[kind,stores[kind].snapshot()]));
  try{for(const kind of plan.kinds)stores[kind].replaceRecords(plan.next[kind]);}
  catch(error){for(const kind of plan.kinds)stores[kind].replaceRecords(before[kind]);throw error;}
}
