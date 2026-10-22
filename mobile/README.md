# moodpage — the app

A private diary whose pages are weather. Write how the day felt; the words
stay on the phone, and the day becomes a living moodpage. Past days are kept
as a calendar of small skies, and each one can be opened and lived in again.

Friends share weather, never words: each sees the other's latest weather,
and visiting a friend's page puts you both in the same water, each drawing in
your own colour.

## How it fits together

```
src/app/              screens (Expo Router)
  index.tsx           today: your weather, full screen
  write.tsx           write the day; it is turned into weather
  days.tsx            a month of days, each as its weather
  day/[date].tsx      one day again, and your words if you ask
  friends.tsx         your friends' weather, invites, your name, delete account
  friend/[id].tsx     a friend's water, alive, drawn in together; while they
                      are away, what you draw is left as a stone
  invite/[code].tsx   an invite link, opened
  recovery.tsx        your recovery code, or restoring an account with one
src/components/
  MoodView.tsx        the engine in a WebView (MoodView.web.tsx: an iframe)
  Swatch.tsx          a day's weather in a few pixels
  Pill.tsx            the one kind of button
  NameForm.tsx        the name your friends see
src/lib/
  diary.ts            the diary on the device: SQLite (diary.web.ts: localStorage)
  api.ts              the one call that carries words: an entry to POST /api/mood
  server.ts           where the server is, and how to talk to it
  account.ts          your account: a secret key in the keychain
  friends.ts          friends, invites, sharing your weather
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

Accounts need no email or password: the app makes a secret key on first use
and keeps it in the keychain; the server stores only its hash, the name you
choose, your friendships, and your latest weather. Friends find each other
with invite codes, never by searching. Without a database on the server
(`DATABASE_URL`), the app simply works alone.

The diary lives only on the device. To make the weather, the entry is sent
once to the moodpage server (`server/`, `POST /api/mood`), which asks Claude
through OpenRouter to translate it with AGENT.md's own field guide and returns
only the mood. Requests are only routed to providers that do not keep or train
on them, and the server stores and logs nothing.

## Run it

The server lives in `server/`; run it from the repository root. Put the
OpenRouter key in `server/.env` (copy `server/.env.example`); it is never
committed and never served:

```bash
npm install
cp server/.env.example server/.env     # then fill in OPENROUTER_API_KEY
npm start                              # http://localhost:8787
```

The app, with its own `.env` (copy `mobile/.env.example`):

```bash
cd mobile
npm install
cp .env.example .env                   # where the server is
npm start                              # then press i, a, or w
```

`mobile/.env` holds only `EXPO_PUBLIC_` settings, and Expo builds those into
the app, where anyone can read them: never put the OpenRouter key there;
it belongs in `server/.env`.
`EXPO_PUBLIC_MOODPAGE_API` is the server (default `http://localhost:8787`; a
phone on the same network needs your computer's address, e.g.
`http://192.168.1.5:8787`). If the server sets `MOODPAGE_APP_TOKEN`, give the
app the same value as `EXPO_PUBLIC_MOODPAGE_TOKEN`; it is a speed bump
against strangers, not a secret.

The web build (`w`) is for development: it runs the engine in an iframe and
keeps the diary in localStorage.

## Stones and recovery

Drawing in a friend's water while they are away leaves a stone: the touches
wait on the server (at most three from one friend, for a week) and replay in
their water the next time they open the app, with a quiet "Mara was here".
Delivered once, then gone.

Your recovery code (Friends → Recovery code) is your account's key. On a new
phone, Friends → "I have a recovery code" brings back your name and friends.
The diary itself stays on the phone it was written on.

## Building for TestFlight

Everything is configured: the name, bundle ID `de.therascal.moodpage`,
icons (`scripts/make-icons.py`), splash, invite links on the server's domain
(`app.config.js`), and build profiles (`eas.json`, which points cloud builds
at `https://the-rascal.de`). What needs your accounts:

1. Enrol in the Apple Developer Program, then note your **Team ID**
   (developer.apple.com → Account → Membership details).
2. In App Store Connect, create the app: My Apps → + → New App, bundle ID
   `de.therascal.moodpage` (register it when asked), name `moodpage`.
3. On Coolify, set `APPLE_TEAM_ID=<Team ID>` and redeploy; check that
   `https://the-rascal.de/.well-known/apple-app-site-association` shows it.
   Set `MOODPAGE_OPERATOR`, `MOODPAGE_ADDRESS` and `MOODPAGE_CONTACT` too,
   for the privacy page.
4. From `mobile/`:
   ```bash
   npx eas-cli@latest login            # your Expo account
   npx eas-cli@latest build -p ios --profile production
   npx eas-cli@latest submit -p ios --latest
   ```
   EAS creates the certificates and provisioning profile for you when asked
   to log in to your Apple account.
5. In App Store Connect → TestFlight, add yourself and your friends as
   testers. With a public link, set it on Coolify as `APP_INSTALL_URL`.
   The privacy policy URL is `https://the-rascal.de/privacy`.

While developing, keep using Expo Go (`npx expo start --lan`): invite
links then open Expo Go, and the code can always be typed in by hand.

## Checks

```bash
npm run typecheck
```
