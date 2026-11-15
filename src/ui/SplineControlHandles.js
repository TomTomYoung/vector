// Pointer interaction edits only the SplineEditor draft. Apply owns the history commit.
class SplineControlHandles {
  constructor(editor) {this.editor=editor;this.canvas=editor.manager.canvas;this.group=null;this.drag=null;}
  open() {
    this.close();this.events=new AbortController();const signal=this.events.signal;
    const on=(target,name,fn)=>target.addEventListener(name,fn,{capture:true,signal});
    on(this.canvas,'pointerdown',event=>this.start(event));
    on(document,'pointermove',event=>this.move(event));
    on(document,'pointerup',event=>this.finish(event));
    on(document,'pointercancel',event=>{if(this.drag?.id===event.pointerId)this.stop(true,'このドラッグを取り消しました。');});
    on(this.canvas,'lostpointercapture',event=>{if(this.drag?.id===event.pointerId)this.stop(true,'このドラッグを取り消しました。');});
    on(window,'blur',event=>{if(event.target===window && this.drag)this.stop(true,'このドラッグを取り消しました。');});
    on(document,'keydown',event=>{
      if(event.key!=='Escape' || ToolManager.isEditingField(event.target))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(this.drag)this.stop(true,'このドラッグを取り消しました。');else this.editor.cancel();
    });
    on(this.canvas,'mousedown',event=>{
      if(event.target.closest?.('[data-spline-control-index]') && !window.zoomPanManager?.spacePressed){event.preventDefault();event.stopImmediatePropagation();}
    });
    on(window,'resize',()=>this.scheduleSync());
    this.observer=new MutationObserver(records=>{
      const element=this.editor.element;
      if(!element?.isConnected || records.some(r=>r.target===element || r.target===this.canvas || r.target.contains(element)))this.scheduleSync();
    });
    this.observer.observe(this.canvas,{attributes:true,subtree:true,childList:true,attributeFilter:['transform','style','viewBox','width','height','d','data-vector-spline','data-layer']});
    this.layerObserver=new MutationObserver(()=>this.scheduleSync());
    const layers=document.getElementById('layer-list');if(layers)this.layerObserver.observe(layers,{subtree:true,childList:true});
    this.resizeObserver=new ResizeObserver(()=>this.scheduleSync());this.resizeObserver.observe(this.canvas);
    this.sync();
  }
  close() {
    this.events?.abort();this.observer?.disconnect();this.layerObserver?.disconnect();this.resizeObserver?.disconnect();
    this.release();cancelAnimationFrame(this.moveFrame);cancelAnimationFrame(this.syncFrame);
    this.moveFrame=this.syncFrame=null;this.pending=null;this.group?.remove();this.group=null;
  }
  release() {
    const drag=this.drag;this.drag=null;
    drag?.handle.setAttribute('cursor','grab');
    if(drag && this.canvas.hasPointerCapture?.(drag.id))this.canvas.releasePointerCapture(drag.id);
  }
  scheduleSync() {
    if(this.syncFrame)return;
    this.syncFrame=requestAnimationFrame(()=>{this.syncFrame=null;this.sync();});
  }
  frame() {return window.VectorUtils.splineControlGeometry.splineControlFrame(this.canvas.getScreenCTM(),this.editor.element.getScreenCTM());}
  create(tag,attrs={}) {
    const el=document.createElementNS(this.canvas.namespaceURI,tag);
    for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);
    return el;
  }
  sync() {
    if(!this.editor.draft)return;
    try {
      this.editor.assertTarget();
      const points=this.editor.input().points,frame=this.frame(),text=window.VectorUtils.splineControlGeometry.splineMatrixText;
      this.editor.manager.tools.select.removeControlPoints();
      if(!this.group) {
        this.group=this.create('g',{'data-vector-preview':'spline-controls','pointer-events':'none'});
        this.polygon=this.create('path',{'data-spline-control-polygon':'',fill:'none',stroke:'#777','stroke-width':1,'stroke-dasharray':'4 4','vector-effect':'non-scaling-stroke'});
        this.group.append(this.polygon);this.items=[];
      }
      while(this.items.length>points.length)this.items.pop().remove();
      while(this.items.length<points.length){
        const i=this.items.length,group=this.create('g'),circle=this.create('circle',{r:7,fill:'#fff',stroke:'#1265d6','stroke-width':1.5,'pointer-events':'all',cursor:'grab','data-spline-control-index':i,'aria-label':'制御点 '+(i+1)});
        circle.style.touchAction='none';const title=this.create('title');title.textContent='制御点 '+(i+1)+'：ドラッグして移動';circle.append(title);
        const label=this.create('text',{x:10,y:-10,fill:'#1265d6','font-size':11});label.textContent=i+1;
        group.append(circle,label);this.items.push(group);this.group.append(group);
      }
      const canvasPoints=points.map(frame.toCanvas);
      this.polygon.setAttribute('d',canvasPoints.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ')+(this.editor.draft.periodic&&points.length?' Z':''));
      canvasPoints.forEach((p,i)=>this.items[i].setAttribute('transform',text(frame.handleMatrix(p))));
      if(this.editor.preview)this.editor.preview.setAttribute('transform',text(frame.localCanvas));
      if(this.group.parentNode!==this.canvas)this.canvas.append(this.group);
      if(this.error){this.error=false;this.editor.message='制御点をドラッグできます。「適用」で元図形を更新します。';this.editor.updateStatus();}
    } catch(error) {
      if(this.drag)this.stop(true,error.message);
      this.group?.remove();this.group=null;this.editor.preview?.remove();this.editor.preview=null;
      this.error=true;this.editor.message=error.message;this.editor.updateStatus();
    }
  }
  start(event) {
    const handle=event.target.closest?.('[data-spline-control-index]');
    if(!handle || !this.group?.contains(handle) || event.button!==0 || event.isPrimary===false || this.drag || window.zoomPanManager?.spacePressed || window.zoomPanManager?.isPanning)return;
    event.preventDefault();event.stopImmediatePropagation();
    try {
      this.editor.assertTarget();const points=this.editor.input().points,index=Number(handle.dataset.splineControlIndex),frame=this.frame();
      const pointer=frame.fromScreen({x:event.clientX,y:event.clientY}),point=points[index];
      this.drag={id:event.pointerId,index,points,handle,before:this.editor.draft.pointsText,start:{x:event.clientX,y:event.clientY},moved:false,anchor:frame.toCanvas(point),offset:{x:point.x-pointer.x,y:point.y-pointer.y}};
      handle.setAttribute('cursor','grabbing');
      try{this.canvas.setPointerCapture(event.pointerId);}catch{/* Synthetic events have no active browser pointer. Document listeners still work. */}
    }catch(error){this.editor.message=error.message;this.editor.updateStatus();}
  }
  move(event) {
    if(!this.drag || event.pointerId!==this.drag.id)return;
    event.preventDefault();event.stopImmediatePropagation();this.pending=event;
    if(!this.moveFrame)this.moveFrame=requestAnimationFrame(()=>{this.moveFrame=null;const next=this.pending;this.pending=null;if(this.drag&&next)this.update(next);});
  }
  update(event) {
    try {
      this.editor.assertTarget();const manager=this.editor.manager;
      if(!this.drag.moved && Math.hypot(event.clientX-this.drag.start.x,event.clientY-this.drag.start.y)<2)return;
      this.drag.moved=true;
      const point=window.VectorUtils.splineControlGeometry.moveSplineControl(this.frame(),{x:event.clientX,y:event.clientY},this.drag.offset,{
        anchor:this.drag.anchor,ortho:event.shiftKey || window.orthoMode,
        snap:p=>manager.host.snap(p,{geometry:false,exclude:this.editor.element,anchor:this.drag.anchor,manager}),
      });
      this.drag.points[this.drag.index]=point;
      this.editor.draft.pointsText=this.drag.points.map(p=>p.x+', '+p.y).join('\n');
      this.editor.showPreview(false);this.editor.updatePointsField();
    }catch(error){this.stop(true,error.message);}
  }
  finish(event) {
    if(!this.drag || event.pointerId!==this.drag.id)return;
    event.preventDefault();event.stopImmediatePropagation();
    cancelAnimationFrame(this.moveFrame);this.moveFrame=null;this.pending=null;
    this.update(event);if(this.drag)this.stop(false);
  }
  stop(rollback,message) {
    if(!this.drag)return;
    const before=this.drag.before;this.release();cancelAnimationFrame(this.moveFrame);this.moveFrame=null;this.pending=null;
    if(rollback && this.editor.draft){this.editor.draft.pointsText=before;this.editor.showPreview(false);}
    if(message)this.editor.message=message;
    this.editor.updatePointsField();this.editor.updateStatus();
  }
}
window.SplineControlHandles=SplineControlHandles;
