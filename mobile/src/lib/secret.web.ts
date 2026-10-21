/*
 * The web build's stand-in for the keychain: localStorage, for development.
 */
export const readSecret = async (key: string) => globalThis.localStorage?.getItem(key) ?? null;

export const writeSecret = async (key: string, value: string) => {
  globalThis.localStorage?.setItem(key, value);
};

export const deleteSecret = async (key: string) => {
  globalThis.localStorage?.removeItem(key);
};
