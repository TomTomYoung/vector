import {isSimplePolygon} from '../model/polygons.js';
import {signedArea} from '../model/measurements.js';
import {meshTriangles} from './meshSource.js';

const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const key=p=>p.x+','+p.y;
// Preserve the input ring; only the calculation may discard repeated/collinear vertices.
export function polygonTriangles(input,result) {
  const points=input?.points;
  if(!Array.isArray(points)||points.length<3||points.length>1000||!points.every(finitePoint))throw Error('多角形は有限な頂点を3〜1000点で指定してください。');
  const area=signedArea({points});
  if(!Number.isFinite(area)||!area||!isSimplePolygon({points}))throw Error('面積が有限で0でない、自己交差や辺の重なりのない単純多角形が必要です。');
  if(!Array.isArray(result)||!result.length||result.length>2000)throw Error('多角形の三角分割結果が空、または上限を超えています。');
  const indices=new Map();points.forEach((p,i)=>{if(!indices.has(key(p)))indices.set(key(p),i);});
  const triangles=result.map(triangle=>{
    if(!Array.isArray(triangle)||triangle.length!==3||!triangle.every(finitePoint))throw Error('三角形には有限な3頂点が必要です。');
    return triangle.map(p=>{
      const index=indices.get(key(p));
      if(index===undefined)throw Error('三角形の頂点が元の多角形にありません。');
      return index;
    });
  });
  // Reuse exact zero-area and duplicate-face validation, without changing the result contract.
  return meshTriangles(input,triangles).map(triangle=>triangle.map(i=>({x:points[i].x,y:points[i].y})));
}
