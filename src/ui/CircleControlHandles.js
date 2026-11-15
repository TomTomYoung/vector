// Pointer gestures edit only CircleEditor input. The Apply action commits history.
class CircleControlHandles {
  constructor(editor) {this.editor=editor;this.canvas=editor.manager.canvas;this.group=null;this.drag=null;this.direction={x:1,y:0};}
  open() {
    this.close();this.direction={x:1,y:0};this.error=false;this.events=new AbortController();const signal=this.events.signal;
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
      if(event.target.closest?.('[data-circle-control]') && !window.zoomPanManager?.spacePressed){event.preventDefault();event.stopImmediatePropagation();}
    });
    on(window,'resize',()=>this.scheduleSync());
    this.observer=new MutationObserver(records=>{
      const element=this.editor.element;
      if(!element?.isConnected || records.some(r=>r.target===element || r.target===this.canvas || r.target.contains(element)))this.scheduleSync();
    });
    this.observer.observe(this.canvas,{attributes:true,subtree:true,childList:true,
      attributeFilter:['transform','style','viewBox','width','height','d','cx','cy','r','data-vector-circle','data-vector-implementation','data-layer']});
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
  frame() {return window.VectorUtils.circleControlGeometry.circleControlFrame(this.canvas.getScreenCTM(),this.editor.element.getScreenCTM());}
  create(tag,attrs={}) {
    const el=document.createElementNS(this.canvas.namespaceURI,tag);
    for(const [key,value] of Object.entries(attrs))el.setAttribute(key,value);return el;
  }
  sync() {
    if(!this.editor.draft)return;
    try {
      this.editor.assertTarget();const frame=this.frame(),model={kind:'circle',...this.editor.input()};
      const points=window.VectorUtils.circleControlGeometry.circleControlPoints(model,this.direction);
      const text=window.VectorUtils.splineControlGeometry.splineMatrixText;
      this.editor.manager.tools.select.removeControlPoints();
      if(!this.group) {
        this.group=this.create('g',{'data-vector-preview':'circle-controls','pointer-events':'none'});
        this.spoke=this.create('path',{'data-circle-radius-guide':'',fill:'none',stroke:'#777','stroke-width':1,'stroke-dasharray':'4 4','vector-effect':'non-scaling-stroke'});
        this.group.append(this.spoke);this.items={};
        for(const [kind,label] of [['center','中心'],['radius','半径']]){
          const group=this.create('g'),handle=this.create('circle',{r:7,fill:kind==='center'?'#1265d6':'#fff',stroke:'#1265d6','stroke-width':1.5,
            'pointer-events':'all',cursor:'grab','data-circle-control':kind,'aria-label':'円の'+label+'ハンドル'});
          handle.style.touchAction='none';const title=this.create('title');title.textContent=label+'：ドラッグして変更';handle.append(title);
          const caption=this.create('text',{x:10,y:-10,fill:'#1265d6','font-size':11});caption.textContent=label;
          group.append(handle,caption);this.items[kind]=group;this.group.append(group);
        }
      }
      const center=frame.toCanvas(points.center),radius=frame.toCanvas(points.radius);
      this.spoke.setAttribute('d',`M${center.x} ${center.y} L${radius.x} ${radius.y}`);
      for(const [kind,point] of Object.entries({center,radius}))this.items[kind].setAttribute('transform',text(frame.handleMatrix(point)));
      if(this.editor.preview)this.editor.preview.setAttribute('transform',text(frame.localCanvas));
      if(this.group.parentNode!==this.canvas || (this.editor.preview && this.group.nextSibling))this.canvas.append(this.group);
      if(this.error){this.error=false;this.editor.message='中心・半径をドラッグできます。「適用」で元図形を更新します。';this.editor.updateStatus();}
    } catch(error) {
      if(this.drag)this.stop(true,error.message);
      this.group?.remove();this.group=null;this.editor.preview?.remove();this.editor.preview=null;
      this.error=true;this.editor.message=error.message;this.editor.updateStatus();
    }
  }
  start(event) {
    const handle=event.target.closest?.('[data-circle-control]');
    if(!handle || !this.group?.contains(handle) || event.button!==0 || event.isPrimary===false || this.drag || window.zoomPanManager?.spacePressed || window.zoomPanManager?.isPanning)return;
    event.preventDefault();event.stopImmediatePropagation();
    try {
      this.editor.assertTarget();const model={kind:'circle',...this.editor.input()},kind=handle.dataset.circleControl,frame=this.frame();
      const point=window.VectorUtils.circleControlGeometry.circleControlPoints(model,this.direction)[kind];
      const pointer=frame.fromScreen({x:event.clientX,y:event.clientY}),d=this.editor.draft;
      this.drag={id:event.pointerId,kind,model,handle,before:{cx:d.cx,cy:d.cy,radius:d.radius},direction:{...this.direction},
        start:{x:event.clientX,y:event.clientY},moved:false,anchor:frame.toCanvas(model.center),offset:{x:point.x-pointer.x,y:point.y-pointer.y}};
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
      const result=window.VectorUtils.circleControlGeometry.moveCircleControl(this.frame(),drag.model,drag.kind,{x:event.clientX,y:event.clientY},drag.offset,{
        anchor:drag.anchor,ortho:event.shiftKey || window.orthoMode,
        snap:p=>manager.host.snap(p,{geometry:false,exclude:this.editor.element,anchor:drag.anchor,manager}),
      });
      const {center,radius}=result.model;
      // Validate the resulting handle position before updating any draft field.
      window.VectorUtils.circleControlGeometry.circleControlPoints(result.model,result.direction??this.direction);
      Object.assign(this.editor.draft,{cx:String(center.x),cy:String(center.y),radius:String(radius)});
      if(result.direction)this.direction=result.direction;
      this.editor.showPreview(false);this.editor.updateFields();
    } catch(error){this.stop(true,error.message);}
  }
  finish(event) {
    if(!this.drag || event.pointerId!==this.drag.id)return;
    event.preventDefault();event.stopImmediatePropagation();cancelAnimationFrame(this.moveFrame);this.moveFrame=null;this.pending=null;
    this.update(event);if(this.drag)this.stop(false);
  }
  stop(rollback,message) {
    if(!this.drag)return;
    const {before,direction}=this.drag;this.release();cancelAnimationFrame(this.moveFrame);this.moveFrame=null;this.pending=null;
    if(rollback && this.editor.draft){Object.assign(this.editor.draft,before);this.direction=direction;this.editor.showPreview(false);}
    if(message)this.editor.message=message;
    this.editor.updateFields();this.editor.updateStatus();
  }
}
window.CircleControlHandles=CircleControlHandles;
