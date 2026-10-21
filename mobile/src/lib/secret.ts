/*
 * Small secrets on the device: the account key lives in the iOS Keychain /
 * Android Keystore, never in plain storage.
 */
import * as SecureStore from "expo-secure-store";

export const readSecret = (key: string) => SecureStore.getItemAsync(key);

export const writeSecret = (key: string, value: string) => SecureStore.setItemAsync(key, value);

export const deleteSecret = (key: string) => SecureStore.deleteItemAsync(key);
