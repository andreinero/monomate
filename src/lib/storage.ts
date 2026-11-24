import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useSyncExternalStore } from 'react';
import type { AvatarConfig } from './avatar';

export type SavedGame = {
  id: string;
  date: number;
  mode: 'bot' | 'coach' | 'local' | 'import' | 'online';
  botId?: string;
  playerColor: 'w' | 'b';
  startFen: string;
  moves: string[]; // SAN
  result: '1-0' | '0-1' | '1/2-1/2' | '*';
  reason: string;
  accuracy?: { w: number; b: number };
  /** Online (Lichess) and chess.com games: who you played. */
  opponent?: { name: string; rating?: number };
  /** chess.com games: your account name and rating in that game. */
  self?: { name: string; rating?: number };
  /** Online games: your Lichess rating before the game and how much it changed. */
  lichessRating?: { before?: number; diff?: number };
  /** Set for rated games against bots. */
  rating?: { before: number; after: number };
};

export type Settings = {
  boardTheme: 'mono' | 'concrete' | 'walnut' | 'ocean';
  showLegalMoves: boolean;
  haptics: boolean;
  animateMoves: boolean;
  sound: boolean;
  voice: boolean;
  coachId: string;
  /** Draw the last move as an arrow. */
  lastMoveArrow: boolean;
  /** "Accurate info from coach": a WHY? button with a concrete explanation of bad moves. */
  coachDetails: boolean;
  /** Roast mode: explicit, swearing trash talk from the coaches (opt-in). */
  roastMode: boolean;
  /** Focus mode: hide the opponent's name, picture and rating during online games. */
  focusMode?: boolean;
};

export type PuzzleStats = {
  rating: number;
  solved: number;
  failed: number;
  streak: number;
  bestStreak: number;
  seen: string[];
  /** Best Puzzle Rush scores by variant ('3', '5', 'survival'). */
  rushBest?: Record<string, number>;
  /** Puzzles solved per theme. */
  themeSolved?: Record<string, number>;
};

/** Opening lines the player has practised to the end (keys: guide id or line moves). */
export type Learned = Record<string, number>;

export type Profile = {
  name: string;
  botWins: Record<string, number>;
  /** Elo rating; undefined until the player picks a starting rating. */
  rating?: number;
  /** Rated games played since the rating was set. */
  ratedGames?: number;
  /** The player's drawn avatar (see src/lib/avatar.ts); a letter is shown when unset. */
  avatar?: AvatarConfig;
  /** Profile photo file name in the app's documents folder (takes precedence over the avatar). */
  photo?: string;
  /** Rating after each rated game (and when set by hand), oldest first. */
  ratingHistory?: { date: number; rating: number }[];
  /** Linked chess.com account (public data only, no login; see src/lib/chesscom.ts). */
  chesscom?: { username: string; linkedAt: number };
};

const KEYS = {
  games: 'gambit.games.v1',
  settings: 'gambit.settings.v2', // v2: brutalist redesign (new board themes)
  puzzles: 'gambit.puzzles.v1',
  profile: 'gambit.profile.v1',
  learned: 'gambit.learned.v1',
};

const DEFAULTS = {
  settings: { boardTheme: 'mono', showLegalMoves: true, haptics: true, animateMoves: true, sound: true, voice: true, coachId: 'sage', lastMoveArrow: true, coachDetails: true, roastMode: false } as Settings,
  puzzles: { rating: 1200, solved: 0, failed: 0, streak: 0, bestStreak: 0, seen: [] } as PuzzleStats,
  profile: { name: 'You', botWins: {} } as Profile,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

async function readArray<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// Shared, in-memory copies of what's stored, one per loader (store.settings, store.profile, …).
// Every screen reading the same thing shares one copy, and saving only refreshes the screens
// that read what changed. (Before, every save made every open screen re-read everything from
// disk and redraw — tapping a coach or toggling a setting stalled the app on real phones.)
type Loader = () => Promise<unknown>;
type Entry = { value: unknown; loaded: boolean; loading: boolean; again: boolean; gen: number; subs: Set<() => void> };
const entries = new Map<Loader, Entry>();
/** Which storage key each loader reads (filled in below `store`). */
const KEY_OF = new Map<Loader, string>();

function entryFor(loader: Loader): Entry {
  let e = entries.get(loader);
  if (!e) {
    e = { value: undefined, loaded: false, loading: false, again: false, gen: 0, subs: new Set() };
    entries.set(loader, e);
  }
  return e;
}

function load(loader: Loader, e: Entry) {
  if (e.loading) {
    e.again = true; // changed while loading: read once more when this read is done
    return;
  }
  e.loading = true;
  const gen = e.gen;
  loader().then(
    (v) => {
      e.loading = false;
      if (e.again) {
        e.again = false;
        return load(loader, e);
      }
      // A save happened while reading: the saved value is newer than what was read.
      if (gen !== e.gen) return;
      e.value = v;
      e.loaded = true;
      e.subs.forEach((l) => l());
    },
    () => {
      e.loading = false;
    },
  );
}

/** Show a just-saved value right away (no disk round trip), then let readers re-render. */
function prime(loader: Loader, value: unknown) {
  const e = entryFor(loader);
  e.gen++;
  e.value = value;
  e.loaded = true;
  e.subs.forEach((l) => l());
}

/** Something under `key` changed (all keys when omitted): refresh whoever reads it. */
const notify = (key?: string) => {
  entries.forEach((e, loader) => {
    if (key && KEY_OF.has(loader) && KEY_OF.get(loader) !== key) return;
    if (e.subs.size) load(loader, e);
    else e.loaded = false; // nobody's looking: read it fresh next time
  });
};

export const store = {
  async games(): Promise<SavedGame[]> {
    return readArray<SavedGame>(KEYS.games);
  },
  async game(id: string): Promise<SavedGame | undefined> {
    return (await store.games()).find((g) => g.id === id);
  },
  async saveGame(g: SavedGame) {
    const all = (await store.games()).filter((x) => x.id !== g.id);
    all.unshift(g);
    await AsyncStorage.setItem(KEYS.games, JSON.stringify(all.slice(0, 200)));
    notify(KEYS.games);
  },
  async deleteGame(id: string) {
    const all = (await store.games()).filter((x) => x.id !== id);
    await AsyncStorage.setItem(KEYS.games, JSON.stringify(all));
    notify(KEYS.games);
  },
  async settings(): Promise<Settings> {
    return readJson(KEYS.settings, DEFAULTS.settings);
  },
  async saveSettings(s: Settings) {
    prime(store.settings, { ...DEFAULTS.settings, ...s });
    await AsyncStorage.setItem(KEYS.settings, JSON.stringify(s));
  },
  async puzzleStats(): Promise<PuzzleStats> {
    return readJson(KEYS.puzzles, DEFAULTS.puzzles);
  },
  async savePuzzleStats(s: PuzzleStats) {
    prime(store.puzzleStats, { ...DEFAULTS.puzzles, ...s, seen: s.seen.slice(-500) });
    await AsyncStorage.setItem(KEYS.puzzles, JSON.stringify({ ...s, seen: s.seen.slice(-500) }));
  },
  async profile(): Promise<Profile> {
    return readJson(KEYS.profile, DEFAULTS.profile);
  },
  async saveProfile(p: Profile) {
    prime(store.profile, { ...DEFAULTS.profile, ...p });
    await AsyncStorage.setItem(KEYS.profile, JSON.stringify(p));
  },
  async learned(): Promise<Learned> {
    return readJson<Learned>(KEYS.learned, {});
  },
  async markLearned(key: string) {
    const l = await store.learned();
    l[key] = Date.now();
    await AsyncStorage.setItem(KEYS.learned, JSON.stringify(l));
    notify(KEYS.learned);
  },
  async resetAll() {
    await AsyncStorage.multiRemove(Object.values(KEYS));
    notify();
  },
};

KEY_OF.set(store.games, KEYS.games);
KEY_OF.set(store.settings, KEYS.settings);
KEY_OF.set(store.puzzleStats, KEYS.puzzles);
KEY_OF.set(store.profile, KEYS.profile);
KEY_OF.set(store.learned, KEYS.learned);

/** Load an async value and reload whenever the store changes. */
export function useStored<T>(loader: () => Promise<T>, initial: T): [T, () => void] {
  const e = entryFor(loader);
  const subscribe = useCallback(
    (l: () => void) => {
      e.subs.add(l);
      if (!e.loaded) load(loader, e);
      return () => {
        e.subs.delete(l);
      };
    },
    [e, loader],
  );
  const value = useSyncExternalStore(subscribe, () => (e.loaded ? (e.value as T) : undefined));
  const reload = useCallback(() => load(loader, e), [e, loader]);
  return [value ?? initial, reload];
}

export function useSettings(): Settings {
  return useStored(store.settings, DEFAULTS.settings)[0];
}

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
