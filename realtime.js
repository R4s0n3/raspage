/*
 * Shared rooms.
 *
 * moodpage stays wordless: the room is the link you already have open. Up to
 * five people share a room, and every drop or stroke is relayed to the others
 * through the small WebSocket relay in server.js.
 *
 * MOODPAGE.connectRoom(water, { url, room, join }) joins one water surface
 * to a relay. Without a room code the relay places a visitor with whoever
 * else is there. `join` adds fields to the join message: the app's
 * { visit, token } asks for a friend's own water, which the relay only
 * opens to friends. `onPeers(count)` hears how many are in the water,
 * yourself included (1 when alone or disconnected). Which relay and which room is the page's decision (see main.js); an
 * app shell passes its own.
 */
(() => {
  "use strict";

  const MOODPAGE = (window.MOODPAGE = window.MOODPAGE || {});

  // Room codes are short and plain: letters, digits, _ and -.
  MOODPAGE.roomCode = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 16) || null;

  MOODPAGE.connectRoom = (interaction, options = {}) => {
    const url = String(options.url || "").trim();
    if (!interaction || !/^wss?:\/\//i.test(url)) {
      return null;
    }
    const requestedRoom = MOODPAGE.roomCode(options.room);
    const extra = options.join && typeof options.join === "object" ? options.join : {};
    const onPeers = typeof options.onPeers === "function" ? options.onPeers : () => {};
    const peers = (count) => {
      try {
        onPeers(Number.isInteger(count) && count > 0 ? count : 1);
      } catch {
        // A listener's trouble is not the water's.
      }
    };

    let socket = null;
    let retry = 0;
    let timer = 0;
    let retryAt = 0;
    let paused = false;
    let closed = false;

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

      // The colour slot of whoever drew it; the relay stamps it on.
      const slot = Number.isInteger(message.c) && message.c >= 0 ? message.c : 0;

      if (message.t === "welcome") {
        if (Number.isInteger(message.slot) && message.slot >= 0) {
          interaction.state.slot = message.slot;
        }
        peers(message.peers);
      } else if (message.t === "peer") {
        peers(message.peers);
      } else if (message.t === "drop") {
        if (valid(message.x, 0, 1) && valid(message.y, 0, 1)) {
          interaction.addDrop(
            message.x,
            message.y,
            valid(message.s, 0, 1) ? message.s : 1,
            slot,
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
            slot,
          );
        }
      } else if (message.t === "full") {
        // The named room is full. Wait quietly and try again.
        retryAt = Date.now() + 15000;
      } else if (message.t === "denied") {
        // Not allowed in (no longer friends): stay alone, stop asking.
        closed = true;
      } else if (message.t === "busy") {
        retryAt = Date.now() + 30000;
      }
    };

    const schedule = () => {
      if (paused || closed || timer) {
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
      if (paused || closed) {
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
        socket.send(JSON.stringify({ ...extra, t: "join", room: requestedRoom }));
      });

      socket.addEventListener("message", onMessage);

      socket.addEventListener("close", () => {
        socket = null;
        // Alone again: back to the first colour until the next room.
        interaction.state.slot = 0;
        peers(1);
        schedule();
      });

      socket.addEventListener("error", () => {
        // A close event follows; reconnection is handled there.
      });
    };

    const unsubscribe = interaction.onLocalGesture((gesture) => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(gesture));
      }
    });

    const onOnline = () => {
      retryAt = 0;
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      connect();
    };
    window.addEventListener("online", onOnline);

    // A hidden page keeps its socket but does not chase a lost one.
    const pause = () => {
      paused = true;
    };

    const resume = () => {
      paused = false;
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        connect();
      }
    };

    const close = () => {
      closed = true;
      unsubscribe();
      window.removeEventListener("online", onOnline);
      window.clearTimeout(timer);
      timer = 0;
      socket?.close();
      socket = null;
      interaction.state.slot = 0;
    };

    connect();

    return { pause, resume, close };
  };
})();
