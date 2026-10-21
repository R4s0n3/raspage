/*
 * The one network call the diary makes: an entry goes to the moodpage server
 * (server.js, POST /api/mood) to be turned into weather, and the mood comes
 * back. The server keeps nothing.
 */
import type { Mood } from "./mood";

const API = (process.env.EXPO_PUBLIC_MOODPAGE_API || "http://localhost:8787").replace(/\/$/, "");
const TOKEN = process.env.EXPO_PUBLIC_MOODPAGE_TOKEN || "";

export class TranslateError extends Error {}

export const translateEntry = async (entry: string, date: string): Promise<Mood> => {
  let response: Response;
  try {
    response = await fetch(API + "/api/mood", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(TOKEN ? { authorization: "Bearer " + TOKEN } : {}),
      },
      body: JSON.stringify({ entry, date }),
    });
  } catch {
    throw new TranslateError("Couldn't reach the weather. Check your connection and try again.");
  }

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.mood?.palette) {
    if (response.status === 429) {
      throw new TranslateError("That's a lot of weather for one hour. Try again a little later.");
    }
    throw new TranslateError(body?.error ? `The weather couldn't be made: ${body.error}.` : "The weather couldn't be made. Try again.");
  }
  return body.mood as Mood;
};
