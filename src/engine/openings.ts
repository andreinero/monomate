import { Chess } from 'chess.js';
import data from '../data/openings.json';

/**
 * Every named opening line from the Lichess chess-openings dataset (CC0):
 * https://github.com/lichess-org/chess-openings — built by scripts/build-data.ts.
 */
export type Opening = {
  index: number;
  eco: string;
  name: string;
  /** "Sicilian Defense" for "Sicilian Defense: Najdorf Variation". */
  family: string;
  /** "Najdorf Variation", or '' for the family's main entry. */
  variation: string;
  /** SAN moves, space separated. */
  moves: string;
  plies: number;
};

const ROWS = data as [string, string, string, string][];

export const OPENINGS: Opening[] = ROWS.map(([eco, name, moves], index) => {
  const i = name.indexOf(':');
  return {
    index,
    eco,
    name,
    family: i < 0 ? name : name.slice(0, i),
    variation: i < 0 ? '' : name.slice(i + 1).trim(),
    moves,
    plies: moves.split(' ').length,
  };
});

/** Position (first four FEN fields) → opening, so transpositions are named too. */
const BY_POSITION = new Map<string, Opening>();
ROWS.forEach(([, , , epd], i) => {
  // If two lines reach the same position, keep the one reached in fewer moves.
  const prev = BY_POSITION.get(epd);
  if (!prev || OPENINGS[i].plies < prev.plies) BY_POSITION.set(epd, OPENINGS[i]);
});

/** Every SAN prefix of every named line — a move sequence in here is "book". */
const BOOK_PREFIXES = new Set<string>();
for (const o of OPENINGS) {
  const m = o.moves.split(' ');
  for (let i = 1; i <= m.length; i++) BOOK_PREFIXES.add(m.slice(0, i).join(' '));
}

const MAX_PLIES = 40;
const epd = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

/** Most specific named opening reached by these moves (from the standard start position). */
export function openingName(sanMoves: string[]): { name: string; eco: string; plies: number; opening: Opening } | null {
  const c = new Chess();
  let found: { name: string; eco: string; plies: number; opening: Opening } | null = null;
  for (let i = 0; i < Math.min(sanMoves.length, MAX_PLIES); i++) {
    try {
      c.move(sanMoves[i]);
    } catch {
      break;
    }
    const o = BY_POSITION.get(epd(c.fen()));
    if (o) found = { name: o.name, eco: o.eco, plies: i + 1, opening: o };
  }
  return found;
}

/** Number of leading plies that follow a named opening line (used to mark "Book" moves). */
export function bookDepth(sanMoves: string[]): number {
  let depth = 0;
  for (let i = 1; i <= Math.min(sanMoves.length, MAX_PLIES); i++) {
    if (BOOK_PREFIXES.has(sanMoves.slice(0, i).join(' '))) depth = i;
    else break;
  }
  return depth;
}

/** Families in dataset order, each with its lines (main entry first). */
export type OpeningFamily = { family: string; eco: string; lines: Opening[] };

let familiesCache: OpeningFamily[] | null = null;
export function openingFamilies(): OpeningFamily[] {
  if (familiesCache) return familiesCache;
  const map = new Map<string, OpeningFamily>();
  for (const o of OPENINGS) {
    let f = map.get(o.family);
    if (!f) map.set(o.family, (f = { family: o.family, eco: o.eco, lines: [] }));
    f.lines.push(o);
  }
  for (const f of map.values()) f.lines.sort((a, b) => a.plies - b.plies || a.name.localeCompare(b.name));
  familiesCache = [...map.values()].sort((a, b) => a.family.localeCompare(b.family));
  return familiesCache;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Search by name, ECO code or moves ("najdorf", "B90", "e4 c5"). */
export function searchOpenings(query: string, limit = 60): Opening[] {
  const q = fold(query.trim());
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored: [number, Opening][] = [];
  for (const o of OPENINGS) {
    const hay = fold(`${o.name} ${o.eco}`);
    let score = 0;
    if (o.eco.toLowerCase() === q) score = 3;
    else if (o.moves.toLowerCase().startsWith(q)) score = 2;
    else if (words.every((w) => hay.includes(w))) score = 1 + (fold(o.name).startsWith(q) ? 0.5 : 0);
    if (score) scored.push([score - o.plies / 1000, o]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, o]) => o);
}
