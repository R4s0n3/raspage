/*
 * The pages and files behind the app's links, on the server's own domain:
 *
 *   /invite/CODE                     an invite: who it is from, the code, a way
 *                                    into the app. With the app installed, the
 *                                    phone opens the app instead of this page.
 *   /privacy                         the privacy policy
 *   /.well-known/apple-app-site-association   lets iOS open /invite/ links in
 *                                    the app (needs APPLE_TEAM_ID)
 *   /.well-known/assetlinks.json     the same for Android (needs
 *                                    ANDROID_CERT_SHA256)
 *
 * The website itself stays wordless: these live beside it, not on it.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const BUNDLE_ID = process.env.IOS_BUNDLE_ID || "de.therascal.moodpage";
const PACKAGE = process.env.ANDROID_PACKAGE || "de.therascal.moodpage";
const TEAM_ID = (process.env.APPLE_TEAM_ID || "").trim();
const CERTS = (process.env.ANDROID_CERT_SHA256 || "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
// Where to get the app (a TestFlight or store link), shown on invite pages.
const INSTALL_URL = (process.env.APP_INSTALL_URL || "").trim();
// Who is responsible for the service, for the privacy policy. Set on the
// server (Coolify), so personal details stay out of the public repository.
const OPERATOR = (process.env.MOODPAGE_OPERATOR || "").trim();
const ADDRESS = (process.env.MOODPAGE_ADDRESS || "").trim();
const CONTACT = (process.env.MOODPAGE_CONTACT || "").trim();

const escape = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const cleanCode = (value) => String(value || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 16);
const formatCode = (code) => code.replace(/^(.{4})(.{4})$/, "$1-$2");

// The evening palette (mood.js), so these pages feel like the same place.
const page = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06080a">
<title>${escape(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; min-height: 100dvh;
    display: flex; align-items: center; justify-content: center;
    padding: 32px 22px;
    font: 17px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    color: #cfc8b2;
    background:
      radial-gradient(60% 45% at 50% 30%, rgba(217,148,79,.28), transparent 70%),
      linear-gradient(180deg, #06080a 0%, #1a2224 60%, #06080a 100%);
  }
  main { max-width: 34rem; width: 100%; }
  h1 { font-weight: 300; font-size: 1.45rem; line-height: 1.35; margin: 0 0 .8em; text-align: center; }
  h2 { font-weight: 500; font-size: 1.05rem; margin: 1.8em 0 .4em; color: #e0b27e; }
  p, li { opacity: .88; }
  .note { font-size: .9rem; opacity: .6; text-align: center; }
  .code { font-size: 2rem; letter-spacing: .18em; text-align: center; margin: .6em 0; color: #f2d3a6; }
  .actions { display: grid; gap: 12px; margin: 1.6em 0; }
  a.button {
    display: block; text-align: center; text-decoration: none;
    padding: 14px 20px; border-radius: 999px;
    border: 1px solid rgba(207,200,178,.25); color: #cfc8b2;
  }
  a.button.strong { background: rgba(207,200,178,.9); color: #06080a; border-color: transparent; }
  a { color: #e0b27e; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;

const sendHtml = (response, status, html) => {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html),
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
  });
  response.end(html);
};

const sendJsonFile = (response, body) => {
  const payload = JSON.stringify(body);
  response.writeHead(200, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "public, max-age=3600",
  });
  response.end(payload);
};

const notFound = (response) => {
  response.writeHead(404, { "content-type": "text/plain" });
  response.end("moodpage");
};

const PRIVACY = fs.readFileSync(path.join(__dirname, "privacy.html"), "utf8");

// The controller under the GDPR: name, postal address (one line per comma
// or newline), and an email address.
const controller = () => {
  if (!OPERATOR || !CONTACT) {
    return `<p><em>The operator's name and contact address have not been set on
      this server yet (MOODPAGE_OPERATOR, MOODPAGE_ADDRESS, MOODPAGE_CONTACT).</em></p>`;
  }
  const lines = [OPERATOR, ...ADDRESS.split(/\s*(?:\n|\\n|,)\s*/).filter(Boolean)].map(escape);
  return `<p>${lines.join("<br>")}<br>
    <a href="mailto:${escape(CONTACT)}">${escape(CONTACT)}</a></p>`;
};

const createLinks = ({ db }) => {
  const invitePage = async (response, raw) => {
    const code = cleanCode(raw);
    let from;
    if (db && code) {
      const { rows } = await db.query(
        `SELECT users.name FROM invites JOIN users ON users.id = invites.user_id
         WHERE invites.code = $1 AND invites.expires_at > now()`,
        [code],
      );
      from = rows[0] ? rows[0].name || "Someone" : null;
    }
    if (!from) {
      sendHtml(
        response,
        404,
        page(
          "moodpage",
          `<h1>This invite has expired or was already used.</h1>
           <p class="note">Ask your friend for a new one.</p>`,
        ),
      );
      return;
    }
    const open = `moodpage://invite/${code}`;
    sendHtml(
      response,
      200,
      page(
        "An invite to share weather",
        `<h1>${escape(from)} would like to share weather with you on moodpage.</h1>
         <p class="note">You will see each other's latest weather, never each other's words.</p>
         <div class="actions">
           <a class="button strong" href="${escape(open)}">Open in moodpage</a>
           ${INSTALL_URL ? `<a class="button" href="${escape(INSTALL_URL)}">Get the app</a>` : ""}
         </div>
         <p class="note">Or open Friends in the app, choose “I have a code” and enter:</p>
         <p class="code">${escape(formatCode(code))}</p>
         <p class="note">The invite is for one person and lasts seven days.</p>`,
      ),
    );
  };

  // Answers the request if it is one of these; false otherwise.
  const handle = async (request, response, pathname) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return false;
    }
    const invite = pathname.match(/^\/invite\/([^/]+)\/?$/);
    if (invite) {
      await invitePage(response, decodeURIComponent(invite[1]));
      return true;
    }
    if (pathname === "/privacy" || pathname === "/privacy/") {
      sendHtml(
        response,
        200,
        page(
          "moodpage · privacy",
          PRIVACY.replace("<!--CONTROLLER-->", controller()),
        ),
      );
      return true;
    }
    if (pathname === "/.well-known/apple-app-site-association") {
      if (!TEAM_ID) {
        notFound(response);
        return true;
      }
      const appID = `${TEAM_ID}.${BUNDLE_ID}`;
      // The newer format first, the older one for iOS before 13.
      sendJsonFile(response, {
        applinks: {
          details: [
            { appIDs: [appID], components: [{ "/": "/invite/*" }] },
            { appID, paths: ["/invite/*"] },
          ],
        },
      });
      return true;
    }
    if (pathname === "/.well-known/assetlinks.json") {
      if (!CERTS.length) {
        notFound(response);
        return true;
      }
      sendJsonFile(response, [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: PACKAGE, sha256_cert_fingerprints: CERTS },
        },
      ]);
      return true;
    }
    return false;
  };

  return { handle };
};

module.exports = { createLinks };
