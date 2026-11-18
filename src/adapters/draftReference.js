const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validDraftReferenceId=id=>typeof id==='string'&&id.length===36&&uuid.test(id);

// A null value marks an ambiguous ID. A batch of edges shares one canvas scan.
export function indexDraftReferences(canvas,attribute){
  const index=new Map();
  for(const element of canvas.querySelectorAll('['+attribute+']')){
    const id=element.getAttribute(attribute);
    index.set(id,index.has(id)?null:element);
  }
  return index;
}

// The caller commits the new ID only after its preset store has accepted the record.
export function prepareDraftReference(canvas,attribute,element,index=indexDraftReferences(canvas,attribute)){
  const existing=element.getAttribute(attribute),id=existing??crypto.randomUUID();
  if(!validDraftReferenceId(id)||(existing===null?index.has(id):index.get(id)!==element)){
    throw Error('図形の参照IDが不正または重複しています。');
  }
  return {id,commit:existing===null?()=>element.setAttribute(attribute,id):undefined};
}

export function resolveDraftReference(canvas,attribute,id,index=indexDraftReferences(canvas,attribute)){
  const element=index.get(id);
  if(!element)throw Error('記録した図形が図面内に見つからないか、参照IDが重複しています。');
  return element;
}

// Keep the original on-disk attribute so the same outline can be used in all three tools.
const outlineAttribute='data-vector-boundary-draft-id';

export function prepareOutlineReferences(canvas,elements,canUse){
  const index=indexDraftReferences(canvas,outlineAttribute),bindings=[];
  const references=elements.map(element=>{
    if(!canUse(element))throw Error('選んだ線に使用できない図形があります。表示・ロック・形状を確認してください。');
    const {id,commit}=prepareDraftReference(canvas,outlineAttribute,element,index);
    index.set(id,element);
    if(commit)bindings.push(commit);
    return {id,tag:element.localName};
  });
  return {references,commit:()=>bindings.forEach(bind=>bind())};
}

export function resolveOutlineReferences(canvas,references,canUse){
  const index=indexDraftReferences(canvas,outlineAttribute);
  return references.map(({id,tag})=>{
    const element=resolveDraftReference(canvas,outlineAttribute,id,index);
    if(element.localName!==tag||!canUse(element))throw Error('記録した線の種類・形状、表示状態、レイヤーのロックを確認してください。');
    return element;
  });
}
