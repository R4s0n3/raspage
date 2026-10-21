/*
 * Friends: who they are, their latest weather, and invites. Only weather is
 * ever shared, never words.
 */
import { asMe, getAccount } from "./account";
import { diary } from "./diary";
import type { Gesture, Mood } from "./mood";
import { request } from "./server";

export type Friend = {
  id: string;
  name: string | null;
  mood: Mood | null;
  moodDate: string | null;
};

export const listFriends = async () => (await asMe<{ friends: Friend[] }>("/api/friends")).friends;

export const removeFriend = (id: string) => asMe(`/api/friends/${id}`, { method: "DELETE" });

export const createInvite = () => asMe<{ code: string; expiresAt: string }>("/api/invites", { method: "POST" });

// Anyone may look an invite up, to see who it is from before accepting.
export const lookupInvite = (code: string) =>
  request<{ from: { name: string | null } }>(`/api/invites/${encodeURIComponent(code)}`);

export const acceptInvite = (code: string) =>
  asMe<{ friend: Friend }>(`/api/invites/${encodeURIComponent(code)}/accept`, { method: "POST" });

export const shareMood = (mood: Mood, date: string) =>
  asMe("/api/me/mood", { method: "PUT", body: { mood, date } });

// Your newest day's weather, for your friends. Quietly does nothing without
// an account or a day; a failure only means friends see it a little later.
export const shareLatest = async () => {
  if (!(await getAccount())) {
    return;
  }
  const [latest] = await diary.listDays();
  if (latest) {
    await shareMood(latest.mood, latest.date).catch(() => {});
  }
};

// Invite codes are read aloud and typed: XXXX-XXXX.
export const formatCode = (code: string) => code.replace(/^(.{4})(.{4})$/, "$1-$2");

export type Stone = {
  from: { id: string; name: string | null };
  gestures: Gesture[];
  createdAt: string;
};

// Touches from a visit, made into a stone: times start at zero, and long
// pauses shrink to a breath, so the whole visit replays in under two
// minutes.
export const toStone = (gestures: Gesture[]): Gesture[] => {
  const sorted = [...gestures].sort((a, b) => a.at - b.at).slice(0, 400);
  let clock = 0;
  let last = sorted[0]?.at ?? 0;
  return sorted
    .map((g) => {
      clock += Math.min(g.at - last, 1200);
      last = g.at;
      return { ...g, at: clock };
    })
    .filter((g) => g.at <= 120000);
};

export const leaveStone = (friendId: string, gestures: Gesture[]) =>
  asMe(`/api/friends/${friendId}/stones`, { method: "POST", body: { gestures: toStone(gestures) } });

// Stones left for you since you last looked. Reading them uses them up.
export const collectStones = async (): Promise<Stone[]> => {
  if (!(await getAccount())) {
    return [];
  }
  return (await asMe<{ stones: Stone[] }>("/api/stones")).stones;
};
