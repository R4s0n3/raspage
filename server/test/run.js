/*
 * Runs the server tests against a real Postgres engine: PGlite in memory,
 * served over the Postgres protocol, so server.js talks to it through `pg`
 * exactly as it talks to the database on Coolify. No translation key, so
 * nothing is sent to OpenRouter.
 *
 *   npm test --workspace server
 */
"use strict";

const { spawn } = require("child_process");
const path = require("path");

const DB_PORT = 54329;
const PORT = 8798;

const runFile = (file, env) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { env, stdio: "inherit" });
    child.on("exit", (code) => resolve(code === 0));
  });

(async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  const db = await PGlite.create();
  const dbServer = new PGLiteSocketServer({ db, port: DB_PORT, host: "127.0.0.1", maxConnections: 10 });
  await dbServer.start();

  const env = {
    ...process.env,
    PORT: String(PORT),
    DATABASE_URL: `postgres://postgres@127.0.0.1:${DB_PORT}/postgres`,
    OPENROUTER_API_KEY: "",
    APPLE_TEAM_ID: "ABCDE12345",
    ANDROID_CERT_SHA256: "",
    APP_INSTALL_URL: "https://testflight.apple.com/join/TEST",
    MOODPAGE_CONTACT: "hello@example.com",
  };
  const server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (chunk) => String(chunk).includes("moodpage on") && resolve());
    server.on("exit", () => reject(new Error("server did not start")));
  });

  let ok = true;
  for (const file of ["friends.test.js", "links-and-stones.test.js"]) {
    console.log(`\n${file}`);
    ok = (await runFile(path.join(__dirname, file), { ...env, BASE: `http://127.0.0.1:${PORT}` })) && ok;
  }

  server.kill();
  await dbServer.stop();
  await db.close();
  console.log(ok ? "\nall suites passed" : "\nSOME SUITES FAILED");
  process.exit(ok ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
