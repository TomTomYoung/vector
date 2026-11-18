export const constructionInputTools = ['bSplineCurve','nurbsCurve','convexHull','triangulatePolygon','delaunayTriangles','voronoiCells','fitLine','fitCircle','minimumEnclosingCircle'];
export const constructionDraftTools = ['line','polyline','quadraticBezier','cubicBezier','nthBezier'];
export const constructionShapeTools = ['rectangle','circle','arc','polygon'];
export const constructionParameterFields = {
  spline:[['tension','標準実装の接線倍率',0,4]],
  fillet:[['radius','半径',0.5,1000]],
  chamfer:[['distance1','距離1',0,1000],['distance2','距離2',0,1000]],
  offset:[['offsetDistance','オフセット距離',0.5,1000],['miterLimit','Miter実装の上限比',1,1000]],
};
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const validName = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) && !['__proto__','prototype','constructor'].includes(v);
const fail = () => {throw new TypeError('作図入力プリセットの形式が不正です。');};
const keys = (value, expected) => {if(!record(value)||Object.keys(value).length!==expected.length||expected.some(k=>!Object.hasOwn(value,k)))fail();};
const checkPoints = points => {
  if(!Array.isArray(points)||points.length>1000)fail();
  for(const p of points){keys(p,['x','y']);if(!Number.isFinite(p.x)||!Number.isFinite(p.y))fail();}
};

// Shared bounds for legacy and named input metadata, before JSON copying.
export function validateConstructionInputData(value) {
  let count=0;
  function check(item,depth=0){
    if(depth>12||++count>50000)fail();
    if(item===null||typeof item==='boolean'||typeof item==='string')return;
    if(typeof item==='number'){if(!Number.isFinite(item))fail();return;}
    if(Array.isArray(item)){for(const v of item)check(v,depth+1);return;}
    if(!record(item))fail();
    const proto=Object.getPrototypeOf(item);if(proto&&proto.constructor?.name!=='Object')fail();
    for(const [k,v] of Object.entries(item)){if(['__proto__','prototype','constructor'].includes(k))fail();check(v,depth+1);}
  }
  check(value);
}

// Validate stored drafts structurally; incomplete geometry and unfinished text are intentional.
export function parseConstructionInputPresets(value) {
  if(value===undefined)return undefined;
  if(typeof value==='string'){if(value.length>2000000)throw RangeError('作図入力は2000000文字までです。');value=JSON.parse(value);}
  validateConstructionInputData(value);keys(value,['version','entries']);if(value.version!==1||!record(value.entries)||Object.keys(value.entries).length>256)fail();
  for(const [name,entry] of Object.entries(value.entries)){
    if(!validName(name))fail();keys(entry,['version','input']);
    if(!Number.isSafeInteger(entry.version)||entry.version<1||!record(entry.input))fail();
    if(name==='dimension'&&entry.version===1){
      keys(entry.input,['points','dimensionType']);checkPoints(entry.input.points);
      if(!['linear','angular'].includes(entry.input.dimensionType)||entry.input.points.length>(entry.input.dimensionType==='linear'?2:3))fail();
      continue;
    }
    if(name==='text'&&entry.version===1){
      keys(entry.input,['point','content']);
      if(entry.input.point!==null)checkPoints([entry.input.point]);
      if(typeof entry.input.content!=='string'||entry.input.content.length>20000)fail();
      continue;
    }
    if(constructionShapeTools.includes(name)&&entry.version===1){
      keys(entry.input,['points']);checkPoints(entry.input.points);
      const count=entry.input.points.length;
      if(['rectangle','circle'].includes(name)&&count!==0&&count!==2)fail();
      if(name==='arc'&&count>3)fail();
      continue;
    }
    if((name==='path'&&entry.version===1)||(name==='spline'&&entry.version===2)){
      const input=entry.input;keys(input,['points',name==='path'?'pathMode':'tension']);checkPoints(input.points);
      if(name==='path'&&!['line','bezier'].includes(input.pathMode))fail();
      if(name==='spline'&&(!Number.isFinite(input.tension)||input.tension<0||input.tension>4))fail();
      continue;
    }
    // Unknown tools/entry versions are retained, never interpreted by the built-in controllers.
    const periodicVersion = ['bSplineCurve','nurbsCurve'].includes(name) && entry.version===2;
    const cornerDraft=['fillet','chamfer'].includes(name)&&entry.version===2;
    if(entry.version!==1 && !periodicVersion && !cornerDraft)continue;
    if(constructionDraftTools.includes(name)){
      const input=entry.input;keys(input,['points',...(name==='nthBezier'?['degree']:[])]);
      if(name==='nthBezier'&&(!Number.isInteger(input.degree)||input.degree<2||input.degree>12))fail();
      const max={line:2,polyline:1000,quadraticBezier:3,cubicBezier:4,nthBezier:input.degree+1}[name];
      if(!Array.isArray(input.points)||input.points.length>max||(name==='line'&&input.points.length===1))fail();
      for(const p of input.points){keys(p,['x','y']);if(!Number.isFinite(p.x)||!Number.isFinite(p.y))fail();}
      continue;
    }
    if(Object.hasOwn(constructionParameterFields,name)){
      const fields=constructionParameterFields[name],expected=fields.map(([key])=>key);
      if(cornerDraft){
        expected.push('firstLine');
        const id=entry.input.firstLine;
        if(id!==null && !(typeof id==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)))fail();
      }
      keys(entry.input,expected);
      for(const [key,label,min,max] of fields){const v=entry.input[key];if(!Number.isFinite(v)||v<min||v>max)throw RangeError(label+'は'+min+'〜'+max+'の有限数で指定してください。');}
      continue;
    }
    if(!constructionInputTools.includes(name))continue;
    const spline=['bSplineCurve','nurbsCurve'].includes(name),input=entry.input;
    keys(input,['points',...(spline?['degree','periodic','knotsText']:[]),...(periodicVersion?['periodicKnotsText']:[]),...(name==='nurbsCurve'?['weightsText']:[]),...(name==='voronoiCells'?['box']:[])]);
    if(!Array.isArray(input.points)||input.points.length>1000)fail();
    for(const p of input.points){keys(p,['x','y']);if(!Number.isFinite(p.x)||!Number.isFinite(p.y))fail();}
    if(spline&&(!Number.isInteger(input.degree)||input.degree<1||input.degree>12||typeof input.periodic!=='boolean'))fail();
    for(const key of spline?['knotsText',...(periodicVersion?['periodicKnotsText']:[]),...(name==='nurbsCurve'?['weightsText']:[])]:[])
      if(typeof input[key]!=='string'||input[key].length>20000)fail();
    if(name==='voronoiCells'){
      const b=input.box;keys(b,['x','y','width','height']);
      if(!Object.values(b).every(Number.isFinite)||b.width<=0||b.height<=0||!Number.isFinite(b.x+b.width)||!Number.isFinite(b.y+b.height))fail();
    }
  }
  const text=JSON.stringify(value);if(text.length>2000000)throw RangeError('作図入力は2000000文字までです。');
  return JSON.parse(text);
}

export function parseConstructionInput(name, entry) {
  if(!constructionInputTools.includes(name)||!(entry?.version===1 || (['bSplineCurve','nurbsCurve'].includes(name)&&entry?.version===2)))throw Error('この作図入力のツール・版には対応していません。');
  return parseConstructionInputPresets({version:1,entries:{[name]:entry}}).entries[name];
}

export function parseConstructionDraft(name, entry) {
  if(!constructionDraftTools.includes(name)||entry?.version!==1)throw Error('この線・ベジェ下書きのツール・版には対応していません。');
  return parseConstructionInputPresets({version:1,entries:{[name]:entry}}).entries[name];
}

export function parseCurveDraft(name, entry) {
  if(!((name==='path'&&entry?.version===1)||(name==='spline'&&entry?.version===2)))throw Error('このパス・スプライン下書きのツール・版には対応していません。');
  return parseConstructionInputPresets({version:1,entries:{[name]:entry}}).entries[name];
}

export function parseShapeDraft(name, entry) {
  if(!constructionShapeTools.includes(name)||entry?.version!==1)throw Error('この図形下書きのツール・版には対応していません。');
  return parseConstructionInputPresets({version:1,entries:{[name]:entry}}).entries[name];
}

export function parseAnnotationDraft(name, entry) {
  if(!['dimension','text'].includes(name)||entry?.version!==1)throw Error('この寸法・文字下書きのツール・版には対応していません。');
  return parseConstructionInputPresets({version:1,entries:{[name]:entry}}).entries[name];
}

export function supportsConstructionInput(controller, entry) {
  return !!entry&&typeof controller?.restoreInputPreset==='function'&&
    (controller.inputPresetVersions??[controller.inputPresetVersion]).includes(entry.version);
}

export function constructionInputMode(controller, entry) {
  return controller.inputPresetModeForEntry?.(entry)??controller.inputPresetMode;
}

export function hasConstructionDraft(controller){
  return typeof controller?.prepareInputDraftPreset==='function'||typeof controller?.exportInputDraftPreset==='function';
}

// Bind a new reference to its SVG element only after the entire record is accepted.
export function saveConstructionInput(controller,draft,save){
  if(draft&&controller?.prepareInputDraftPreset){
    const prepared=controller.prepareInputDraftPreset();
    if(!save(prepared.entry))return false;
    prepared.commit?.();
    return true;
  }
  const fn=draft?controller?.exportInputDraftPreset:controller?.exportInputPreset;
  if(typeof fn!=='function')throw Error('このツールは指定した入力の記録に対応していません。');
  return save(fn.call(controller));
}

export function exportConstructionParameters(name, controller) {
  if(!Object.hasOwn(constructionParameterFields,name))throw Error('このツールの作図設定には対応していません。');
  const input=Object.fromEntries(constructionParameterFields[name].map(([key])=>[key,controller[key]]));
  return parseConstructionInputPresets({version:1,entries:{[name]:{version:1,input}}}).entries[name];
}

export function restoreConstructionParameters(name, entry, controller) {
  if(!Object.hasOwn(constructionParameterFields,name)||entry?.version!==1)throw Error('この作図設定のツール・版には対応していません。');
  const checked=parseConstructionInputPresets({version:1,entries:{[name]:entry}}).entries[name];
  if(!controller.isActive)throw Error('復元する作図ツールを先に選択してください。');
  Object.assign(controller,checked.input);
}

export function createConstructionInputPresets() {
  let data;
  const state={message:'作図入力を図面に記録できます。',warning:false};
  const status=(message,warning=false)=>Object.assign(state,{message,warning});
  return {state,
    snapshot:()=>parseConstructionInputPresets(data),
    entry(name){return validName(name)&&Object.hasOwn(data?.entries??{},name)?this.snapshot().entries[name]:undefined;},
    open(value){const next=parseConstructionInputPresets(value);data=next;status(next?'図面の作図入力を読み込みました。各ツールで明示的に復元できます。':'この図面に作図入力の記録はありません。');},
    record(name,controller,{draft=false}={}){
      try{
        if(!validName(name))throw Error('作図ツール名が不正です。');
        return saveConstructionInput(controller,draft,entry=>{
          data=parseConstructionInputPresets({version:1,entries:{...data?.entries,[name]:entry}});
          status(name+'の作図入力を図面に記録しました。SVG保存で持ち出せます。');return true;
        });
      }catch(error){status('作図入力を記録できません。'+error.message,true);return false;}
    },
    restore(name,controller){
      try{
        const entry=this.entry(name);if(!entry)throw Error('このツールの記録はありません。');
        if(!supportsConstructionInput(controller,entry))throw Error(name+'の作図入力のツール・版に対応していません。記録は保持しています。');
        controller.restoreInputPreset(entry);
        const message=constructionInputMode(controller,entry)==='parameters'?'の作図設定を復元しました。入力点と対象の選択は維持します。':'の入力を下書きに復元しました。'+(controller.inputPresetInstructions??'Enterで図形を確定できます。');
        status(name+message+(controller.implementationError?' '+controller.implementationError:''),!!controller.implementationError);return true;
      }catch(error){status('作図入力を復元できません。'+error.message,true);return false;}
    },
    remove(name){
      if(!data||!Object.hasOwn(data.entries,name))return false;
      const next=this.snapshot();delete next.entries[name];data=Object.keys(next.entries).length?next:undefined;
      status(name+'の記録を図面から削除しました。現在の下書きは維持します。');return true;
    },
  };
}
