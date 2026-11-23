/* Shared by the migration script: HTML entities, inline -> Markdown, and a depth-0
   element scanner. Nothing here is needed to render a page, only to read the old ones. */

export const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', middot: '·', bull: '•',
  times: '×', divide: '÷', minus: '−', plusmn: '±', radic: '√',
  le: '≤', ge: '≥', ne: '≠', asymp: '≈', approx: '≈', deg: '°',
  rarr: '→', larr: '←', harr: '↔', uarr: '↑', darr: '↓',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  euro: '€', pound: '£', yen: '¥', cent: '¢', copy: '©', reg: '®', trade: '™',
  micro: 'µ', mu: 'μ', pi: 'π', lambda: 'λ', rho: 'ρ', sigma: 'σ', Sigma: 'Σ',
  alpha: 'α', beta: 'β', delta: 'δ', Delta: 'Δ', theta: 'θ', infin: '∞', sum: '∑',
  sup1: '¹', sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾',
};

export const decode = s => String(s).replace(/&(#x[0-9a-fA-F]+|#\d+|\w+);/g, (m, e) => {
  if (e[0] !== '#') {
    if (e in ENTITIES) return ENTITIES[e];
    throw new Error(`unknown HTML entity &${e};  — add it to ENTITIES`);
  }
  const hex = e[1] === 'x' || e[1] === 'X';
  return String.fromCodePoint(parseInt(hex ? e.slice(2) : e.slice(1), hex ? 16 : 10));
});

/* Inline HTML -> inline Markdown. <i> and <em> both mean emphasis and both come back as <em>. */
const KEEP_INLINE = new Set(['em', 'sub', 'sup']);

export function inline(s) {
  /* Code spans come out first and go back in last. Their text is data, not markup:
     <code>&lt;base /&gt;</code> must survive as `<base />`, not be mistaken for a tag. */
  const spans = [];
  let out = String(s ?? '').replace(/<code>([\s\S]*?)<\/code>/g, (_, c) => {
    // A code span holding markup (0.99<sup>6</sup>) has no Markdown spelling: keep the tag.
    spans.push(/<[a-zA-Z]/.test(c)
      ? { raw: `<code>${c.replace(/\s+/g, ' ')}</code>` }
      : { code: decode(c).replace(/\s+/g, ' ') });
    return `\u0000${spans.length - 1}\u0000`;
  });
  out = decode(out
    .replace(/<(b|strong)>([\s\S]*?)<\/\1>/g, '**$2**')
    .replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')
    .replace(/<br\s*\/?>/g, ' ')
    .replace(/<(\/?)i>/g, '<$1em>')
    // Markdown has no spelling for <em> inside a word (p<i>q</i>), nor for <sub>/<sup>,
    // so these three survive as tags. Everything else is dropped.
    .replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, close, name) =>
      KEEP_INLINE.has(name.toLowerCase()) ? `<${close}${name.toLowerCase()}>` : ''));
  return out.replace(/\s+/g, ' ').trim()
    // a span holding a backtick needs a longer fence
    .replace(/\u0000(\d+)\u0000/g, (_, i) => {
      const { raw, code } = spans[+i];
      if (raw) return raw;
      const fence = '`'.repeat(Math.max(...[0, ...[...code.matchAll(/`+/g)].map(m => m[0].length)]) + 1);
      return fence + (code.startsWith('`') || code.endsWith('`') ? ` ${code} ` : code) + fence;
    });
}

const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'source', 'use', 'path', 'circle', 'rect', 'line']);

/* The depth-0 elements of a fragment, in order. Comments and whitespace are skipped;
   anything else at depth 0 that is not whitespace is reported as `text`. */
export function children(html) {
  const out = [];
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let depth = 0, start = 0, open = null, m;
  let last = 0;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('<!--')) { if (depth === 0) last = re.lastIndex; continue; }
    const name = m[1].toLowerCase();
    const closing = m[0][1] === '/';
    const selfClosing = m[0].endsWith('/>') || VOID.has(name);
    if (depth === 0 && !closing) {
      const between = html.slice(last, m.index);
      if (between.trim()) out.push({ tag: 'text', html: between.trim() });
      start = m.index; open = name;
      if (selfClosing) { out.push(node(html.slice(start, re.lastIndex), name)); last = re.lastIndex; continue; }
      depth = 1; continue;
    }
    if (depth === 0) continue;                       // stray close tag
    if (!closing) { if (!selfClosing) depth++; continue; }
    depth--;
    if (depth === 0) { out.push(node(html.slice(start, re.lastIndex), open)); last = re.lastIndex; }
  }
  const tail = html.slice(last);
  if (tail.trim()) out.push({ tag: 'text', html: tail.trim() });
  return out;
}

const node = (html, tag) => ({
  tag,
  cls: (html.match(/^<[^>]*\bclass="([^"]*)"/) || [, ''])[1],
  id: (html.match(/^<[^>]*\bid="([^"]*)"/) || [, ''])[1],
  html,
  inner: html.replace(/^<[^>]*>/, '').replace(/<\/[a-zA-Z0-9]+>$/, ''),
});

export function mdTable(t) {
  const rows = [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(r =>
    [...r[1].matchAll(/<(th|td)[^>]*>([\s\S]*?)<\/\1>/g)].map(c => inline(c[2]).replace(/\|/g, '\\|')));
  if (!rows.length) return '';
  const hasHead = /<th[\s>]/.test(t);
  const head = hasHead ? rows[0] : rows[0].map(() => '');
  const body = hasHead ? rows.slice(1) : rows;
  const n = Math.max(...rows.map(r => r.length));
  const pad = r => [...r, ...Array(n - r.length).fill('')];
  return [`| ${pad(head).join(' | ')} |`, `| ${Array(n).fill('---').join(' | ')} |`,
          ...body.map(r => `| ${pad(r).join(' | ')} |`)].join('\n');
}

export function mdCode(pre) {
  const lang = (pre.match(/<code class="language-([\w-]+)"/) || [, 'none'])[1];
  const body = decode((pre.match(/<code[^>]*>([\s\S]*?)<\/code>/) || [, ''])[1]).replace(/\s+$/, '');
  return '```' + (lang === 'none' ? '' : lang) + '\n' + body + '\n```';
}

export function mdList(el) {
  const ordered = el.tag === 'ol';
  return [...el.inner.matchAll(/<li>([\s\S]*?)<\/li>/g)]
    .map((li, i) => `${ordered ? `${i + 1}.` : '-'} ${inline(li[1])}`).join('\n');
}

/* A run of depth-0 elements -> one Markdown string. `special` may claim an element
   (returning a placeholder); anything unhandled throws, so nothing is dropped silently. */
export function toMarkdown(els, special) {
  const parts = [];
  for (const el of els) {
    const claimed = special?.(el);
    if (claimed !== undefined && claimed !== null) { if (claimed !== '') parts.push(claimed); continue; }
    switch (el.tag) {
      case 'p': case 'text': parts.push(inline(el.tag === 'p' ? el.inner : el.html)); break;
      case 'h3': parts.push('### ' + inline(el.inner)); break;
      case 'h4': parts.push('#### ' + inline(el.inner)); break;
      case 'h5': parts.push('##### ' + inline(el.inner)); break;
      case 'ul': case 'ol': parts.push(mdList(el)); break;
      case 'table': parts.push(mdTable(el.html)); break;
      case 'pre': parts.push(mdCode(el.html)); break;
      case 'div':
        if (el.cls === 'table-wrap') { parts.push(mdTable(el.inner)); break; }
        throw new Error(`unhandled <div class="${el.cls}">`);
      default:
        throw new Error(`unhandled <${el.tag} class="${el.cls}">`);
    }
  }
  return parts.filter(s => s !== '').join('\n\n');
}
