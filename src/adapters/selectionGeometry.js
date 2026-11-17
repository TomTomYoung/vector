import {selectionPixelSize,regionContains,intersectBounds,expandBounds,pointBoxDistance} from '../model/selectionRegion.js';

const tileSize=256, maxPixels=16_777_216;
const paint = (value,opacity) => value!=='none' && value!=='transparent' && Number(opacity)>0 && !/rgba\([^)]*,\s*0\s*\)$/.test(value);
const transformed = (p,m) => ({x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f});
function boundsOf(el,m,padding) {
  const b=el.getBBox(),points=[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}].map(p=>transformed(p,m));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
  return expandBounds({x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},padding);
}
function geometryPath(el) {
  const p=new Path2D(),n=name=>el[name]?.baseVal?.value??0;
  switch(el.localName) {
    case 'path':return new Path2D(el.getAttribute('d')??'');
    case 'line':p.moveTo(n('x1'),n('y1'));p.lineTo(n('x2'),n('y2'));break;
    case 'rect': {
      const w=n('width'),h=n('height');if(w<=0||h<=0)return null;
      const rx=Math.min(w/2,n('rx')||n('ry')),ry=Math.min(h/2,n('ry')||n('rx'));
      p.roundRect(n('x'),n('y'),w,h,{x:rx,y:ry});break;
    }
    case 'circle':if(n('r')<=0)return null;p.arc(n('cx'),n('cy'),n('r'),0,2*Math.PI);break;
    case 'ellipse':if(n('rx')<=0||n('ry')<=0)return null;p.ellipse(n('cx'),n('cy'),n('rx'),n('ry'),0,0,2*Math.PI);break;
    case 'polygon':case 'polyline':
      if(!el.points.numberOfItems)return null;
      Array.from(el.points).forEach((v,i)=>i?p.lineTo(v.x,v.y):p.moveTo(v.x,v.y));
      if(el.localName==='polygon')p.closePath();break;
    default:return null;
  }
  return p;
}

// SVG geometry -> Canvas paint coverage. The mask is tiled at 1/4 CSS px, never a bounding-box hit test.
// See doc/selection.md for precision, supported SVG features and the replaceable adapter contract.
export function createSelectionGeometry({canvas,canSelect}) {
  const surface=canvas.ownerDocument.createElement('canvas');surface.width=surface.height=tileSize;
  const ctx=surface.getContext('2d',{willReadFrequently:true});
  const pixel=selectionPixelSize;
  function describe(el) {
    if(!canSelect(el))return null;
    for(let n=el;n&&n!==canvas;n=n.parentElement) {
      const s=getComputedStyle(n);if(s.display==='none'||Number(s.opacity)===0)return null;
    }
    const s=getComputedStyle(el);if(s.visibility!=='visible')return null;
    const fill=paint(s.fill,s.fillOpacity),stroke=paint(s.stroke,s.strokeOpacity)&&parseFloat(s.strokeWidth)>0;
    if(!fill&&!stroke)return null;
    const path=geometryPath(el),text=el.localName==='text';
    if(!path&&!text)return null;
    const matrix=el.getScreenCTM();if(!matrix||!Number.isFinite(matrix.inverse().a))return null;
    const width=parseFloat(s.strokeWidth)||0,nonScaling=s.vectorEffect==='non-scaling-stroke';
    const scale=Math.hypot(matrix.a,matrix.b,matrix.c,matrix.d);
    const miter=Math.max(1,Number(s.strokeMiterlimit)||4);
    const padding=stroke?width/2*(nonScaling?1:scale)*miter+pixel:pixel;
    const screenPath=new Path2D();if(path)screenPath.addPath(path,matrix);
    const lengthScale=el.pathLength?.baseVal.value>0?el.getTotalLength()/el.pathLength.baseVal.value:1;
    const dash=s.strokeDasharray==='none'?[]:s.strokeDasharray.split(/[ ,]+/).map(Number.parseFloat).map(v=>v*lengthScale);
    const glyphs=[];
    if(text)for(let i=0;i<el.getNumberOfChars();i++) {
      const at=el.getStartPositionOfChar(i);glyphs.push({text:[...el.textContent][i]??'',at,rotation:el.getRotationOfChar(i)*Math.PI/180});
    }
    return {el,path,screenPath,matrix,inverse:matrix.inverse(),fill,stroke,width,nonScaling,
      rule:s.fillRule,cap:s.strokeLinecap,join:s.strokeLinejoin,miter,dash,offset:(parseFloat(s.strokeDashoffset)||0)*lengthScale,
      font:s.font||`${s.fontSize} ${s.fontFamily}`,glyphs,bounds:boundsOf(el,matrix,padding),tiles:new Map()};
  }
  function style(d) {
    ctx.lineWidth=d.width;ctx.lineCap=d.cap;ctx.lineJoin=d.join;ctx.miterLimit=d.miter;
    ctx.setLineDash(d.dash);ctx.lineDashOffset=d.offset;ctx.fillStyle=ctx.strokeStyle='#000';
  }
  function draw(d,tx,ty) {
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,tileSize,tileSize);style(d);
    const m=d.matrix;ctx.setTransform(m.a/pixel,m.b/pixel,m.c/pixel,m.d/pixel,m.e/pixel-tx,m.f/pixel-ty);
    if(d.path) {
      if(d.fill)ctx.fill(d.path,d.rule);
      if(d.stroke) {
        if(d.nonScaling)ctx.setTransform(1/pixel,0,0,1/pixel,-tx,-ty);
        ctx.stroke(d.nonScaling?d.screenPath:d.path);
      }
    } else {
      ctx.font=d.font;ctx.textAlign='left';ctx.textBaseline='alphabetic';
      for(const g of d.glyphs){ctx.save();ctx.translate(g.at.x,g.at.y);ctx.rotate(g.rotation);if(d.fill)ctx.fillText(g.text,0,0);if(d.stroke)ctx.strokeText(g.text,0,0);ctx.restore();}
    }
  }
  function scan(d,bounds,test,budget) {
    const box=intersectBounds(d.bounds,bounds);if(box.width<=0||box.height<=0)return false;
    const x0=Math.floor(box.x/pixel),y0=Math.floor(box.y/pixel),x1=Math.ceil((box.x+box.width)/pixel),y1=Math.ceil((box.y+box.height)/pixel);
    for(let ty=Math.floor(y0/tileSize)*tileSize;ty<y1;ty+=tileSize)for(let tx=Math.floor(x0/tileSize)*tileSize;tx<x1;tx+=tileSize) {
      const left=Math.max(x0,tx),top=Math.max(y0,ty),right=Math.min(x1,tx+tileSize),bottom=Math.min(y1,ty+tileSize);
      budget.count+=(right-left)*(bottom-top);
      if(budget.count>maxPixels)throw Error('選択判定の処理量上限です。表示を縮小するか、選択範囲を狭めてください。');
      const key=tx+','+ty;let alpha=d.tiles.get(key);
      if(!alpha){draw(d,tx,ty);const rgba=ctx.getImageData(0,0,tileSize,tileSize).data;alpha=new Uint8Array(tileSize*tileSize);for(let i=0;i<alpha.length;i++)alpha[i]=rgba[4*i+3];if(d.tiles.size>=128)d.tiles.clear();d.tiles.set(key,alpha);}
      for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(alpha[(y-ty)*tileSize+x-tx]&&test({x:(x+0.5)*pixel,y:(y+0.5)*pixel}))return true;
    }
    return false;
  }
  function exact(d,p) {
    if(!d.path)return false;
    ctx.setTransform(1,0,0,1,0,0);style(d);const local=transformed(p,d.inverse);
    return (d.fill&&ctx.isPointInPath(d.path,local.x,local.y,d.rule))||
      (d.stroke&&ctx.isPointInStroke(d.nonScaling?d.screenPath:d.path,d.nonScaling?p.x:local.x,d.nonScaling?p.y:local.y));
  }
  return {
    id:'canvas-coverage',algorithm:'Canvas Path2Dの塗り・線の被覆判定（0.25 CSS px）。なげなわは偶奇規則。',
    snapshot(elements) {
      // Selection dashes are decoration; restore original paint while reading computed styles.
      const selected=[...canvas.querySelectorAll('[data-vector-selected]')];selected.forEach(e=>e.removeAttribute('data-vector-selected'));
      try{return elements.map(element=>({element,parts:[element,...element.querySelectorAll('path,line,rect,circle,ellipse,polygon,polyline,text')].filter((e,i,a)=>a.indexOf(e)===i).map(describe).filter(Boolean)}));}
      finally{selected.forEach(e=>e.setAttribute('data-vector-selected',''));}
    },
    pick(items,p,radius) {
      // Reverse document order resolves direct hits and equal-distance ties to the frontmost object.
      for(const item of [...items].reverse())if(item.parts.some(d=>exact(d,p)))return item.element;
      if(radius===0)return null;
      const box={x:p.x-radius,y:p.y-radius,width:2*radius,height:2*radius},budget={count:0};
      let best=null,distance=Infinity;
      for(const item of [...items].reverse())for(const d of item.parts) {
        if(pointBoxDistance(p,d.bounds)>radius)continue;
        scan(d,box,q=>{const dist=pointBoxDistance(p,{x:q.x-pixel/2,y:q.y-pixel/2,width:pixel,height:pixel});if(dist<=radius&&dist<distance-1e-9){distance=dist;best=item.element;}return false;},budget);
      }
      return best;
    },
    query(items,region,match) {
      const contain=match==='contain'&&region.shape!=='line',budget={count:0},found=[];
      // Rasterize the region once per tile: freehand complexity must not multiply the per-pixel scan.
      const mask=canvas.ownerDocument.createElement('canvas');mask.width=mask.height=tileSize;
      const mc=mask.getContext('2d',{willReadFrequently:true}),regionPath=new Path2D(),tiles=new Map();
      if(region.shape==='circle')regionPath.arc(region.center.x,region.center.y,region.radius,0,2*Math.PI);
      else {region.points.forEach((p,i)=>i?regionPath.lineTo(p.x,p.y):regionPath.moveTo(p.x,p.y));if(region.shape!=='line')regionPath.closePath();}
      function covered(p) {
        const x=Math.floor(p.x/pixel),y=Math.floor(p.y/pixel),tx=Math.floor(x/tileSize)*tileSize,ty=Math.floor(y/tileSize)*tileSize,key=tx+','+ty;
        let data=tiles.get(key);
        if(!data) {
          mc.setTransform(1,0,0,1,0,0);mc.clearRect(0,0,tileSize,tileSize);mc.setTransform(1/pixel,0,0,1/pixel,-tx,-ty);
          if(region.shape!=='line')mc.fill(regionPath,'evenodd');
          mc.lineWidth=pixel;mc.lineJoin='round';mc.lineCap='round';mc.stroke(regionPath);
          data=mc.getImageData(0,0,tileSize,tileSize).data;if(tiles.size>=128)tiles.clear();tiles.set(key,data);
        }
        return data[4*((y-ty)*tileSize+x-tx)+3]>0;
      }
      for(const item of items) {
        let painted=false,hit=false,outside=false;
        for(const d of item.parts) {
          if(contain) {
            const b=d.bounds;
            const fullyInside=['rectangle','circle'].includes(region.shape)&&[
              {x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x,y:b.y+b.height},{x:b.x+b.width,y:b.y+b.height}
            ].every(p=>regionContains(region,p));
            if(fullyInside){painted=scan(d,d.bounds,()=>true,budget)||painted;continue;}
            outside=scan(d,d.bounds,p=>{painted=true;return !covered(p);},budget);
            if(outside)break;
          } else {
            hit=scan(d,expandBounds(region.bounds,pixel),covered,budget);
            if(hit)break;
          }
        }
        if(contain?painted&&!outside:hit)found.push(item.element);
      }
      return found;
    },
  };
}
