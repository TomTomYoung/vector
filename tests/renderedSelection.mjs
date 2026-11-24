export async function testRenderedSelection({w, doc, canvas, fixture, selectionSetup, selectionMouse, selectionDrag,
  selectionIDs, check, assert, key, tick, activate}) {
  const tool = w.selectTool;
  const wait = async predicate => {
    const deadline = performance.now() + 4000;
    while (!predicate() && performance.now() < deadline) await tick();
    assert(predicate(), 'timed out waiting for the selection gesture: ' + tool.selectionMessage);
  };
  async function drag(a, b) {
    selectionDrag(a, b);
    await wait(() => !tool.isMarqueeSelecting);
    return selectionIDs();
  }
  const transparentFrame = doc.createElement('canvas');
  transparentFrame.width = transparentFrame.height = 40;
  transparentFrame.getContext('2d').fillRect(10, 10, 20, 20);
  const png = transparentFrame.toDataURL();
  const svg = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect x="10" y="10" width="20" height="20"/></svg>');
  const image = href => '<image id="art" x="100" y="100" width="40" height="40" href="' + href + '"/>';
  async function setup(content, options) {
    fixture(content);
    await tick();
    selectionSetup(options);
  }
  await check('SVG and PNG image selection tests the transparent margin and opaque pixels with all four regions', async () => {
    for (const href of [svg, png]) {
      await setup(image(href));
      assert(await drag([108,108],[132,132]) === 'art', 'contain visible pixels inside transparent margin');
      assert(await drag([105,105],[119,119]) === '', 'contain rejects partial alpha coverage');
      tool.setSelectionOptions({match:'touch'});
      assert(await drag([101,101],[106,106]) === '', 'transparent only');
      assert(await drag([105,105],[119,119]) === 'art', 'partial contact');
      tool.setSelectionOptions({shape:'circle',match:'contain'});
      // A drag starting on paint moves the object. Center the selection on blank canvas.
      assert(await drag([90,120],[140,120]) === 'art', 'circle includes paint');
      tool.setSelectionOptions({shape:'line'});
      assert(await drag([80,121],[145,121]) === 'art', 'line crosses opaque pixels');
      assert(await drag([80,103],[145,103]) === '', 'line crosses only transparent pixels');
      tool.setSelectionOptions({shape:'lasso',match:'contain'});
      selectionMouse('mousedown',108,108);
      selectionMouse('mousemove',132,108);
      selectionMouse('mousemove',132,132);
      selectionMouse('mouseup',108,132);
      await wait(() => !tool.isMarqueeSelecting);
      assert(selectionIDs() === 'art', 'closed lasso at release');
    }
  });
  await check('Symbol viewBox, use instances, group transforms, zoom and referenced geometry updates retain the painted position', async () => {
    await setup('<defs><symbol id="s" viewBox="0 0 40 40"><rect id="ink" x="10" y="10" width="20" height="20"/></symbol></defs>' +
      '<g id="group" transform="translate(160 80) rotate(90)"><use href="#s" x="10" y="10" width="80" height="80"/></g>');
    const transform = canvas.style.transform;
    try {
      canvas.style.transform = 'scale(1.3)';
      assert(await drag([88,108],[132,152]) === 'group', 'symbol instance scaled and rotated');
      doc.querySelector('#ink').setAttribute('width', '4');
      assert(await drag([88,108],[132,121]) === 'group', 'referenced definition edit invalidates alpha');
      tool.setSelectionOptions({match:'touch'});
      assert(await drag([100,140],[120,150]) === '', 'old pixels removed');
    } finally { canvas.style.transform = transform; }
  });
  await check('Transparent native image target passes clicks through and proximity measures client pixels', async () => {
    await setup('<rect id="under" x="100" y="100" width="6" height="6"/>' + image(png));
    const art = doc.querySelector('#art');
    async function click(x, y, target) {
      selectionMouse('mousedown',x,y,{},target);
      selectionMouse('mouseup',x,y,{},target);
      await wait(() => !tool.isMarqueeSelecting);
    }
    await click(103,103,art);
    assert(selectionIDs() === 'under', 'direct hit under transparent image');
    await click(120,120,art);
    assert(selectionIDs() === 'art', 'opaque direct hit at radius zero');
    tool.deselectObject();
    const p = new w.DOMPoint(120,110).matrixTransform(canvas.getScreenCTM());
    const engine = tool.selectionGeometry, items = engine.snapshot([art]);
    assert(await engine.pick(items, {x:p.x, y:p.y-3}, 5) === art, 'near painted edge');
    assert(await engine.pick(items, {x:p.x, y:p.y-7}, 5) === null, 'outside radius');
  });
  await check('Broken external image cancels atomically, then changing href retries without stale alpha', async () => {
    await setup('<rect id="keep" x="20" y="20" width="10" height="10"/>' + image('missing-rendered-selection.png'));
    tool.selectObject(doc.querySelector('#keep'));
    assert(await drag([80,80],[150,150]) === 'keep', 'failed decode preserves previous selection');
    assert(tool.selectionMessage.includes('読み込めません'), 'failed resource is reported');
    doc.querySelector('#art').setAttribute('href',png);
    assert(await drag([80,80],[150,150]) === 'art', 'valid replacement retries');
    assert(!canvas.querySelector('.marquee-selection,[data-vector-selection-candidate]'), 'no stale preview');
  });
  await check('Pending image decode honors Escape, pointer cancellation, tool switches and artwork changes after mouseup', async () => {
    for (const end of ['Escape','pointercancel','tool','edit','remove','zoom','supersede']) {
      await setup('<rect id="keep" x="20" y="20" width="10" height="10"/>' + image('deferred-rendered-selection.png'));
      tool.selectObject(doc.querySelector('#keep'));
      const fetch = w.fetch, transform = canvas.style.transform;
      let resume, signal;
      w.fetch = (url, options) => {
        if (!String(url).endsWith('deferred-rendered-selection.png')) return fetch.call(w,url,options);
        signal = options.signal;
        return new Promise(resolve => {resume = async () => resolve(await fetch.call(w,png));});
      };
      try {
        selectionDrag([80,80],[150,150]);
        await wait(() => !!resume);
        assert(tool.isMarqueeSelecting && selectionIDs() === 'keep', 'commit waits for alpha');
        if (end === 'Escape') key('Escape');
        if (end === 'pointercancel') w.dispatchEvent(new w.Event('pointercancel'));
        if (end === 'tool') activate('line');
        if (end === 'edit') doc.querySelector('#art').setAttribute('x','300');
        if (end === 'remove') doc.querySelector('#art').remove();
        if (end === 'zoom') canvas.style.transform = 'scale(1.2)';
        if (end === 'supersede') selectionDrag([10,10],[35,35]);
        await resume();
        await wait(() => !tool.isMarqueeSelecting);
        assert(signal.aborted && !canvas.querySelector('.marquee-selection,[data-vector-selection-candidate]'), 'released pending resources: '+end);
        assert(!w.selectedObjects.some(el => el.id === 'art'), 'old promise never selects: '+end);
        if (end !== 'tool') assert(selectionIDs() === 'keep', 'previous or newer selection preserved: '+end);
      } finally {w.fetch = fetch; canvas.style.transform = transform;}
    }
  });
  await check('Reading an external image once per gesture uses the mouseup region even if previews complete late', async () => {
    await setup(image('deferred-rendered-selection.png'), {match:'touch'});
    const fetch = w.fetch;
    let resume, requests = 0;
    w.fetch = (url, options) => {
      if (!String(url).endsWith('deferred-rendered-selection.png')) return fetch.call(w,url,options);
      requests++;
      return new Promise(resolve => {resume = async () => resolve(await fetch.call(w,png));});
    };
    try {
      selectionMouse('mousedown',80,80);
      selectionMouse('mousemove',120,120);
      await wait(() => !!resume);
      selectionMouse('mouseup',105,105);
      await resume();
      await wait(() => !tool.isMarqueeSelecting);
      assert(requests === 1 && selectionIDs() === '', 'transparent final region wins over prior opaque preview');
    } finally { w.fetch = fetch; }
  });
}
