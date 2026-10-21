import { ENGINE_HTML } from "@/engine/engine-html";
import type { Gesture, Mood } from "@/lib/mood";

export type { Gesture } from "@/lib/mood";

// Someone's own water on the relay, which lets in only them and their
// friends.
export type Visit = { url: string; visit: string; token: string };

// JSON inside a <script> must not be able to close the tag.
const inline = (value: unknown) =>
  value ? JSON.stringify(value).replace(/</g, "\\u003c") : "null";

// The engine page with its first mood (and room, if any) written in.
export const moodHtml = (mood: Mood | null, room: Visit | null = null) =>
  ENGINE_HTML.replace("/*__MOOD__*/null", inline(mood)).replace("/*__ROOM__*/null", inline(room));

export type MoodViewProps = {
  mood: Mood | null;
  // Off screen or behind a modal: stop drawing, keep the state.
  paused?: boolean;
  // Draw together in someone's water. Fixed when the view is made.
  room?: Visit | null;
  // How many are in the shared water, you included.
  onPeers?: (count: number) => void;
  // While true, each of your touches is handed to onGesture (for stones).
  record?: boolean;
  onGesture?: (gesture: Gesture) => void;
  // Touches to play back; a new id plays a new replay.
  replay?: Replay | null;
};

export type Replay = { id: string; gestures: Gesture[]; slot?: number };

// What the engine page says back (src/engine/host.js and log.js).
export type PageMessage =
  | { type: "ready" }
  | { type: "peers"; count: number }
  | { type: "gesture"; gesture: Gesture }
  | { type: "log"; level: "error" | "warn" | "info"; message: string };

// The page's own log lines, in the app's log while developing.
export const logFromPage = (message: PageMessage) => {
  if (message.type === "log" && __DEV__) {
    console.log(`[weather ${message.level}]`, message.message);
  }
};
