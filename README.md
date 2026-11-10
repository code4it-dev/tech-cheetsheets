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

## Add a cheatsheet

Pages are generated with Claude Code using the project skill in `.claude/skills/tech-cheatsheet/`. From this folder, ask Claude:

```
/tech-cheatsheet postgresql
```

To add or edit a page by hand, start from `.claude/skills/tech-cheatsheet/template.html`, save it as `cheatsheets/<slug>.html`, then rebuild the search index, the home page cards and the "Related pages" sections:

```bash
node scripts/build-index.mjs
```

## Deploy

Every push to `main` runs `.github/workflows/deploy.yml`, which rebuilds the index and publishes the site to GitHub Pages.

One-time setup: in the repository on GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
