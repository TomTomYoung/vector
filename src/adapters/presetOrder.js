export function movePreset(entries,id,direction,tool){
  if(![-1,1].includes(direction))throw Error('移動方向が不正です。');
  const indices=entries.flatMap((e,i)=>tool===undefined||e.tool===tool?[i]:[]),at=indices.findIndex(i=>entries[i].id===id);
  if(at<0)throw Error('移動する記録が見つかりません。');
  if(at+direction<0||at+direction>=indices.length)return false;
  const a=indices[at],b=indices[at+direction];[entries[a],entries[b]]=[entries[b],entries[a]];return true;
}
export function sortPresets(entries,tool){
  const indices=entries.flatMap((e,i)=>tool===undefined||e.tool===tool?[i]:[]),before=indices.map(i=>entries[i]);
  const sorted=[...before].sort((a,b)=>a.name.localeCompare(b.name,'ja',{numeric:true,sensitivity:'variant'}));
  if(sorted.every((e,i)=>e.id===before[i].id))return false;
  indices.forEach((index,i)=>{entries[index]=sorted[i];});return true;
}
export function filterPresets(entries,query){
  const words=String(query).normalize('NFKC').toLocaleLowerCase('ja').trim().split(/\s+/).filter(Boolean);
  return entries.filter(e=>{const text=(e.name+' '+e.id).normalize('NFKC').toLocaleLowerCase('ja');return words.every(word=>text.includes(word));});
}
