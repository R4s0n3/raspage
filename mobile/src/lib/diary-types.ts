import type { Mood } from "./mood";

// One day in the diary. The entry never leaves the device except once, to be
// translated; the mood is the only part that will ever be shared.
export type Day = {
  date: string;
  entry: string;
  mood: Mood;
  createdAt: number;
};

export type Diary = {
  getDay(date: string): Promise<Day | null>;
  // Every day with weather, newest first.
  listDays(): Promise<Day[]>;
  saveDay(day: Day): Promise<void>;
};
