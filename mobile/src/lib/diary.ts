/*
 * The diary, on the device: one SQLite table, one row per day.
 */
import * as SQLite from "expo-sqlite";

import type { Day, Diary } from "./diary-types";

export type { Day } from "./diary-types";

type Row = { date: string; entry: string; mood: string; created_at: number };

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

const database = () => {
  opening ??= (async () => {
    const db = await SQLite.openDatabaseAsync("moodpage.db");
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS days (
        date TEXT PRIMARY KEY NOT NULL,
        entry TEXT NOT NULL,
        mood TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    return db;
  })();
  return opening;
};

const toDay = (row: Row): Day => ({
  date: row.date,
  entry: row.entry,
  mood: JSON.parse(row.mood),
  createdAt: row.created_at,
});

export const diary: Diary = {
  async getDay(date) {
    const db = await database();
    const row = await db.getFirstAsync<Row>(
      "SELECT * FROM days WHERE date = ?",
      date,
    );
    return row ? toDay(row) : null;
  },

  async listDays() {
    const db = await database();
    const rows = await db.getAllAsync<Row>(
      "SELECT * FROM days ORDER BY date DESC",
    );
    return rows.map(toDay);
  },

  async saveDay(day) {
    const db = await database();
    await db.runAsync(
      "INSERT OR REPLACE INTO days (date, entry, mood, created_at) VALUES (?, ?, ?, ?)",
      day.date,
      day.entry,
      JSON.stringify(day.mood),
      day.createdAt,
    );
  },
};
