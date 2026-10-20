# moodpage

A living background for the weather inside.

The page has no text, controls, or content — only an infinite atmosphere of
slow clouds and drifting streams of light. Each day it is reshaped by a short,
diary-like prompt: a mood, a day, a thought. The animation changes; the diary
stays private.

**Current mood:** *Unfinished Gold* — a high, open gold with cool air and a
few trails drifting past.

## Run it

No build step and no dependencies.

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173>. Any static file server works. Opening `index.html`
directly can work in some browsers, but a local server gives the most reliable
WebGL/Canvas behaviour.

## The daily ritual

Send the agent a short entry — how the day felt, what happened, what you
noticed. It becomes a brief, not copy. The agent reads the weather in it and
adjusts the palette, light, cloud cover, tempo, stream density, and orbit.

See [AGENT.md](AGENT.md) for the complete working agreement, the mood field
guide, and the rules for translating a diary entry into an atmosphere.

The site itself remains wordless. The log lives in [`journal/`](journal/); the
words are paraphrased so the public repository never becomes a public diary.

## Structure

```
index.html          full-screen stage
styles.css          layout, CSS fallback, veil and grain
mood.js             the current mood (edited daily)
shader.js           WebGL atmosphere
app.js              renderer, timing, pointer parallax
motes.js            2D layer of light streams and dust
journal/            dated, non-identifying mood logs
AGENT.md            instructions for the next day
```

Under the hood: a single full-screen WebGL shader creates a domain-warped
cloudscape with a focal light. A transparent 2D canvas above it draws long light
trails that curl around that light, plus dust and bokeh. Both layers are
time-based, pause when the tab is hidden, and slow down for
`prefers-reduced-motion`.

## Publishing

The repository is a plain static site rooted at `main`, ready to serve from
GitHub Pages if you enable it (Settings → Pages → Deploy from a branch → `main` /
root). Every push to `main` will then update the page.

After each daily change:

```bash
git add -A
git commit -m "mood: 2026-10-21 — Name of the weather"
git push
```

For reference: the page title and hidden description update from `mood.js`; the
theme colour follows the darkest colour in the palette.

## Privacy

The GitHub repository and the site are public. The journal records the
atmosphere, not the diary. Do not commit identifying details or raw diary text.
See the privacy section in [AGENT.md](AGENT.md).
