/*
 * The bridge between the app and the moodpage inside its WebView (or, on
 * web, its iframe).
 *
 * The app writes the first mood into the page before it loads
 * (window.__MOODPAGE_MOOD); without one, the bundled mood.js is the weather.
 * After that the app sends small messages:
 *
 *   { type: "mood", mood }    change the weather in place
 *   { type: "pause" }         off screen, app in the background
 *   { type: "resume" }
 *
 * and the page answers { type: "ready" } once the weather is running.
 * Errors and warnings inside the page reach the app through log.js.
 */
(() => {
  "use strict";

  // From log.js, which runs before the engine.
  const post = window.__moodpagePost;
  const log = window.__moodpageLog;

  const stage = document.querySelector(".stage");
  const page = window.MOODPAGE.create(stage, {
    mood: window.__MOODPAGE_MOOD || window.MOOD,
  });
  if (!page) {
    log("error", ["the moodpage could not start"]);
    return;
  }

  const receive = (message) => {
    if (!message || typeof message.type !== "string") {
      return;
    }
    if (message.type === "mood" && message.mood && message.mood.palette) {
      page.setMood(message.mood);
    } else if (message.type === "pause") {
      page.pause();
    } else if (message.type === "resume") {
      page.resume();
    }
  };

  const onMessage = (event) => {
    let message = event.data;
    if (typeof message === "string") {
      try {
        message = JSON.parse(message);
      } catch {
        return;
      }
    }
    receive(message);
  };

  // The native app calls receive() directly through injectJavaScript; the
  // web build posts messages to the iframe.
  window.moodpageHost = { receive };
  window.addEventListener("message", onMessage);

  post({ type: "ready" });
  log("info", [
    "weather running:",
    stage.classList.contains("no-webgl") ? "no WebGL (CSS fallback)" : "WebGL",
    innerWidth + "x" + innerHeight + "@" + devicePixelRatio,
  ]);
})();
