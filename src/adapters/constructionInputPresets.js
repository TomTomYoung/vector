export const constructionInputTools = ['bSplineCurve','nurbsCurve','convexHull','triangulatePolygon','delaunayTriangles','voronoiCells','fitLine','fitCircle','minimumEnclosingCircle'];
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const validName = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v) && !['__proto__','prototype','constructor'].includes(v);
const fail = () => {throw new TypeError('作図入力プリセットの形式が不正です。');};
const keys = (value, expected) => {if(!record(value)||Object.keys(value).length!==expected.length||expected.some(k=>!Object.hasOwn(value,k)))fail();};

// Validate stored drafts structurally; incomplete geometry and unfinished text are intentional.
export function parseConstructionInputPresets(value) {
  if(value===undefined)return undefined;
  if(typeof value==='string'){if(value.length>2000000)throw RangeError('作図入力は2000000文字までです。');value=JSON.parse(value);}
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
  check(value);keys(value,['version','entries']);if(value.version!==1||!record(value.entries)||Object.keys(value.entries).length>256)fail();
  for(const [name,entry] of Object.entries(value.entries)){
    if(!validName(name))fail();keys(entry,['version','input']);
    if(!Number.isSafeInteger(entry.version)||entry.version<1||!record(entry.input))fail();
    // Unknown tools/entry versions are retained, never interpreted by the built-in controllers.
    if(entry.version!==1||!constructionInputTools.includes(name))continue;
    const spline=['bSplineCurve','nurbsCurve'].includes(name),input=entry.input;
    keys(input,['points',...(spline?['degree','periodic','knotsText']:[]),...(name==='nurbsCurve'?['weightsText']:[]),...(name==='voronoiCells'?['box']:[])]);
    if(!Array.isArray(input.points)||input.points.length>1000)fail();
    for(const p of input.points){keys(p,['x','y']);if(!Number.isFinite(p.x)||!Number.isFinite(p.y))fail();}
    if(spline&&(!Number.isInteger(input.degree)||input.degree<1||input.degree>12||typeof input.periodic!=='boolean'))fail();
    for(const key of spline?['knotsText',...(name==='nurbsCurve'?['weightsText']:[])]:[])
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
  if(!constructionInputTools.includes(name)||entry?.version!==1)throw Error('この作図入力のツール・版には対応していません。');
  return parseConstructionInputPresets({version:1,entries:{[name]:entry}}).entries[name];
}

export function createConstructionInputPresets() {
  let data;
  const state={message:'作図入力を図面に記録できます。',warning:false};
  const status=(message,warning=false)=>Object.assign(state,{message,warning});
  return {state,
    snapshot:()=>parseConstructionInputPresets(data),
    entry(name){return validName(name)&&Object.hasOwn(data?.entries??{},name)?this.snapshot().entries[name]:undefined;},
    open(value){const next=parseConstructionInputPresets(value);data=next;status(next?'図面の作図入力を読み込みました。各ツールで明示的に復元できます。':'この図面に作図入力の記録はありません。');},
    record(name,controller){
      try{
        if(!validName(name)||typeof controller?.exportInputPreset!=='function')throw Error('このツールは作図入力の記録に対応していません。');
        const entry=controller.exportInputPreset();
        const next=parseConstructionInputPresets({version:1,entries:{...data?.entries,[name]:entry}});
        data=next;status(name+'の作図入力を図面に記録しました。SVG保存で持ち出せます。');return true;
      }catch(error){status('作図入力を記録できません。'+error.message,true);return false;}
    },
    restore(name,controller){
      try{
        const entry=this.entry(name);if(!entry)throw Error('このツールの記録はありません。');
        if(typeof controller?.restoreInputPreset!=='function'||controller.inputPresetVersion!==entry.version)throw Error(name+'の作図入力のツール・版に対応していません。記録は保持しています。');
        controller.restoreInputPreset(entry);
        status(name+'の入力を下書きに復元しました。Enterで図形を確定できます。'+(controller.implementationError?' '+controller.implementationError:''),!!controller.implementationError);return true;
      }catch(error){status('作図入力を復元できません。'+error.message,true);return false;}
    },
    remove(name){
      if(!data||!Object.hasOwn(data.entries,name))return false;
      const next=this.snapshot();delete next.entries[name];data=Object.keys(next.entries).length?next:undefined;
      status(name+'の記録を図面から削除しました。現在の下書きは維持します。');return true;
    },
  };
}
