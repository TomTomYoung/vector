import {createElement} from '../utils/svg.js';

// Dimension calculation keeps its existing result contract. This adapter owns the
// standard annotation layout; a registered renderer may replace this descriptor.
export function renderDimension({mode, result}, target = null) {
  const finitePoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
  const fail = () => {throw Error('寸法の計算結果が不正です。');};
  if (!result) fail();
  const children = [];
  const label = (point, content, angular = false) => {
    const text = createElement('text', {x:point.x,y:point.y,fill:'#ff0000','font-size':'14',
      'font-family':'Arial','text-anchor':'middle',...(angular?{'dominant-baseline':'middle'}:{})});
    text.textContent = content;return text;
  };
  if (mode === 'linear') {
    const {start,end,angle,middle,length} = result;
    if (![start,end,middle].every(finitePoint)||!Number.isFinite(angle)||!Number.isFinite(length)||length<0) fail();
    children.push(createElement('line',{x1:start.x,y1:start.y,x2:end.x,y2:end.y,stroke:'#ff0000','stroke-width':'1.5'}));
    for (const [point,direction] of [[start,angle],[end,angle+Math.PI]]) {
      const points = [point,...[Math.PI/6,-Math.PI/6].map(turn=>({x:point.x+8*Math.cos(direction+turn),y:point.y+8*Math.sin(direction+turn)}))];
      children.push(createElement('polygon',{points:points.map(p=>p.x+','+p.y).join(' '),fill:'#ff0000'}));
    }
    children.push(label({x:middle.x,y:middle.y-5},length.toFixed(1)));
  } else if (mode === 'angular') {
    const {vertex,startAngle,endAngle,turn} = result;
    if (!finitePoint(vertex)||![startAngle,endAngle,turn].every(Number.isFinite)||turn<0||turn>=2*Math.PI) fail();
    const at = (angle,radius) => ({x:vertex.x+radius*Math.cos(angle),y:vertex.y+radius*Math.sin(angle)});
    const a=at(startAngle,30),b=at(endAngle,30);
    children.push(createElement('path',{d:`M ${a.x} ${a.y} A 30 30 0 ${Number(turn>Math.PI)} 1 ${b.x} ${b.y}`,stroke:'#ff0000','stroke-width':'1.5',fill:'none'}));
    children.push(label(at(startAngle+turn/2,45),(turn*180/Math.PI).toFixed(1)+'°',true));
  } else fail();
  const group = target?.tagName === 'g' ? target : createElement('g');
  if (target && target!==group) {
    for (const attribute of target.attributes) group.setAttribute(attribute.name,attribute.value);
    target.replaceWith(group);
  }
  group.replaceChildren(...children);
  return group;
}
