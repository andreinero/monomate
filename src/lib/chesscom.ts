/**
 * chess.com Published-Data API (public, read-only, no login): https://www.chess.com/news/view/published-data-api
 * chess.com has no OAuth for other apps, so "linking" is just remembering a username.
 */
import { Chess } from 'chess.js';
import type { SavedGame } from './storage';
import { t } from './i18n';

const API = 'https://api.chess.com/pub';
// Generic on purpose: never put the user's name or email here.
const HEADERS = { Accept: 'application/json', 'User-Agent': 'MonoMate chess app' };

export type ChesscomPlayer = { username: string; name?: string; url: string; avatar?: string; title?: string };
export type ChesscomRatings = { rapid?: number; blitz?: number; bullet?: number; daily?: number };
export type ChesscomSide = { username: string; rating: number; result: string };
export type ChesscomGame = {
  url: string;
  uuid?: string;
  pgn: string;
  white: ChesscomSide;
  black: ChesscomSide;
  result: SavedGame['result'];
  /** Readable reason, e.g. "Checkmate" or "Timeout". */
  reason: string;
  timeClass: 'daily' | 'rapid' | 'blitz' | 'bullet' | string;
  /** Unix time in seconds, as chess.com sends it. */
  endTime: number;
};

const clean = (username: string) => username.trim().toLowerCase();

async function get<T>(path: string, username?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { headers: HEADERS });
  } catch {
    throw new Error(t('Couldn’t reach chess.com. Check your connection.'));
  }
  if (res.status === 404) throw new Error(username ? t('No chess.com player called “{name}”.', { name: username.trim() }) : t('Not found on chess.com.'));
  if (res.status === 429) throw new Error(t('chess.com is busy. Try again in a minute.'));
  if (!res.ok) throw new Error(t('chess.com error ({status}). Try again later.', { status: res.status }));
  return res.json() as Promise<T>;
}

const userPath = (username: string) => {
  const u = clean(username);
  if (!/^[a-z0-9_-]{1,50}$/.test(u)) throw new Error(t('A chess.com username only has letters, digits, - and _.'));
  return `/player/${encodeURIComponent(u)}`;
};

export async function player(username: string): Promise<ChesscomPlayer> {
  return get<ChesscomPlayer>(userPath(username), username);
}

type Perf = { last?: { rating: number } };
export async function stats(username: string): Promise<ChesscomRatings> {
  const s = await get<Record<string, Perf | undefined>>(`${userPath(username)}/stats`, username);
  return {
    rapid: s.chess_rapid?.last?.rating,
    blitz: s.chess_blitz?.last?.rating,
    bullet: s.chess_bullet?.last?.rating,
    daily: s.chess_daily?.last?.rating,
  };
}

const DRAWS = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);
// Reasons stay English (they're saved with the game); screens translate them with t() when showing them.
const REASONS: Record<string, string> = {
  checkmated: 'Checkmate',
  resigned: 'Resignation',
  timeout: 'Timeout',
  abandoned: 'Abandoned',
  agreed: 'Draw agreed',
  repetition: 'Repetition',
  stalemate: 'Stalemate',
  insufficient: 'Insufficient material',
  '50move': '50-move rule',
  timevsinsufficient: 'Timeout vs insufficient material',
};

type RawGame = { url: string; uuid?: string; pgn?: string; rules?: string; time_class: string; end_time: number; white: ChesscomSide; black: ChesscomSide };

function toGame(g: RawGame & { pgn: string }): ChesscomGame {
  const w = g.white.result;
  const b = g.black.result;
  const result = w === 'win' ? '1-0' : b === 'win' ? '0-1' : DRAWS.has(w) || DRAWS.has(b) ? '1/2-1/2' : '*';
  const code = w === 'win' ? b : b === 'win' ? w : DRAWS.has(w) ? w : b;
  return {
    url: g.url,
    uuid: g.uuid,
    pgn: g.pgn,
    white: { username: g.white.username, rating: g.white.rating, result: w },
    black: { username: g.black.username, rating: g.black.rating, result: b },
    result,
    reason: REASONS[code] ?? 'Game over',
    timeClass: g.time_class,
    endTime: g.end_time,
  };
}

/** The player's latest `n` standard-chess games, newest first (reads back at most 6 monthly archives). */
export async function recentGames(username: string, n = 30): Promise<ChesscomGame[]> {
  const base = userPath(username);
  const { archives } = await get<{ archives: string[] }>(`${base}/games/archives`, username);
  const out: ChesscomGame[] = [];
  for (const url of archives.slice(-6).reverse()) {
    const month = url.slice(url.lastIndexOf('/games/'));
    const { games } = await get<{ games: RawGame[] }>(`${base}${month}`, username);
    const usable = games.filter((g): g is RawGame & { pgn: string } => !!g.pgn && (g.rules ?? 'chess') === 'chess');
    out.push(...usable.map(toGame).sort((a, b) => b.endTime - a.endTime));
    if (out.length >= n) break;
  }
  return out.slice(0, n);
}

/** Which side `username` played, or null if they didn't play this game. */
export function sideOf(g: ChesscomGame, username: string): 'w' | 'b' | null {
  const u = clean(username);
  return g.white.username.toLowerCase() === u ? 'w' : g.black.username.toLowerCase() === u ? 'b' : null;
}

/** A chess.com game as a saved game the Game Review screen can open (throws if the PGN can't be read). */
export function toSavedGame(g: ChesscomGame, username: string): SavedGame {
  const c = new Chess();
  c.loadPgn(g.pgn);
  const playerColor = sideOf(g, username) ?? 'w';
  const opp = playerColor === 'w' ? g.black : g.white;
  const me = playerColor === 'w' ? g.white : g.black;
  return {
    id: `chesscom-${g.uuid ?? g.url.slice(g.url.lastIndexOf('/') + 1)}`,
    date: g.endTime * 1000,
    mode: 'import',
    playerColor,
    startFen: c.getHeaders().FEN ?? new Chess().fen(),
    moves: c.history(),
    result: g.result,
    reason: g.reason,
    opponent: { name: opp.username, rating: opp.rating },
    self: { name: me.username, rating: me.rating },
  };
}
