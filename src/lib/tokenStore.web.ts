/** Desktop: the Lichess token lives in the app's own (per-install) browser storage. */
export const tokenStore = {
  get: async (k: string) => localStorage.getItem(k),
  set: async (k: string, v: string) => localStorage.setItem(k, v),
  remove: async (k: string) => localStorage.removeItem(k),
};
