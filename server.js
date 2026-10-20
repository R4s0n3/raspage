/*
 * moodpage server.
 *
 * One small Node process serves the static page and the two-person room relay
 * on the same origin, so the published page can open a WebSocket back to
 * itself. index.html is served with its moodpage-ws meta tag filled in at
 * runtime; the repository copy keeps that meta empty, which keeps the plain
 * static mirror (GitHub Pages, python -m http.server) silent and solo.
 *
 * Rooms hold at most two people. The relay stores nothing: it only forwards
 * normalized drops and strokes to the other client in the room.
 *
 *   npm install
 *   npm start            # PORT=8787 by default
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");

const PORT = Number(process.env.PORT) || 8787;
const MAX_PER_ROOM = 2;
const MAX_ROOMS = 400;
const MESSAGE_LIMIT = 120; // messages per second, per client

const STATIC_ROOT = path.resolve(__dirname);
const INDEX_META =
  /(<meta\s+name="moodpage-ws"\s+content=")([^"]*)(")/i;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

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

// The page served here is told to open its WebSocket on its own origin.
const injectedMeta = (request) => {
  const host = request.headers.host;
  if (!host) {
    return "";
  }
  const forwarded = (request.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim();
  const proto = forwarded || "http";
  const wsProto = proto === "https" ? "wss" : "ws";
  return wsProto + "://" + host;
};

const serveFile = (filePath, request, response) => {
  fs.readFile(filePath, (error, body) => {
    if (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end("moodpage");
      return;
    }

    const type = TYPES[path.extname(filePath).toLowerCase()] ||
      "application/octet-stream";
    let payload = body;

    if (path.basename(filePath) === "index.html") {
      const html = body.toString("utf8");
      const match = html.match(INDEX_META);
      // A non-empty meta in the repository wins; otherwise fill it in here.
      if (match && match[2].trim() === "") {
        payload = html.replace(INDEX_META, "$1" + injectedMeta(request) + "$3");
      } else {
        payload = body;
      }
    }

    response.writeHead(200, {
      "content-type": type,
      "content-length": Buffer.byteLength(payload),
    });
    response.end(request.method === "HEAD" ? undefined : payload);
  });
};

const serveStatic = (request, response) => {
  if (request.url === "/health") {
    let clients = 0;
    for (const room of rooms.values()) {
      clients += room.clients.size;
    }
    const body = JSON.stringify({ ok: true, rooms: rooms.size, clients });
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(body),
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://moodpage").pathname);
  } catch {
    response.writeHead(400, { "content-type": "text/plain" });
    response.end("moodpage");
    return;
  }

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = path.normalize(path.join(STATIC_ROOT, pathname));
  const insideRoot =
    filePath === STATIC_ROOT || filePath.startsWith(STATIC_ROOT + path.sep);
  const segments = filePath.split(path.sep);

  // Never serve the diary's private drawer or the repository itself.
  if (!insideRoot || segments.includes("private") || segments.includes(".git")) {
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("moodpage");
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("moodpage");
      return;
    }
    serveFile(filePath, request, response);
  });
};

const server = http.createServer(serveStatic);
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
  console.log("moodpage on http://localhost:" + PORT);
});
