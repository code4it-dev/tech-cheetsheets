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
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHEETS = join(ROOT, 'cheatsheets');
const check = process.argv.includes('--check');
const MAX_RELATED = 6;

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ', rarr: '→', larr: '←' };
const strip = s => s.replace(/<[^>]+>/g, ' ').replace(/&(#?\w+);/g, (m, e) => ENT[e] ?? m).replace(/\s+/g, ' ').trim();
const tidy = s => strip(s).replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(');
// Must match slugify() in assets/site.js
const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const one = (html, re) => { const m = html.match(re); return m ? tidy(m[1]) : ''; };
const list = (html, name) => one(html, new RegExp(`<meta name="${name}" content="([^"]*)"`)).split(',').map(t => t.trim()).filter(Boolean);

const RELATED_RE = /\n?[ \t]*<!-- RELATED:START[\s\S]*?<!-- RELATED:END -->/;

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
write(homePath, readFileSync(homePath, 'utf8').replace(/(<!-- CARDS:START -->)[\s\S]*?(\s*<!-- CARDS:END -->)/, `$1\n${cards}$2`));

if (check && stale) { console.error('Run: node scripts/build-index.mjs'); process.exit(1); }
console.log(`${check ? 'Checked' : 'Built'} ${pages.length} cheatsheet(s):`);
for (const p of pages) console.log(`  ${p.title}: ${p.terms.length} terms, related → ${p.related.map(r => r.slug).join(', ') || 'none'}`);
