#!/usr/bin/env node
/* content/<slug>.yaml + content/<slug>/*.svg + templates/page.html  ->  cheatsheets/<slug>.html
   Run before scripts/build-index.mjs, which adds "Related pages", Prism classes and asset
   hashes. Slugs with no content file are left alone, so hand-written pages still work.
     node scripts/render.mjs            every page that has a content file
     node scripts/render.mjs redis      just one
*/
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { marked } from 'marked';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const TEMPLATE = readFileSync(join(ROOT, 'templates', 'page.html'), 'utf8').replace(/\r\n/g, '\n');
const LINE_NUMBER_MIN = 5;   // keep in step with build-index.mjs
const NOTE_STYLE = ' style="margin:-6px 0 14px"';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* Indents markup without touching the inside of a <pre>, where every space is content. */
function indent(s, n) {
  const pad = ' '.repeat(n);
  let inPre = false;
  return s.split('\n').map(line => {
    const out = inPre || !line.trim() ? line : pad + line;
    const opens = (line.match(/<pre\b/g) || []).length;
    const closes = (line.match(/<\/pre>/g) || []).length;
    if (opens > closes) inPre = true; else if (closes > opens) inPre = false;
    return out;
  }).join('\n');
}

marked.use({ gfm: true, breaks: false });

function codeBlock(code, lang) {
  const body = String(code).replace(/\s+$/, '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const cls = lang || 'none';
  const pre = [`language-${cls}`, body.split('\n').length >= LINE_NUMBER_MIN ? 'line-numbers' : '']
    .filter(Boolean).join(' ');
  return `<pre class="${pre}"><code class="language-${cls}">${body}</code></pre>`;
}

/* House markup: <b> rather than <strong>, and the flat <table><tr><th> shape the theme and
   the search index are written against — no <thead>/<tbody>. */
marked.use({
  renderer: {
    code: ({ text, lang }) => codeBlock(text, lang || 'none'),
    strong({ tokens }) { return `<b>${this.parser.parseInline(tokens)}</b>`; },
    table(token) {
      const row = (cells, tag) =>
        `<tr>${cells.map(c => `<${tag}>${this.parser.parseInline(c.tokens)}</${tag}>`).join('')}</tr>`;
      return `<table>${row(token.header, 'th')}\n${token.rows.map(r => row(r, 'td')).join('\n')}</table>\n`;
    },
  },
});

/* marked escapes quotes everywhere; in text and code they are plain characters.
   Every attribute on this page is built with esc(), never by marked. */
const quotes = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const md = s => quotes(marked.parse(String(s ?? '').trim()).trim());
const mdi = s => quotes(marked.parseInline(String(s ?? '').trim()).trim());
/* In a page section a table is a full <thead>/<tbody> table that scrolls inside its own box;
   in a concept panel it is the flat <table><tr><th> shape. Same Markdown, two house styles. */
const mdSection = s => md(s).replace(/<table>([\s\S]*?)<\/table>/g, (_, rows) => {
  const [head, ...body] = rows.trim().split('\n');
  return `<div class="table-wrap">
  <table>
    <thead>${head}</thead>
    <tbody>
${body.map(r => '      ' + r).join('\n')}
    </tbody>
  </table>
</div>`;
});

/* A structured section table: header row, body rows, one row possibly marked as the subject.
   A Markdown table cannot carry that mark, which is why these stay structured in content. */
const sectionTable = t => `<div class="table-wrap">
  <table>
    <thead><tr>${t.columns.map(c => `<th>${mdi(c)}</th>`).join('')}</tr></thead>
    <tbody>
${t.rows.map(r => `      <tr${r.self ? ' class="self"' : ''}>${r.cells.map(c => `<td>${mdi(c)}</td>`).join('')}</tr>`).join('\n')}
    </tbody>
  </table>
</div>`;

/* ---------- pieces ---------- */
function svgOf(page, ref, alt) {
  const file = join(CONTENT, ref);
  if (!existsSync(file)) throw new Error(`${page.slug}: missing ${ref}`);
  let svg = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
  if (alt && !svg.slice(0, svg.indexOf('>')).includes('aria-label='))
    svg = svg.replace(/^<svg /, `<svg role="img" aria-label="${esc(alt)}" `);
  return svg;
}

function animBlock(page, a, heading) {
  const attrs = a.key ? ` id="${a.key}-anim" data-steps="${a.key}"` : ` id="${a.id}"`;
  return `<div class="anim"${attrs}>
  <${heading}>${mdi(a.title)}</${heading}>
  <div class="stage">
${indent(svgOf(page, a.svg, a.alt), 4)}
  </div>
  <div class="controls"></div>
  <div class="narration"></div>
</div>`;
}

function termBlock(page, t) {
  const see = t.see?.length ? ` data-see="${esc(t.see.join(', '))}"` : '';
  let detail = md(t.detail || '');
  if (t.anim) detail = detail.replace(/<p>::anim [^<]*::<\/p>/, animBlock(page, t.anim, 'h4'));
  if (t.figure) detail = detail.replace(/<p>::figure::<\/p>/,
    `<div class="figure">\n${indent(svgOf(page, t.figure.svg, t.figure.alt), 2)}\n</div>`);
  const head = `<div class="term"><b>${mdi(t.term)}</b><span>${mdi(t.short)}</span>`;
  return t.detail ? `${head}<template class="term-detail"${see}>\n${detail}\n</template></div>` : `${head}</div>`;
}

const colBlock = (c, kind) => `<div class="col ${kind}"><h3>${esc(c.heading)}</h3><ul>
${c.items.map(i => `  <li>${mdi(i)}</li>`).join('\n')}
</ul></div>`;

function twoCols(s) {
  const pairs = s.pairs ?? [{ good: s.good, bad: s.bad }];
  const note = s.note ? `<span class="note"${NOTE_STYLE}>${mdi(s.note)}</span>\n` : '';
  return note + pairs.map(p => `<div class="cols">
${indent(colBlock(p.good, 'good'), 2)}
${indent(colBlock(p.bad, 'bad'), 2)}
</div>`).join('\n');
}

function howItWorks(page) {
  return page.howItWorks.map(b => {
    if (b.anim) return animBlock(page, b.anim, 'h3');
    if (b.table) return sectionTable(b.table);
    if (b.heading) return `<h3${b.id ? ` id="${esc(b.id)}"` : ''}>${mdi(b.heading)}</h3>`;
    if (b.note) return `<span class="note"${NOTE_STYLE}>${mdi(b.note)}</span>`;
    if (b.md) return mdSection(b.md);
    throw new Error(`${page.slug}: howItWorks block has none of anim/heading/note/md`);
  }).join('\n');
}

/* The animation steps are data; this is the only generated JavaScript. */
const stepsJs = steps => steps.map(s => {
  const parts = [`say: ${JSON.stringify(mdi(s.say))}`];
  for (const k of ['show', 'hide', 'hl', 'unhl', 'move', 'text', 'fill']) if (s[k]) parts.push(`${k}: ${JSON.stringify(s[k])}`);
  return `  { ${parts.join(', ')} },`;
}).join('\n');

function pageScript(page) {
  const out = page.howItWorks.filter(b => b.anim).map(({ anim: a }) =>
    `createAnimation('${a.id}', [\n${stepsJs(a.steps)}\n]${a.options ? `, ${JSON.stringify(a.options)}` : ''});`);
  const terms = page.concepts.filter(t => t.anim?.steps?.length);
  if (terms.length) {
    out.push('/* Animations inside key-concept panels */\nwindow.TERM_ANIMS = {\n' +
      terms.map(t => `  ${t.anim.key}: [\n${indent(stepsJs(t.anim.steps), 2)}\n  ],`).join('\n') + '\n};');
  }
  return out.join('\n\n');
}

/* ---------- a page ---------- */
export function render(page) {
  const slots = {
    title: esc(page.title),
    description: esc(page.description),
    aliases: esc((page.aliases || []).join(', ')),
    keywords: esc((page.keywords || []).join(', ')),
    relatedMeta: page.related?.length ? `\n<meta name="related" content="${esc(page.related.join(', '))}">` : '',
    tagline: mdi(page.tagline),
    asof: mdi(page.asof),
    commandsTocLabel: esc(page.commands.tocLabel),
    commandsHeading: esc(page.commands.heading),

    overview: [
      ...page.overview.map(p => `      <p>${mdi(p)}</p>`),
      ...(page.footnote ? [`      <p class="meta">${mdi(page.footnote)}</p>`] : []),
    ].join('\n'),

    architectureSvg: indent(svgOf(page, page.architecture.svg, page.architecture.alt), 8),
    architectureCaption: mdi(page.architecture.caption),

    howItWorks: indent(howItWorks(page), 6),

    concepts: page.concepts.map(t => indent(termBlock(page, t), 8)).join('\n'),

    commands: indent(
      (page.commands.note ? `<p style="margin:0 0 16px"><span class="note">${mdi(page.commands.note)}</span></p>\n` : '') +
      (page.commands.intro ? mdSection(page.commands.intro) + '\n' : '') +
      page.commands.groups.map(g => `<div class="cmd-group">
  <h3>${mdi(g.group)}</h3>
${g.items.map(c => `  <div class="cmd">${codeBlock(c.code, c.lang || 'none')}<div class="what">${mdi(c.what)}</div></div>`).join('\n')}
</div>`).join('\n'), 6),

    prosCons: indent(twoCols(page.prosCons), 6),
    when: indent(twoCols(page.when), 6),

    useCases: page.useCases.map(u =>
      `        <div class="card"><h3>${mdi(u.title)}</h3><p>${mdi(u.body)}</p></div>`).join('\n'),

    gotchas: indent(
      (page.gotchas.note ? `<span class="note"${NOTE_STYLE}>${mdi(page.gotchas.note)}</span>\n` : '') +
      page.gotchas.items.map(g =>
        `<div class="gotcha"><b>${mdi(g.mistake)}</b><span>${mdi(g.why)}</span><div class="fix">Fix: ${mdi(g.fix)}</div></div>`).join('\n') +
      (page.gotchas.extra ? '\n' + mdSection(page.gotchas.extra) : ''), 6),

    alternativesTable: indent(sectionTable(page.alternatives), 6),
    altNotes: page.alternatives.notes.map(n => `        <li>${mdi(n)}</li>`).join('\n'),

    resources: page.resources.map(r =>
      `        <li><a href="${esc(r.url)}" target="_blank" rel="noopener">${mdi(r.title)}</a>: ${mdi(r.why)}</li>`).join('\n'),

    script: pageScript(page),
  };
  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in slots)) throw new Error(`${page.slug}: template slot {{${k}}} has no value`);
    return slots[k];
  });
}

/* ---------- run ---------- */
const only = process.argv[2];
const files = readdirSync(CONTENT).filter(f => f.endsWith('.yaml')).filter(f => !only || f === `${only}.yaml`);
if (!files.length) { console.error(only ? `no content/${only}.yaml` : 'no content/*.yaml'); process.exit(1); }

let failed = 0;
for (const f of files) {
  try {
    const page = YAML.parse(readFileSync(join(CONTENT, f), 'utf8'));
    const out = join(ROOT, 'cheatsheets', `${page.slug}.html`);
    // build-index.mjs owns the Related block; keep it so an intermediate state still renders.
    const old = existsSync(out) ? readFileSync(out, 'utf8').replace(/\r\n/g, '\n') : '';
    const keep = old.match(/\n?[ \t]*<!-- RELATED:START[\s\S]*?<!-- RELATED:END -->/);
    let html = render(page);
    if (keep) html = html.replace(/\n(\s*)<\/main>/, `${keep[0]}\n$1</main>`);
    writeFileSync(out, html);
  } catch (e) { failed++; console.error(`  FAIL ${f}: ${e.message}`); }
}
console.log(`rendered ${files.length - failed}/${files.length} page(s)`);
process.exit(failed ? 1 : 0);
