import {orientationSign} from '../model/exactPredicates.js';

const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const copy=p=>({x:p.x,y:p.y});
export function voronoiInput(input) {
  const {sites,box}=input??{};
  if(!Array.isArray(sites)||!sites.length||sites.length>1000||!sites.every(finitePoint))throw Error('母点は有限な x, y の組を1〜1000点で指定してください。');
  if(!box||!['x','y','width','height'].every(k=>Number.isFinite(box[k]))||box.width<=0||box.height<=0||
      !Number.isFinite(box.x+box.width)||!Number.isFinite(box.y+box.height)||box.x+box.width<=box.x||box.y+box.height<=box.y)throw Error('切り取り範囲は有限な座標と正の幅・高さで指定してください。');
  return {sites:sites.map(copy),box:{x:box.x,y:box.y,width:box.width,height:box.height}};
}

// Verify site correspondence and bounded polygon data, not the nearest-site property.
export function voronoiResult(input,result) {
  const {sites,box}=voronoiInput(input),unique=[],seen=new Set();
  sites.forEach((site,index)=>{const key=site.x+','+site.y;if(!seen.has(key)){seen.add(key);unique.push({site,index});}});
  if(!Array.isArray(result)||result.length!==unique.length)throw Error('異なる母点ごとに、空の領域も含めて1個のセルを返してください。');
  const right=box.x+box.width,bottom=box.y+box.height,tolerance=64*Number.EPSILON*Math.max(1,Math.abs(box.x),Math.abs(box.y),Math.abs(right),Math.abs(bottom));
  let vertices=0,visible=0;
  const cells=result.map((cell,i)=>{
    const expected=unique[i];
    if(cell?.index!==expected.index||!finitePoint(cell.site)||cell.site.x!==expected.site.x||cell.site.y!==expected.site.y)throw Error('セルの母点と元の入力番号・順序が一致しません。');
    const points=cell.points;
    if(!Array.isArray(points)||points.length>2000||(points.length>0&&points.length<3)||!points.every(finitePoint)||(vertices+=points.length)>12000)throw Error('セルの頂点数または座標が不正です。');
    if(points.length){
      if(points.some(p=>p.x<box.x-tolerance||p.x>right+tolerance||p.y<box.y-tolerance||p.y>bottom+tolerance))throw Error('セルの頂点が切り取り範囲の外にあります。');
      const first=points[0],second=points.find(p=>p.x!==first.x||p.y!==first.y);
      if(!second||!points.some(p=>orientationSign(first,second,p)))throw Error('セルの頂点が一直線または同一点です。');
      visible++;
    }
    return {index:cell.index,site:copy(cell.site),points:points.map(copy)};
  });
  if(!visible)throw Error('切り取り範囲に描画できるセルがありません。');
  return cells;
}
