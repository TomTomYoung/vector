// Screen-space regions. The lasso uses the even-odd crossing rule, including its boundary.
export const selectionPixelSize = 0.25;
export function segmentDistance(p,a,b) {
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
export function makeSelectionRegion(shape,start,end,points=[]) {
  if (shape==='circle') {
    const radius=Math.hypot(end.x-start.x,end.y-start.y);
    return {shape,center:start,radius,bounds:{x:start.x-radius,y:start.y-radius,width:2*radius,height:2*radius}};
  }
  const vertices=shape==='lasso'?points:shape==='line'?[start,end]:[
    start,{x:end.x,y:start.y},end,{x:start.x,y:end.y}];
  const xs=vertices.map(p=>p.x),ys=vertices.map(p=>p.y);
  return {shape,points:vertices,bounds:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}};
}
export function regionContains(region,p,tolerance=0) {
  if(region.shape==='circle')return Math.hypot(p.x-region.center.x,p.y-region.center.y)<=region.radius+tolerance;
  if(region.shape==='line')return segmentDistance(p,...region.points)<=tolerance;
  const points=region.points;let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[j],b=points[i];
    if(segmentDistance(p,a,b)<=tolerance+1e-9)return true;
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
  }
  return inside;
}
export function intersectBounds(a,b) {
  const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y);
  return {x,y,width:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-x),height:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-y)};
}
export function expandBounds(b,padding) {return {x:b.x-padding,y:b.y-padding,width:b.width+2*padding,height:b.height+2*padding};}
export function pointBoxDistance(p,b) {return Math.hypot(Math.max(b.x-p.x,0,p.x-b.x-b.width),Math.max(b.y-p.y,0,p.y-b.y-b.height));}
