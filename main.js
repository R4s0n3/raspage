/*
 * The site: today's mood, full screen.
 *
 * Everything page-wide lives here: the title, the hidden description, the
 * theme colour, and which relay and room to join. The moodpage itself is
 * made by MOODPAGE.create() in moodpage.js, and is kept on window.moodpage
 * so a host (an app's WebView, the console) can change its weather.
 */
(() => {
  "use strict";

  const mood = window.MOOD;
  const stage = document.querySelector(".stage");
  if (!mood || !stage || !window.MOODPAGE?.create) {
    return;
  }

  document.title = mood.title ? "moodpage · " + mood.title : "moodpage";

  const title = document.querySelector("[data-mood-title]");
  const description = document.querySelector("[data-mood-description]");
  if (title) {
    title.textContent = "moodpage — " + mood.title;
  }
  if (description && mood.description) {
    description.textContent = mood.description;
  }

  // The page behind the stage wears the same palette.
  const root = document.documentElement;
  for (const [name, value] of Object.entries(mood.palette)) {
    root.style.setProperty("--" + name, value);
  }
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) {
    theme.setAttribute("content", mood.palette.night);
  }

  // Which relay: server.js fills the moodpage-ws meta with the page's own
  // origin; a plain static host leaves it empty and the page runs alone.
  let params = null;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    params = null;
  }

  const meta = document.querySelector('meta[name="moodpage-ws"]');
  let url = (meta?.getAttribute("content") || "").trim();

  // ?ws=... is a development override for a relay on another host, e.g. a
  // phone testing against a laptop on the same network.
  const override = params?.get("ws")?.trim();
  if (override && /^wss?:\/\//i.test(override)) {
    url = override;
  }

  if (!url) {
    const local =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    // Only reach for a local relay when a room was explicitly requested;
    // a plain local page should stay silent if no relay is running.
    if (local && params?.has("room")) {
      url = "ws://" + window.location.hostname + ":8787";
    }
  }

  window.moodpage = window.MOODPAGE.create(stage, {
    mood,
    room: url ? { url, room: params?.get("room") } : null,
  });
})();
