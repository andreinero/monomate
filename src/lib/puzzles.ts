import { Chess } from 'chess.js';
import pack from '../data/puzzlePack.json';
import { t } from './i18n';

/** Puzzles come from the Lichess puzzle database (CC0): https://database.lichess.org/#puzzles */
export type Puzzle = {
  id: string;
  /** Position after the opponent's last move — the player moves first. */
  fen: string;
  lastMove?: string;
  solution: string[]; // UCI, player's move first, alternating
  rating: number;
  themes: string[];
};

/** ~3,500 bundled puzzles (rating 400–2900, ≥120 per theme) — built by scripts/build-data.ts. */
const OFFLINE: Puzzle[] = (pack as [string, string, string, string, number, string][]).map(([id, fen, lastMove, sol, rating, themes]) => ({
  id,
  fen,
  lastMove,
  solution: sol.split(' '),
  rating,
  themes: themes.split(' '),
}));

type Difficulty = 'easiest' | 'easier' | 'normal' | 'harder' | 'hardest';

function difficultyFor(userRating: number): Difficulty {
  // Lichess picks relative to 1500 for anonymous users.
  const d = userRating - 1500;
  if (d < -450) return 'easiest';
  if (d < -150) return 'easier';
  if (d < 150) return 'normal';
  if (d < 450) return 'harder';
  return 'hardest';
}

async function fetchJson(url: string, ms = 6000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Lichess's puzzle API sends the game's moves (PGN, cut at the puzzle's start), not a position:
 * replay them to get the position and the opponent's last move.
 */
function fromApi(j: any): Puzzle {
  const p = j.puzzle;
  let fen: string = p.fen;
  let lastMove: string | undefined = p.lastMove;
  if (!fen && typeof j.game?.pgn === 'string') {
    try {
      const c = new Chess();
      c.loadPgn(j.game.pgn);
      const last = c.history({ verbose: true }).at(-1);
      fen = c.fen();
      lastMove = last ? last.from + last.to + (last.promotion ?? '') : undefined;
    } catch {}
  }
  return { id: p.id, fen, lastMove, solution: p.solution, rating: p.rating, themes: p.themes ?? [] };
}

/** The solution plays out legally from the position (guards against API changes). */
function playable(p: Puzzle): boolean {
  if (!p.fen || !p.solution?.length) return false;
  try {
    const c = new Chess(p.fen);
    for (const u of p.solution) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    return true;
  } catch {
    return false;
  }
}

/** A bundled puzzle near `userRating` (optionally of one theme) that hasn't been seen. */
export function offlinePuzzle(userRating: number, seen: string[], theme?: string): Puzzle {
  const seenSet = new Set(seen);
  const themed = theme ? OFFLINE.filter((p) => p.themes.includes(theme)) : OFFLINE;
  const base = themed.length ? themed : OFFLINE;
  const unseen = base.filter((p) => !seenSet.has(p.id));
  const pool = unseen.length ? unseen : base;
  // Choose among the closest-rated puzzles.
  const sorted = [...pool].sort((a, b) => Math.abs(a.rating - userRating) - Math.abs(b.rating - userRating));
  const near = sorted.slice(0, 8);
  return near[Math.floor(Math.random() * near.length)];
}

export async function nextPuzzle(userRating: number, seen: string[], theme?: string): Promise<{ puzzle: Puzzle; online: boolean }> {
  try {
    const angle = theme ? `&angle=${encodeURIComponent(theme)}` : '';
    for (let i = 0; i < 3; i++) {
      const p = fromApi(await fetchJson(`https://lichess.org/api/puzzle/next?difficulty=${difficultyFor(userRating)}${angle}`));
      if (playable(p) && !seen.includes(p.id)) return { puzzle: p, online: true };
    }
  } catch {
    // fall through to offline pack
  }
  return { puzzle: offlinePuzzle(userRating, seen, theme), online: false };
}

/** Puzzle Rush variants: a timer (or none) and three strikes. */
export const RUSH_VARIANTS = [
  { id: '3', label: '3 MIN', sub: 'Solve as many as you can', seconds: 180 },
  { id: '5', label: '5 MIN', sub: 'More time, same three lives', seconds: 300 },
  { id: 'survival', label: 'SURVIVAL', sub: 'No clock · three strikes', seconds: 0 },
] as const;
export type RushVariant = (typeof RUSH_VARIANTS)[number]['id'];

/** Rush puzzles start easy and climb ~45 rating points per puzzle; bundled so they load instantly. */
export function rushPuzzle(index: number, used: string[]): Puzzle {
  return offlinePuzzle(Math.min(2800, 500 + index * 45), used);
}

/** Themes offered on the "Puzzle themes" screen, with a one-line explanation each. */
export const PUZZLE_THEMES: { id: string; sub: string }[] = [
  { id: 'mateIn1', sub: 'Deliver checkmate in one move' },
  { id: 'mateIn2', sub: 'Checkmate in two moves' },
  { id: 'mateIn3', sub: 'Checkmate in three moves' },
  { id: 'backRankMate', sub: 'Mate a king trapped behind its pawns' },
  { id: 'smotheredMate', sub: 'A knight mates a boxed-in king' },
  { id: 'fork', sub: 'Attack two pieces at once' },
  { id: 'pin', sub: 'A piece can’t move without exposing another' },
  { id: 'skewer', sub: 'Hit a big piece, win the one behind it' },
  { id: 'discoveredAttack', sub: 'Move one piece to unleash another' },
  { id: 'doubleCheck', sub: 'Check with two pieces at once' },
  { id: 'hangingPiece', sub: 'Grab an undefended piece' },
  { id: 'trappedPiece', sub: 'A piece with nowhere to run' },
  { id: 'sacrifice', sub: 'Give material to gain more' },
  { id: 'deflection', sub: 'Lure a defender away from its job' },
  { id: 'attraction', sub: 'Drag a piece onto a fatal square' },
  { id: 'capturingDefender', sub: 'Remove the piece that defends' },
  { id: 'intermezzo', sub: 'An in-between move that changes everything' },
  { id: 'xRayAttack', sub: 'Attack through another piece' },
  { id: 'kingsideAttack', sub: 'Break open the castled king' },
  { id: 'exposedKing', sub: 'Punish an unsafe king' },
  { id: 'quietMove', sub: 'A calm move with a deadly threat' },
  { id: 'defensiveMove', sub: 'Find the move that saves you' },
  { id: 'zugzwang', sub: 'Every move makes it worse for them' },
  { id: 'promotion', sub: 'Push a pawn all the way' },
  { id: 'advancedPawn', sub: 'Use a pawn close to queening' },
  { id: 'opening', sub: 'Tactics in the first moves' },
  { id: 'middlegame', sub: 'Tactics in the middlegame' },
  { id: 'endgame', sub: 'Technique with few pieces left' },
  { id: 'rookEndgame', sub: 'Rook endings' },
  { id: 'pawnEndgame', sub: 'King and pawn endings' },
];

export async function dailyPuzzle(): Promise<Puzzle | null> {
  try {
    const p = fromApi(await fetchJson('https://lichess.org/api/puzzle/daily'));
    return playable(p) ? p : null;
  } catch {
    return null;
  }
}

/** Elo-style update for puzzle rating. */
export function updateRating(user: number, puzzle: number, solved: boolean, games: number): number {
  const k = games < 20 ? 40 : 20;
  const expected = 1 / (1 + Math.pow(10, (puzzle - user) / 400));
  return Math.round(user + k * ((solved ? 1 : 0) - expected));
}

const THEME_NAMES: Record<string, string> = {
  mateIn1: 'Mate in 1', mateIn2: 'Mate in 2', mateIn3: 'Mate in 3', mateIn4: 'Mate in 4', mate: 'Checkmate',
  fork: 'Fork', pin: 'Pin', skewer: 'Skewer', discoveredAttack: 'Discovered attack', hangingPiece: 'Hanging piece',
  sacrifice: 'Sacrifice', deflection: 'Deflection', attraction: 'Attraction', backRankMate: 'Back-rank mate',
  endgame: 'Endgame', middlegame: 'Middlegame', opening: 'Opening', advantage: 'Advantage', crushing: 'Crushing',
  promotion: 'Promotion', trappedPiece: 'Trapped piece', kingsideAttack: 'Kingside attack', defensiveMove: 'Defensive move',
  quietMove: 'Quiet move', exposedKing: 'Exposed king', capturingDefender: 'Remove the defender', short: 'Short', long: 'Long',
  oneMove: 'One move', intermezzo: 'Intermezzo', xRayAttack: 'X-ray', zugzwang: 'Zugzwang', doubleCheck: 'Double check',
  smotheredMate: 'Smothered mate', advancedPawn: 'Advanced pawn', rookEndgame: 'Rook endgame', pawnEndgame: 'Pawn endgame',
};

/** Display name for a theme id, even ones hidden from the in-puzzle tags (translated at call time). */
export function themeName(id: string): string {
  return t(THEME_NAMES[id] ?? id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()));
}

export function themeLabel(id: string): string | null {
  if (['short', 'long', 'veryLong', 'oneMove', 'middlegame', 'endgame', 'opening', 'master', 'masterVsMaster'].includes(id)) return null;
  return themeName(id);
}
