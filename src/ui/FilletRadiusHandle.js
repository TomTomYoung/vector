// Pointer gestures edit only FilletEditor input. The Apply action commits history.
class FilletRadiusHandle {
  constructor(editor) {this.editor=editor;this.canvas=editor.manager.canvas;this.group=null;this.drag=null;}
  open() {
    this.close();this.error=false;this.events=new AbortController();const signal=this.events.signal;
    const on=(target,name,fn)=>target.addEventListener(name,fn,{capture:true,signal});
    on(this.canvas,'pointerdown',event=>this.start(event));
    on(document,'pointermove',event=>this.move(event));
    on(document,'pointerup',event=>this.finish(event));
    on(document,'pointercancel',event=>{if(this.drag?.id===event.pointerId)this.stop(true,'このドラッグを取り消しました。');});
    on(this.canvas,'lostpointercapture',event=>{if(this.drag?.id===event.pointerId)this.stop(true,'このドラッグを取り消しました。');});
    on(window,'blur',event=>{if(event.target===window && this.drag)this.stop(true,'このドラッグを取り消しました。');});
    on(document,'keydown',event=>{
      if(event.key!=='Escape')return;
      event.preventDefault();event.stopImmediatePropagation();
      if(this.drag)this.stop(true,'このドラッグを取り消しました。');else this.editor.cancel();
    });
    on(this.canvas,'mousedown',event=>{
      if(event.target.closest?.('[data-fillet-radius-control]') && !window.zoomPanManager?.spacePressed){event.preventDefault();event.stopImmediatePropagation();}
    });
    on(window,'resize',()=>this.scheduleSync());
    this.observer=new MutationObserver(records=>{
      const element=this.editor.element;
      const nodes=[element,...(this.editor.lines??[])];
      if(nodes.some(el=>!el?.isConnected) || records.some(r=>nodes.some(el=>r.target===el || r.target.contains(el))))this.scheduleSync();
    });
    this.observer.observe(this.canvas,{attributes:true,subtree:true,childList:true,
      attributeFilter:['transform','style','viewBox','width','height','d','x1','y1','x2','y2','data-vector-fillet-line-id','data-vector-fillet','data-vector-implementation','data-layer']});
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
    const drag=this.drag;this.drag=null;drag?.handle.setAttribute('cursor','grab');
    if(drag && this.canvas.hasPointerCapture?.(drag.id))this.canvas.releasePointerCapture(drag.id);
  }
  scheduleSync() {
    if(!this.syncFrame)this.syncFrame=requestAnimationFrame(()=>{this.syncFrame=null;this.sync();});
  }
  frame() {return window.VectorUtils.filletControlGeometry.filletControlFrame(this.canvas.getScreenCTM(),this.editor.element.getScreenCTM());}
  create(tag,attrs={}) {
    const el=document.createElementNS(this.canvas.namespaceURI,tag);
    for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);return el;
  }
  sync() {
    if(!this.editor.draft)return;
    let preservePreview=false;
    try {
      this.editor.assertTarget();const frame=this.frame(),prepared=this.editor.build();preservePreview=true;
      const contact=JSON.parse(prepared.bridge.getAttribute('data-vector-fillet')).result.bridge.start;
      const points=window.VectorUtils.filletControlGeometry.filletRadiusControl(this.editor.input(),contact);
      const text=window.VectorUtils.splineControlGeometry.splineMatrixText;
      this.editor.manager.tools.select.removeControlPoints();
      if(!this.group) {
        this.group=this.create('g',{'data-vector-preview':'fillet-controls','pointer-events':'none'});
        this.guide=this.create('path',{'data-fillet-radius-guide':'',fill:'none',stroke:'#777','stroke-width':1,'stroke-dasharray':'4 4','vector-effect':'non-scaling-stroke'});
        this.item=this.create('g');const handle=this.create('circle',{r:7,fill:'#fff',stroke:'#1265d6','stroke-width':1.5,'pointer-events':'all',cursor:'grab','data-fillet-radius-control':'','aria-label':'フィレットの半径ハンドル'});
        handle.style.touchAction='none';const title=this.create('title');title.textContent='第一線分の接点をドラッグして半径を変更';handle.append(title);
        const caption=this.create('text',{x:10,y:-10,fill:'#1265d6','font-size':11});caption.textContent='半径';this.item.append(handle,caption);this.group.append(this.guide,this.item);
      }
      const vertex=frame.toCanvas(points.vertex),handle=frame.toCanvas(points.handle);
      this.guide.setAttribute('d',`M${vertex.x} ${vertex.y} L${handle.x} ${handle.y}`);
      this.item.setAttribute('transform',text(frame.handleMatrix(handle)));
      if(this.editor.preview)this.editor.preview.setAttribute('transform',text(frame.localCanvas));
      if(this.group.parentNode!==this.canvas || (this.editor.preview && this.group.nextSibling))this.canvas.append(this.group);
      if(this.error){this.error=false;this.editor.message='第一線分の接点をドラッグして半径を変更できます。「適用」で元図形を更新します。';this.editor.updateStatus();}
    } catch(error) {
      if(this.drag)this.stop(true,error.message);
      this.group?.remove();this.group=null;
      if(!preservePreview){this.editor.preview?.remove();this.editor.preview=null;}
      this.error=true;this.editor.message=error.message;this.editor.updateStatus();
    }
  }
  start(event) {
    const handle=event.target.closest?.('[data-fillet-radius-control]');
    if(!handle || !this.group?.contains(handle) || event.button!==0 || event.isPrimary===false || this.drag || window.zoomPanManager?.spacePressed || window.zoomPanManager?.isPanning)return;
    event.preventDefault();event.stopImmediatePropagation();
    try {
      this.editor.assertTarget();const input=this.editor.input(),frame=this.frame();
      const control=window.VectorUtils.filletControlGeometry.filletRadiusControl(input),pointer=frame.fromScreen({x:event.clientX,y:event.clientY});
      this.drag={id:event.pointerId,input,handle,before:this.editor.draft.radius,start:{x:event.clientX,y:event.clientY},moved:false,
        anchor:frame.toCanvas(control.vertex),offset:{x:control.handle.x-pointer.x,y:control.handle.y-pointer.y}};
      handle.setAttribute('cursor','grabbing');
      try{this.canvas.setPointerCapture(event.pointerId);}catch{/* Document listeners also handle synthetic pointer events. */}
    } catch(error){this.editor.message=error.message;this.editor.updateStatus();}
  }
  move(event) {
    if(!this.drag || event.pointerId!==this.drag.id)return;
    event.preventDefault();event.stopImmediatePropagation();this.pending=event;
    if(!this.moveFrame)this.moveFrame=requestAnimationFrame(()=>{this.moveFrame=null;const next=this.pending;this.pending=null;if(this.drag&&next)this.update(next);});
  }
  update(event) {
    try {
      this.editor.assertTarget();const manager=this.editor.manager,drag=this.drag;
      if(!drag.moved && Math.hypot(event.clientX-drag.start.x,event.clientY-drag.start.y)<2)return;
      drag.moved=true;
      const radius=window.VectorUtils.filletControlGeometry.moveFilletRadius(this.frame(),drag.input,{x:event.clientX,y:event.clientY},drag.offset,{
        anchor:drag.anchor,ortho:event.shiftKey || window.orthoMode,
        snap:p=>manager.host.snap(p,{geometry:false,exclude:this.editor.element,anchor:drag.anchor,manager}),
      });
      this.editor.draft.radius=String(radius);
      if(!this.editor.showPreview(false)||!this.group)throw Error(this.editor.message);
      this.editor.updateFields();
    } catch(error){this.stop(true,error.message);}
  }
  finish(event) {
    if(!this.drag || event.pointerId!==this.drag.id)return;
    event.preventDefault();event.stopImmediatePropagation();cancelAnimationFrame(this.moveFrame);this.moveFrame=null;this.pending=null;
    this.update(event);if(this.drag)this.stop(false);
  }
  stop(rollback,message) {
    if(!this.drag)return;
    const {before}=this.drag;this.release();cancelAnimationFrame(this.moveFrame);this.moveFrame=null;this.pending=null;
    if(rollback && this.editor.draft){this.editor.draft.radius=before;this.editor.showPreview(false);}
    if(message)this.editor.message=message;
    this.editor.updateFields();this.editor.updateStatus();
  }
}
window.FilletRadiusHandle=FilletRadiusHandle;
