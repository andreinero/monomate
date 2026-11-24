import { useEffect, useSyncExternalStore } from 'react';
import { account, getToken, login as apiLogin, logout as apiLogout, type Account } from './api';

/** Who is logged in to Lichess, shared by every screen. */
type Session = { status: 'unknown' | 'loggedOut' | 'loggedIn'; account: Account | null; error: string | null };

let state: Session = { status: 'unknown', account: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<Session>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
let loading: Promise<void> | null = null;

/** Load the saved token and the account behind it. */
export function refreshSession(): Promise<void> {
  loading ??= (async () => {
    try {
      if (!(await getToken())) return set({ status: 'loggedOut', account: null });
      set({ status: 'loggedIn', account: await account(), error: null });
    } catch (e) {
      const status = (await getToken()) ? 'loggedIn' : 'loggedOut';
      set({ status, error: e instanceof Error ? e.message : String(e) });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export async function loginWithLichess(): Promise<boolean> {
  set({ error: null });
  try {
    const ok = await apiLogin();
    if (ok) await refreshSession();
    return ok;
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}

export async function logoutOfLichess() {
  await apiLogout();
  set({ status: 'loggedOut', account: null, error: null });
}

/** Logged in to Lichess right now? (for non-React code) */
export const isLichessConnected = () => state.status === 'loggedIn' && !!state.account;

export function useLichess(): Session {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  useEffect(() => {
    if (state.status === 'unknown') refreshSession();
  }, []);
  return s;
}
