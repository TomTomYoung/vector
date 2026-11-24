import {createSelectionGeometry} from './selectionGeometry.js';
import {expandBounds, intersectBounds, selectionPixelSize} from '../model/selectionRegion.js';

const svgNS = 'http://www.w3.org/2000/svg';
const xlink = 'http://www.w3.org/1999/xlink';
const hrefOf = el => el.getAttribute('href') ?? el.getAttributeNS(xlink, 'href') ?? '';
const supports = el => el.matches('image, use');

// A viewport-sized, transparent SVG image retains percentage lengths and symbol viewBoxes.
// Its pixel coordinates are mapped back to client coordinates independently of CSS zoom/pan.
function viewportOf(canvas) {
  const style = getComputedStyle(canvas);
  const width = parseFloat(style.width), height = parseFloat(style.height);
  const view = canvas.viewBox.baseVal, aspect = canvas.preserveAspectRatio.baseVal;
  let userToViewport = new DOMMatrix();
  if (view.width && view.height) {
    let sx = width/view.width, sy = height/view.height;
    let dx = 0, dy = 0;
    if (aspect.align !== 1) {
      sx = sy = aspect.meetOrSlice === 2 ? Math.max(sx, sy) : Math.min(sx, sy);
      const alignment = aspect.align - 2;
      dx = (width - view.width*sx)*(alignment % 3)/2;
      dy = (height - view.height*sy)*Math.floor(alignment/3)/2;
    }
    userToViewport = userToViewport.translate(dx, dy).scale(sx, sy).translate(-view.x, -view.y);
  }
  const matrix = canvas.getScreenCTM().multiply(userToViewport.inverse());
  return {width, height, matrix};
}

function localReference(canvas, href) {
  if (!href.startsWith('#')) throw Error('別ファイルの use 参照には対応していません。');
  const id = decodeURIComponent(href.slice(1));
  return id ? canvas.querySelector('#' + CSS.escape(id)) : null;
}

function dataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function embedImage(source, copy, signal) {
  const href = hrefOf(source);
  if (!href) return;
  const url = new URL(href, source.baseURI);
  let embedded = url.href;
  if (url.protocol !== 'data:') {
    const fragment = url.hash;
    url.hash = '';
    const credentials = source.getAttribute('crossorigin') === 'use-credentials' ? 'include' : 'same-origin';
    const response = await fetch(url, {signal, mode:'cors', credentials});
    if (!response.ok) throw Error('HTTP ' + response.status);
    embedded = await dataURL(await response.blob()) + fragment;
  }
  signal?.throwIfAborted();
  // An outer SVG can decode successfully even when one of its images is broken.
  const check = new Image();
  check.src = embedded;
  await check.decode();
  copy.removeAttributeNS(xlink, 'href');
  copy.setAttribute('href', embedded);
}

async function isolatedImage(canvas, element, viewport, signal) {
  signal?.throwIfAborted();
  const root = canvas.cloneNode(false);
  root.removeAttribute('style');
  root.removeAttribute('transform');
  root.setAttribute('width', viewport.width);
  root.setAttribute('height', viewport.height);
  const defs = document.createElementNS(svgNS, 'defs');
  root.append(defs);
  const styles = canvas.querySelectorAll('style');
  for (const style of styles) defs.append(style.cloneNode(true));
  const references = new Set(), images = [];
  function copyNode(source, deep) {
    const copy = source.cloneNode(false);
    for (const attr of ['data-vector-selected','data-vector-highlight','data-vector-selection-candidate']) copy.removeAttribute(attr);
    if (source.localName === 'image') images.push([source, copy]);
    if (source.localName === 'use' && hrefOf(source)) {
      const target = localReference(canvas, hrefOf(source));
      if (target) references.add(target);
    }
    if (deep) for (const child of source.childNodes) {
      copy.append(child.nodeType === Node.ELEMENT_NODE ? copyNode(child, true) : child.cloneNode());
    }
    return copy;
  }
  // Preserve authored group transforms, opacity, inherited paint and nested SVG viewports.
  let branch = copyNode(element, true);
  for (let ancestor = element.parentElement; ancestor !== canvas; ancestor = ancestor.parentElement) {
    const group = copyNode(ancestor, false);
    group.append(branch);
    branch = group;
  }
  root.append(branch);
  // Keep paint servers and clipping resources available without painting artwork siblings.
  for (const resource of canvas.querySelectorAll('defs > :not(style)')) {
    if (!resource.matches('g,symbol,image,use,path,rect,line,circle,ellipse,text,polygon,polyline')) {
      defs.append(resource.cloneNode(true));
    }
  }
  for (const target of references) {
    if (!root.querySelector('#' + CSS.escape(target.id))) defs.append(copyNode(target, true));
  }
  for (const [source, copy] of images) await embedImage(source, copy, signal);
  signal?.throwIfAborted();
  const xml = new XMLSerializer().serializeToString(root);
  const url = URL.createObjectURL(new Blob([xml], {type:'image/svg+xml'}));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    signal?.throwIfAborted();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function paintOverflowsBox(el) {
  const s = getComputedStyle(el);
  return s.filter !== 'none' || s.stroke !== 'none' ||
    [s.markerStart, s.markerMid, s.markerEnd].some(marker => marker !== 'none');
}

function coverageBox(canvas, element) {
  for (let node = element; node !== canvas; node = node.parentElement) {
    if (getComputedStyle(node).filter !== 'none') return canvas.getBoundingClientRect();
  }
  if (element.localName === 'use') {
    const href = hrefOf(element);
    const target = href.startsWith('#') && localReference(canvas, href);
    if (target && (paintOverflowsBox(element) ||
        [target, ...target.querySelectorAll('*')].some(node => node.localName === 'use' || paintOverflowsBox(node)))) {
      // getBBox omits cap/join, marker and filter extents on use instances.
      return canvas.getBoundingClientRect();
    }
  }
  return element.getBoundingClientRect();
}

function describe(canvas, element) {
  const viewport = viewportOf(canvas);
  const box = coverageBox(canvas, element);
  const bounds = expandBounds({x:box.x, y:box.y, width:box.width, height:box.height}, selectionPixelSize);
  let image, loading;
  return {
    bounds, tiles:new Map(),
    prepare(signal) {
      if (image) return;
      loading ??= isolatedImage(canvas, element, viewport, signal).then(result => { image = result; }).catch(error => {
        if (signal?.aborted) throw error;
        throw Error('SVGの選択画像を読み込めませんでした。' + error.message);
      });
      return loading;
    },
    drawTile(ctx, tx, ty, pixel) {
      const m = viewport.matrix;
      ctx.setTransform(m.a/pixel, m.b/pixel, m.c/pixel, m.d/pixel, m.e/pixel-tx, m.f/pixel-ty);
      ctx.drawImage(image, 0, 0, viewport.width, viewport.height);
    },
  };
}

export function createRenderedSelectionGeometry(options) {
  const gestures = new WeakMap();
  let parts;
  const geometry = createSelectionGeometry(options, {supports, describe(el) {
    if (!parts.has(el)) parts.set(el, describe(options.canvas, el));
    return parts.get(el);
  }});
  // Ordinary drawings stay synchronous. Decode only raster parts relevant to the current query.
  function prepared(items, box, contain, request, evaluate) {
    const overlaps = part => {
      const b = intersectBounds(part.bounds, box);
      return b.width > 0 && b.height > 0;
    };
    const candidates = items.filter(item => item.parts.some(overlaps));
    const pending = [];
    for (const item of candidates) for (const part of item.parts) {
      if (part.prepare && (contain || overlaps(part))) {
        const job = part.prepare(request.signal);
        if (job) pending.push(job);
      }
    }
    const ready = candidates.map(item => ({...item, parts:contain ? item.parts : item.parts.filter(overlaps)}));
    if (!pending.length) return evaluate(ready);
    return Promise.all(pending).then(() => {
      request.signal?.throwIfAborted();
      if (request.current && !request.current()) return;
      return evaluate(ready);
    });
  }
  return {
    ...geometry,
    id:'svg-rendered-coverage',
    algorithm:'Canvas Path2Dの被覆と、SVG image・use の描画アルファを0.25 CSS pxで判定。',
    requiresPaintHit:supports,
    snapshot(elements, {signal} = {}) {
      parts = (signal && gestures.get(signal)) || new WeakMap();
      if (signal) gestures.set(signal, parts);
      try { return geometry.snapshot(elements); }
      finally { parts = null; }
    },
    pick(items, point, radius, request = {}) {
      const box = expandBounds({...point, width:0, height:0}, radius + selectionPixelSize);
      return prepared(items, box, false, request, ready => geometry.pick(ready, point, radius));
    },
    query(items, region, match, request = {}) {
      const box = expandBounds(region.bounds, selectionPixelSize);
      return prepared(items, box, match === 'contain' && region.shape !== 'line', request,
        ready => geometry.query(ready, region, match));
    },
  };
}
