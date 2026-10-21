// Stones, invite pages, the privacy page, and the files that let links open the app.
const BASE = process.env.BASE;
let failures = 0;
const check = (label, ok, extra = "") => { console.log((ok ? "ok   " : "FAIL ") + label + (extra ? "  " + extra : "")); if (!ok) failures++; };
const api = async (method, path, token, body) => {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const page = async (path) => { const r = await fetch(BASE + path); return { status: r.status, type: r.headers.get("content-type"), text: await r.text() }; };
(async () => {
  const A = (await api("POST", "/api/account", null, { name: "Ras <b>&" })).body;
  const B = (await api("POST", "/api/account", null, { name: "Mara" })).body;
  const C = (await api("POST", "/api/account", null, { name: "Cleo" })).body;
  const code = (await api("POST", "/api/invites", A.token)).body.code;

  let p = await page("/invite/" + code);
  check("invite page shows who and the code", p.status === 200 && p.text.includes("would like to share weather") && p.text.includes(code.slice(0, 4) + "-" + code.slice(4)));
  check("invite page escapes the name", p.text.includes("Ras &lt;b&gt;&amp;") && !p.text.includes("<b>&"));
  check("invite page links into the app", p.text.includes("moodpage://invite/" + code));
  check("invite page offers the install link", p.text.includes("https://testflight.apple.com/join/TEST"));
  p = await page("/invite/NOPE2345");
  check("unknown invite page is 404", p.status === 404 && p.text.includes("expired"));

  p = await page("/privacy");
  check("privacy page", p.status === 200 && p.type.startsWith("text/html") && p.text.includes("What stays on your phone") && p.text.includes("hello@example.com"));
  check("privacy source is not served raw", (await page("/server/privacy.html")).status === 404);

  p = await page("/.well-known/apple-app-site-association");
  let aasa = null; try { aasa = JSON.parse(p.text); } catch {}
  check("apple-app-site-association", p.status === 200 && p.type === "application/json" && aasa.applinks.details[0].appIDs[0] === "ABCDE12345.de.therascal.moodpage" && aasa.applinks.details[0].components[0]["/"] === "/invite/*");
  check("assetlinks 404 without a certificate", (await page("/.well-known/assetlinks.json")).status === 404);
  check("other dotfiles still hidden", (await page("/.gitignore")).status === 404 && (await page("/server/.env.example")).status === 404);

  await api("POST", "/api/invites/" + code + "/accept", B.token);
  const gestures = [
    { t: "drop", x: 0.5, y: 0.5, s: 1, at: 0 },
    { t: "stroke", x0: 0.1, y0: 0.2, x1: 0.2, y1: 0.3, s: 1, at: 120 },
    { t: "stroke", x0: 2, y0: 0.2, x1: 0.2, y1: 0.3, s: 1, at: 150 },
    { t: "nope", at: 160 }, { t: "drop", x: 0.3, y: 0.3, at: 999999 },
  ];
  let r = await api("POST", "/api/friends/" + A.id + "/stones", B.token, { gestures });
  check("B leaves a stone for A (bad gestures dropped)", r.status === 201 && r.body.left === 3, JSON.stringify(r.body));
  r = await api("POST", "/api/friends/" + A.id + "/stones", C.token, { gestures });
  check("a stranger cannot leave a stone", r.status === 404);
  r = await api("POST", "/api/friends/" + A.id + "/stones", B.token, { gestures: [] });
  check("an empty stone is refused", r.status === 400);
  for (let i = 0; i < 4; i++) await api("POST", "/api/friends/" + A.id + "/stones", B.token, { gestures: [{ t: "drop", x: 0.1 * (i + 1), y: 0.5, at: 0 }] });
  r = await api("GET", "/api/stones", A.token);
  check("A receives the newest 3 from B, with B's name", r.status === 200 && r.body.stones.length === 3 && r.body.stones.every((s) => s.from.name === "Mara"), String(r.body.stones?.length));
  check("stones come in order, clamped", r.body.stones[0].gestures[0].x === 0.2 && r.body.stones[2].gestures[0].x === 0.4);
  r = await api("GET", "/api/stones", A.token);
  check("stones are delivered once", r.body.stones.length === 0);
  r = await api("GET", "/api/stones", B.token);
  check("B has none", r.body.stones.length === 0);

  await api("POST", "/api/friends/" + A.id + "/stones", B.token, { gestures });
  await api("DELETE", "/api/friends/" + B.id, A.token);
  r = await api("GET", "/api/stones", A.token);
  check("unfriending sinks waiting stones", r.body.stones.length === 0);

  check("site still served", (await page("/")).status === 200);
  console.log(failures ? failures + " FAILED" : "all passed");
  process.exit(failures ? 1 : 0);
})();
