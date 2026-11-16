#!/usr/bin/env node
// Generates everything derived from cheatsheets/*.html. No dependencies.
//   - search-index.json         titles, aliases, tags, sections, glossary terms, related pages
//   - index.html                home page cards (between CARDS:START / CARDS:END)
//   - cheatsheets/*.html        "Related pages" section (between RELATED:START / RELATED:END) + TOC link
// Run `node scripts/build-index.mjs` after adding or editing a cheatsheet.
// `--check` exits with code 1 if any generated content is out of date (nothing is written).
//
// Two pages are related when one mentions the other (title or <meta name="aliases">) in its text,
// when one lists the other in <meta name="related">, or when they share tags.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEETS = join(ROOT, 'cheatsheets');
const check = process.argv.includes('--check');
const MAX_RELATED = 6;

const ENT = {
  amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', rarr: '→', larr: '←',
  mdash: '—', ndash: '–', hellip: '…', middot: '·', times: '×', divide: '÷',
  minus: '−', plusmn: '±', approx: '≈', asymp: '≈', micro: 'µ', deg: '°',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  pi: 'π', lambda: 'λ', le: '≤', ge: '≥', ne: '≠',
};
// Decodes the named entities above plus any numeric reference (&#8212; / &#x2014;).
const decodeEnt = s => s.replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) =>
  e[0] === '#'
    ? String.fromCodePoint(parseInt(e[1] === 'x' || e[1] === 'X' ? e.slice(2) : e.slice(1), e[1] === 'x' || e[1] === 'X' ? 16 : 10))
    : ENT[e] ?? m);
const strip = s => decodeEnt(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// Collapse the space before punctuation only when it really ends a word (so " .NET 9" survives).
const tidy = s => strip(s).replace(/\s+([.,;:!?)])(?=\s|$)/g, '$1').replace(/\(\s+/g, '(');
// Must match slugify() in assets/site.js
const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const one = (html, re) => { const m = html.match(re); return m ? tidy(m[1]) : ''; };
const list = (html, name) => one(html, new RegExp(`<meta name="${name}" content="([^"]*)"`)).split(',').map(t => t.trim()).filter(Boolean);

const RELATED_RE = /\n?[ \t]*<!-- RELATED:START[\s\S]*?<!-- RELATED:END -->/;

/* ---------- Code blocks: language tagging + Prism assets ----------
   Authored blocks are plain `<pre><code>`; this adds the language class Prism needs
   and the line-number gutter. Already-tagged blocks carry attributes on <pre>, so the
   regex skips them and re-running is a no-op. To re-detect a block, delete its class. */
const PRISM = '1.29.0';
const PRISM_CDN = `https://cdnjs.cloudflare.com/ajax/libs/prism/${PRISM}`;
const LINE_NUMBER_MIN = 5;   // 1-4 line snippets read better without a gutter

function detectLang(raw) {
  const s = decodeEnt(raw).trim();
  const first = s.split('\n')[0].trim();
  const SHELL = 'curl|docker|docker-compose|kubectl|helm|kind|minikube|az|aws|gcloud|func|dotnet|git|npm|npx|node|wrk2?|k6|ab|psql|mysql|redis-cli|kafka-[\\w.-]+\\.sh|promtool|jq|sed|grep|awk|echo|export|make|cd|ls|open|mkdir|rm|cp|mv|chmod|tar|ssh|scp';

  if (/^<\?xml/.test(first) || (/^</.test(first) && /<\/[a-zA-Z-]+>/.test(s))) return 'markup';
  if (/^\s*\{/m.test(s) && /"[\w-]+"\s*:/.test(s) && !/\b(var|await|public|new)\b/.test(s)) return 'json';
  if (/^FROM\s+\S+/m.test(s)) return 'docker';
  if (/^(local |redis\.call)/m.test(s) || /\bredis\.call\(/.test(s)) return 'lua';
  if (/^(query|mutation|fragment)\s+\w*\s*\{/.test(first)) return 'graphql';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|GRANT)\b/m.test(s)) return 'sql';
  if (/\b(public|private|internal|protected)\s+(static\s+|sealed\s+|async\s+|override\s+|readonly\s+)*(class|record|interface|void|Task|string|int|bool|var|IServiceCollection)\b/.test(s)
      || /\[(Function|HttpTrigger|ActivityTrigger|OrchestrationTrigger|Fact|EntityTrigger|DurableClient)\b/.test(s)) return 'csharp';
  if (/^resource\s+\w+\s+'[\w.@/-]+'\s*=/m.test(s)) return 'bicep';
  if (/^\s*(def|import|from|class)\s+\w/m.test(s) && !/[;{]\s*$/m.test(s)) return 'python';
  if (/\bprint\(f?["']/.test(s)) return 'python';
  if (/\[[^\]]*\bfor\s+\w+\s+in\s+[^\]]*\]/.test(s)) return 'python';
  if (/^\s*(for|if|while|with)\b.*:\s*$/m.test(s) && !/[;{]\s*$/m.test(s)) return 'python';
  if (/;/.test(s) && /(\bawait\b|\bvar\s|=>|\bnew\s*[\w({]|\busing\s+\w|\bpublic\b|\basync\b|\b(builder|services|app)\.[A-Z])/.test(s)) return 'csharp';
  if (new RegExp(`^(\\$|#\\s|${SHELL})\\b`).test(first) || new RegExp(`^\\s*(${SHELL})\\s`, 'm').test(s)) return 'bash';
  if (/^\s*(SET|GET|DEL|INCR|EXPIRE|TTL|ZADD|ZCARD|ZREMRANGEBYSCORE|CONFIG|INFO|EVALSHA|CL\.THROTTLE|PERSIST|DBSIZE)\b/m.test(s)) return 'bash';
  if ((s.match(/^\s*[\w.-]+\s*:(\s|$)/gm) || []).length >= 2 && !/;/.test(s) && !/^\s*</.test(first)
      && !/\b(function|return|await|var)\b/.test(s)) return 'yaml';
  return null;   // formulas, header lines, directory trees, sample output: leave them plain
}

function tagCodeBlocks(html) {
  return html.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/g, (whole, raw) => {
    const lang = detectLang(raw);
    const lines = decodeEnt(raw).replace(/\s+$/, '').split('\n').length;
    const cls = [lang ? `language-${lang}` : 'language-none', lines >= LINE_NUMBER_MIN ? 'line-numbers' : '']
      .filter(Boolean).join(' ');
    return `<pre class="${cls}"><code class="${lang ? `language-${lang}` : 'language-none'}">${raw}</code></pre>`;
  });
}

/* Cache busting. python -m http.server sends no Cache-Control and GitHub Pages caches
   assets for minutes, so a reader who already has the site can get fresh HTML with a
   stale notebook.css or site.js — which looks like the feature simply not working.
   Stamping the content hash into the URL makes every asset change a new URL. */
const LOCAL_ASSETS = ['notebook.css', 'site.js', 'player.js'];
const assetHash = Object.fromEntries(LOCAL_ASSETS.map(name => [
  name,
  createHash('sha1').update(readFileSync(join(ROOT, 'assets', name))).digest('hex').slice(0, 8),
]));

function stampAssets(html) {
  return html.replace(
    /(assets\/(notebook\.css|site\.js|player\.js))(\?v=[a-f0-9]+)?/g,
    (_m, path, name) => `${path}?v=${assetHash[name]}`);
}

function ensurePrismAssets(html) {
  if (html.includes('prism-core.min.js')) return html;
  const tags = `
<link rel="stylesheet" href="${PRISM_CDN}/plugins/line-numbers/prism-line-numbers.min.css">
<script src="${PRISM_CDN}/components/prism-core.min.js" defer></script>
<script src="${PRISM_CDN}/plugins/autoloader/prism-autoloader.min.js" defer></script>
<script src="${PRISM_CDN}/plugins/line-numbers/prism-line-numbers.min.js" defer></script>`;
  return html.replace(/(<script src="\.\.\/assets\/site\.js" defer><\/script>)/, `$1${tags}`);
}

/* ---------- 1. Parse pages ---------- */
const files = readdirSync(SHEETS).filter(f => f.endsWith('.html')).sort();
const pages = files.map(file => {
  const html = readFileSync(join(SHEETS, file), 'utf8');
  const slug = file.replace(/\.html$/, '');
  const title = one(html, /<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!title) throw new Error(`${file}: missing <h1>`);
  const aliases = [...new Set([title, ...list(html, 'aliases')])];

  // Text chunks per section, without code, diagrams, scripts or the generated related block.
  const main = (html.match(/<main>([\s\S]*?)<\/main>/) || [, ''])[1].replace(RELATED_RE, '');
  const chunks = [];
  const re = /<section id="([^"]+)"[^>]*>\s*<h2>([\s\S]*?)<\/h2>([\s\S]*?)<\/section>/g;
  const heroEnd = main.search(/<section /);
  chunks.push({ id: 'overview', title: 'Overview', html: main.slice(0, heroEnd < 0 ? main.length : heroEnd) });
  for (const m of main.matchAll(re)) chunks.push({ id: m[1], title: tidy(m[2]), html: m[3] });
  for (const c of chunks) {
    c.text = strip(c.html.replace(/<(pre|code|svg|script|h1)\b[\s\S]*?<\/\1>/g, ' ').replace(/<p class="tagline"[\s\S]*?<\/p>/, ' '));
  }

  return {
    file, html, slug,
    url: `cheatsheets/${file}`,
    title, aliases,
    tagline: one(html, /class="tagline"[^>]*>([\s\S]*?)<\/p>/),
    asOf: one(html, /class="meta"[^>]*>([\s\S]*?)<\/span>/),
    description: one(html, /<meta name="description" content="([^"]*)"/),
    tags: list(html, 'keywords'),
    explicit: list(html, 'related').map(slugify),
    sections: chunks.filter(c => c.id !== 'overview').map(c => ({ id: c.id, title: c.title })),
    chunks,
    // <div class="term"><b>name</b><span>short definition</span>[<template class="term-detail">deep dive</template>]</div>
    terms: [...html.matchAll(/<div class="term"[^>]*><b>([\s\S]*?)<\/b><span>([\s\S]*?)<\/span>(?:<template class="term-detail"[^>]*>([\s\S]*?)<\/template>)?<\/div>/g)]
      .map(m => ({
        id: 'term-' + slugify(tidy(m[1])), term: tidy(m[1]), def: tidy(m[2]),
        ...(m[3] ? { detail: tidy(m[3].replace(/<(svg|script)\b[\s\S]*?<\/\1>/g, ' ')).slice(0, 1500) } : {}),
      })),
  };
});
const bySlug = new Map(pages.map(p => [p.slug, p]));
for (const p of pages) for (const s of p.explicit) if (!bySlug.has(s)) console.warn(`${p.file}: <meta name="related"> names unknown page "${s}"`);

/* ---------- 2. Mentions and relatedness ---------- */
// mentions(a, b) -> section titles of `a` that mention `b`
function mentions(a, b) {
  const re = new RegExp(`(?<![\\w-])(?:${b.aliases.map(escRe).join('|')})(?![\\w-])`);
  return a.chunks.filter(c => re.test(c.text)).map(c => c.title);
}
const joinNames = xs => xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;

for (const p of pages) {
  p.related = pages
    .filter(q => q !== p)
    .map(q => {
      const out = mentions(p, q), back = mentions(q, p);
      const shared = p.tags.filter(t => q.tags.some(u => u.toLowerCase() === t.toLowerCase()));
      const manual = p.explicit.includes(q.slug) || q.explicit.includes(p.slug);
      const score = (manual ? 10 : 0) + out.length * 3 + back.length * 2 + shared.length;
      const why = [];
      if (out.length) why.push(`Mentioned here in ${joinNames(out)}`);
      if (back.length) why.push(`${q.title} mentions ${p.title} in ${joinNames(back)}`);
      if (shared.length) why.push(`Shared tags: ${shared.join(', ')}`);
      if (!why.length && manual) why.push('Closely related topic');
      return { slug: q.slug, score, why: why.join(' · ') };
    })
    .filter(r => r.score >= 2)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, MAX_RELATED);
}

/* ---------- 3. Generated outputs ---------- */
let stale = false;
const write = (path, content) => {
  let old = '';
  try { old = readFileSync(path, 'utf8'); } catch {}
  if (old === content) return;
  stale = true;
  if (check) console.error(`out of date: ${path}`); else writeFileSync(path, content);
};

// 3a. Related section + TOC link in each page
for (const p of pages) {
  const items = p.related.map(r => {
    const q = bySlug.get(r.slug);
    return `          <a class="related-card" href="${q.file}">
            <b>${esc(q.title)}</b>
            <span>${esc(q.tagline)}</span>
            <small>${esc(r.why)}</small>
          </a>`;
  }).join('\n');
  const block = `
    <!-- RELATED:START (generated by scripts/build-index.mjs, do not edit) -->
    <section id="related">
      <h2>Related pages</h2>
      ${items
        ? `<div class="related-list">\n${items}\n      </div>`
        : `<span class="note">Nothing related on the site yet. New cheatsheets that mention ${esc(p.title)} will show up here.</span>`}
    </section>
    <!-- RELATED:END -->`;
  let html = RELATED_RE.test(p.html) ? p.html.replace(RELATED_RE, block) : p.html.replace(/\n\s*<\/main>/, `${block}\n  </main>`);
  if (!/href="#related"/.test(html)) html = html.replace(/(\n\s*)<\/nav>/, `$1  <a href="#related">Related</a>$1</nav>`);
  html = stampAssets(ensurePrismAssets(tagCodeBlocks(html)));
  write(join(SHEETS, p.file), html);
}

// 3b. Search index
const index = {
  pages: [...pages].sort((a, b) => a.title.localeCompare(b.title)).map(p => ({
    slug: p.slug, url: p.url, title: p.title, aliases: p.aliases, tagline: p.tagline, asOf: p.asOf,
    description: p.description, tags: p.tags, sections: p.sections, terms: p.terms,
    related: p.related.map(r => r.slug),
  })),
};
write(join(ROOT, 'search-index.json'), JSON.stringify(index, null, 2) + '\n');

// 3c. Home page cards
const cards = index.pages.map(p => `      <a class="sheet-card" data-slug="${p.slug}" href="${p.url}">
        <h2><span>${esc(p.title)}</span></h2>
        <p>${esc(p.tagline)}</p>
        <div class="tags">${p.tags.slice(0, 5).map(t => `<span>${esc(t)}</span>`).join('')}</div>
        <span class="asof">${esc(p.asOf)} · ${p.terms.length} terms</span>
      </a>`).join('\n');
const homePath = join(ROOT, 'index.html');
write(homePath, stampAssets(readFileSync(homePath, 'utf8')
  .replace(/(<!-- CARDS:START -->)[\s\S]*?(\s*<!-- CARDS:END -->)/, `$1\n${cards}$2`)));

if (check && stale) { console.error('Run: node scripts/build-index.mjs'); process.exit(1); }
console.log(`${check ? 'Checked' : 'Built'} ${pages.length} cheatsheet(s):`);
for (const p of pages) console.log(`  ${p.title}: ${p.terms.length} terms, related → ${p.related.map(r => r.slug).join(', ') || 'none'}`);
