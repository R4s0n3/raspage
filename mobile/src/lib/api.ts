/*
 * The one call that carries words: an entry goes to the moodpage server
 * (POST /api/mood) to be turned into weather, and the mood comes back. The
 * server keeps nothing.
 */
import { asMe, ensureAccount } from "./account";
import type { Mood } from "./mood";
import { request, ServerError } from "./server";

const TOKEN = process.env.EXPO_PUBLIC_MOODPAGE_TOKEN || "";

export class TranslateError extends Error {}

const explain = (error: unknown) => {
  if (error instanceof ServerError) {
    if (error.status === 0) {
      return "Couldn't reach the weather. Check your connection and try again.";
    }
    if (error.status === 429) {
      return "That's a lot of weather for one hour. Try again a little later.";
    }
    return `The weather couldn't be made: ${error.message}.`;
  }
  return "The weather couldn't be made. Try again.";
};

export const translateEntry = async (entry: string, date: string): Promise<Mood> => {
  const body = { entry, date };
  try {
    // With accounts on the server, translation is done as you (and a
    // forgotten account is replaced); without, the optional app token.
    const account = await ensureAccount();
    const { mood } = account
      ? await asMe<{ mood: Mood }>("/api/mood", { method: "POST", body })
      : await request<{ mood: Mood }>("/api/mood", { method: "POST", body, token: TOKEN });
    return mood;
  } catch (error) {
    throw new TranslateError(explain(error));
  }
};
