/*
 * moodpage rooms.
 *
 * A small WebSocket relay: up to two people per room. It knows nothing about
 * the drawing itself, it only forwards drops and strokes. Run it next to the
 * static page and point the moodpage-ws meta tag at it.
 *
 *   PORT=8787 node index.js
 */
"use strict";

const http = require("http");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 8787;
const MAX_PER_ROOM = 2;
const MAX_ROOMS = 400;
const MESSAGE_LIMIT = 120; // messages per second, per client

const rooms = new Map(); // code -> { clients: Set<WebSocket> }

const roomCode = () => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = crypto.randomBytes(4).toString("hex").slice(0, 6);
    if (!rooms.has(code)) {
      return code;
    }
  }
  return String(rooms.size + 1);
};

const openRoom = () => {
  const code = roomCode();
  rooms.set(code, { clients: new Set() });
  return code;
};

const findRoom = () => {
  for (const [code, room] of rooms) {
    if (room.clients.size < MAX_PER_ROOM) {
      return code;
    }
  }
  return null;
};

const send = (client, message) => {
  if (client.readyState === WebSocket.OPEN) {
    client.send(JSON.stringify(message));
  }
};

const broadcast = (room, message, except) => {
  for (const client of room.clients) {
    if (client !== except) {
      send(client, message);
    }
  }
};

const number = (value, min, max) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;

const validRoom = (value) =>
  typeof value === "string" && /^[a-z0-9_-]{1,16}$/i.test(value);

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    let clients = 0;
    for (const room of rooms.values()) {
      clients += room.clients.size;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size, clients }));
    return;
  }

  response.writeHead(404, { "content-type": "text/plain" });
  response.end("moodpage rooms");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (client) => {
  client.isAlive = true;
  client.room = null;
  client.windowStarted = Date.now();
  client.windowCount = 0;

  client.on("pong", () => {
    client.isAlive = true;
  });

  client.on("message", (raw) => {
    const now = Date.now();
    if (now - client.windowStarted > 1000) {
      client.windowStarted = now;
      client.windowCount = 0;
    }
    client.windowCount += 1;
    if (client.windowCount > MESSAGE_LIMIT) {
      return;
    }

    let message = null;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (!message || typeof message.t !== "string") {
      return;
    }

    if (message.t === "join") {
      if (client.room) {
        return;
      }

      let code = validRoom(message.room) ? message.room.toLowerCase() : null;

      if (code) {
        const existing = rooms.get(code);
        if (existing && existing.clients.size >= MAX_PER_ROOM) {
          send(client, { t: "full", room: code });
          client.close(4001, "room full");
          return;
        }
        if (!existing) {
          if (rooms.size >= MAX_ROOMS) {
            send(client, { t: "busy" });
            client.close(4002, "busy");
            return;
          }
          rooms.set(code, { clients: new Set() });
        }
      } else {
        code = findRoom();
        if (!code) {
          if (rooms.size >= MAX_ROOMS) {
            send(client, { t: "busy" });
            client.close(4002, "busy");
            return;
          }
          code = openRoom();
        }
      }

      const room = rooms.get(code);
      room.clients.add(client);
      client.room = code;

      send(client, {
        t: "welcome",
        room: code,
        peers: room.clients.size,
        max: MAX_PER_ROOM,
      });
      broadcast(room, { t: "peer", peers: room.clients.size }, client);
      return;
    }

    if (!client.room) {
      return;
    }

    const room = rooms.get(client.room);
    if (!room) {
      return;
    }

    if (message.t === "drop") {
      if (number(message.x, 0, 1) && number(message.y, 0, 1)) {
        broadcast(
          room,
          {
            t: "drop",
            x: message.x,
            y: message.y,
            s: number(message.s, 0, 1) ? message.s : 1,
          },
          client,
        );
      }
    } else if (message.t === "stroke") {
      if (
        number(message.x0, 0, 1) &&
        number(message.y0, 0, 1) &&
        number(message.x1, 0, 1) &&
        number(message.y1, 0, 1)
      ) {
        broadcast(
          room,
          {
            t: "stroke",
            x0: message.x0,
            y0: message.y0,
            x1: message.x1,
            y1: message.y1,
            s: number(message.s, 0, 1) ? message.s : 1,
          },
          client,
        );
      }
    }
  });

  client.on("close", () => {
    const code = client.room;
    if (!code) {
      return;
    }

    client.room = null;
    const room = rooms.get(code);
    if (!room) {
      return;
    }

    room.clients.delete(client);
    if (room.clients.size === 0) {
      rooms.delete(code);
    } else {
      broadcast(room, { t: "peer", peers: room.clients.size });
    }
  });

  client.on("error", () => {
    client.terminate();
  });
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (!client.isAlive) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, 30000);

wss.on("close", () => {
  clearInterval(heartbeat);
});

server.listen(PORT, () => {
  console.log("moodpage rooms listening on " + PORT);
});
