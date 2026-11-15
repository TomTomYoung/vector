import test from 'node:test';
import assert from 'node:assert/strict';
import {bSplineCurve,nurbsCurve} from '../src/model/splineCurves.js';
import {prepareGeometry,createRenderRegistry} from '../src/adapters/renderStrategies.js';
import {pathData} from '../src/adapters/svgGeometry.js';
import {readSplineSource} from '../src/adapters/splineSource.js';
const points=[{x:0,y:0},{x:30,y:90},{x:60,y:0},{x:90,y:30}];
function saved(model,options={},legacy=false){
  const geometry=prepareGeometry(model,'default',options),path=pathData(geometry);
  return {source:{version:1,model,...(!legacy?{path}:{})},record:{version:1,tool:model.weights?'nurbsCurve':'bSplineCurve',
    calculation:{id:'default'},rendering:{id:'default',options},sampling:geometry.sampling},path};
}
const read=s=>readSplineSource(JSON.stringify(s.source),JSON.stringify(s.record),s.path);

test('saved and legacy spline sources recover editable parameters and effective sampling',()=>{
  for(const create of [bSplineCurve,nurbsCurve])for(const legacy of [false,true]){
    const s=saved(create({points,degree:2}),{sampleCount:23,maxDepth:9},legacy),result=read(s);
    assert.deepEqual(result.input.points,points);assert.equal(result.input.degree,2);
    assert.equal(result.input.knots,undefined);assert.equal(result.options.sampleCount,23);assert.equal(result.options.maxDepth,9);
    assert.deepEqual(create(result.input),s.source.model);
  }
});

test('periodic NURBS unwrap controls and weights once across repeated reconstruction',()=>{
  let model=nurbsCurve({points,degree:3,periodic:true,weights:[1,0,2,-1]});
  for(let i=0;i<3;i++){
    const result=read(saved(model));
    assert.equal(result.input.points.length,4);assert.equal(result.input.knots,undefined);
    assert.deepEqual(result.input.weights,[1,0,2,-1]);assert.equal(result.input.periodic,true);
    model=nurbsCurve(result.input);assert.equal(model.points.length,7);assert.equal(model.weights.length,7);
  }
});

test('explicit discontinuous knots remain explicit and missing external implementations are not silently replaced',()=>{
  const s=saved(bSplineCurve({points,degree:1,knots:[0,0,0.5,0.5,1,1]}));
  s.record.calculation.id='external-calc';s.record.rendering.id='external-render';s.record.rendering.options.customDetail=42;
  const result=read(s);
  assert.deepEqual(result.input.knots,[0,0,0.5,0.5,1,1]);
  assert.equal(result.implementation,'external-calc');assert.equal(result.renderer,'external-render');assert.equal(result.options.customDetail,42);
  delete s.source.path;assert.throws(()=>read(s),/旧形式/);
});

test('changed outlines refuse source reconstruction in both saved formats',()=>{
  for(const legacy of [false,true]){
    const s=saved(bSplineCurve({points,degree:2}),{},legacy);s.path+=' L200 200';
    assert.throws(()=>read(s),/形状と生成元/);
  }
});

test('corrupt source models, versions, method records and sampling limits are rejected',()=>{
  const changes=[s=>s.source.version=2,s=>s.source.model.points[0].x=null,s=>s.source.model.knots[2]=999,
    s=>s.source.model.periodic='false',s=>s.record.tool='circle',s=>s.record.sampling.sampleCount=10001,
    s=>s.record.sampling.poleTolerance=0,s=>s.record.sampling.maxDepth=25,s=>s.record.sampling.maxNodes=0];
  for(const change of changes){const s=saved(nurbsCurve({points,degree:2}));change(s);assert.throws(()=>read(s));}
  const s=saved(nurbsCurve({points,degree:3,periodic:true}));s.source.model.weights[6]=2;assert.throws(()=>read(s));
  assert.throws(()=>readSplineSource('{',null,''));
});

test('per-call renderer and parameters leave the next drawing selection and settings intact',()=>{
  const registry=createRenderRegistry(),shape={kind:'bezier',points:points.slice(0,3)};
  registry.select('quadraticBezier','adaptive',{maxDepth:0,sampleCount:7});
  const explicit=registry.prepare('quadraticBezier',shape,{sampleCount:13},'sampled');
  assert.equal(explicit.segments.length,13);
  assert.equal(registry.describe('quadraticBezier').id,'adaptive');
  assert.equal(registry.describe('quadraticBezier').options.sampleCount,7);
  assert.deepEqual(registry.describe('quadraticBezier','sampled').options,{});
  assert.equal(registry.prepare('quadraticBezier',shape).withinTolerance,false);
  assert.throws(()=>registry.prepare('line',shape,{},'adaptive'));
  assert.throws(()=>registry.describe('quadraticBezier','missing'));
});
