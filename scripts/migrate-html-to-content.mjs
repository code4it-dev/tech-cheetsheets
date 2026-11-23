#!/usr/bin/env node
/* One-off migration: cheatsheets/<slug>.html  ->  content/<slug>.yaml + content/<slug>/*.svg
     node scripts/migrate-html-to-content.mjs redis
     node scripts/migrate-html-to-content.mjs --all
   It throws on anything it does not recognise rather than dropping it, so a clean run
   means every element of the page ended up in the content file. Read the result anyway. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import YAML from 'yaml';
import { decode as dec, inline, children, toMarkdown, mdTable } from './lib/html-blocks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function migrate(slug) {
  const html = readFileSync(join(ROOT, 'cheatsheets', `${slug}.html`), 'utf8').replace(/\r\n/g, '\n');
  const outDir = join(ROOT, 'content', slug);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const meta = name => (html.match(new RegExp(`<meta name="${name}" content="([^"]*)"`)) || [, ''])[1];
  const csv = s => s.split(',').map(x => x.trim()).filter(Boolean);

  /* A section runs to the next <section> or to the generated Related block — not to an
     indented </section>, because at least one page indents that tag differently. */
  const section = id => {
    const open = html.search(new RegExp(`<section id="${id}"[^>]*>`));
    if (open < 0) return null;
    const from = html.indexOf('>', open) + 1;
    const rest = html.slice(from);
    const end = rest.search(/<section |<!-- RELATED:START|<\/main>/);
    return rest.slice(0, end < 0 ? rest.length : end).replace(/\s*<\/section>\s*$/, '');
  };
  const heading = body => inline((body.match(/^\s*<h2>([\s\S]*?)<\/h2>/) || [, ''])[1]);
  const bodyOf = id => (section(id) || '').replace(/^\s*<h2>[\s\S]*?<\/h2>/, '');
  const kids = id => children(bodyOf(id));

  /* A section table: a header row, body rows, and possibly one row marked as the subject.
     Markdown tables cannot carry that mark, so these stay structured. */
  const parseTable = t => ({
    columns: [...(t.match(/<thead>([\s\S]*?)<\/thead>/) || [, t])[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
      .map(m => inline(m[1])),
    rows: [...(t.match(/<tbody>([\s\S]*?)<\/tbody>/) || [, t])[1].matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/g)]
      .filter(m => /<td/.test(m[2]))
      .map(m => ({
        ...(/class="self"/.test(m[1]) ? { self: true } : {}),
        cells: [...m[2].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => inline(c[1])),
      })),
  });

  const svgs = [];
  function takeSvg(h, name) {
    const m = h.match(/<svg[\s\S]*?<\/svg>/);
    if (!m) throw new Error(`${slug}: no <svg> for ${name}`);
    const lines = m[0].split('\n');
    const widths = lines.slice(1).filter(l => l.trim()).map(l => l.match(/^ */)[0].length);
    const cut = widths.length ? Math.min(...widths) : 0;
    svgs.push([name, lines.map((l, i) => (i === 0 ? l : l.slice(cut))).join('\n') + '\n']);
    return `${slug}/${name}`;
  }
  const altOf = h => inline((h.match(/aria-label="([^"]*)"/) || [, ''])[1]);

  /* ---------- animation steps, by running the page script ---------- */
  const src = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const got = {};
  const box = { createAnimation: (id, steps, opts) => { got[id] = { steps, opts }; }, window: {}, console };
  runInNewContext(src, box);
  const termAnims = box.window.TERM_ANIMS || {};
  const cleanSteps = steps => (steps || []).map(s => {
    const o = { say: inline(s.say) };
    for (const k of ['show', 'hide', 'hl', 'unhl', 'move', 'text', 'fill']) if (s[k]) o[k] = s[k];
    for (const k of Object.keys(s)) if (!['say', 'show', 'hide', 'hl', 'unhl', 'move', 'text', 'fill'].includes(k))
      throw new Error(`${slug}: animation step uses "${k}", which the content format does not carry`);
    return o;
  });
  const animOf = (el, name) => {
    const key = (el.html.match(/data-steps="([^"]+)"/) || [])[1];
    const id = el.id;
    const a = {
      ...(key ? { key } : { id }),
      title: inline((el.html.match(/<h[34]>([\s\S]*?)<\/h[34]>/) || [, ''])[1]),
      svg: takeSvg(el.html, name),
      alt: altOf(el.html),
      steps: cleanSteps(key ? termAnims[key] : got[id]?.steps),
    };
    if (got[id]?.opts) a.options = got[id].opts;
    if (!a.steps.length) throw new Error(`${slug}: animation "${key || id}" has no steps`);
    return a;
  };

  /* ---------- the page ---------- */
  const doc = {};
  doc.title = inline((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, ''])[1]);
  doc.slug = slug;
  doc.tagline = inline((html.match(/class="tagline"[^>]*>([\s\S]*?)<\/p>/) || [, ''])[1]);
  doc.asof = inline((html.match(/class="meta"[^>]*>([\s\S]*?)<\/span>/) || [, ''])[1]).replace(/^As of\s*/, '');
  doc.description = dec(meta('description'));
  doc.aliases = csv(meta('aliases'));
  doc.keywords = csv(meta('keywords'));
  if (meta('related')) doc.related = csv(meta('related'));

  const hero = (html.match(/<header class="hero"[^>]*>([\s\S]*?)<\/header>/) || [, ''])[1];
  doc.overview = [...hero.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => inline(m[1]));
  const footnote = hero.match(/<p class="meta">([\s\S]*?)<\/p>/);
  if (footnote) doc.footnote = inline(footnote[1]);

  /* architecture */
  {
    const b = bodyOf('architecture');
    doc.architecture = {
      svg: takeSvg(b, 'architecture.svg'),
      alt: altOf(b),
      caption: inline((b.match(/class="caption">([\s\S]*?)<\/p>/) || [, ''])[1]),
    };
  }

  /* how it works: an ordered sequence of blocks, because pages group, caption and
     compare their animations in different ways. */
  {
    const blocks = [];
    let prose = [];
    const flush = () => { if (prose.length) { blocks.push({ md: toMarkdown(prose) }); prose = []; } };
    for (const el of kids('how-it-works')) {
      if (el.tag === 'div' && el.cls?.startsWith('anim')) {
        flush();
        blocks.push({ anim: animOf(el, `${el.id || 'anim'}.svg`) });
      } else if (el.tag === 'div' && el.cls === 'table-wrap') {
        flush();
        blocks.push({ table: parseTable(el.inner) });
      } else if (el.tag === 'h3') {
        flush();
        blocks.push({ heading: inline(el.inner), ...(el.id ? { id: el.id } : {}) });
      } else if (el.tag === 'span' && el.cls?.startsWith('note')) {
        flush();
        blocks.push({ note: inline(el.inner) });
      } else prose.push(el);
    }
    flush();
    doc.howItWorks = blocks;
  }

  /* key concepts */
  doc.concepts = [...bodyOf('concepts').matchAll(
    /<div class="term"[^>]*><b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span>(?:<template class="term-detail"([^>]*)>([\s\S]*?)<\/template>)?<\/div>/g)]
    .map(m => {
      const t = { term: inline(m[1]), short: inline(m[2]) };
      const see = (m[3] || '').match(/data-see="([^"]*)"/);
      if (see) t.see = csv(dec(see[1]));
      if (m[4]) {
        t.detail = toMarkdown(children(m[4]), el => {
          if (el.tag !== 'div') return undefined;
          if (el.cls?.startsWith('anim')) {
            t.anim = animOf(el, `${(el.html.match(/data-steps="([^"]+)"/) || [, el.id])[1]}.svg`);
            return `::anim ${t.anim.key}::`;
          }
          if (el.cls === 'figure') {
            const name = `figure-${t.term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.svg`;
            t.figure = { svg: takeSvg(el.html, name), alt: altOf(el.html) };
            return '::figure::';
          }
          return undefined;
        });
      }
      return t;
    });

  /* commands: the only section whose heading and nav label vary from page to page */
  {
    const body = bodyOf('commands');
    const tops = children(body).filter(el => el.tag === 'p');
    const noteP = tops.find(el => /^<span class="note">/.test(el.inner.trim()));
    const intro = tops.filter(el => el !== noteP);
    doc.commands = {
      heading: heading(section('commands')),
      tocLabel: inline((html.match(/<a href="#commands">([\s\S]*?)<\/a>/) || [, ''])[1]),
      ...(noteP ? { note: inline(noteP.inner) } : {}),
      ...(intro.length ? { intro: toMarkdown(intro) } : {}),
      groups: body.split('<div class="cmd-group">').slice(1).map(g => ({
        group: inline((g.match(/<h3>([\s\S]*?)<\/h3>/) || [, ''])[1]),
        items: [...g.matchAll(/<div class="cmd">(<pre[\s\S]*?<\/pre>)<div class="what">([\s\S]*?)<\/div><\/div>/g)].map(c => {
          const lang = (c[1].match(/<code class="language-([\w-]+)"/) || [, 'none'])[1];
          return {
            ...(lang === 'none' ? {} : { lang }),
            code: dec((c[1].match(/<code[^>]*>([\s\S]*?)<\/code>/) || [, ''])[1]).replace(/\s+$/, ''),
            what: inline(c[2]),
          };
        }),
      })),
    };
  }

  /* two-column sections; a page may carry more than one pair */
  const cols = id => {
    const out = { pairs: [] };
    for (const el of kids(id)) {
      if (el.tag === 'span' && el.cls?.startsWith('note')) { out.note = inline(el.inner); continue; }
      if (el.tag === 'div' && el.cls === 'cols') {
        const pair = {};
        for (const c of children(el.inner)) {
          const kind = c.cls.includes('good') ? 'good' : 'bad';
          pair[kind] = {
            heading: inline((c.inner.match(/<h3>([\s\S]*?)<\/h3>/) || [, ''])[1]),
            items: [...c.inner.matchAll(/<li>([\s\S]*?)<\/li>/g)].map(x => inline(x[1])),
          };
        }
        out.pairs.push(pair);
        continue;
      }
      throw new Error(`${slug}: unexpected <${el.tag} class="${el.cls}"> in #${id}`);
    }
    if (out.pairs.length === 1) { Object.assign(out, out.pairs[0]); delete out.pairs; }
    return out;
  };
  doc.prosCons = cols('pros-cons');
  doc.when = cols('when');

  doc.useCases = [...bodyOf('use-cases').matchAll(/<div class="card"><h3>([\s\S]*?)<\/h3><p>([\s\S]*?)<\/p><\/div>/g)]
    .map(m => ({ title: inline(m[1]), body: inline(m[2]) }));

  /* gotchas */
  {
    const items = [], rest = [];
    let note;
    for (const el of kids('gotchas')) {
      if (el.tag === 'span' && el.cls?.startsWith('note')) { note = inline(el.inner); continue; }
      if (el.tag === 'div' && el.cls === 'gotcha') {
        const m = el.inner.match(/^<b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span><div class="fix">Fix:\s*([\s\S]*?)<\/div>$/);
        if (!m) throw new Error(`${slug}: unrecognised .gotcha`);
        items.push({ mistake: inline(m[1]), why: inline(m[2]), fix: inline(m[3]) });
        continue;
      }
      rest.push(el);
    }
    doc.gotchas = { ...(note ? { note } : {}), items, ...(rest.length ? { extra: toMarkdown(rest) } : {}) };
  }

  /* alternatives */
  {
    const b = bodyOf('alternatives');
    const table = parseTable((b.match(/<div class="table-wrap">([\s\S]*?)<\/div>/) || [, b])[1]);
    if (!table.rows.some(r => r.self)) throw new Error(`${slug}: no <tr class="self"> in the alternatives table`);
    doc.alternatives = {
      ...table,
      notes: [...(b.match(/<ul[^>]*>([\s\S]*?)<\/ul>/) || [, ''])[1].matchAll(/<li>([\s\S]*?)<\/li>/g)]
        .map(m => inline(m[1])),
    };
  }

  doc.resources = [...bodyOf('resources').matchAll(/<li><a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>:\s*([\s\S]*?)<\/li>/g)]
    .map(m => ({ url: m[1], title: inline(m[2]), why: inline(m[3]) }));

  /* ---------- write ---------- */
  for (const [name, body] of svgs) writeFileSync(join(outDir, name), body);
  const ydoc = new YAML.Document(doc);
  YAML.visit(ydoc, { Seq(_, node) {
    if (node.items.every(i => YAML.isScalar(i)) &&
        node.items.reduce((n, i) => n + String(i.value).length + 2, 0) < 72) node.flow = true;
  } });
  writeFileSync(join(ROOT, 'content', `${slug}.yaml`),
    ydoc.toString({ lineWidth: 0, blockQuote: 'literal', singleQuote: false }));

  const anims = doc.howItWorks.filter(b => b.anim).length + doc.concepts.filter(c => c.anim).length;
  return `${slug}: ${doc.concepts.length} concepts, ${anims} animations, ${svgs.length} svg, ` +
         `${doc.commands.groups.reduce((n, g) => n + g.items.length, 0)} commands, ${doc.gotchas.items.length} gotchas`;
}

const arg = process.argv[2];
if (!arg) { console.error('usage: node scripts/migrate-html-to-content.mjs <slug> | --all'); process.exit(1); }
const slugs = arg === '--all'
  ? readdirSync(join(ROOT, 'cheatsheets')).filter(f => f.endsWith('.html')).map(f => f.replace(/\.html$/, ''))
  : [arg];
let failed = 0;
for (const s of slugs) {
  try { console.log('  ' + migrate(s)); }
  catch (e) { failed++; console.error(`  FAIL ${s}: ${e.message}`); }
}
if (slugs.length > 1) console.log(`\n${slugs.length - failed}/${slugs.length} extracted`);
process.exit(failed ? 1 : 0);
