import test from 'node:test';
import assert from 'node:assert/strict';
import {bSplineCurve,nurbsCurve,splineBezierSpans,sampleSplineBranches} from '../src/model/splineCurves.js';
import {nurbsPoint,bSplinePoint} from '../src/model/splines.js';
import {prepareGeometry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const pointNear=(a,b)=>{near(a.x,b.x);near(a.y,b.y);};
const points=Array.from({length:8},(_,i)=>({x:Math.cos(i)*20,y:Math.sin(i)*30}));
const input={points:points.slice(0,4),degree:3,periodic:true,periodicKnots:[0.1,0.1,1,2,2]};
function jet(span,last){
  const p=span.controls.length-1,i=last?p:0,j=last?p-1:1,h=span.controls[i];
  const d=Object.fromEntries(['x','y','w'].map(k=>[k,(last?1:-1)*p*(h[k]-span.controls[j][k])/(span.to-span.from)]));
  return [{x:h.x/h.w,y:h.y/h.w},Object.fromEntries(['x','y'].map(k=>[k,(d[k]*h.w-h[k]*d.w)/(h.w*h.w)]))];
}
test('cyclic multiplicities one through degree retain the required seam continuity through degree twelve',()=>{
  for(let degree=2;degree<=12;degree++)for(let multiplicity=1;multiplicity<=degree;multiplicity++){
    const count=2*degree+3,points=Array.from({length:count},(_,i)=>({x:Math.cos(i),y:Math.sin(i)}));
    const knots=[...Array(multiplicity).fill(0),...Array.from({length:count+1-multiplicity},(_,i)=>i+1)];
    for(const split of [false,true]){
      const periodicKnots=split&&multiplicity>1?[...knots.slice(1),knots.at(-1)]:knots;
      for(const create of [bSplineCurve,nurbsCurve]){
        const model=create({points,degree,periodic:true,periodicKnots,weights:points.map((_,i)=>1+i%3)});assert.ok(model);
        const spans=splineBezierSpans(model),first=jet(spans[0],false),last=jet(spans.at(-1),true);
        pointNear(first[0],last[0]);if(multiplicity<degree)pointNear(first[1],last[1]);
        assert.equal(sampleSplineBranches(model,{sampleCount:8}).closed,true);
      }
    }
  }
});
test('double periodic knots reproduce an exact rational quadratic circle with unequal span widths',()=>{
  const points=[{x:1,y:-1},{x:1,y:0},{x:1,y:1},{x:0,y:1},{x:-1,y:1},{x:-1,y:0},{x:-1,y:-1},{x:0,y:-1}];
  const model=nurbsCurve({points,degree:2,periodic:true,periodicKnots:[0,0,1,1,3,3,6,6,10],weights:points.map((_,i)=>i%2?1:Math.SQRT1_2)});
  const result=sampleSplineBranches(model,{sampleCount:100});assert.equal(result.closed,true);
  for(const p of result.branches[0].points)near(p.x*p.x+p.y*p.y,1);
  for(let i=0;i<=100;i++){const p=nurbsPoint({...model,t:i/10});near(p.x*p.x+p.y*p.y,1);}
  assert.match(pathData(prepareGeometry(model)),/Z$/);assert.equal(splineBezierSpans(model).length,4);
});
test('interior and seam knots at full allowed multiplicity retain corners without splitting or bridging gaps',()=>{
  const model=bSplineCurve({points,degree:2,periodic:true,periodicKnots:[0,0,1,1,2,2,3,3,4]}),spans=splineBezierSpans(model);
  for(let i=0;i<spans.length;i++){
    const a=jet(spans[i],true),b=jet(spans[(i+1)%spans.length],false);pointNear(a[0],b[0]);
    assert.ok(Math.hypot(a[1].x-b[1].x,a[1].y-b[1].y)>1,'corner tangent retained');
    const t=(spans[i].from+spans[i].to)/2,p0=points[(2*i+1)%8],p1=points[(2*i+2)%8],p2=points[(2*i+3)%8];
    pointNear(bSplinePoint({...model,t}),{x:(p0.x+2*p1.x+p2.x)/4,y:(p0.y+2*p1.y+p2.y)/4});
  }
  const result=sampleSplineBranches(model);assert.equal(result.branches.length,1);assert.equal(result.closed,true);
});
test('over-multiple seams combine leading and trailing repetitions while zero periods and collapsed intervals are rejected',()=>{
  for(const periodicKnots of [[0,0,0,0,1],[0,0,0,1,1],[0,0,1,1,1],[0,1,1,1,1],[1,1,1,1,1],[0,Number.MIN_VALUE,1,1,2],[0,2,1,2,3]])assert.equal(bSplineCurve({...input,periodicKnots}),null,JSON.stringify(periodicKnots));
  assert.equal(bSplineCurve({...input,degree:2,periodicKnots:[0,1,1,1,2]}),null,'interior multiplicity');
  assert.equal(bSplineCurve({...input,degree:1,periodicKnots:[0,1,1,2,3]}),null,'degree one only simple knots');
  for(const periodicKnots of [[0,0,0,1,2],[0,0,1,2,2],[0,1,2,2,2],[0,1,1,1,2]])assert.ok(bSplineCurve({...input,periodicKnots}));
});
test('decimal seam duplicates stay exact and repeated periodic inputs remain immutable',()=>{
  const before=structuredClone(input),model=bSplineCurve(input),u=model.knots;
  assert.equal(u.filter(k=>k===0.1).length,3);assert.equal(u.filter(k=>k===2).length,3);
  assert.equal(splineBezierSpans(model).length,2);pointNear(jet(splineBezierSpans(model)[0],false)[0],jet(splineBezierSpans(model).at(-1),true)[0]);
  model.knots[0]=100;model.points[0].x=100;assert.deepEqual(input,before);
});
test('repeated periodic models survive current and legacy SVG source reconstruction and detect seam corruption',()=>{
  for(const create of [bSplineCurve,nurbsCurve])for(const legacy of [false,true]){
    let model=create({...input,weights:[1,2,3,4]});
    for(let i=0;i<3;i++){
      const geometry=prepareGeometry(model),path=pathData(geometry),source={version:1,model,...(!legacy?{path}:{})};
      const restored=readSplineSource(JSON.stringify(source),null,path);assert.deepEqual(restored.input.periodicKnots,input.periodicKnots);
      assert.deepEqual(create(restored.input),model);model=create(restored.input);assert.equal(model.points.length,7);
      const corrupt=structuredClone(source);corrupt.model.knots[2]=0.09;
      assert.throws(()=>readSplineSource(JSON.stringify(corrupt),null,path));
    }
  }
});
test('negative weights at repeated periodic knots keep finite separate branches and never close omitted poles',()=>{
  const model=nurbsCurve({points,degree:2,periodic:true,periodicKnots:[0,0,1,1,2,2,3,3,4],weights:[1,-1,1,-1,1,-1,1,-1]});
  const result=sampleSplineBranches(model,{sampleCount:2});assert.equal(result.complete,false);assert.equal(result.closed,false);assert.ok(result.omitted.length>=4);
  assert.ok(result.branches.flatMap(b=>b.points).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  const path=pathData(prepareGeometry(model));assert.ok(!path.endsWith('Z'));assert.equal(path.match(/M/g).length,result.branches.length);
});
