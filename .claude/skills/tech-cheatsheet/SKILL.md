---
name: tech-cheatsheet
description: Add or update a page on the Tech cheatsheets website (this repository) — a visual, animated English cheatsheet about a technology, tool or concept (e.g. Kubernetes, Redis, Kafka, DB sharding, OAuth). Use when the user asks for a "cheatsheet", "cheat sheet", "overview page" or "explainer" on a technology, or types /tech-cheatsheet <tech>. Also triggers on Italian requests like "fammi un cheatsheet su X" or "spiegami X in un cheatsheet". Output is always in English.
---

# Tech cheatsheet

Each cheatsheet is one static HTML page in `cheatsheets/<slug>.html` that teaches a technology fast: overview, architecture, **animated** explanation of how it works, glossary, commands, pros/cons, use cases, when (not) to use, gotchas, alternatives, resources.

## Repository layout

```
index.html                 home page; the card list between CARDS:START/END is generated
search-index.json          generated search index (titles, aliases, tags, sections, terms, related pages)
assets/notebook.css        shared "Field notebook" theme + top bar + concept panel + home styles
assets/site.js             top bar + search, cross-links between pages, key-concept detail panel
assets/player.js           createAnimation(): step-by-step SVG animation player
cheatsheets/*.html         one page per technology (kubernetes.html is the most complete reference)
scripts/build-index.mjs    regenerates search-index.json, the home cards and every page's "Related pages" section
.github/workflows/deploy.yml  builds and deploys to GitHub Pages on every push to main
```

Do not inline CSS or the player into pages: shared look and behavior live in `assets/`. Page-specific tweaks may use a small inline `style` attribute.

## Workflow

1. **Identify the subject.** If it is ambiguous (e.g. "Spark" → Apache Spark or Spark Java?), ask once; otherwise go. If `cheatsheets/<slug>.html` already exists, update it instead of creating a new one.
2. **Check freshness.** For fast-moving tech, do one quick web search to confirm the current version and relevant alternatives. Put "As of <Mon YYYY> · <version>" in the header. Never invent version numbers or URLs; if unsure, omit.
3. **Build the page.** Copy `template.html` (this folder) to `cheatsheets/<slug>.html` (slug = lowercase-hyphenated, e.g. `db-sharding`). Fill every `{{...}}` placeholder, delete what you don't need and repeat what you need. Read `cheatsheets/kubernetes.html` first if you need an example of the expected depth, of concept deep dives and of working animations.
4. **Fill the metadata.**
   - `<title>`, `<meta name="description">`.
   - `<meta name="aliases">`: other names the page is mentioned by (`Kubernetes, K8s, k8s`). Other pages that use one of these words get an automatic link here.
   - `<meta name="related">` (optional): slugs of pages that are related even if neither mentions the other.
   - `<meta name="keywords">`: 5–10 comma-separated tags (category, synonyms, related tech). They feed search, the home cards and relatedness.
5. **Link to the rest of the site.** Mention other cheatsheets by name where it's natural (alternatives, when not to use, use cases): `site.js` turns the first mention per section into a link, and the build adds the page to "Related pages". Check `search-index.json` for existing pages and their aliases.
6. **Rebuild.** Run `node scripts/build-index.mjs`. It must list the new page with a non-zero term count and show its related pages. It also rewrites the "Related pages" section of **every** page (between `RELATED:START/END`; never edit that block by hand). CI runs it too, but commit the generated files so the site works locally.
7. **Check it.** Serve the repo root with `python -m http.server 8000` (search needs HTTP, not `file://`) and open `/cheatsheets/<slug>.html`. Step through every animation to the end, including those inside concept panels, and check that moving elements land on their targets. Click a few key concepts and a related-term chip. Search for one glossary term and confirm the result opens its panel.
8. **Reply** with the page path, the local URL, and a 2-line summary. Do not commit or push unless asked; pushing to `main` deploys the site.

## Sections (fixed order — all required)

1. **Header** — `<h1>` name, `.tagline` (one line, rendered as a handwritten note), `.meta` "As of …", 2–4 short paragraphs: what problem it solves, how, who uses it / where it fits.
2. **Architecture / mental model** — one inline SVG diagram of the core components and how they relate, plus a one-line `.caption`. Mermaid (`<pre class="mermaid">`) is not available on the site; use SVG.
3. **How it works (animated)** — 1–2 step-by-step animations of the core mechanism. This is the most important visual; see "Animations".
4. **Key concepts** — 8–18 glossary cards, ordered fundamental → advanced, each with a one- or two-sentence definition **and a deep dive** (see "Concept deep dives"). Markup: `<div class="term"><b>term</b><span>short definition</span><template class="term-detail" data-see="…">…</template></div>`, with `<b>` and `<span>` on one line. The search index parses it, and `site.js` gives each card an anchor (`#term-<slug>`) that opens its panel.
5. **Essential commands / syntax** — 10–20 most-used commands or snippets, grouped (e.g. Setup / Everyday / Debug), each with a one-line "what it does". Include a Python example when a Python client exists. For concepts with no CLI (e.g. sharding), show config or code snippets instead.
6. **Pros & cons** — two columns, 4–7 specific bullets each.
7. **Concrete use cases** — 3–5 real scenarios: who, what problem, how the tech solves it.
8. **When to use / when not to** — two columns, with a handwritten rule of thumb above them. Each "avoid" bullet names what to use instead.
9. **Common mistakes & gotchas** — 5–8 pitfalls, each with why it bites and the fix.
10. **Alternatives** — comparison table (best for, complexity, cost/license, key difference) with the subject as first row (`class="self"`), then one "Pick X if…" line per alternative.
11. **Resources** — 3–6 links: official docs, a good tutorial, a hands-on playground. Only well-known, verified URLs.

## Concept deep dives

Clicking a key-concept card opens a side panel (a bottom sheet on phones) with the card's `<template class="term-detail">` content. Every term gets one. Write 80–250 words that go beyond the short definition:

- **What it is**, more precisely, and how it works under the hood.
- **Common values** where numbers exist (sizes, defaults, timeouts, typical settings), as a small `<table>`. Example: for Kubernetes `vCPU`, a table of typical CPU requests per workload type.
- **How it relates** to other terms: name them in the text and list them in `data-see="term, other term"` (exact term names from the same page). They become clickable chips that switch the panel.
- A short code or config snippet in `<pre><code>` when it helps.
- Use `<h4>` for sub-headings, `<p>`, `<ul>`, `<table>`, `<pre>` — the panel styles them.

**Pictures and animations in panels**, only when they explain better than words (aim for 1–2 per page):
- Static picture: `<div class="figure"><svg viewBox="0 0 560 190">…</svg></div>`. Prefix marker ids (e.g. `pm-arr`) so they don't clash with the page.
- Animation: `<div class="anim" id="<key>-anim" data-steps="<key>">` with the usual `.stage` / `.controls` / `.narration`, a `viewBox` about 560 wide, and steps in `window.TERM_ANIMS = { <key>: [ … ] }` at the bottom of the page script. Same step format as the main animations; prefix element ids with a letter not used elsewhere on the page. Examples: `kubernetes.html` (vCPU requests filling a node, then throttling at the limit), `redis.html` (LRU eviction), `kafka.html` (log compaction).

## Animations

Every cheatsheet must have at least one animation in "How it works" that shows **what actually happens** in the core operation: data moving between components, state changing, decisions being taken. The bar to meet:

- **Redis** — `SET user:1 "Ada"`: client → event loop → key hashed → value stored in RAM → appended to AOF → `+OK`. Second animation: cache-aside miss → DB → `SET … EX` → hit → expiry.
- **Kafka** — keyed record → partitioner `murmur2(key) % 3` → leader appends at offset 4 → followers replicate (ISR) → ack. Second: consumer group commit, rebalance when C3 joins, failover when C2 crashes.
- **DB sharding** — keys `user:17`, `user:42`, `user:99` arrive at the router → shard key hashed (`hash(key) % 3 = n`) → each key lands in Shard A / B / C. Then a 4th shard is added and some keys move.
- **Kubernetes** — `kubectl apply` → API server → etcd → scheduler picks a node → kubelet starts the pod → Ready.

### How to build one

Use the `.anim` block from the template (one per animation, unique ids). Draw the scene as inline SVG (`viewBox` around 800×300) with an `id` on every element that will change. Prefix ids per animation (`s-`, `c-`, `p-`, `g-`…) because ids must be unique across the page. Elements that appear later get `class="hidden"`. Moving things (messages, keys, packets) should be `<g>` groups so text and shape move together.

Define the steps in the page's last `<script>` (after `../assets/player.js`):

```js
createAnimation('anim-1', [
  { say: 'The client sends <code>SET user:1 "Ada"</code> over TCP.', show: ['s-msg'], hl: ['s-client'] },
  { say: 'The event loop picks the command off the socket, one at a time.', move: { 's-msg': [240, 0] }, unhl: ['s-client'], hl: ['s-loop'] },
  { say: 'The value is written in RAM.', move: { 's-msg': [530, -85] }, fill: { 's-slot-2': '#e3eedc' }, text: { 's-slot-2-t': '2 │ user:1 → "Ada"' } },
]);
```

Step fields (all optional except `say`): `say` (narration, HTML allowed), `show` / `hide` (ids), `hl` / `unhl` (red outline), `move` (`{id: [dx, dy]}` translation from the element's original position), `text` (`{id: 'new text'}`), `fill` (`{id: color}`), `run(svg)` (escape hatch). Steps are cumulative; the player adds Reset / Back / Step / Play and ← → keys.

Rules:
- 5–10 steps per animation; each step changes one thing and its `say` explains **why**, not just what.
- Use real names, keys and values (`user:42`, `orders` topic, `nginx` pod), never "Item A".
- Label every box; keep SVG text ≥ 11px at viewBox scale.
- Compute `move` offsets from the coordinates you drew so moved elements land exactly on their target. Moving labels must not overlap boxes they pass.

## Theme: Field notebook

The user's chosen style, defined in `assets/notebook.css`; never swap it for a generic look and never add a dark mode. Sage ruled paper, forest-green ink, red-pen annotations, yellow highlighter on headings and glossary terms. Fonts: Work Sans (text), Kalam (handwritten notes), Fira Code (code).

- Add 2–4 handwritten red-pen asides per page where they help memory: `<span class="note">…</span>` in HTML, `<text class="hand" fill="#c53b3b" font-size="16">…</text>` in SVG. Short, personal, one line. Never put essential information only in a note.
- SVG presentation attributes can't use CSS variables, so use these literal colors: paper `#fbfcf8`, page `#eef1e8`, ink `#23362e`, muted `#5f6f66`, box stroke `#a9b5a6`, hairline `#d5dccf`, chip fill `#e8ece2`, red pen `#c53b3b` / soft `#f9e3df` / soft stroke `#e6b3ad`, green `#2f6b3f` / soft `#e3eedc`, highlighter `#f6e05e`, sticky `#fbf3c4` / stroke `#d9c25a`. Mono text in SVG: `font-family="Fira Code, monospace"`.

## Style rules

- English only, even if the request is in Italian.
- Concise: bullets over prose outside the header; no filler.
- Diagrams and animations only where they explain something — no decorative charts.
- Must work at phone width (the theme already stacks columns; diagrams scroll horizontally inside their box).
- Be accurate: prefer omitting a detail to guessing it.
