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
