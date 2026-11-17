import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {bSplineCurve,nurbsCurve,splineBezierSpans,sampleSplineBranches} from '../src/model/splineCurves.js';
import {bSplinePoint,nurbsPoint} from '../src/model/splines.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
import {parseConstructionInput,parseConstructionInputPresets,supportsConstructionInput} from '../src/adapters/constructionInputPresets.js';
const points=[{x:0,y:0},{x:30,y:90},{x:60,y:0},{x:90,y:30}];
const input={points,degree:3,periodic:true,periodicKnots:[2,3,5,8,12]};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const pointNear=(a,b)=>{near(a.x,b.x);near(a.y,b.y);};
function endpointJet(span,last){
  const {controls,from,to}=span,p=controls.length-1,i=last?p:0,j=last?p-1:1;
  const h=controls[i],sign=last?1:-1;
  const derivative=Object.fromEntries(['x','y','w'].map(k=>[k,sign*p*(h[k]-controls[j][k])/(to-from)]));
  return [{x:h.x/h.w,y:h.y/h.w},Object.fromEntries(['x','y'].map(k=>[k,(derivative[k]*h.w-h[k]*derivative.w)/(h.w*h.w)]))];
}
test('nonuniform periodic curves join in position and tangent and agree with direct de Boor evaluation',()=>{
  for(let degree=2;degree<=12;degree++){
    const count=degree+3,points=Array.from({length:count},(_,i)=>({x:Math.cos(i)*40,y:Math.sin(i)*30}));
    const periodicKnots=Array.from({length:count+1},(_,i)=>3+i*i+i/2);
    for(const create of [bSplineCurve,nurbsCurve]){
      const model=create({points,degree,periodic:true,periodicKnots,weights:points.map((_,i)=>i%3+1)}),spans=splineBezierSpans(model);
      const first=endpointJet(spans[0],false),last=endpointJet(spans.at(-1),true);
      pointNear(first[0],last[0]);pointNear(first[1],last[1]);
      const sampled=sampleSplineBranches(model);assert.equal(sampled.closed,true);assert.equal(sampled.omitted.length,0);
      const evaluate=create===bSplineCurve?bSplinePoint:nurbsPoint;
      for(const span of spans){pointNear(endpointJet(span,false)[0],evaluate({...model,t:span.from}));}
    }
  }
});
test('explicit uniform periods preserve old models and affine knot changes preserve geometry',()=>{
  for(const create of [bSplineCurve,nurbsCurve]){
    const legacy=create({...input,periodicKnots:undefined,weights:[1,2,3,4]});
    assert.deepEqual(legacy,create({...input,periodicKnots:[0,1,2,3,4],weights:[1,2,3,4]}));
    const model=create(input),shifted=create({...input,periodicKnots:input.periodicKnots.map(k=>k*4-17)});
    assert.deepEqual(model.knots,[-7,-5,-2,2,3,5,8,12,13,15,18]);
    const a=sampleSplineBranches(model).branches[0].points,b=sampleSplineBranches(shifted).branches[0].points;
    assert.equal(a.length,b.length);a.forEach((p,i)=>pointNear(p,b[i]));
  }
});
test('periodic knot validation rejects ambiguous, over-multiple and numerically unrepresentable periods without mutation',()=>{
  const before=structuredClone(input);const m=bSplineCurve(input);m.knots[0]=999;m.points[0].x=999;assert.deepEqual(input,before);
  for(const periodicKnots of [null,{},[],[0,1,2,3],[0,1,2,3,4,5],[0,0,0,0,3],[0,2,1,3,4],[0,1,NaN,3,4],[-1e308,0,1,2,1e308],[-1e308,-5e307,0,5e307,1e308],[0,Number.MIN_VALUE,1,2,3]])
    assert.equal(bSplineCurve({...input,periodicKnots}),null,JSON.stringify(periodicKnots));
  assert.equal(bSplineCurve({...input,periodic:false}),null);assert.equal(bSplineCurve({...input,knots:[0,1]}),null);
});
test('signed periodic weights retain pole gaps instead of joining or filling omitted branches',()=>{
  const model=nurbsCurve({...input,degree:1,weights:[1,-1,1,-1]}),r=sampleSplineBranches(model);
  assert.equal(r.complete,false);assert.equal(r.closed,false);assert.ok(r.omitted.length>=4);
  assert.ok(r.branches.flatMap(b=>b.points).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
});
function read(model){return readSplineSource(JSON.stringify({version:1,model,path:'saved'}),null,'saved');}
test('saved nonuniform periodic sources reconstruct once and reject inconsistent wrapped knots or controls',()=>{
  for(const create of [bSplineCurve,nurbsCurve]){
    let m=create({...input,weights:[1,2,3,4]});
    for(let i=0;i<4;i++){const source=read(m);assert.deepEqual(source.input.periodicKnots,input.periodicKnots);assert.equal(source.input.points.length,4);assert.deepEqual(create(source.input),m);m=create(source.input);}
    for(const index of [0,m.knots.length-1]){const bad=structuredClone(m);bad.knots[index]+=0.25;assert.throws(()=>read(bad));}
    const bad=structuredClone(m);bad.points.at(-1).x++;assert.throws(()=>read(bad));
    assert.equal(read(create({...input,periodicKnots:undefined})).input.periodicKnots,undefined);
  }
});
test('spline draft version two preserves unfinished periodic text, validates shape, and leaves unrelated future versions inert',()=>{
  for(const name of ['bSplineCurve','nurbsCurve']){
    const entry={version:2,input:{points,degree:3,periodic:false,knotsText:'0, 1',periodicKnotsText:' 2, 3, -',...(name==='nurbsCurve'?{weightsText:'1,2,3,4'}:{})}};
    assert.deepEqual(parseConstructionInput(name,entry),entry);
    for(const value of [null,{},'x'.repeat(20001)])assert.throws(()=>parseConstructionInput(name,{...entry,input:{...entry.input,periodicKnotsText:value}}));
    const {periodicKnotsText,...old}=entry.input;assert.throws(()=>parseConstructionInput(name,{version:2,input:old}));assert.deepEqual(parseConstructionInput(name,{version:1,input:old}).input,old);
    assert.throws(()=>parseConstructionInput(name,{version:1,input:entry.input}));
  }
  const future={version:1,entries:{convexHull:{version:2,input:{future:true}},nurbsCurve:{version:3,input:{future:true}}}};
  assert.deepEqual(parseConstructionInputPresets(future),future);
});
test('real point controllers keep open and periodic knot drafts separate and restore both supported versions',()=>{
  const context=vm.createContext({window:{VectorUtils:{parseConstructionInput}},BaseTool:class{constructor(){this.isActive=true;}}});
  vm.runInContext(readFileSync(new URL('../src/tools/PointConstructionTool.js',import.meta.url),'utf8'),context);
  for(const name of ['bSplineCurve','nurbsCurve']){
    const Controller=context.window.pointConstructionController(name,name),tool=new Controller({},{});tool.redraw=()=>{};
    tool.points=structuredClone(points);tool.knotsText='unfinished open';tool.periodic=true;tool.periodicKnotsText=' 2, 3, 5, 8, 12 ';tool.weightsText='1,2,3,4';
    const entry=tool.exportInputPreset();assert.equal(entry.version,2);assert.equal(supportsConstructionInput(tool,entry),true);
    assert.deepEqual(JSON.parse(JSON.stringify(tool.input().periodicKnots)),input.periodicKnots);assert.equal(tool.input().knots,undefined);
    tool.periodic=false;assert.equal(tool.input().periodicKnots,undefined);assert.equal(tool.exportInputPreset().version,2);
    tool.restoreInputPreset(entry);assert.equal(tool.periodicKnotsText,entry.input.periodicKnotsText);assert.equal(tool.knotsText,'unfinished open');
    const {periodicKnotsText,...old}=entry.input;tool.restoreInputPreset({version:1,input:old});assert.equal(tool.periodicKnotsText,'');assert.equal(tool.exportInputPreset().version,1);
  }
});
