/*
 * The database: accounts, friendships, invites and each person's latest
 * weather. Never diary entries: those stay on the phone.
 *
 * Postgres, reached through DATABASE_URL (on Coolify, the internal URL of a
 * Postgres resource). The tables are created and updated on start by the
 * migrations below; add a new one at the end, never edit an old one.
 */
"use strict";

const { Pool } = require("pg");

const MIGRATIONS = [
  `
  CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- sha256 of the account's secret; the secret itself is only on the phone
    token_hash text NOT NULL UNIQUE,
    -- how friends see you; empty until you choose one
    name text,
    -- your latest weather, as friends see it: never the entry
    mood jsonb,
    mood_date date,
    mood_updated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE invites (
    code text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX invites_user ON invites (user_id);

  -- one row per pair, the smaller id first
  CREATE TABLE friendships (
    a uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    b uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (a, b),
    CHECK (a < b)
  );
  CREATE INDEX friendships_b ON friendships (b);
  `,
];

const createDb = (url) => {
  const pool = new Pool({ connectionString: url, max: 10 });
  pool.on("error", (error) => {
    console.error("database error:", error.code || error.message);
  });

  const query = (text, params) => pool.query(text, params);

  // Runs every migration that has not run yet, each in its own transaction.
  const migrate = async () => {
    await query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await query("SELECT version FROM schema_migrations");
    const done = new Set(rows.map((row) => row.version));
    for (let version = 1; version <= MIGRATIONS.length; version += 1) {
      if (done.has(version)) {
        continue;
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(MIGRATIONS[version - 1]);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
        await client.query("COMMIT");
        console.log("database: migration", version, "applied");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    }
  };

  return { query, migrate, close: () => pool.end() };
};

module.exports = { createDb };
