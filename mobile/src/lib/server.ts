/*
 * The moodpage server (server/ at the repository root): where it is, and one
 * way to talk to it.
 */
export const API = (process.env.EXPO_PUBLIC_MOODPAGE_API || "http://localhost:8787").replace(/\/$/, "");

// The relay lives on the same origin, over WebSockets.
export const RELAY = API.replace(/^http/, "ws");

export class ServerError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// status 0: the server could not be reached at all.
export const request = async <T>(
  path: string,
  { method = "GET", body, token }: { method?: string; body?: unknown; token?: string } = {},
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(API + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ServerError(0, "unreachable");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ServerError(response.status, data?.error || "something went wrong");
  }
  return data as T;
};
