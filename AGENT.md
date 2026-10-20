# AGENT.md — working on moodpage

This repository is a living visual diary. The website is only a full-screen,
infinitely running background animation: no visible text, no navigation, no
controls, no scroll. Each day the human gives you a short, diary-like entry —
how the day felt, what happened, what they noticed. Your job is to read it and
change the weather of the page.

The diary is a prompt, not copy. **Never display the diary entry on the page.**
Translate it into light, colour, weather, density, tempo, and movement.

---

## Non-negotiables

- **The page is the animation.** Do not add headings, captions, buttons, links,
  dates, logos, loading UI, or a visible mood name. The only words live in the
  HTML `<title>`, the hidden accessibility text, the journal, and this repo.
- **Full bleed, no scroll.** `html`, `body`, and `.stage` must always fill the
  viewport. Mobile safe areas are handled by `viewport-fit=cover`.
- **Forever, not a loop.** The animation is time-based and continuous. Avoid
  CSS/JS animations with an obvious restart point.
- **One coherent world.** A day may change the palette and weather, but it must
  still feel like the same place. Keep the atmospheric cloud engine and the
  drifting light streams; bend them, don't replace the site with a new app.
- **No build step and no framework.** Vanilla HTML, CSS, and JS. No npm
  dependencies, external fonts, image libraries, or CDNs.
- **Every visible colour comes from `mood.js`.** The CSS fallback keeps its own
  defaults, but the live page must not contain hard-coded scene colours.
- **Respect reduced motion.** `prefers-reduced-motion` must noticeably slow the
  page (the engines already do this). Do not remove this behaviour.
- **Keep the repo safe.** This GitHub repository is public. See
  [Privacy](#privacy) before writing anything about the human's day.

---

## The daily ritual

### 1. Read the entry twice

First for events, second for temperature. Do not make a literal illustration of
what happened. Look for:

- **temperature** (warm, cold, clammy, bright, dim)
- **weight** (buoyant, heavy, restless, still)
- **tempo** (quick, circling, dragging, suspended)
- **weather** (clear, overcast, stormy, misty, clearing)
- **one quiet detail** (a colour, a sound, a quality of light)

### 2. Name the weather in three words

Examples: *soft, enclosed, clearing* · *bright, restless, open* · *low, grey,
held*. Write these words down; they are your brief.

### 3. Choose the composition

Decide before touching the code:

- **Palette:** five colours — darkest air, shadow, ambient haze, highlight,
  focal light. Pick one dominant temperature and one accent.
- **Light:** where is the emotional centre? Move `lightX` / `lightY`; make it
  larger and softer, or smaller and more exposed. It is a place in the weather,
  not a literal sun icon.
- **Sky:** clear or heavily clouded; smooth or torn; slow or agitated.
- **Streams:** sparse or busy; long memories or quick, nervous trails; circling
  the light or drifting past it.
- **Grade:** is the day bright and open, or low and close?

### 4. Edit `mood.js`

Start with `mood.js`. Most days should be expressible entirely through its
fields. Keep the current title format short and evocative: one or two words.

Update `description` too — it is the hidden, accessible version of the mood and
belongs in the journal.

### 5. Only change the engine when the feeling needs a new gesture

The shader and the particle engine are deliberately small. If a day needs a
texture that cannot be made with the existing fields — for example, rain
becoming the main subject, or two opposing winds — you may extend the engine.
When doing so:

- add a named, documented config field; do not hard-code one day's values
- keep the new feature off at `0` so future days can ignore it
- preserve the existing look when the new field is absent or zero
- test on mobile and with reduced motion
- update the field guide below

### 6. Write the journal entry

Add `journal/YYYY-MM-DD.md` using the [format below](#journal-format). The
journal is an atmospheric log, not a confessional. Paraphrase; do not commit
identifying details or raw private text.

### 7. Verify, commit, push

Run the [checklist](#before-you-push). Then commit and push to `main`:

```bash
git add -A
git commit -m "mood: 2026-10-21 — Name of the weather"
git push
```

The site is published from this repo, so a successful push is the end of the
day's ritual.

If the human sends a second entry on the same day, evolve the same mood rather
than creating a separate page. Append an `## Addendum` section to the day's
journal entry with the new prompt's paraphrase and the changes.

---

## Translating a diary entry

Use this table as a starting point, not a recipe. Combine at most two or three
qualities in one day.

| The entry feels… | Sky | Light | Streams | Palette / grade |
| --- | --- | --- | --- | --- |
| heavy, grey, shut in | high cloud cover, low ceiling, slow tear | small, diffuse, low intensity | fewer, short trails, slow orbit | slate, umber, desaturated; low exposure |
| anxious, racing | torn clouds, faster turbulence | exposed, bright, slightly cold | many fast streams, tighter orbit, shorter trails | cold cyan + a warning-warm accent; higher contrast |
| soft, safe, at home | medium clouds, soft edges | wide, low, warm | long gentle trails, slow drift | cream, moss, dusty teal; low saturation |
| joyful, open | clear breaks, light scale | high and generous | buoyant streams, wide orbits, long trails | pale gold, sky blue, warm white; higher exposure |
| grief | dense, static weight; fog | almost gone, but keep one ember | very slow, sparse, trailing downward | blue-grey, ash, one warm note; low saturation |
| restless, unresolved | two directions in the cloud field | off-centre, uneasy | faster and less coherent; vary stream directions | split warm/cool; medium contrast |
| calm after a storm | clouds thinning, high veil | softer, lower, clearing | slower, longer trails | washed teal, pearl, pale amber |
| excited, electric | fast-moving detail, bright breaks | small, intense, high | quick streams, many small particles | cyan, acid green or hot amber; crisp contrast |

**Avoid literal symbols.** No images of rain clouds, umbrellas, hearts, moons,
or faces. The shader's weather is abstract; let the viewer feel it without being
told what it is.

**Do not overdo it.** A page that is trying to say five things says none of
them. Choose one dominant feeling, one supporting colour, and one surprise.

---

## Where everything lives

```
index.html          page shell, hidden accessibility text
styles.css          full-bleed layout, CSS fallback, veil + grain
mood.js             THE CURRENT MOOD — edit this each day
shader.js           WebGL atmosphere: clouds, light, shader dust
app.js              WebGL setup, pointer parallax, motion/time
motes.js            2D layer: long light streams, dust, bokeh
favicon.svg         small static mark
journal/            one atmospheric log per day
AGENT.md            this file
README.md           human-facing overview and run instructions
```

The page loads four classic scripts in this order: `mood.js`, `shader.js`,
`app.js`, then `motes.js`. No bundler and no server code are required.

### How the two layers work

- **Atmosphere (`shader.js`)** — a single full-screen WebGL triangle. Domain-
  warped fBm makes a slow cloudscape; five palette colours tint the air; a warm
  focal light opens a clearing in the weather; grain and vignette finish it.
- **Pulse (`motes.js`)** — a transparent 2D canvas above the atmosphere. Light
  streams follow a slow noise field and curl around the focal point, leaving
  trails. A small number can be `strays`, which keep a slower outward path
  instead. Static dust and soft bokeh sit around them. Counts scale down on
  small screens. Each stream keeps a pixel-length history so trails look
  consistent across refresh rates, and the scene is warmed up before the first
  frame.

Both layers pause when the tab is hidden and resume without a time jump.

---

## Field guide: `mood.js`

All fields are optional in the engine, but keep the shape of the object intact
so future days remain legible.

### `palette`

Five hex colours. No sixth colour; derive variety through light and opacity.

| Key | Role | Character |
| --- | --- | --- |
| `night` | darkest air, page theme | deep, near-black, never pure `#000` |
| `deep` | body of the sky / shadows | cool or warm dark tone |
| `haze` | clouds, mist, distance | mid-tone; gives the weather its colour |
| `light` | cloud edges, dust, stars | pale highlight; choose warm *or* cool |
| `glow` | focal light and warm accents | a colour that feels alive, not neon |

### `composition`

| Field | Range (comfortable) | Effect |
| --- | --- | --- |
| `cloudCover` | `0.15–0.85` | `0` clear, `1` overcast; default `.54` |
| `cloudScale` | `0.8–2.4` | higher = smaller, more detailed weather |
| `turbulence` | `0.5–1.8` | higher = more torn and restless |
| `lightX`, `lightY` | `0–1` | screen position of the focal light |
| `lightRadius` | `0.25–0.7` | apparent size of the light; small = more exposed |
| `lightIntensity` | `0.4–1.15` | focus and bloom |
| `rays` | `0–1` | soft visible rays; keep subtle (`.1–.45`) |

### `atmosphere`

| Field | Range | Effect |
| --- | --- | --- |
| `grain` | `0.01–0.06` | film grain in the shader |
| `vignette` | `0–0.8` | shader vignette; CSS veil also darkens the frame |
| `motes` | `0–1` | faint shader dust/bokeh in the air |
| `stars` | `0–1` | tiny distant points (only visible in clear patches) |
| `rain` | `0–1` | shader rain streak layer (off by default) |

The CSS veil (`styles.css`) supplies an additional constant vignette and a
static paper grain over both canvases. Adjust it only when the whole visual
language changes.

### `motes`

The 2D layer is the pulse. This is where a day most clearly shows its tempo.

| Field | Range (comfortable) | Effect |
| --- | --- | --- |
| `streamers` | `40–300` | number of long light trails before mobile scaling |
| `strays` | `0–40` | streams that leave the main current: slower, cooler, longer trails drifting outward; `0` keeps the old look |
| `dust` | `0–300` | tiny suspended points |
| `bokeh` | `0–30` | large, soft out-of-focus orbs |
| `trailLength` | `40–260` px | how much memory each stream carries |
| `speed` | `15–100` px/s | base speed of streams |
| `orbit` | `0–28` | curl around the focal light; high = vortex |
| `driftX`, `driftY` | `-25–25` px/s | shared wind direction |
| `fieldScale` | `0.5–2` | higher = smaller, quicker swirls |
| `opacity` | `0.3–1.2` | overall pulse strength |
| `reducedMotionScale` | `0.05–0.35` | optional per-mood override (default `.18`) |

A calm day is usually `streamers 100–150`, `orbit 5–12`, `speed 30–50`.
A restless day can go to `streamers 220+`, `orbit 18–24`, `speed 70+`. Long
trails feel like memory; short trails feel like nerve.

### `motion`

- `speed` (`0.05–0.5`) — speed of the cloud field. Keep it slow; the streams
  carry the visible tempo. `0.24` is the current threshold.
- `drift` (`0–0.2`) — horizontal travel of the weather.
- `parallax` (`0–1`) — how far the focal light follows the pointer. Keep subtle
  (`.3–.7`). Touch devices do not need special handling.
- `reducedMotionScale` (`0.05–0.3`) — multiplier for the sky when reduced
  motion is requested.

### `grade`

- `contrast` (`0.9–1.15`)
- `saturation` (`0.7–1.1`)
- `exposure` (`0.8–1.25`)

### `quality`

- `maxPixelRatio` (`0.8–1.5`) — internal shader resolution cap. The atmosphere
  is soft; `1.25` is a good balance on retina displays.
- `maxPixels` — hard ceiling for the WebGL canvas. Keep at or below `3,000,000`
  unless you have measured the page on the target machine.

The 2D layer has its own resolution cap (`1.75` DPR, `3.2M` pixels).

---

## Engine notes

### Time

The site must run forever. Motion is accumulated from real elapsed time; never
derive positions from a loop that restarts. Both engines scale time for
`prefers-reduced-motion`. When a tab is hidden, RAF stops; on return the
simulation continues rather than jumping.

### Adding a shader uniform

1. Add the uniform to `shader.js` and use it.
2. Add the field to `mood.js`.
3. Wire it in `app.js` with `set("u_name", ...)`.
4. Test that the whole page still compiles: a missing uniform is silently
   ignored by the helper, but a typo will quietly do nothing.
5. Update this guide.

Avoid adding extra full-screen fBm passes. The current fragment shader already
uses several 4-octave fBm calls; the atmosphere is soft, so resolution is a more
effective lever than new detail. There is an unused `stars` / `rain` path for
weather days; use it rather than duplicating noise.

### Adding a new particle field pattern

The stream direction is sampled from 3D value noise plus an orbit around the
light. Per-particle flow offsets create several interleaving winds. If a day
needs two opposing winds, consider adding a config-level `flowGroups` array
with strength/direction rather than a one-off hard-coded branch, and scale its
default to zero for old moods.

### Pointer and touch

`app.js` shifts the focal light slightly toward the pointer. It is a small
parallax, not a cursor effect. Do not add trails to the cursor, click bursts, or
audio. The page should remain a background even when touched; `touch-action:
none` prevents accidental gestures from scrolling.

### Performance

Target 60 fps on an ordinary laptop, 30 fps minimum on a phone. If a change is
expensive, in order:

1. lower `quality.maxPixelRatio` / `maxPixels`
2. lower `motes.streamers`, `dust`, or `trailLength`
3. simplify the shader

Do not use canvas shadows, per-particle gradients, CSS blur filters, or large
animated SVG filters. The current grain is a single static overlay.

---

## Before you push

- [ ] `python3 -m http.server 4173` starts and the page loads at
      `http://localhost:4173`
- [ ] No console errors; no 404s
- [ ] No visible text, scrollbars, or controls at desktop (1440×900) and phone
      (390×844) sizes
- [ ] Page still fills the viewport on resize and on a phone with a notch
- [ ] `prefers-reduced-motion` still results in a slower, calmer animation
- [ ] Focus/pointing at the page does not cause anything to jump
- [ ] Palette contrast is readable as an atmosphere, not mud; the light feels
      intentional
- [ ] Performance is acceptable; no obvious stutter
- [ ] Title is `moodpage · <Title>`; hidden description matches the mood
- [ ] `journal/YYYY-MM-DD.md` is written and contains no private details
- [ ] `git status` contains only intended files

---

## Journal format

Create `journal/YYYY-MM-DD.md`:

```md
# 2026-10-21 — Name of the weather

## The weather
Three words. One sentence.

## What changed
- Palette: ...
- Light: ...
- Sky: ...
- Streams: ...
- Grade: ...

## Notes
What the entry was about in non-identifying terms, what you avoided, what the
page is doing emotionally. Do not paste private diary text.
```

If the human explicitly wants their raw diary archived, keep it in `private/`
(gitignored) or a separate private repository — never in this public repo.

---

## Privacy

This GitHub repository is public. The website is public too. The human's diary
entry is a private source, not publication copy.

- By default, record only an atmospheric paraphrase in `journal/`.
- Do not commit names, locations, workplaces, health details, relationship
  details, or anything that could identify the human.
- Do not put diary text in HTML, meta tags, commit messages, file names, or
  image alt text.
- If unsure whether a detail is too personal, leave it out. The visual result is
  what matters.
- If the human asks to publish the actual diary, confirm they understand the
  repository is public before doing so.

---

## A worked example

**The entry (paraphrased for this example):**
> Rain most of the day. Stayed in, made soup, and felt softer than I have in
> weeks.

**Three words:** soft, enclosed, clearing.

**Choices**

```js
palette: {
  night: "#070b12",
  deep: "#14222b",
  haze: "#526b6a",
  light: "#d8dfcf",
  glow: "#f3c69b",
},
composition: {
  cloudCover: 0.68,
  cloudScale: 1.4,
  turbulence: 0.9,
  lightX: 0.55,
  lightY: 0.5,
  lightRadius: 0.5,
  lightIntensity: 0.58,
  rays: 0.15,
},
motes: {
  streamers: 120,
  dust: 160,
  bokeh: 14,
  trailLength: 120,
  speed: 32,
  orbit: 6,
  driftX: 1.5,
  driftY: -0.5,
  fieldScale: 1.1,
  opacity: 0.8,
},
motion: { speed: 0.18, drift: 0.03, parallax: 0.35 },
grade: { contrast: 0.98, saturation: 0.84, exposure: 0.98 },
```

**Why:** lower contrast, smaller light, slower orbit, long soft trails. Rain is
suggested by weight and grey-teal air, not by adding an umbrella. The soup and
the staying-in are in the enclosure; the "softening" is in the clearing light.

**Journal:** a short note about a low, clearing sky; no raw diary text.

---

## Git and publishing

- Default branch: `main`.
- Remote: `origin` → `R4s0n3/raspage` on GitHub.
- The site is static at the repository root; GitHub Pages can serve `main` /
  `/` directly.
- Commit once per day (or once per addendum), with the mood in the message.
- Never force-push over another morning's entry. Pull first if the remote has
  changed.
- SSH may require a passphrase; if the configured key is unavailable, use the
  authenticated `gh` credential helper over HTTPS. Do not commit tokens.

If GitHub Pages is enabled, it builds automatically from `main`. It may take a
minute; the page is not broken because the URL is briefly stale.
