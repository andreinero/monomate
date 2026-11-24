import { fetch as streamingFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { tokenStore } from '../tokenStore';
import { AuthRequest, CodeChallengeMethod, ResponseType, exchangeCodeAsync, makeRedirectUri } from 'expo-auth-session';
import { ndjsonSplitter } from './game';
import { t } from '../i18n';

/**
 * Lichess API client (https://lichess.org/api). Online games use the Board API with
 * "Login with Lichess" (OAuth2 PKCE; Lichess accepts unregistered public clients).
 */
export const LICHESS = 'https://lichess.org';
const CLIENT_ID = 'monomate-chess-app';
// follow:* = your Lichess friends list (read it, add and remove friends).
const SCOPES = ['board:play', 'challenge:write', 'follow:read', 'follow:write'];
const TOKEN_KEY = 'lichess.token';

export class LichessError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// ---------- Token ----------
let token: string | null = null;
let tokenLoaded = false;

export async function getToken(): Promise<string | null> {
  if (!tokenLoaded) {
    try {
      token = await tokenStore.get(TOKEN_KEY);
    } catch {
      token = null;
    }
    tokenLoaded = true;
  }
  return token;
}

async function setToken(t: string | null) {
  token = t;
  tokenLoaded = true;
  if (t) await tokenStore.set(TOKEN_KEY, t);
  else await tokenStore.remove(TOKEN_KEY).catch(() => {});
}

/** Opens the Lichess login page; resolves true when the user approved MonoMate. */
export async function login(): Promise<boolean> {
  const discovery = { authorizationEndpoint: `${LICHESS}/oauth`, tokenEndpoint: `${LICHESS}/api/token` };
  // Lichess requires a reverse-domain scheme for app logins (com.example://).
  // On desktop the app is served from http://localhost, which Lichess accepts as a redirect.
  const redirectUri = Platform.OS === 'web' ? makeRedirectUri({ path: 'oauth' }) : makeRedirectUri({ scheme: 'com.andrej.monomate', path: 'oauth' });
  const request = new AuthRequest({
    clientId: CLIENT_ID,
    redirectUri,
    scopes: SCOPES,
    usePKCE: true,
    responseType: ResponseType.Code,
    codeChallengeMethod: CodeChallengeMethod.S256,
  });
  const result = await request.promptAsync(discovery);
  if (result.type !== 'success' || !result.params.code) return false;
  const tokens = await exchangeCodeAsync(
    { clientId: CLIENT_ID, code: result.params.code, redirectUri, extraParams: { code_verifier: request.codeVerifier ?? '' } },
    discovery,
  );
  await setToken(tokens.accessToken);
  return true;
}

/** Revokes the token on Lichess and forgets it. */
export async function logout() {
  const t = await getToken();
  if (t) await fetch(`${LICHESS}/api/token`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } }).catch(() => {});
  await setToken(null);
}

// ---------- Requests ----------
type Form = Record<string, string | number | boolean | undefined>;
const encode = (form?: Form) =>
  form
    ? Object.entries(form)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : undefined;

async function headers(form?: Form): Promise<Record<string, string>> {
  const t = await getToken();
  const h: Record<string, string> = { Accept: 'application/json' };
  if (t) h.Authorization = `Bearer ${t}`;
  if (form) h['Content-Type'] = 'application/x-www-form-urlencoded';
  return h;
}

const ONLY_JSON = /only returns JSON/i;
/** Shown when Lichess refuses to start a game without saying why (it does that for bans and cooldowns). Translated with t() where used. */
const REFUSED =
  "Lichess won't let you play right now. You probably have a temporary cooldown, usually for leaving or aborting games. Wait a few minutes and try again.";

async function errorFrom(res: { status: number; text: () => Promise<string> }, body?: string): Promise<LichessError> {
  let msg = t('Lichess error {status}', { status: res.status });
  try {
    const raw = body ?? (await res.text());
    try {
      const j = JSON.parse(raw);
      msg = typeof j.error === 'string' ? j.error : (j.error && JSON.stringify(j.error)) || msg;
    } catch {
      if (raw.trim() && raw.length < 300) msg = raw.trim();
    }
  } catch {}
  if (ONLY_JSON.test(msg) || res.status === 406) msg = t(REFUSED);
  else if (/playban|banned|cannot play|can't play/i.test(msg)) msg = t("Lichess won't let you play right now: {msg}", { msg });
  if (res.status === 429) msg = t('Lichess is busy — please wait a minute and try again.');
  if (res.status === 401) {
    msg = t('Your Lichess login has expired. Please log in again.');
    await setToken(null);
  }
  return new LichessError(msg, res.status);
}

export async function api<T = unknown>(path: string, opts: { method?: string; form?: Form } = {}): Promise<T> {
  const res = await fetch(`${LICHESS}${path}`, { method: opts.method ?? (opts.form ? 'POST' : 'GET'), headers: await headers(opts.form), body: encode(opts.form) });
  if (!res.ok) throw await errorFrom(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/**
 * Streams an ND-JSON response, calling `onObject` for each line, until the server closes it
 * or `signal` aborts (which resolves quietly). HTTP errors reject with a LichessError.
 */
export async function stream(path: string, onObject: (o: any) => void, opts: { method?: string; form?: Form; signal: AbortSignal }): Promise<void> {
  const open = async (accept: string) =>
    streamingFetch(`${LICHESS}${path}`, {
      method: opts.method ?? (opts.form ? 'POST' : 'GET'),
      headers: { ...(await headers(opts.form)), Accept: accept },
      body: encode(opts.form),
      signal: opts.signal,
    });
  let res;
  try {
    res = await open('application/x-ndjson');
    if (!res.ok) {
      // When Lichess refuses (ban, cooldown, rate limit) it only says why to JSON requests. Ask again that way.
      const body = await res.text().catch(() => '');
      if (!ONLY_JSON.test(body) && res.status !== 406) throw await errorFrom(res, body);
      res = await open('application/json');
      if (!res.ok) throw await errorFrom(res);
    }
  } catch (e) {
    if (opts.signal.aborted) return;
    throw e;
  }
  const reader = res.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  const feed = ndjsonSplitter(onObject);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      feed(decoder.decode(value, { stream: true }));
    }
  } catch (e) {
    if (!opts.signal.aborted) throw e;
  } finally {
    reader.cancel().catch(() => {});
  }
}

// ---------- Endpoints ----------
export type Perf = { rating: number; prov?: boolean; games?: number };
export type Account = { id: string; username: string; title?: string; flair?: string; perfs?: Partial<Record<'blitz' | 'rapid' | 'classical' | 'bullet', Perf>> };

export const account = () => api<Account>('/api/account');

/** Game stream for a Board API game: gameFull, then gameState / chatLine / opponentGone. */
export const streamGame = (id: string, onEvent: (e: any) => void, signal: AbortSignal) => stream(`/api/board/game/stream/${id}`, onEvent, { signal });

/** The account's event stream: gameStart, gameFinish, challenge, challengeCanceled, challengeDeclined. */
export const streamEvents = (onEvent: (e: any) => void, signal: AbortSignal) => stream('/api/stream/event', onEvent, { signal });

/** Seek a random opponent; the seek lives as long as the request stays open. */
export const seek = (o: { time: number; inc: number; rated: boolean }, signal: AbortSignal) =>
  stream('/api/board/seek', () => {}, { form: { time: o.time, increment: o.inc, rated: o.rated, variant: 'standard' }, signal });

/** Challenge a user; resolves with how it ended ('accepted', 'declined', 'canceled') unless aborted. */
export async function challenge(username: string, o: { time: number; inc: number; rated: boolean; color: 'random' | 'white' | 'black' }, signal: AbortSignal): Promise<string | null> {
  let done: string | null = null;
  await stream(
    `/api/challenge/${encodeURIComponent(username.trim())}`,
    (e) => {
      if (e && typeof e.done === 'string') done = e.done;
    },
    { form: { rated: o.rated, 'clock.limit': o.time * 60, 'clock.increment': o.inc, color: o.color, variant: 'standard', keepAliveStream: true }, signal },
  );
  return done;
}

/** Ongoing games of the logged-in player (most urgent first). */
export type PlayingGame = { gameId: string; speed?: string; hasMoved?: boolean; isMyTurn?: boolean; opponent?: { username?: string } };
export const playing = () => api<{ nowPlaying: PlayingGame[] }>('/api/account/playing?nb=20').then((r) => r.nowPlaying ?? []);

export const acceptChallenge = (id: string) => api(`/api/challenge/${id}/accept`, { method: 'POST' });
export const declineChallenge = (id: string) => api(`/api/challenge/${id}/decline`, { method: 'POST' });

export const move = (id: string, uci: string) => api(`/api/board/game/${id}/move/${uci}`, { method: 'POST' });
export const resign = (id: string) => api(`/api/board/game/${id}/resign`, { method: 'POST' });
export const abort = (id: string) => api(`/api/board/game/${id}/abort`, { method: 'POST' });
export const draw = (id: string, accept: boolean) => api(`/api/board/game/${id}/draw/${accept ? 'yes' : 'no'}`, { method: 'POST' });
export const claimVictory = (id: string) => api(`/api/board/game/${id}/claim-victory`, { method: 'POST' });

/** Finished game (public): rating changes for the result screen. */
export const exportGame = (id: string) =>
  api<{ players: { white: { ratingDiff?: number; rating?: number }; black: { ratingDiff?: number; rating?: number } } }>(`/game/export/${id}?moves=false&clocks=false&evals=false&opening=false`);

// ---------- Friends (the players you follow on Lichess) ----------
export type Friend = { id: string; username: string; title?: string; flair?: string; flag?: string; rating?: number; online?: boolean; playing?: boolean };

/** Your Lichess friends. Rejects with status 403 when the login predates the friends permission. */
export async function following(): Promise<Friend[]> {
  const out: Friend[] = [];
  await stream(
    '/api/rel/following',
    (u) => {
      if (!u?.id) return;
      const p = u.perfs ?? {};
      out.push({ id: u.id, username: u.username ?? u.id, title: u.title, flair: u.flair, flag: u.profile?.flag, rating: (p.rapid ?? p.blitz ?? p.classical)?.rating });
    },
    { signal: new AbortController().signal },
  );
  return out;
}

export const follow = (username: string) => api(`/api/rel/follow/${encodeURIComponent(username.trim())}`, { method: 'POST' });
export const unfollow = (username: string) => api(`/api/rel/unfollow/${encodeURIComponent(username.trim())}`, { method: 'POST' });

/** Who is online / playing right now (cheap; Lichess allows polling it every few seconds). */
export const statuses = (ids: string[]) =>
  ids.length ? api<{ id: string; online?: boolean; playing?: boolean }[]>(`/api/users/status?ids=${ids.slice(0, 100).map(encodeURIComponent).join(',')}`) : Promise.resolve([]);

/** Does a Lichess player with this name exist? */
export const userExists = (username: string) =>
  api(`/api/user/${encodeURIComponent(username.trim())}`).then(
    () => true,
    (e) => (e instanceof LichessError && e.status === 404 ? false : Promise.reject(e)),
  );
