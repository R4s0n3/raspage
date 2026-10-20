/*
 * Two-person rooms.
 *
 * moodpage stays wordless: the room is the link you already have open. Up to
 * two people share a room, and every drop or stroke is relayed to the other
 * one through the small WebSocket server in server/. Set the moodpage-ws meta
 * tag to a wss:// URL to turn this on. Without it the page runs alone, exactly
 * as before.
 */
(() => {
  "use strict";

  const interaction = window.MOODPAGE_INTERACTION;
  if (!interaction) {
    return;
  }

  const meta = document.querySelector('meta[name="moodpage-ws"]');
  let url = (meta?.getAttribute("content") || "").trim();

  let params = null;
  try {
    params = new URLSearchParams(window.location.search);
  } catch {
    params = null;
  }

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
    } else {
      return;
    }
  }

  let requestedRoom = null;
  try {
    requestedRoom = new URLSearchParams(window.location.search).get("room");
  } catch {
    requestedRoom = null;
  }
  if (requestedRoom) {
    requestedRoom =
      requestedRoom.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 16) ||
      null;
  }

  let socket = null;
  let retry = 0;
  let timer = 0;
  let retryAt = 0;

  const valid = (value, min, max) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;

  const onMessage = (event) => {
    let message = null;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (!message || typeof message.t !== "string") {
      return;
    }

    if (message.t === "drop") {
      if (valid(message.x, 0, 1) && valid(message.y, 0, 1)) {
        interaction.addDrop(
          message.x,
          message.y,
          valid(message.s, 0, 1) ? message.s : 1,
        );
      }
    } else if (message.t === "stroke") {
      if (
        valid(message.x0, 0, 1) &&
        valid(message.y0, 0, 1) &&
        valid(message.x1, 0, 1) &&
        valid(message.y1, 0, 1)
      ) {
        interaction.addStroke(
          message.x0,
          message.y0,
          message.x1,
          message.y1,
          valid(message.s, 0, 1) ? message.s : 1,
        );
      }
    } else if (message.t === "full") {
      // The room already has two people. Wait quietly and try again.
      retryAt = Date.now() + 15000;
    } else if (message.t === "busy") {
      retryAt = Date.now() + 30000;
    }
  };

  const schedule = () => {
    if (document.hidden || timer) {
      return;
    }

    const wait = Math.max(0, retryAt - Date.now());
    retryAt = 0;
    const backoff = wait
      ? wait
      : Math.min(15000, 1000 * Math.pow(2, Math.min(retry, 4)));
    if (!wait) {
      retry += 1;
    }

    timer = window.setTimeout(() => {
      timer = 0;
      connect();
    }, backoff);
  };

  const connect = () => {
    if (document.hidden) {
      return;
    }
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    try {
      socket = new WebSocket(url);
    } catch {
      socket = null;
      schedule();
      return;
    }

    socket.addEventListener("open", () => {
      retry = 0;
      socket.send(JSON.stringify({ t: "join", room: requestedRoom }));
    });

    socket.addEventListener("message", onMessage);

    socket.addEventListener("close", () => {
      socket = null;
      schedule();
    });

    socket.addEventListener("error", () => {
      // A close event follows; reconnection is handled there.
    });
  };

  interaction.onLocalGesture((gesture) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(gesture));
    }
  });

  window.addEventListener("online", () => {
    retryAt = 0;
    if (timer) {
      window.clearTimeout(timer);
      timer = 0;
    }
    connect();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      return;
    }
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      connect();
    }
  });

  connect();
})();
