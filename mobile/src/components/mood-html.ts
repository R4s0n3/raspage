import { ENGINE_HTML } from "@/engine/engine-html";
import type { Mood } from "@/lib/mood";

// The engine page with its first mood written in. JSON inside a <script> must
// not be able to close the tag.
export const moodHtml = (mood: Mood | null) =>
  ENGINE_HTML.replace(
    "/*__MOOD__*/null",
    mood ? JSON.stringify(mood).replace(/</g, "\\u003c") : "null",
  );

export type MoodViewProps = {
  mood: Mood | null;
  // Off screen or behind a modal: stop drawing, keep the state.
  paused?: boolean;
};

// What the engine page says back (src/engine/host.js and log.js).
export type PageMessage =
  | { type: "ready" }
  | { type: "log"; level: "error" | "warn" | "info"; message: string };

// The page's own log lines, in the app's log while developing.
export const logFromPage = (message: PageMessage) => {
  if (message.type === "log" && __DEV__) {
    console.log(`[weather ${message.level}]`, message.message);
  }
};
