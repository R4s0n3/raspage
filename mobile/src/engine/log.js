/*
 * Runs before the engine: sends errors and warnings from inside the page to
 * the app, which writes them to its own log (the WebView's console is
 * otherwise out of sight). Messages are { type: "log", level, message }.
 */
(() => {
  "use strict";

  const post = (message) => {
    const text = JSON.stringify(message);
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(text);
    } else if (window.parent !== window) {
      window.parent.postMessage(text, "*");
    }
  };

  const describe = (value) => {
    if (value instanceof Error) {
      return value.message + (value.stack ? "\n" + value.stack : "");
    }
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  // Kept short: a log line, not a dump.
  const log = (level, parts) =>
    post({
      type: "log",
      level,
      message: parts.map(describe).join(" ").slice(0, 2000),
    });

  for (const level of ["error", "warn"]) {
    const original = console[level].bind(console);
    console[level] = (...parts) => {
      original(...parts);
      log(level, parts);
    };
  }
  window.addEventListener("error", (event) =>
    log("error", [event.error || event.message]),
  );
  window.addEventListener("unhandledrejection", (event) =>
    log("error", ["unhandled rejection:", event.reason]),
  );

  window.__moodpageLog = log;
  window.__moodpagePost = post;
})();
