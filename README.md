# moodpage

A living background for the weather inside.

The page has no text, buttons, or content — only an infinite atmosphere of slow
clouds and drifting streams of light. Draw into it: drag a finger or pointer and
the surface leaves a soft wake of ripples that bends the clouds and nudges the
light streams; tap to drop a stone and watch the rings spread and fade. Up to
two people can share a room and draw into the same water. Each day it is
reshaped by a short, diary-like prompt: a mood, a day, a thought. The animation
changes; the diary stays private.

**Current mood:** *Unfinished Gold* — a high, open gold with cool air and a
few trails drifting past.

## Run it

No build step and no dependencies for the page itself.

```bash
python3 -m http.server 4173
```

Open <http://localhost:4173>. Any static file server works. Opening `index.html`
directly can work in some browsers, but a local server gives the most reliable
WebGL/Canvas behaviour.

### Two people in one room

The two-person drawing is optional. The static page runs alone unless a room
relay is available. To run the relay locally:

```bash
cd server
npm install
npm start
```

It listens on <http://localhost:8787> (`/health` shows room counts). Open two
tabs at <http://localhost:4173/?room=water>, draw in one, and the other sees the
same water. The local page only reaches for the relay when a room is in the URL,
so a plain local page stays quiet when the relay is not running. A `?ws=` query
parameter (for example `?ws=ws://192.168.1.5:8787`) points the page at a relay on
another host.

For a deployed page, set the `moodpage-ws` meta tag in `index.html` to the
public `wss://` URL of the relay. Visitors without a room are then paired into
rooms of at most two, or they can share a specific room with `?room=yourname`.
GitHub Pages cannot host WebSockets, so the relay needs its own small host (a
VPS or a Node host). If the relay is not configured or not reachable, the page
simply runs solo.

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
interaction.js      water height field, pointer and touch
shader.js           WebGL atmosphere
app.js              renderer, timing, water texture
motes.js            2D layer of light streams and dust
realtime.js         two-person room client
server/             tiny WebSocket relay for the rooms
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
other person in a room, so the water lands in the same relative place on a
different screen. It stores nothing and keeps at most two clients per room.

## Publishing

The repository is a plain static site rooted at `main`, ready to serve from
GitHub Pages if you enable it (Settings → Pages → Deploy from a branch → `main` /
root). Every push to `main` will then update the page.

The room relay is separate from the static site. Deploy `server/` to a Node host
and set the `moodpage-ws` meta tag in `index.html` to its public `wss://` URL;
without that, the published page still works, just solo. GitHub Pages cannot run
the relay itself.

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
