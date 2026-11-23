---
name: tech-cheatsheet
description: Add or update a page on the Tech cheatsheets website (this repository) — a visual, animated English cheatsheet about a technology, tool or concept (e.g. Kubernetes, Redis, Kafka, DB sharding, OAuth). Use when the user asks for a "cheatsheet", "cheat sheet", "overview page" or "explainer" on a technology, or types /tech-cheatsheet <tech>. Also triggers on Italian requests like "fammi un cheatsheet su X" or "spiegami X in un cheatsheet". Output is always in English.
---

# Tech cheatsheet

Each cheatsheet teaches a technology fast: overview, architecture, **animated** explanation of how it works, glossary, commands, pros/cons, use cases, when (not) to use, gotchas, alternatives, resources.

The site is headless. **You write content, never HTML**: one `content/<slug>.yaml` holding all the text, plus the page's diagrams as `content/<slug>/*.svg`. One template renders every page.

## Repository layout

```
content/<slug>.yaml        the whole page: text, tables, code, animation steps. No HTML.
content/<slug>/*.svg       its diagrams, one file each
templates/page.html        the single page template — the only place page markup lives
scripts/render.mjs         content -> cheatsheets/<slug>.html
scripts/build-index.mjs    search index, home cards, "Related pages", Prism classes, asset hashes
assets/notebook.css        shared "Field notebook" theme
assets/site.js             top bar, search, cross-links, key-concept panel
assets/player.js           createAnimation(): step-by-step SVG animation player
cheatsheets/*.html         generated — never edit by hand
```

Never edit anything in `cheatsheets/`: `npm run build` overwrites it. Never inline CSS or the player into a page.

## Workflow

1. **Identify the subject.** If it is ambiguous (e.g. "Spark" → Apache Spark or Spark Java?), ask once; otherwise go. If `content/<slug>.yaml` already exists, update it instead of creating a new one.
2. **Check freshness.** For fast-moving tech, do one quick web search to confirm the current version and relevant alternatives. Put it in `asof`. Never invent version numbers or URLs; if unsure, omit.
3. **Write the content.** Copy `template.yaml` (this folder) to `content/<slug>.yaml` (slug = lowercase-hyphenated, e.g. `db-sharding`) and fill it in. Read `content/kubernetes.yaml` first if you need an example of the expected depth. Draw each diagram as its own `content/<slug>/*.svg`.
4. **Fill the metadata.** `description`, `aliases` (other names the page is mentioned by — other pages that use one of those words get an automatic link here), `keywords` (5–10 tags feeding search, the home cards and relatedness), and optionally `related` (slugs related even though neither page mentions the other).
5. **Link to the rest of the site.** Mention other cheatsheets by name where it's natural (alternatives, when not to use, use cases): `site.js` turns the first mention per section into a link, and the build adds the page to "Related pages". Check `search-index.json` for existing pages and their aliases.
6. **Build.** `npm run build`. It must render your page and list it with a non-zero term count and its related pages. Commit the generated files so the site works locally.
7. **Check it.** Serve the repo root with `python -m http.server 8000` (search needs HTTP, not `file://`) and open `/cheatsheets/<slug>.html`. Step through every animation to the end, including those inside concept panels, and check that moving elements land on their targets. Click a few key concepts and a related-term chip. Search for one glossary term and confirm the result opens its panel.
8. **Reply** with the content path, the local URL, and a 2-line summary. Do not commit or push unless asked; pushing to `main` deploys the site.

## Writing content, not markup

Every text field is Markdown: `` `code` ``, `**bold**`, `_emphasis_`, `[link](url)`, lists, tables, and ``` fences. The renderer turns these into the house markup. Three rules follow from that:

- **Never write HTML tags** in a content file. The three exceptions, because Markdown cannot express them, are `<sub>`, `<sup>` and `<em>` inside a word.
- **Give every code block a `lang`** (`csharp`, `python`, `bash`, `yaml`, `json`, `sql`, `lua`, `promql`, `markup`, `docker`, `bicep`, `graphql`). Omit it for output, formulas and directory trees. This replaces guessing from the code's shape.
- **A table that marks one row as the subject** (`self: true`) stays structured — see `alternatives` and the optional `table` block in `howItWorks`.

## Sections (fixed order — all required)

1. **`title` / `tagline` / `asof` / `overview`** — name, one handwritten line, "As of …", 2–4 short paragraphs: what problem it solves, how, who uses it / where it fits.
2. **`architecture`** — one inline SVG of the core components and how they relate, plus a one-line caption. Mermaid is not available; use SVG.
3. **`howItWorks`** — an ordered list of blocks. Usually one `note` and 1–2 `anim` blocks animating the core mechanism. A page comparing several approaches may add `heading`, `md` and `table` blocks between them. This is the most important visual; see "Animations".
4. **`concepts`** — 8–18 glossary cards, ordered fundamental → advanced, each with a one- or two-sentence `short` **and a `detail` deep dive**. `see` lists other terms on the page; they become clickable chips.
5. **`commands`** — 10–20 most-used commands or snippets, grouped (e.g. Setup / Everyday / Debug), each with a one-line `what`. **Show code in both C# and Python, C# first** (see "Code examples"). For concepts with no CLI (e.g. sharding), show config or code snippets instead. `heading` and `tocLabel` vary per page: "Essential code patterns" / "Code patterns", "Essential formulas" / "Formulas", and so on.
6. **`prosCons`** — two columns, 4–7 specific bullets each.
7. **`useCases`** — 3–5 real scenarios: who, what problem, how the tech solves it.
8. **`when`** — two columns, with a handwritten `note` rule of thumb above them. Each "avoid" bullet names what to use instead.
9. **`gotchas`** — 5–8 pitfalls, each with why it bites and the fix.
10. **`alternatives`** — comparison table with the subject as the `self: true` row, then one "Pick X if…" line per alternative in `notes`.
11. **`resources`** — 3–6 links: official docs, a good tutorial, a hands-on playground. Only well-known, verified URLs.

## Concept deep dives

Clicking a key-concept card opens a side panel (a bottom sheet on phones) with the term's `detail`. Every term gets one. Write 80–250 words that go beyond the short definition:

- **What it is**, more precisely, and how it works under the hood.
- **Common values** where numbers exist (sizes, defaults, timeouts, typical settings), as a small Markdown table. Example: for Kubernetes `vCPU`, a table of typical CPU requests per workload type.
- **How it relates** to other terms: name them in the text and list them in `see` (exact term names from the same page).
- A short code or config snippet in a fenced block when it helps.
- Use `####` for sub-headings. The panel styles headings, paragraphs, lists, tables and code.

**Pictures and animations in panels**, only when they explain better than words (aim for 1–2 per page). Add a `figure:` or `anim:` to the term and put `::figure::` or `::anim <key>::` on its own line in `detail` to say where it goes. Prefix the SVG's marker and element ids (e.g. `pm-arr`) so they don't clash with the page. Examples: `content/kubernetes.yaml` (vCPU requests filling a node, then throttling at the limit), `content/redis.yaml` (LRU eviction), `content/kafka.yaml` (log compaction).

## Animations

Every cheatsheet must have at least one animation in `howItWorks` that shows **what actually happens** in the core operation: data moving between components, state changing, decisions being taken. The bar to meet:

- **Redis** — `SET user:1 "Ada"`: client → event loop → key hashed → value stored in RAM → appended to AOF → `+OK`. Second animation: cache-aside miss → DB → `SET … EX` → hit → expiry.
- **Kafka** — keyed record → partitioner `murmur2(key) % 3` → leader appends at offset 4 → followers replicate (ISR) → ack. Second: consumer group commit, rebalance when C3 joins, failover when C2 crashes.
- **DB sharding** — keys `user:17`, `user:42`, `user:99` arrive at the router → shard key hashed (`hash(key) % 3 = n`) → each key lands in Shard A / B / C. Then a 4th shard is added and some keys move.
- **Kubernetes** — `kubectl apply` → API server → etcd → scheduler picks a node → kubelet starts the pod → Ready.

### How to build one

Draw the scene in `content/<slug>/<anim-id>.svg` (`viewBox` around 800×300) with an `id` on every element that will change. Prefix ids per animation (`s-`, `c-`, `p-`, `g-`…) because ids must be unique across the page. Elements that appear later get `class="hidden"`. Moving things (messages, keys, packets) should be `<g>` groups so text and shape move together.

Then write the steps as data:

```yaml
- anim:
    id: anim-set
    title: What happens on `SET user:1 "Ada"`
    svg: redis/anim-set.svg
    alt: Animated walk-through of a SET command
    steps:
      - say: The client sends `SET user:1 "Ada"` over TCP.
        show: [ s-msg ]
        hl: [ s-client ]
      - say: The event loop picks the command off the socket, one at a time.
        move: { s-msg: [ 240, 0 ] }
        unhl: [ s-client ]
        hl: [ s-loop ]
      - say: The value is written in RAM.
        move: { s-msg: [ 530, -85 ] }
        fill: { s-slot-2: "#e3eedc" }
        text: { s-slot-2-t: '2 │ user:1 → "Ada"' }
```

Step fields (all optional except `say`): `say` (narration, Markdown), `show` / `hide` (ids), `hl` / `unhl` (red outline), `move` (`{id: [dx, dy]}` translation from the element's original position), `text` (`{id: 'new text'}`), `fill` (`{id: color}`). Steps are cumulative; the player adds Reset / Back / Step / Play and ← → keys.

Rules:
- 5–10 steps per animation; each step changes one thing and its `say` explains **why**, not just what.
- Use real names, keys and values (`user:42`, `orders` topic, `nginx` pod), never "Item A".
- Label every box; keep SVG text ≥ 11px at viewBox scale.
- Compute `move` offsets from the coordinates you drew so moved elements land exactly on their target. Moving labels must not overlap boxes they pass.

## Code examples

**Show both C# and Python, with C# first.** Whenever a concept can be shown in code — in `commands`, in a concept's `detail`, or in an inline snippet — lead with C# and give the Python equivalent alongside it. Readers arrive from both ecosystems, and seeing the same idea twice is what makes it portable rather than framework trivia.

- **C# first**, as the house default. Modern and idiomatic: file-scoped namespaces, records, pattern matching, `async`/`await`, collection expressions. Use the standard library for the job where there is one (Polly, MassTransit, EF Core, `System.Threading.Channels`, `Npgsql`, `StackExchange.Redis`).
- **Python second**, equally idiomatic rather than a transliteration: dataclasses, type hints, context managers, `asyncio`, and the usual client for the technology (`psycopg`, `redis-py`, `confluent-kafka`).
- Group them so the pair is obvious — either two items under one `group`, or a `C#` group followed by a `Python` group.

Judgement, not quota:

- If the two would be near-identical and add nothing (a one-line config value, a trivial call), **one is enough** — do not pad the page.
- Where each language has a genuinely different idiom for the same idea, show both even if it costs space: that contrast is the content.
- A third language appears only when its idiom *is* the point (Go channels and `select`, Java `Resilience4j` config) — keep C# first and say why it is there.
- SQL, YAML, JSON, shell, PromQL and config are not "a language" in this sense; use them freely wherever they are the natural form, with no C#/Python pairing required.
- For a .NET-specific technology (Azure Durable Functions, APIM) C# carries the page, and Python appears only where a client genuinely exists.

## Theme: Field notebook

The user's chosen style, defined in `assets/notebook.css`; never swap it for a generic look and never add a dark mode. Sage ruled paper, forest-green ink, red-pen annotations, yellow highlighter on headings and glossary terms. Fonts: Work Sans (text), Kalam (handwritten notes), Fira Code (code).

- Add 2–4 handwritten red-pen asides per page where they help memory: a `note:` block in `howItWorks`, `when.note`, `gotchas.note` or `commands.note` in content; `<text class="hand" fill="#c53b3b" font-size="16">…</text>` in SVG. Short, personal, one line. Never put essential information only in a note.
- SVG presentation attributes can't use CSS variables, so use these literal colors: paper `#fbfcf8`, page `#eef1e8`, ink `#23362e`, muted `#5f6f66`, box stroke `#a9b5a6`, hairline `#d5dccf`, chip fill `#e8ece2`, red pen `#c53b3b` / soft `#f9e3df` / soft stroke `#e6b3ad`, green `#2f6b3f` / soft `#e3eedc`, highlighter `#f6e05e`, sticky `#fbf3c4` / stroke `#d9c25a`. Mono text in SVG: `font-family="Fira Code, monospace"`.

## Style rules

- English only, even if the request is in Italian.
- Concise: bullets over prose outside the overview; no filler.
- Diagrams and animations only where they explain something — no decorative charts.
- Must work at phone width (the theme already stacks columns; diagrams scroll horizontally inside their box).
- Be accurate: prefer omitting a detail to guessing it.
