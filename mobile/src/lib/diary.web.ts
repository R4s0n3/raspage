/*
 * The diary in a browser: localStorage, for development on the web build.
 * (SQLite on web needs WebAssembly and cross-origin isolation headers; the
 * phone uses diary.ts.)
 */
import type { Day, Diary } from "./diary-types";

export type { Day } from "./diary-types";

const KEY = "moodpage.days";

const read = (): Record<string, Day> => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(KEY) || "{}");
  } catch {
    return {};
  }
};

export const diary: Diary = {
  async getDay(date) {
    return read()[date] ?? null;
  },

  async listDays() {
    return Object.values(read()).sort((a, b) => b.date.localeCompare(a.date));
  },

  async saveDay(day) {
    const days = read();
    days[day.date] = day;
    globalThis.localStorage?.setItem(KEY, JSON.stringify(days));
  },
};
