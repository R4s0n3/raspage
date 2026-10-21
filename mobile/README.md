# moodpage — the app

A private diary whose pages are weather. Write how the day felt; the words
stay on the phone, and the day becomes a living moodpage. Past days are kept
as a calendar of small skies, and each one can be opened and lived in again.

This is the single-player app: no accounts and no friends yet.

## How it fits together

```
src/app/              screens (Expo Router)
  index.tsx           today: your weather, full screen
  write.tsx           write the day; it is turned into weather
  days.tsx            a month of days, each as its weather
  day/[date].tsx      one day again, and your words if you ask
src/components/
  MoodView.tsx        the engine in a WebView (MoodView.web.tsx: an iframe)
  Swatch.tsx          a day's weather in a few pixels
  Pill.tsx            the one kind of button
src/lib/
  diary.ts            the diary on the device: SQLite (diary.web.ts: localStorage)
  api.ts              the one network call: an entry to POST /api/mood
src/engine/
  host.js             the bridge inside the WebView: mood, pause, resume
scripts/
  build-engine.mjs    bundles the engine from the repository root into one HTML
                      string (src/engine/engine-html.ts, generated)
```

The weather is the same engine as the website, from the repository root
(`moodpage.js` and friends), bundled inline so it runs offline. The app passes
it a mood and later sends new ones in; the sky changes in place and never
reloads. A change to the engine reaches the app on the next `npm start`.

The diary lives only on the device. To make the weather, the entry is sent
once to the moodpage server (`server.js`, `POST /api/mood`), which asks Claude
to translate it with AGENT.md's own field guide and returns only the mood. The
server stores and logs nothing.

## Run it

The server, from the repository root, with Claude credentials:

```bash
npm install
ANTHROPIC_API_KEY=... npm start        # http://localhost:8787
```

The app:

```bash
cd mobile
npm install
npm start                              # then press i, a, or w
```

`EXPO_PUBLIC_MOODPAGE_API` points the app at a server (default
`http://localhost:8787`; a phone on the same network needs your computer's
address, e.g. `http://192.168.1.5:8787`). If the server sets
`MOODPAGE_APP_TOKEN`, give the app the same value as
`EXPO_PUBLIC_MOODPAGE_TOKEN`; it is a speed bump against strangers, not a
secret, since anything in an app can be read out of it.

The web build (`w`) is for development: it runs the engine in an iframe and
keeps the diary in localStorage.

## Checks

```bash
npm run typecheck
```
