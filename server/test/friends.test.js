// Accounts, invites, friends, shared weather, visits and account deletion.
const WebSocket = require("ws");
const BASE = process.env.BASE;
const WS = BASE.replace(/^http/, "ws");
let failures = 0;
const check = (label, ok, extra = "") => { console.log((ok ? "ok   " : "FAIL ") + label + (extra ? "  " + extra : "")); if (!ok) failures++; };
const api = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const visit = (visitId, token) => new Promise((resolve) => {
  const ws = new WebSocket(WS);
  const got = [];
  ws.on("open", () => ws.send(JSON.stringify({ t: "join", visit: visitId, token })));
  ws.on("message", (m) => got.push(JSON.parse(m)));
  ws.on("close", (code) => resolve({ ws, got, code }));
  setTimeout(() => resolve({ ws, got, code: null }), 800);
});
(async () => {
  let r = await api("POST", "/api/account", null, { name: "  Ras   " });
  check("create account A", r.status === 201 && r.body.token && r.body.name === "Ras", JSON.stringify(r.body).slice(0, 80));
  const A = r.body;
  r = await api("POST", "/api/account", null, {});
  check("create account B without a name", r.status === 201 && r.body.name === null);
  const B = r.body;
  r = await api("POST", "/api/account", null, {});
  const C = r.body;

  check("me without token is 401", (await api("GET", "/api/me")).status === 401);
  check("me with bad token is 401", (await api("GET", "/api/me", "nope")).status === 401);
  r = await api("PATCH", "/api/me", B.token, { name: "Mara" });
  check("B sets a name", r.status === 200 && r.body.name === "Mara");

  r = await api("POST", "/api/mood", null, { entry: "x" });
  check("translate needs an account", r.status === 401);
  r = await api("POST", "/api/mood", A.token, { entry: "x" });
  check("translate with account, no key: 503", r.status === 503, JSON.stringify(r.body));

  const mood = { title: "Low, Grey, Held", palette: { night: "#0a0b0c", deep: "#111", haze: "#333333", light: "#cccccc", glow: "#ffaa66" }, composition: { cloudCover: 7 }, evil: "<script>" };
  r = await api("PUT", "/api/me/mood", A.token, { mood, date: "2026-10-21" });
  check("A shares a mood", r.status === 200);
  r = await api("PUT", "/api/me/mood", A.token, { mood });
  check("mood without date is 400", r.status === 400);

  r = await api("GET", "/api/friends", B.token);
  check("B has no friends yet", r.status === 200 && r.body.friends.length === 0);

  r = await api("POST", "/api/invites", A.token);
  check("A makes an invite", r.status === 201 && /^[2-9A-Z]{8}$/.test(r.body.code), r.body.code);
  const code = r.body.code;
  r = await api("GET", "/api/invites/" + code.toLowerCase().slice(0, 4) + "-" + code.slice(4));
  check("invite lookup (any case, dashes)", r.status === 200 && r.body.from.name === "Ras", JSON.stringify(r.body));
  r = await api("POST", "/api/invites/" + code + "/accept", A.token);
  check("A cannot accept own invite", r.status === 400);
  r = await api("POST", "/api/invites/" + code + "/accept", B.token);
  check("B accepts", r.status === 200 && r.body.friend.name === "Ras");
  r = await api("POST", "/api/invites/" + code + "/accept", C.token);
  check("invite is single-use", r.status === 404);

  r = await api("GET", "/api/friends", B.token);
  const f = r.body.friends[0] || {};
  check("B sees A with A's mood", f.name === "Ras" && f.moodDate === "2026-10-21" && f.mood && f.mood.title === "Low, Grey, Held", JSON.stringify({ name: f.name, date: f.moodDate }));
  check("shared mood is clamped", f.mood && f.mood.composition.cloudCover === 0.95 && f.mood.palette.deep === "#1a2224" && !("evil" in f.mood));
  r = await api("GET", "/api/friends", A.token);
  check("A sees B", r.body.friends.length === 1 && r.body.friends[0].name === "Mara" && r.body.friends[0].mood === null);
  check("C sees nobody", (await api("GET", "/api/friends", C.token)).body.friends.length === 0);

  let v = await visit(A.id, B.token);
  check("B may visit A", v.got.some((m) => m.t === "welcome" && m.room === "home:" + A.id), JSON.stringify(v.got));
  const a = await visit(A.id, A.token);
  check("A is home too, second colour", a.got.some((m) => m.t === "welcome" && m.slot === 1));
  const drop = new Promise((res) => { v.ws.on("message", (m) => { const x = JSON.parse(m); if (x.t === "drop") res(x); }); setTimeout(() => res(null), 800); });
  a.ws.send(JSON.stringify({ t: "drop", x: 0.5, y: 0.5, s: 1 }));
  const d = await drop;
  check("A's drop reaches B in A's colour", d && d.c === 1);
  const c = await visit(A.id, C.token);
  check("C may not visit A", c.got.some((m) => m.t === "denied") && c.code === 4003);
  const nobody = await visit(A.id, "nope");
  check("bad token may not visit", nobody.code === 4003);
  v.ws.close(); a.ws.close();

  r = await api("DELETE", "/api/friends/" + A.id, B.token);
  check("B removes A", r.status === 200 && (await api("GET", "/api/friends", B.token)).body.friends.length === 0);
  const after = await visit(A.id, B.token);
  check("B may no longer visit", after.code === 4003);

  r = await api("POST", "/api/invites", A.token);
  r = await api("DELETE", "/api/me", A.token);
  check("A deletes the account", r.status === 200 && (await api("GET", "/api/me", A.token)).status === 401);

  const ws = new WebSocket(WS);
  const open = await new Promise((res) => { ws.on("open", () => ws.send(JSON.stringify({ t: "join", room: "water" }))); ws.on("message", (m) => res(JSON.parse(m))); });
  check("plain named rooms still work", open.t === "welcome" && open.room === "water");
  ws.close();
  check("site still served", (await fetch(BASE + "/")).status === 200);
  check("unknown api is 404", (await api("GET", "/api/nope")).status === 404);
  console.log(failures ? failures + " FAILED" : "all passed");
  process.exit(failures ? 1 : 0);
})();
