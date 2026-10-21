/*
 * moodpage server.
 *
 * One small Node process serves the static page and the shared room relay
 * on the same origin, so the published page can open a WebSocket back to
 * itself. index.html is served with its moodpage-ws meta tag filled in at
 * runtime; the repository copy keeps that meta empty, which keeps the plain
 * static mirror (GitHub Pages, python -m http.server) silent and solo.
 *
 * Rooms hold up to five people. Visitors without a room code are placed in
 * the fullest open room that still has space, so strangers share the same
 * water; a named room (?room=CODE) only ever holds the people who asked for
 * it. The relay stores nothing: it only forwards normalized drops and
 * strokes to the others in the room.
 *
 * The site it serves is the repository root, one level up; this directory
 * holds only the server.
 *
 *   npm install          # from the repository root
 *   npm start            # PORT=8787 by default
 */
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer, WebSocket } = require("ws");
const { createTranslator, TranslationError, MAX_ENTRY } = require("./translate");
const { clampMood } = require("./mood-schema");
const { createDb } = require("./db");
const { createAccounts } = require("./accounts");
const { createLinks } = require("./links");
const {
  HttpError,
  sendJson,
  sendPreflight,
  readJson,
  clientAddress,
  bearer,
  limiter,
} = require("./http");

// Secrets for local runs can live in server/.env (never committed, never
// served). Variables already set, e.g. by Coolify, win.
try {
  process.loadEnvFile(path.join(__dirname, ".env"));
} catch {
  // No .env: the environment is all there is.
}

const PORT = Number(process.env.PORT) || 8787;
const MAX_PER_ROOM = Math.max(2, Number(process.env.MAX_PER_ROOM) || 5);
const MAX_ROOMS = 400;
const MESSAGE_LIMIT = 120; // messages per second, per client

// The site: the repository root, one level up from this directory.
const STATIC_ROOT = path.resolve(__dirname, "..");

// POST /api/mood: a diary entry in, a mood out (translate.js). Off unless
// OPENROUTER_API_KEY is set. With a database it needs an account; without
// one, MOODPAGE_APP_TOKEN (when set) is a shared secret the app must send.
const APP_TOKEN = process.env.MOODPAGE_APP_TOKEN || "";
const TRANSLATIONS_PER_HOUR = Number(process.env.TRANSLATIONS_PER_HOUR) || 20;
const translator = createTranslator({ root: STATIC_ROOT });

// Accounts, friends and visits need Postgres (DATABASE_URL). Without it the
// server is what it was: the site, open rooms, and the translator.
const db = process.env.DATABASE_URL ? createDb(process.env.DATABASE_URL) : null;
const accounts = db
  ? createAccounts({ db, clampMood, base: translator.base })
  : null;
// Invite pages, the privacy policy, and the files that let links open the app.
const links = createLinks({ db });
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

// code -> { clients: Set<WebSocket>, open: boolean }
// Open rooms are filled with whoever arrives; named rooms are not.
const rooms = new Map();

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
  rooms.set(code, { clients: new Set(), open: true });
  return code;
};

// The fullest open room with space, so rooms fill up instead of leaving
// everyone alone in a room of their own.
const findRoom = () => {
  let best = null;
  let bestSize = 0;
  for (const [code, room] of rooms) {
    const size = room.clients.size;
    if (room.open && size < MAX_PER_ROOM && size > bestSize) {
      best = code;
      bestSize = size;
    }
  }
  return best;
};

// Each person in a room gets the lowest free colour slot, so everyone in the
// room sees the same person drawing in the same colour.
const freeSlot = (room) => {
  const taken = new Set();
  for (const other of room.clients) {
    taken.add(other.slot);
  }
  let slot = 0;
  while (taken.has(slot)) {
    slot += 1;
  }
  return slot;
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
  // Never serve the diary's private drawer, the repository itself (.git and
  // every other dotfile: .env holds secrets), dependencies, or the server's
  // and the app's source.
  const segments = path.relative(STATIC_ROOT, filePath).split(path.sep);
  if (
    !insideRoot ||
    segments.some((segment) => segment.startsWith(".")) ||
    segments.includes("private") ||
    segments.includes("node_modules") ||
    segments[0] === "server" ||
    segments[0] === "mobile"
  ) {
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

const translations = limiter(TRANSLATIONS_PER_HOUR, 60 * 60 * 1000);

const serveMood = async (request, response) => {
  if (request.method !== "POST") {
    sendJson(response, 405, { error: "POST a diary entry" });
    return;
  }
  // Who is asking: an account when there is a database, else the address.
  let who = clientAddress(request);
  if (accounts) {
    const user = await accounts.authenticate(bearer(request)).catch(() => null);
    if (!user) {
      sendJson(response, 401, { error: "unknown account" });
      return;
    }
    who = user.id;
  } else if (APP_TOKEN && bearer(request) !== APP_TOKEN) {
    sendJson(response, 401, { error: "unauthorized" });
    return;
  }
  if (!translator.enabled) {
    sendJson(response, 503, { error: "translation is not configured" });
    return;
  }
  if (!translations(who)) {
    sendJson(response, 429, { error: "too many entries this hour" });
    return;
  }

  // The entry is held only for the length of this request: never logged,
  // never written anywhere.
  try {
    const body = await readJson(request, MAX_ENTRY * 4 + 1024);
    const date =
      typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
        ? body.date
        : null;
    const mood = await translator.translate(body.entry, date);
    sendJson(response, 200, { mood });
  } catch (error) {
    if (error instanceof HttpError || error instanceof TranslationError) {
      sendJson(response, error.status, { error: error.message });
    } else {
      console.error("translation failed:", error?.status || "", error?.name || "error");
      sendJson(response, 502, { error: "the weather could not be made" });
    }
  }
};

const serveApi = async (request, response, pathname) => {
  if (request.method === "OPTIONS") {
    sendPreflight(response);
    return;
  }
  if (pathname === "/api/mood") {
    await serveMood(request, response);
    return;
  }
  if (accounts && (await accounts.handle(request, response, pathname))) {
    return;
  }
  if (!accounts && /^\/api\/(account|me|invites|friends)(\/|$)/.test(pathname)) {
    sendJson(response, 503, { error: "friends are not configured on this server" });
    return;
  }
  sendJson(response, 404, { error: "no such thing" });
};

const server = http.createServer((request, response) => {
  const pathname = (request.url || "/").split("?")[0];
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    serveApi(request, response, pathname).catch((error) => {
      console.error("api error:", error.code || error.message);
      if (!response.headersSent) {
        sendJson(response, 500, { error: "something went wrong" });
      }
    });
    return;
  }
  links
    .handle(request, response, pathname)
    .then((handled) => {
      if (!handled) {
        serveStatic(request, response);
      }
    })
    .catch((error) => {
      console.error("page error:", error.code || error.message);
      if (!response.headersSent) {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end("moodpage");
      }
    });
});
const wss = new WebSocketServer({ server });

// The home being visited, if the visitor's account is its owner or one of
// the owner's friends.
const admitVisit = async ({ visit, token }) => {
  if (!accounts || !/^[0-9a-f-]{36}$/i.test(visit)) {
    return null;
  }
  const user = await accounts.authenticate(typeof token === "string" ? token : "");
  if (!user || !(await accounts.areFriends(user.id, visit.toLowerCase()))) {
    return null;
  }
  return visit.toLowerCase();
};

// Puts a client in the room `code` (made on first arrival as a private
// room), or in a new open room when `code` is null. A full room or a full
// server turns the client away.
const enterRoom = (client, code) => {
  if (client.readyState !== WebSocket.OPEN) {
    return;
  }
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
      rooms.set(code, { clients: new Set(), open: false });
    }
  } else {
    if (rooms.size >= MAX_ROOMS) {
      send(client, { t: "busy" });
      client.close(4002, "busy");
      return;
    }
    code = openRoom();
  }

  const room = rooms.get(code);
  client.slot = freeSlot(room);
  room.clients.add(client);
  client.room = code;

  send(client, {
    t: "welcome",
    room: code,
    peers: room.clients.size,
    max: MAX_PER_ROOM,
    slot: client.slot,
  });
  broadcast(room, { t: "peer", peers: room.clients.size }, client);
};

wss.on("connection", (client) => {
  client.isAlive = true;
  client.room = null;
  client.slot = 0;
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
      if (client.room || client.joining) {
        return;
      }

      // A visit: someone's own water, open only to them and their friends.
      // Its room name has a colon, which a ?room= code can never have.
      if (typeof message.visit === "string") {
        client.joining = true;
        admitVisit(message)
          .then((home) => {
            client.joining = false;
            if (!home) {
              send(client, { t: "denied" });
              client.close(4003, "not friends");
              return;
            }
            enterRoom(client, "home:" + home);
          })
          .catch(() => {
            client.joining = false;
            client.close(1011, "try again");
          });
        return;
      }

      let code = validRoom(message.room) ? message.room.toLowerCase() : null;
      if (!code) {
        code = findRoom();
      }
      enterRoom(client, code);
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
            c: client.slot,
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
            c: client.slot,
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

// With a database, its tables are brought up to date before anyone arrives.
(db ? db.migrate() : Promise.resolve())
  .then(() => {
    server.listen(PORT, () => {
      console.log(
        "moodpage on http://localhost:" + PORT,
        accounts ? "(with friends)" : "(no DATABASE_URL: no friends)",
      );
    });
  })
  .catch((error) => {
    console.error("database could not be prepared:", error.code || error.message);
    process.exit(1);
  });
