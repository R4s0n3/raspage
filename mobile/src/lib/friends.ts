/*
 * Friends: who they are, their latest weather, and invites. Only weather is
 * ever shared, never words.
 */
import { asMe, getAccount } from "./account";
import { diary } from "./diary";
import type { Mood } from "./mood";
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
