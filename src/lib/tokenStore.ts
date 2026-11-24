import * as SecureStore from 'expo-secure-store';

/** Phones: the Lichess token lives in the Keychain / Keystore. */
export const tokenStore = {
  get: (k: string) => SecureStore.getItemAsync(k),
  set: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  remove: (k: string) => SecureStore.deleteItemAsync(k),
};
