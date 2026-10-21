# moodpage

A living background for the weather inside.

The page has no text, buttons, or content — only an infinite atmosphere of slow
clouds and drifting streams of light. Draw into it: drag a finger or pointer and
the surface leaves a soft wake of ripples that bends the clouds and nudges the
light streams; tap to drop a stone and watch the rings spread and fade. Draw
with two or three fingers and each one leaves its own line. Up to
five people can share a room and draw into the same water. The first touch
also wakes a soft, synthesised sound of water and air: lapping, distant drips,
a plop where you tap. Each day it is
reshaped by a short, diary-like prompt: a mood, a day, a thought. The animation
changes; the diary stays private.

**Current mood:** *Drawing Water* — the evening sky held in still, dark water,
alive: soft drifters pulse through it, the water sparks where it is touched,
and the drifters come to see who drew.

## Run it

The page itself has no build step and no dependencies. Two ways:

```bash
# page only, no rooms:
python3 -m http.server 4173
```

```bash
# the page plus the shared rooms, on one local origin:
npm install
npm start
```

The second command serves the site at <http://localhost:8787> together with the
room relay. Opening `index.html` directly can work in some browsers, but a local
server gives the most reliable WebGL/Canvas behaviour.

### Sharing the water

When the page is served by `npm start`, it connects to the relay on its own
origin automatically. Open two tabs at <http://localhost:8787/?room=water>,
draw in one, and the other sees the same water. Visitors without a room are
placed together, filling rooms of up to five; `?room=yourname` meets specific
people in a private room. A `?ws=` query parameter (for example `?ws=ws://192.168.1.5:8787`) points
the page at a relay on another host.

The plain static page (GitHub Pages, `python3 -m http.server`) keeps the
`moodpage-ws` meta tag empty and therefore runs solo: it never tries to connect
and never logs connection errors. On the Node server, `server.js` fills that
meta tag in at runtime with the page's own origin.

### Deploying the relay

The Node app is one process that serves the static site and the rooms on the
same origin. On Coolify (nixpacks), point a service at this repository's root:

- Build pack: Nixpacks (auto-detects the root `package.json`)
- Ports exposes: `8787`
- Health check: `GET /health`
- Domains: the domain you serve the page from

Coolify/Traefik terminates TLS; `server.js` reads `x-forwarded-proto` and serves
the page with `wss://<same domain>` in its meta tag, so the published page talks
to itself. The GitHub Pages mirror of the repository stays a silent, solo copy.

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
styles.css          .moodpage layers, CSS fallback, veil and grain
mood.js             the current mood (edited daily)
shader.js           WebGL atmosphere
interaction.js      water height field, pointer and touch
app.js              sky renderer, timing, water texture
motes.js            2D layer of light streams and dust
realtime.js         shared room client
sound.js            soft, synthesised water-and-air ambience
moodpage.js         MOODPAGE.create(): one moodpage in any element
main.js             the site: today's mood, full screen
examples/           a developer page with two moodpages side by side
server.js           Node app: static site, room relay, /api/mood
translate.js        diary entry → mood, with Claude via OpenRouter (for the app)
mood-schema.js      the mood's fields and ranges; keeps any mood in range
mobile/             the Expo app: a private diary of moodpages
package.json        the relay's only dependency (`ws`)
journal/            dated, non-identifying mood logs
AGENT.md            instructions for the next day
```

Under the hood: a single full-screen WebGL shader creates a domain-warped
cloudscape with a focal light. A transparent 2D canvas above it draws long light
trails that curl around that light, plus dust and bokeh. A small water module
runs a coarse height-field wave equation: a drag leaves a line of drops, a tap
leaves one larger drop, and the surface spreads and fades. The shader bends the
clouds along the surface slope and lights the crests, while the streams ride the
same slope. Everything is time-based, pauses when the tab is hidden, and slows
down for `prefers-reduced-motion`.

The optional room relay forwards the same normalized drops and strokes to the
others in a room, so the water lands in the same relative place on a
different screen. It stores nothing and keeps at most five clients per room.
`server.js` serves the static site and the relay on the same origin and fills
the `moodpage-ws` meta tag at runtime; on any other static host the meta stays
empty and the page runs solo.

## Embedding

The engine is not tied to the page. Load the scripts (everything from
`shader.js` to `moodpage.js`, plus `styles.css`) and give it an element and a
mood:

```js
const page = MOODPAGE.create(element, { mood });
page.setMood(otherMood); // the weather changes in place
page.pause();            // off screen, app in the background
page.destroy();          // frees the WebGL context and the audio
```

A mood is plain data in the shape of `mood.js`, so it can come from JSON. Several
moodpages can share a screen; see [`examples/embed.html`](examples/embed.html)
(served by either command above, at `/examples/embed.html`). The site itself
is one of these, made by `main.js` and kept on `window.moodpage`.

## The app

[`mobile/`](mobile/) is an Expo app built on the same engine: a private diary
where each day becomes weather. The words stay on the phone; the server's
`POST /api/mood` turns an entry into a mood with Claude (through OpenRouter), using this
repository's AGENT.md as its field guide, and keeps nothing. It is off unless
`OPENROUTER_API_KEY` is set, in the environment or a `.env` next to
`server.js` (see `.env.example`; dotfiles are never served) (`MOODPAGE_MODEL` picks another OpenRouter model;
the default is `anthropic/claude-opus-5.5`). See [`mobile/README.md`](mobile/README.md).

## Publishing

The repository is a plain static site rooted at `main`, ready to serve from
GitHub Pages if you enable it (Settings → Pages → Deploy from a branch → `main` /
root). Every push to `main` will then update that mirror. The GitHub Pages copy
runs solo, because its `moodpage-ws` meta tag is empty.

The room relay is part of the Node app in `server.js`. On Coolify, a nixpacks
service on this repository's root serves the site and the rooms together (port
`8787`, health check `GET /health`); `server.js` fills the meta tag with the
page's own `wss://` origin, so no domain is hard-coded in the repository.

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

The room relay is ephemeral: it forwards normalized pointer positions to the
other person in the room and stores nothing. It does not record names, room
history, or drawing content.

The app's `POST /api/mood` holds a diary entry only for the length of the
request: it is sent through OpenRouter to Claude to be translated, never
logged or written
anywhere, and only the resulting mood is returned. Requests are rate-limited
per address; only the counts are kept, for an hour.
