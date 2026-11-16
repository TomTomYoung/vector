import {orientationSign} from '../model/exactPredicates.js';

// Validate index topology, not the Delaunay property of an external implementation.
export function meshTriangles(input,result) {
  const points=input?.points;
  if(!Array.isArray(points)||!Array.isArray(result)||!result.length||result.length>2000)throw Error('三角形を作れません。重複・一直線の配置と三角形の個数を確認してください。');
  const seen=new Set();
  return result.map(triangle=>{
    if(!Array.isArray(triangle)||triangle.length!==3||!triangle.every(i=>Number.isInteger(i)&&i>=0&&i<points.length)||new Set(triangle).size!==3)throw Error('三角形の入力点インデックスが不正です。');
    const key=[...triangle].sort((a,b)=>a-b).join(',');
    if(seen.has(key)||!orientationSign(...triangle.map(i=>points[i])))throw Error('同じ三角形の重複または面積0の三角形があります。');
    seen.add(key);return [...triangle];
  });
}
const metadataTags=['title','desc','metadata'];
const faceTags=['polygon','path'];
const tag=el=>el?.tagName?.toLowerCase();

export function meshGeometrySnapshot(element) {
  if(tag(element)!=='g')throw Error('三角分割の再編集にはSVGグループが必要です。');
  const faces=[];
  for(const el of element.children){
    if(metadataTags.includes(tag(el)))continue;
    if(!faceTags.includes(tag(el))||el.children.length)throw Error('三角分割は直接の多角形または閉じたパスで描画してください。');
    faces.push({tag:tag(el),attributes:[...el.attributes].map(a=>[a.name,a.value]).sort(([a],[b])=>a<b?-1:a>b?1:0)});
  }
  if(!faces.length||faces.length>2000)throw Error('描画する三角形がありません、または上限を超えています。');
  return {tag:'g',faces};
}

export function validateMeshSnapshot(saved,current,count) {
  if(current?.tag!=='g'||!Array.isArray(current.faces)||current.faces.length!==count||JSON.stringify(saved)!==JSON.stringify(current))throw Error('現在の三角形と点群の元データが一致しません。');
  for(const face of current.faces){
    if(!faceTags.includes(face?.tag)||!Array.isArray(face.attributes)||!face.attributes.every(a=>Array.isArray(a)&&a.length===2&&a.every(v=>typeof v==='string')))throw Error('三角形の描画記録が不正です。');
    const attrs=Object.fromEntries(face.attributes);
    if(face.tag==='polygon'){
      const values=typeof attrs.points==='string'?attrs.points.trim().split(/[\s,]+/).map(Number):[];
      if(values.length!==6||!values.every(Number.isFinite))throw Error('三角形の描画には有限な3頂点が必要です。');
    }else if(typeof attrs.d!=='string'||!attrs.d.trim()||/NaN|Infinity/.test(attrs.d)||!/[zZ]\s*$/.test(attrs.d))throw Error('三角形の描画には閉じた有限のSVGパスが必要です。');
  }
}

// Prepare detached faces before the editor commits; retain root metadata node identity.
export function meshReplacementChildren(target,result) {
  meshGeometrySnapshot(target);meshGeometrySnapshot(result);
  const fresh=[...result.children].filter(el=>faceTags.includes(tag(el))).map(el=>el.cloneNode(true));
  let inserted=false;
  return [...target.childNodes].flatMap(node=>{
    if(!faceTags.includes(tag(node)))return [node];
    if(inserted)return [];
    inserted=true;return fresh;
  });
}
