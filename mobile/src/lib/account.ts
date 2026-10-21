/*
 * Your account: a secret key this app makes on first use and keeps in the
 * keychain. The server only ever sees it to recognise you, stores just its
 * hash, and knows nothing else about you but the name you give your friends.
 */
import { deleteSecret, readSecret, writeSecret } from "./secret";
import { request, ServerError } from "./server";

export type Account = { id: string; token: string; name: string | null };

const KEY = "moodpage.account";

let cached: Account | null | undefined;

export const getAccount = async (): Promise<Account | null> => {
  if (cached === undefined) {
    const stored = await readSecret(KEY);
    try {
      cached = stored ? (JSON.parse(stored) as Account) : null;
    } catch {
      cached = null;
    }
  }
  return cached;
};

const store = async (account: Account | null) => {
  cached = account;
  if (account) {
    await writeSecret(KEY, JSON.stringify(account));
  } else {
    await deleteSecret(KEY);
  }
};

// The account, made now if there is none. Null when the server has no
// accounts (no database: 503; an older server: 404): the app then works
// alone, as before.
export const ensureAccount = async (): Promise<Account | null> => {
  const existing = await getAccount();
  if (existing) {
    return existing;
  }
  try {
    const made = await request<Account>("/api/account", { method: "POST", body: {} });
    await store({ id: made.id, token: made.token, name: made.name });
    return cached!;
  } catch (error) {
    if (error instanceof ServerError && (error.status === 503 || error.status === 404)) {
      return null;
    }
    throw error;
  }
};

// A call made as you. If the server no longer knows the account (its
// database was reset), a new one is made and the call tried once more.
export const asMe = async <T>(path: string, options: { method?: string; body?: unknown } = {}) => {
  const account = await ensureAccount();
  if (!account) {
    throw new ServerError(503, "friends are not configured on this server");
  }
  try {
    return await request<T>(path, { ...options, token: account.token });
  } catch (error) {
    if (error instanceof ServerError && error.status === 401) {
      await store(null);
      const fresh = await ensureAccount();
      if (fresh) {
        if (account.name) {
          await request("/api/me", { method: "PATCH", body: { name: account.name }, token: fresh.token });
          await store({ ...fresh, name: account.name });
        }
        return request<T>(path, { ...options, token: fresh.token });
      }
    }
    throw error;
  }
};

export const setName = async (name: string) => {
  const me = await asMe<{ id: string; name: string | null }>("/api/me", {
    method: "PATCH",
    body: { name },
  });
  const account = await getAccount();
  if (account) {
    await store({ ...account, name: me.name });
  }
  return me.name;
};

// Deletes the account on the server (friends, invites, shared weather) and
// forgets it here. The diary stays: it was never on the server.
export const deleteAccount = async () => {
  const account = await getAccount();
  if (account) {
    await request("/api/me", { method: "DELETE", token: account.token }).catch((error) => {
      if (!(error instanceof ServerError && error.status === 401)) {
        throw error;
      }
    });
  }
  await store(null);
};
