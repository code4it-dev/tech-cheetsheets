/* Site chrome for Tech cheatsheets:
   1. anchors for glossary terms      4. search over search-index.json
   2. sticky top bar + search box     5. key-concept detail panel
   3. cross-links to other cheatsheets
   Every page sets <body data-root=".."> (or "." on the home page) so links work under any base path,
   e.g. https://<org>.github.io/tech-cheetsheets/. */
(function () {
  'use strict';
  const root = (document.body.dataset.root || '.').replace(/\/$/, '');
  const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ---------- 1. Glossary anchors (same slug rule as scripts/build-index.mjs) ---------- */
  const terms = [...document.querySelectorAll('.term')].filter(t => t.querySelector(':scope > b'));
  const termName = t => t.querySelector(':scope > b').textContent.trim();
  terms.forEach(t => { if (!t.id) t.id = 'term-' + slugify(termName(t)); });

  /* ---------- 2. Top bar ---------- */
  const bar = document.createElement('header');
  bar.className = 'topbar';
  bar.innerHTML = `
    <div class="topbar-inner">
      <a class="brand" href="${root}/">Tech <span>cheatsheets</span></a>
      <div class="search" role="search">
        <input id="site-search" type="search" placeholder="Search a technology or a term" autocomplete="off" spellcheck="false"
               aria-label="Search cheatsheets" aria-controls="search-results" aria-expanded="false">
        <kbd>/</kbd>
        <ul id="search-results" class="results" role="listbox" hidden></ul>
      </div>
    </div>`;
  document.body.prepend(bar);

  const input = bar.querySelector('#site-search');
  const list = bar.querySelector('#search-results');
  const cards = [...document.querySelectorAll('.sheet-card[data-slug]')];
  const noMatch = document.querySelector('.no-match');
  let pages = null, active = -1;

  fetch(root + '/search-index.json')
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(data => {
      pages = data.pages;
      linkMentions([document.querySelector('header.hero'), ...document.querySelectorAll('main > section:not(#related)')]);
      if (panel && !panel.hidden) linkMentions([panelBody]);
      if (input.value) update();
    })
    .catch(() => { input.placeholder = 'Search unavailable (open the site through a web server)'; });

  /* ---------- 3. Cross-links ----------
     The first mention of another cheatsheet (title or alias) in each block becomes a link to it.
     Code, diagrams, headings and existing links are left alone. */
  let mention = null;
  function mentionMatcher() {
    if (mention !== null) return mention;
    const norm = u => u.replace(/\.html$/, '').replace(/\/$/, '');
    const here = pages.find(p => norm(location.pathname).endsWith('/' + norm(p.url)));
    const targets = pages.filter(p => p !== here)
      .flatMap(p => (p.aliases && p.aliases.length ? p.aliases : [p.title]).map(a => ({ a, p })))
      .sort((x, y) => y.a.length - x.a.length);          // prefer "Apache Kafka" over "Kafka"
    mention = !here || !targets.length ? false : {
      re: new RegExp('(?<![\\w-])(' + targets.map(t => escRe(t.a)).join('|') + ')(?![\\w-])', 'g'),
      byAlias: new Map(targets.map(t => [t.a, t.p])),
    };
    return mention;
  }
  function linkMentions(blocks) {
    if (!pages) return;
    const m = mentionMatcher();
    if (!m) return;
    const SKIP = 'a, code, pre, svg, h1, h2, h3, h4, nav, button, .tagline, .meta, .term > b, #related, .anim, script, style';
    for (const block of blocks.filter(Boolean)) {
      const linked = new Set();
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
        acceptNode: n => n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      for (let node of nodes) {
        m.re.lastIndex = 0;
        let hit;
        while ((hit = m.re.exec(node.nodeValue))) {
          const page = m.byAlias.get(hit[1]);
          if (linked.has(page.slug)) continue;
          linked.add(page.slug);
          const word = node.splitText(hit.index);
          node = word.splitText(hit[1].length);       // keep scanning the remainder
          const a = document.createElement('a');
          a.className = 'xref';
          a.href = `${root}/${page.url}`;
          a.title = `${page.title}: ${page.tagline}`;
          word.replaceWith(a);
          a.append(word);
          m.re.lastIndex = 0;
        }
      }
    }
  }

  /* ---------- 4. Search ----------
     Every word must appear somewhere in the page; score favours titles, aliases, tags and term names. */
  function search(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length || !pages) return [];
    const has = (text, w) => (text || '').toLowerCase().includes(w);
    const out = [];
    for (const p of pages) {
      const hay = [p.title, (p.aliases || []).join(' '), p.tagline, p.tags.join(' '), p.sections.map(s => s.title).join(' '),
                   p.terms.map(t => `${t.term} ${t.def} ${t.detail || ''}`).join(' ')].join(' ').toLowerCase();
      if (!words.every(w => hay.includes(w))) continue;
      let score = 0;
      for (const w of words) {
        if (has(p.title, w) || (p.aliases || []).some(a => has(a, w))) score += 20;
        if (p.tags.some(t => has(t, w))) score += 6;
        if (has(p.tagline, w)) score += 3;
      }
      const terms = p.terms
        .map(t => ({ t, s: words.reduce((a, w) => a + (has(t.term, w) ? 5 : has(t.def, w) ? 2 : has(t.detail, w) ? 1 : 0), 0),
                     all: words.every(w => has(`${t.term} ${t.def} ${t.detail || ''}`, w)) }))
        .filter(x => x.all && x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 3);
      const sections = p.sections.filter(s => words.some(w => has(s.title, w))).slice(0, 2);
      score += terms.reduce((a, x) => a + x.s, 0);
      out.push({ p, score, terms: terms.map(x => x.t), sections });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  function highlight(text, q) {
    let html = esc(text);
    q.toLowerCase().split(/\s+/).filter(w => w.length > 1).forEach(w => {
      html = html.replace(new RegExp('(' + escRe(w) + ')(?![^<]*>)', 'gi'), '<mark>$1</mark>');
    });
    return html;
  }
  const clip = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;

  function update() {
    const q = input.value.trim();
    const res = search(q);
    active = -1;

    if (cards.length) {
      const keep = new Set(res.map(r => r.p.slug));
      cards.forEach(c => { c.hidden = q !== '' && !keep.has(c.dataset.slug); });
      if (noMatch) { noMatch.hidden = !(q && pages && !res.length); noMatch.textContent = `Nothing about “${q}” yet. Ask Claude for a new cheatsheet!`; }
    }

    if (!q) { closeResults(); return; }
    let html = '';
    if (!pages) html = '<li class="empty">Loading…</li>';
    else if (!res.length) html = `<li class="empty">No cheatsheet mentions “${esc(q)}”.</li>`;
    for (const r of res) {
      const url = `${root}/${r.p.url}`;
      html += `<li role="option"><a class="page" href="${url}"><b>${highlight(r.p.title, q)}</b><span class="sub">${highlight(r.p.tagline, q)}</span></a></li>`;
      for (const s of r.sections)
        html += `<li role="option"><a class="hit" href="${url}#${s.id}">§ ${highlight(s.title, q)}</a></li>`;
      for (const t of r.terms)
        html += `<li role="option"><a class="hit" href="${url}#${t.id}"><code>${highlight(t.term, q)}</code> <span class="sub">${highlight(clip(t.def, 90), q)}</span></a></li>`;
    }
    list.innerHTML = html;
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function closeResults() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; }
  function move(d) {
    const links = [...list.querySelectorAll('a')];
    if (!links.length) return;
    links.forEach(a => a.classList.remove('active'));
    active = (active + d + links.length) % links.length;
    links[active].classList.add('active');
    links[active].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', () => { if (input.value.trim()) update(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      const links = list.querySelectorAll('a');
      const link = links[active >= 0 ? active : 0];
      if (link) { e.preventDefault(); closeResults(); input.blur(); location.href = link.href; }
    } else if (e.key === 'Escape') { input.value = ''; update(); input.blur(); }
  });
  list.addEventListener('mousedown', e => e.preventDefault()); // keep focus while clicking a result
  list.addEventListener('click', () => { closeResults(); input.blur(); });
  input.addEventListener('blur', closeResults);
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
    const cmdK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
    if ((cmdK || (e.key === '/' && !typing)) && (!panel || panel.hidden)) { e.preventDefault(); input.focus(); input.select(); }
  });

  /* ---------- 5. Key-concept panel ----------
     Each .term may contain <template class="term-detail" data-see="other term, another term">…</template>.
     Clicking the card opens it in a side panel (bottom sheet on phones). A .anim[data-steps="key"]
     inside the detail is animated with window.TERM_ANIMS[key] (defined by the page). */
  let panel = null, panelBody = null, backdrop = null, current = null, lastFocus = null;
  const pageTitle = (document.querySelector('main h1') || {}).textContent || '';

  function buildPanel() {
    backdrop = document.createElement('div');
    backdrop.className = 'tp-backdrop';
    backdrop.hidden = true;
    panel = document.createElement('aside');
    panel.className = 'term-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'tp-title');
    panel.innerHTML = `
      <div class="tp-head"><span class="tp-eyebrow">Key concept · ${esc(pageTitle)}</span>
        <button type="button" class="tp-close" aria-label="Close panel">✕</button></div>
      <h2 id="tp-title"></h2>
      <p class="tp-short"></p>
      <div class="tp-body"></div>
      <div class="tp-see"></div>
      <div class="tp-nav"><button type="button" class="tp-prev"></button><button type="button" class="tp-next"></button></div>`;
    document.body.append(backdrop, panel);
    panelBody = panel.querySelector('.tp-body');
    backdrop.addEventListener('click', closePanel);
    panel.querySelector('.tp-close').addEventListener('click', closePanel);
    panel.querySelector('.tp-prev').addEventListener('click', () => step(-1));
    panel.querySelector('.tp-next').addEventListener('click', () => step(1));
    panel.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); closePanel(); }
      if (e.key === 'Tab') {                            // keep focus inside the dialog
        const f = [...panel.querySelectorAll('button, a[href], [tabindex="0"]')].filter(el => el.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  const findTerm = name => terms.find(t => slugify(termName(t)) === slugify(name));
  function step(d) { const i = terms.indexOf(current); openTerm(terms[(i + d + terms.length) % terms.length]); }

  function openTerm(t) {
    if (!panel) buildPanel();
    if (panel.hidden) lastFocus = document.activeElement;
    if (current) current.classList.remove('active');
    current = t;
    t.classList.add('active');

    const tpl = t.querySelector(':scope > template.term-detail');
    panel.querySelector('#tp-title').textContent = termName(t);
    panel.querySelector('.tp-short').innerHTML = t.querySelector(':scope > span').innerHTML;
    panelBody.replaceChildren();
    if (tpl) panelBody.append(tpl.content.cloneNode(true));
    else panelBody.innerHTML = '<p class="note">No deep dive for this term yet.</p>';

    panelBody.querySelectorAll('.anim[data-steps]').forEach(a => {
      const steps = (window.TERM_ANIMS || {})[a.dataset.steps];
      if (steps && typeof window.createAnimation === 'function') window.createAnimation(a.id, steps);
    });

    const see = (tpl?.dataset.see || '').split(',').map(s => s.trim()).filter(Boolean)
      .map(findTerm).filter(x => x && x !== t);
    const seeBox = panel.querySelector('.tp-see');
    seeBox.innerHTML = see.length ? '<h4>Related terms</h4><div class="tp-chips"></div>' : '';
    see.forEach(other => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tp-chip';
      b.textContent = termName(other);
      b.addEventListener('click', () => openTerm(other));
      seeBox.querySelector('.tp-chips').append(b);
    });

    const i = terms.indexOf(t);
    panel.querySelector('.tp-prev').textContent = '← ' + termName(terms[(i - 1 + terms.length) % terms.length]);
    panel.querySelector('.tp-next').textContent = termName(terms[(i + 1) % terms.length]) + ' →';

    linkMentions([panelBody]);
    backdrop.hidden = false;
    panel.hidden = false;
    document.body.classList.add('panel-open');
    panel.scrollTop = 0;
    panel.querySelector('.tp-close').focus({ preventScroll: true });
    history.replaceState(null, '', '#' + t.id);
  }

  function closePanel() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    backdrop.hidden = true;
    document.body.classList.remove('panel-open');
    if (current) current.classList.remove('active');
    history.replaceState(null, '', location.pathname + location.search);
    (lastFocus && document.contains(lastFocus) ? lastFocus : current)?.focus({ preventScroll: true });
    current = null;
  }

  terms.forEach(t => {
    t.tabIndex = 0;
    t.setAttribute('role', 'button');
    t.setAttribute('aria-haspopup', 'dialog');
    t.setAttribute('aria-label', `${termName(t)}: open details`);
    if (t.querySelector(':scope > template.term-detail')) t.classList.add('has-detail');
    t.addEventListener('click', e => { if (!e.target.closest('a')) openTerm(t); });
    t.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTerm(t); } });
  });

  /* ---------- Hash targets: scroll to them, and open the panel for glossary terms ----------
     Term ids are created by this script, after the browser already tried to follow the hash. */
  function jumpToHash() {
    const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!target) return;
    const offset = (bar.offsetHeight || 0) + 16;
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'instant' });
    target.classList.remove('flash'); void target.offsetWidth; target.classList.add('flash');
    if (target.classList.contains('term')) openTerm(target);
  }
  if (location.hash) {
    if (document.readyState === 'complete') requestAnimationFrame(jumpToHash);
    else window.addEventListener('load', jumpToHash, { once: true });
  }
  window.addEventListener('hashchange', () => { closeResults(); jumpToHash(); });
})();
