# Tech cheatsheets

One-page, animated cheatsheets on backend and infrastructure technologies, in a hand-written "field notebook" style. Each page covers what the technology is, how it works (step-by-step SVG animations), key concepts, commands, pros and cons, use cases, when to use it, common mistakes and alternatives.

- Click any key concept to open a deep-dive panel (common values, related terms, sometimes a diagram or animation).
- Mentions of other cheatsheets become links, and every page ends with generated "Related pages".
- Press `/` anywhere to search pages, sections and concepts.

Live site: https://code4it-dev.github.io/tech-cheetsheets/

## Run locally

The search box loads `search-index.json`, so serve the folder over HTTP:

```bash
python -m http.server 8000
```

Then open http://localhost:8000.

## How the site is built

The site is headless: the page layout lives in one template, the content in HTML-free files.

```
content/<slug>.yaml        the whole page: text, tables, code, animation steps
content/<slug>/*.svg       its diagrams, one file each
templates/page.html        the single page template
scripts/render.mjs         content -> cheatsheets/<slug>.html
scripts/build-index.mjs    search index, home cards, "Related pages", syntax highlighting
cheatsheets/*.html         generated - do not edit
```

```bash
npm ci
npm run build
```

`npm run check` rebuilds and fails if the committed HTML is out of date.

## Add or edit a cheatsheet

Pages are generated with Claude Code using the project skill in `.claude/skills/tech-cheatsheet/`. From this folder, ask Claude:

```
/tech-cheatsheet postgresql
```

By hand: copy `.claude/skills/tech-cheatsheet/template.yaml` to `content/<slug>.yaml`, draw the diagrams into `content/<slug>/`, and run `npm run build`.

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which rebuilds the index and publishes the site to GitHub Pages.

One-time setup: in the repository on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
