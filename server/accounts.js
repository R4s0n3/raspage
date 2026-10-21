/*
 * Accounts, invites and friends.
 *
 * An account is a secret the app makes on first use and keeps in the phone's
 * keychain; the server stores only its sha256. There is no email, password,
 * or profile: just an optional name your friends see, and your latest
 * weather, which only friends can read. Friends find each other through
 * invite codes, never by searching.
 *
 *   POST   /api/account                 make an account      → { id, token }
 *   GET    /api/me                      your account
 *   PATCH  /api/me          { name }
 *   DELETE /api/me                      delete everything about you
 *   PUT    /api/me/mood     { mood, date }   share your weather with friends
 *   DELETE /api/me/mood                 stop sharing it
 *   POST   /api/invites                 a new invite code    → { code, expiresAt }
 *   GET    /api/invites/:code           who it is from       → { from: { name } }
 *   POST   /api/invites/:code/accept    become friends       → { friend }
 *   GET    /api/friends                 your friends and their weather
 *   DELETE /api/friends/:id             no longer friends
 *   POST   /api/friends/:id/stones  { gestures }   leave touches in a friend's
 *                                       water while they are away
 *   GET    /api/stones                  touches left for you (delivered once)
 */
"use strict";

const crypto = require("crypto");
const {
  HttpError,
  sendJson,
  readJson,
  clientAddress,
  bearer,
  limiter,
} = require("./http");

const INVITE_DAYS = 7;
const INVITES_PER_USER = 20; // open invites at once
const NAME_LENGTH = 40;
// No 0/O, 1/I/L: codes are read aloud and typed by hand.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STONE_GESTURES = 400; // per stone
const STONE_SPAN = 120000; // ms: a stone replays within two minutes
const STONES_PER_FRIEND = 3; // waiting at once from one friend
const STONE_DAYS = 7; // undelivered stones sink after a week

const unit = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;

// Only well-formed drops and strokes, with their time, in order: the same
// shapes the relay forwards live.
const cleanGestures = (list) => {
  if (!Array.isArray(list)) {
    return [];
  }
  const out = [];
  for (const g of list.slice(0, STONE_GESTURES)) {
    if (!g || typeof g !== "object") {
      continue;
    }
    const at = typeof g.at === "number" && Number.isFinite(g.at) ? Math.round(Math.min(Math.max(g.at, 0), STONE_SPAN)) : null;
    const s = unit(g.s) ? g.s : 1;
    if (at === null) {
      continue;
    }
    if (g.t === "drop" && unit(g.x) && unit(g.y)) {
      out.push({ t: "drop", x: g.x, y: g.y, s, at });
    } else if (g.t === "stroke" && unit(g.x0) && unit(g.y0) && unit(g.x1) && unit(g.y1)) {
      out.push({ t: "stroke", x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1, s, at });
    }
  }
  return out.sort((a, b) => a.at - b.at);
};

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

const newCode = () =>
  Array.from({ length: 8 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join("");

const cleanCode = (value) =>
  String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);

const cleanName = (value) => {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new HttpError(400, "name must be text");
  }
  const name = value.replace(/\s+/g, " ").trim().slice(0, NAME_LENGTH);
  return name || null;
};

const isDay = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

// What friends see of each other.
const friendView = (row) => ({
  id: row.id,
  name: row.name,
  mood: row.mood,
  moodDate: row.mood_date ? formatDay(row.mood_date) : null,
});

// node-postgres reads a date column as a local Date at midnight.
const formatDay = (value) => {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

const createAccounts = ({ db, clampMood, base }) => {
  const newAccounts = limiter(10, 60 * 60 * 1000); // per address per hour
  const inviteLookups = limiter(60, 60 * 60 * 1000);

  // The account behind a bearer token, or null.
  const authenticate = async (token) => {
    if (!token || token.length > 200) {
      return null;
    }
    const { rows } = await db.query("SELECT * FROM users WHERE token_hash = $1", [hash(token)]);
    return rows[0] || null;
  };

  const requireUser = async (request) => {
    const user = await authenticate(bearer(request));
    if (!user) {
      throw new HttpError(401, "unknown account");
    }
    return user;
  };

  const areFriends = async (one, other) => {
    if (one === other) {
      return true;
    }
    const [a, b] = one < other ? [one, other] : [other, one];
    const { rows } = await db.query("SELECT 1 FROM friendships WHERE a = $1 AND b = $2", [a, b]);
    return rows.length > 0;
  };

  const routes = [
    ["POST", /^\/api\/account$/, async (request) => {
      if (!newAccounts(clientAddress(request))) {
        throw new HttpError(429, "too many new accounts from here");
      }
      const body = await readJson(request, 4096);
      const name = body.name === undefined ? null : cleanName(body.name);
      const token = crypto.randomBytes(32).toString("base64url");
      const { rows } = await db.query(
        "INSERT INTO users (token_hash, name) VALUES ($1, $2) RETURNING id, name",
        [hash(token), name],
      );
      return [201, { id: rows[0].id, name: rows[0].name, token }];
    }],

    ["GET", /^\/api\/me$/, async (request) => {
      const user = await requireUser(request);
      return [200, friendView(user)];
    }],

    ["PATCH", /^\/api\/me$/, async (request) => {
      const user = await requireUser(request);
      const body = await readJson(request, 4096);
      const { rows } = await db.query(
        "UPDATE users SET name = $2 WHERE id = $1 RETURNING *",
        [user.id, cleanName(body.name)],
      );
      return [200, friendView(rows[0])];
    }],

    ["DELETE", /^\/api\/me$/, async (request) => {
      const user = await requireUser(request);
      // Friendships and invites go with it (ON DELETE CASCADE).
      await db.query("DELETE FROM users WHERE id = $1", [user.id]);
      return [200, { deleted: true }];
    }],

    // The weather is checked and clamped like a translated one, so a friend
    // can only ever receive a mood the engine can draw.
    ["PUT", /^\/api\/me\/mood$/, async (request) => {
      const user = await requireUser(request);
      const body = await readJson(request, 64 * 1024);
      if (!body.mood || typeof body.mood !== "object" || !isDay(body.date)) {
        throw new HttpError(400, "send { mood, date }");
      }
      const mood = clampMood(body.mood, base, body.date);
      await db.query(
        "UPDATE users SET mood = $2, mood_date = $3, mood_updated_at = now() WHERE id = $1",
        [user.id, mood, body.date],
      );
      return [200, { shared: true }];
    }],

    ["DELETE", /^\/api\/me\/mood$/, async (request) => {
      const user = await requireUser(request);
      await db.query(
        "UPDATE users SET mood = NULL, mood_date = NULL, mood_updated_at = NULL WHERE id = $1",
        [user.id],
      );
      return [200, { shared: false }];
    }],

    ["POST", /^\/api\/invites$/, async (request) => {
      const user = await requireUser(request);
      await db.query("DELETE FROM invites WHERE expires_at < now()");
      const { rows: open } = await db.query(
        "SELECT count(*)::int AS n FROM invites WHERE user_id = $1",
        [user.id],
      );
      if (open[0].n >= INVITES_PER_USER) {
        throw new HttpError(429, "too many open invites");
      }
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = newCode();
        const { rows } = await db.query(
          `INSERT INTO invites (code, user_id, expires_at)
           VALUES ($1, $2, now() + make_interval(days => $3))
           ON CONFLICT (code) DO NOTHING
           RETURNING code, expires_at`,
          [code, user.id, INVITE_DAYS],
        );
        if (rows[0]) {
          return [201, { code: rows[0].code, expiresAt: rows[0].expires_at }];
        }
      }
      throw new HttpError(503, "try again");
    }],

    ["GET", /^\/api\/invites\/([^/]+)$/, async (request, [code]) => {
      if (!inviteLookups(clientAddress(request))) {
        throw new HttpError(429, "too many lookups");
      }
      const { rows } = await db.query(
        `SELECT users.name FROM invites JOIN users ON users.id = invites.user_id
         WHERE invites.code = $1 AND invites.expires_at > now()`,
        [cleanCode(code)],
      );
      if (!rows[0]) {
        throw new HttpError(404, "this invite has expired or does not exist");
      }
      return [200, { from: { name: rows[0].name } }];
    }],

    // An invite is used once: accepting it removes it.
    ["POST", /^\/api\/invites\/([^/]+)\/accept$/, async (request, [code]) => {
      const user = await requireUser(request);
      const { rows } = await db.query(
        `DELETE FROM invites WHERE code = $1 AND expires_at > now() AND user_id <> $2
         RETURNING user_id`,
        [cleanCode(code), user.id],
      );
      if (!rows[0]) {
        // Your own invite stays open for the friend it was meant for.
        const { rows: own } = await db.query(
          "SELECT 1 FROM invites WHERE code = $1 AND user_id = $2",
          [cleanCode(code), user.id],
        );
        throw own[0]
          ? new HttpError(400, "this is your own invite")
          : new HttpError(404, "this invite has expired or does not exist");
      }
      const from = rows[0].user_id;
      const [a, b] = user.id < from ? [user.id, from] : [from, user.id];
      await db.query(
        "INSERT INTO friendships (a, b) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [a, b],
      );
      const { rows: friend } = await db.query("SELECT * FROM users WHERE id = $1", [from]);
      return [200, { friend: friendView(friend[0]) }];
    }],

    ["GET", /^\/api\/friends$/, async (request) => {
      const user = await requireUser(request);
      const { rows } = await db.query(
        `SELECT users.* FROM friendships
         JOIN users ON users.id = CASE WHEN friendships.a = $1 THEN friendships.b ELSE friendships.a END
         WHERE friendships.a = $1 OR friendships.b = $1
         ORDER BY users.mood_updated_at DESC NULLS LAST, users.created_at`,
        [user.id],
      );
      return [200, { friends: rows.map(friendView) }];
    }],

    ["POST", /^\/api\/friends\/([^/]+)\/stones$/, async (request, [id]) => {
      const user = await requireUser(request);
      if (!UUID.test(id) || id === user.id || !(await areFriends(user.id, id))) {
        throw new HttpError(404, "not a friend");
      }
      const body = await readJson(request, 256 * 1024);
      const gestures = cleanGestures(body.gestures);
      if (!gestures.length) {
        throw new HttpError(400, "send { gestures }");
      }
      await db.query(
        "INSERT INTO stones (to_user, from_user, gestures) VALUES ($1, $2, $3)",
        [id, user.id, JSON.stringify(gestures)],
      );
      // Only the newest few from one friend wait; older ones sink.
      await db.query(
        `DELETE FROM stones WHERE id IN (
           SELECT id FROM stones WHERE to_user = $1 AND from_user = $2
           ORDER BY id DESC OFFSET $3)`,
        [id, user.id, STONES_PER_FRIEND],
      );
      return [201, { left: gestures.length }];
    }],

    // Delivered once: reading them removes them.
    ["GET", /^\/api\/stones$/, async (request) => {
      const user = await requireUser(request);
      await db.query(
        "DELETE FROM stones WHERE created_at < now() - make_interval(days => $1)",
        [STONE_DAYS],
      );
      const { rows } = await db.query(
        `DELETE FROM stones WHERE to_user = $1
         RETURNING id, from_user, gestures, created_at`,
        [user.id],
      );
      if (!rows.length) {
        return [200, { stones: [] }];
      }
      const { rows: senders } = await db.query(
        "SELECT id, name FROM users WHERE id = ANY($1::uuid[])",
        [[...new Set(rows.map((row) => row.from_user))]],
      );
      const names = new Map(senders.map((row) => [row.id, row.name]));
      const stones = rows
        .sort((a, b) => Number(a.id) - Number(b.id))
        .map((row) => ({
          from: { id: row.from_user, name: names.get(row.from_user) ?? null },
          gestures: row.gestures,
          createdAt: row.created_at,
        }));
      return [200, { stones }];
    }],

    ["DELETE", /^\/api\/friends\/([^/]+)$/, async (request, [id]) => {
      const user = await requireUser(request);
      if (!UUID.test(id)) {
        throw new HttpError(404, "not a friend");
      }
      const [a, b] = user.id < id ? [user.id, id] : [id, user.id];
      await db.query("DELETE FROM friendships WHERE a = $1 AND b = $2", [a, b]);
      // Touches still waiting between the two go with the friendship.
      await db.query(
        "DELETE FROM stones WHERE (to_user = $1 AND from_user = $2) OR (to_user = $2 AND from_user = $1)",
        [user.id, id],
      );
      return [200, { removed: true }];
    }],
  ];

  // Answers the request if it is one of these routes; false otherwise.
  const handle = async (request, response, pathname) => {
    for (const [method, pattern, run] of routes) {
      const match = pathname.match(pattern);
      if (!match || request.method !== method) {
        continue;
      }
      try {
        const [status, body] = await run(request, match.slice(1));
        sendJson(response, status, body);
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(response, error.status, { error: error.message });
        } else {
          console.error("api error:", error.code || error.message);
          sendJson(response, 500, { error: "something went wrong" });
        }
      }
      return true;
    }
    return false;
  };

  return { handle, authenticate, areFriends };
};

module.exports = { createAccounts };
