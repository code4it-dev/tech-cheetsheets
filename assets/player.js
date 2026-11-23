/* Shrink-to-fit for SVG labels.

   SVG <text> does not wrap, clip or ellipsize, and CSS has no text-overflow for it, so a
   label longer than the box it sits in simply spills across the diagram. Step text is
   written by hand and changes length constantly, so this cannot be caught by authoring
   discipline alone.

   Each <text> is mapped once to the smallest <rect> containing its anchor point (the x/y
   attributes, which do not move as the content changes). Whenever the content changes we
   re-measure and reduce font-size until it fits. Authored sizes are never increased, so a
   label that already fits is untouched; the floor is 6.5px.

   Still write labels that fit at their authored size — this is a safety net, not a licence
   for long ones. Run the measurement pass in the browser to find the ones to rewrite. */
function fitSvgText(svg) {
  if (!svg || !svg.getBBox) return;
  let boxes = svg.__fitBoxes;
  if (!boxes) {
    boxes = svg.__fitBoxes = Array.from(svg.querySelectorAll('rect'))
      .map(r => ({ x: +r.getAttribute('x'), y: +r.getAttribute('y'),
                   w: +r.getAttribute('width'), h: +r.getAttribute('height') }))
      .filter(b => b.w > 40 && b.h > 16 && isFinite(b.x) && isFinite(b.y));
  }
  svg.querySelectorAll('text').forEach(t => {
    if (t.style.fontSize) t.style.fontSize = '';          // always measure at the authored size
    if (t.__fitClipped !== undefined && t.textContent === t.__fitClipped) t.textContent = t.__fitFull;
    if (!t.textContent || !t.textContent.trim()) return;

    let bb; try { bb = t.getBBox(); } catch (e) { return; }
    if (!bb.width) return;

    if (t.__fitBox === undefined) {
      const ax = t.x && t.x.baseVal.numberOfItems ? t.x.baseVal.getItem(0).value : bb.x;
      const ay = t.y && t.y.baseVal.numberOfItems ? t.y.baseVal.getItem(0).value : bb.y + bb.height / 2;
      t.__fitBox = boxes.filter(b => ax >= b.x && ax <= b.x + b.w && ay >= b.y && ay <= b.y + b.h)
                        .sort((a, b) => a.w * a.h - b.w * b.h)[0] || null;
      t.__fitAnchor = ax;
    }
    const box = t.__fitBox;
    if (!box) return;                                      // floating caption: nothing to fit to

    const pad = 4, ax = t.__fitAnchor;
    const anchor = getComputedStyle(t).textAnchor;
    const avail = anchor === 'middle'
      ? 2 * Math.min(ax - (box.x + pad), box.x + box.w - pad - ax)
      : anchor === 'end'
        ? ax - (box.x + pad)
        : box.x + box.w - pad - ax;

    if (avail <= 0 || bb.width <= avail) return;

    const size = parseFloat(getComputedStyle(t).fontSize) || 10, FLOOR = 7;
    const scaled = size * (avail / bb.width);
    if (scaled >= FLOOR) { t.style.fontSize = scaled + 'px'; return; }

    // Too long even at the floor: hold the floor and clip, so it is contained either way.
    t.style.fontSize = FLOOR + 'px';
    if (t.getBBox().width <= avail) return;
    const full = t.__fitFull = t.textContent;
    let lo = 0, hi = full.length;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      t.textContent = full.slice(0, mid) + '…';
      if (t.getBBox().width <= avail) lo = mid; else hi = mid - 1;
    }
    t.textContent = t.__fitClipped = full.slice(0, lo) + '…';
  });
}

if (typeof window !== 'undefined') {
  window.fitSvgText = fitSvgText;
  const fitAll = () => document.querySelectorAll('svg').forEach(fitSvgText);
  document.addEventListener('DOMContentLoaded', fitAll);   // architecture diagrams and .figure pictures
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);  // re-measure once webfonts land
}

/* Animation player for cheatsheet pages.
   createAnimation('anim-id', [{ say, show, hide, hl, unhl, move: {id:[dx,dy]}, text: {id:'..'}, fill: {id:'#hex'}, run(svg) }], { delay })
   Steps are cumulative; Reset / Back / Step / Play controls and arrow keys are added automatically. */
function createAnimation(rootId, steps, opts) {
  opts = opts || {};
  const root = document.getElementById(rootId);
  const svg = root.querySelector('svg');
  const narration = root.querySelector('.narration');
  const controls = root.querySelector('.controls');
  const intro = opts.intro || 'Press <b>Step ▶</b> (or Play) to start. Arrow keys work too.';
  const delay = opts.delay || 2600;
  const $ = id => svg.querySelector('#' + CSS.escape(id));

  const initial = new Map();
  svg.querySelectorAll('[id]').forEach(el => initial.set(el, {
    cls: el.getAttribute('class') || '',
    transform: el.style.transform || '',
    fill: el.getAttribute('fill'),
    text: el.tagName === 'text' || el.tagName === 'tspan' ? el.textContent : null,
  }));

  let current = 0, timer = null;

  function restore() {
    initial.forEach((s, el) => {
      el.setAttribute('class', s.cls);
      el.style.transform = s.transform;
      if (s.fill === null) el.removeAttribute('fill'); else el.setAttribute('fill', s.fill);
      if (s.text !== null) el.textContent = s.text;
    });
  }
  function apply(step) {
    (step.show || []).forEach(id => $(id) && $(id).classList.remove('hidden'));
    (step.hide || []).forEach(id => $(id) && $(id).classList.add('hidden'));
    (step.hl || []).forEach(id => $(id) && $(id).classList.add('hl'));
    (step.unhl || []).forEach(id => $(id) && $(id).classList.remove('hl'));
    Object.entries(step.move || {}).forEach(([id, [dx, dy]]) => { if ($(id)) $(id).style.transform = `translate(${dx}px, ${dy}px)`; });
    Object.entries(step.text || {}).forEach(([id, t]) => { if ($(id)) $(id).textContent = t; });
    Object.entries(step.fill || {}).forEach(([id, c]) => { if ($(id)) $(id).setAttribute('fill', c); });
    if (typeof step.run === 'function') step.run(svg);
  }
  function goTo(k, instant) {
    k = Math.max(0, Math.min(steps.length, k));
    if (instant) root.classList.add('instant');
    restore();
    for (let i = 0; i < k - 1; i++) apply(steps[i]);
    if (instant) { void svg.getBoundingClientRect(); root.classList.remove('instant'); }
    if (k > 0) apply(steps[k - 1]);
    current = k;
    fitSvgText(svg);                 // step text is arbitrary length; keep it inside its box
    narration.innerHTML = k === 0 ? intro : `<b>Step ${k}.</b> ${steps[k - 1].say}`;
    counter.textContent = `${k} / ${steps.length}`;
    if (k >= steps.length) stop();
  }
  function stop() { clearInterval(timer); timer = null; playBtn.textContent = '⏵ Play'; }
  function play() {
    if (timer) return stop();
    if (current >= steps.length) goTo(0, true);
    playBtn.textContent = '⏸ Pause';
    goTo(current + 1, true);
    timer = setInterval(() => goTo(current + 1, true), delay);
  }
  const btn = (label, fn, cls) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.onclick = fn; if (cls) b.className = cls; controls.appendChild(b); return b; };
  btn('⟲ Reset', () => { stop(); goTo(0, false); });
  btn('◀ Back', () => { stop(); goTo(current - 1, true); });
  btn('Step ▶', () => { stop(); goTo(current + 1, true); }, 'primary');
  const playBtn = btn('⏵ Play', play);
  const counter = document.createElement('span'); counter.className = 'counter'; controls.appendChild(counter);
  root.tabIndex = 0;
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { stop(); goTo(current + 1, true); e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { stop(); goTo(current - 1, true); e.preventDefault(); }
  });
  goTo(0, true);
}
