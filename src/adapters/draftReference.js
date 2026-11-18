const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const validDraftReferenceId=id=>typeof id==='string'&&id.length===36&&uuid.test(id);

function matches(canvas,attribute,id){
  return Array.from(canvas.querySelectorAll('['+attribute+']')).filter(el=>el.getAttribute(attribute)===id);
}

// The caller commits the new ID only after its preset store has accepted the record.
export function prepareDraftReference(canvas,attribute,element){
  const existing=element.getAttribute(attribute),id=existing??crypto.randomUUID();
  const found=matches(canvas,attribute,id);
  if(!validDraftReferenceId(id)|| (existing===null?found.length!==0:found.length!==1||found[0]!==element)){
    throw Error('図形の参照IDが不正または重複しています。');
  }
  return {id,commit:existing===null?()=>element.setAttribute(attribute,id):undefined};
}

export function resolveDraftReference(canvas,attribute,id){
  const found=matches(canvas,attribute,id);
  if(found.length!==1)throw Error('記録した図形が図面内に見つからないか、参照IDが重複しています。');
  return found[0];
}
