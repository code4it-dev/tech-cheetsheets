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
