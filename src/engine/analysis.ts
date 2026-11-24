import { Chess, type Move } from 'chess.js';
import type { EngineResult, Score, AnalyzeOptions } from './EngineProvider';
import { t } from '../lib/i18n';

/**
 * Move classes, following the scheme players know from the big chess sites:
 * brilliant (a sound sacrifice), great (the only good move), best, excellent, good, book, forced
 * (the only legal move), inaccuracy, mistake, miss (didn't punish your opponent's error), blunder.
 */
export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'forced'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

/** `label` is read at render time, so it follows the app language (the English is the dictionary key). */
const meta = (label: string, color: string, symbol: string) => ({
  get label() {
    return t(label);
  },
  color,
  symbol,
});

export const CLASS_META: Record<Classification, { readonly label: string; color: string; symbol: string }> = {
  brilliant: meta('Brilliant', '#1BACA6', '!!'),
  great: meta('Great', '#5C8BB0', '!'),
  best: meta('Best', '#6FA83A', '★'),
  excellent: meta('Excellent', '#8DB84A', '✓✓'),
  good: meta('Good', '#8FAE7C', '✓'),
  book: meta('Book', '#A88865', '≡'),
  forced: meta('Forced', '#8A8A8A', '→'),
  inaccuracy: meta('Inaccuracy', '#E6B800', '?!'),
  mistake: meta('Mistake', '#E58F2A', '?'),
  miss: meta('Miss', '#F06A5E', '✗'),
  blunder: meta('Blunder', '#CA3431', '??'),
};

/** The move class's name in the app language ("Blunder" / "Patzer"). */
export const classLabel = (c: Classification) => CLASS_META[c].label;

/** Classes shown as "bad" (red/orange/yellow) — the coach explains these and offers a retry. */
export const ERROR_CLASSES: Classification[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];
export const isError = (c: Classification | undefined): boolean => !!c && ERROR_CLASSES.includes(c);

/** How fast an advantage turns into wins, for strong players (Lichess's fit). */
const STRONG_K = 0.00368208;
/**
 * The same for a player of this rating: beginners convert an advantage much less reliably, so a
 * two-pawn swing costs them fewer real winning chances than it costs a master (a 300 player's
 * +2 is not yet a win). Unknown rating: the strong-player curve.
 */
export function winK(rating?: number): number {
  if (!rating) return STRONG_K;
  const f = Math.max(0, Math.min(1, (rating - 400) / 1600));
  return 0.002 + f * (STRONG_K - 0.002);
}

/** Win probability (0–100) for White given a centipawn score from White's POV. */
export function winPct(cp: number, k = STRONG_K): number {
  const c = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-k * c)) - 1);
}

export function moverWinPct(score: Score, mover: 'w' | 'b', k = STRONG_K): number {
  const w = winPct(score.cp, k);
  return mover === 'w' ? w : 100 - w;
}

export function classifyLoss(loss: number): Classification {
  if (loss < 2) return 'excellent';
  if (loss < 5) return 'good';
  if (loss < 10) return 'inaccuracy';
  if (loss < 20) return 'mistake';
  return 'blunder';
}

/** Accuracy of one move from its loss in winning chances (a bit stricter than Lichess's curve, closer to chess.com's). */
export function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.06531 * loss) - 3.1669));
}

export function formatScore(s: Score | undefined): string {
  if (!s) return '0.0';
  if (s.mate !== undefined) return `${s.mate > 0 ? '' : '-'}M${Math.abs(s.mate)}`;
  const v = s.cp / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

/** Evaluation of a terminal position (checkmate/draw) without asking the engine. */
export function terminalScore(chess: Chess): Score | null {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? { cp: -10000, mate: -0 } : { cp: 10000, mate: 0 };
  if (chess.isDraw() || chess.isStalemate()) return { cp: 0 };
  return null;
}

export function uciToMove(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

export function moveToUci(m: Pick<Move, 'from' | 'to' | 'promotion'>): string {
  return m.from + m.to + (m.promotion ?? '');
}

/** Convert a UCI line to SAN, stopping at the first illegal move. */
export function pvToSan(fen: string, pv: string[], max = 8): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      out.push(c.move(uciToMove(u)).san);
    } catch {
      break;
    }
  }
  return out;
}

export type PositionEval = {
  fen: string;
  score: Score; // White POV
  best: string | null; // UCI
  second?: Score; // second best line, White POV
  pv: string[];
};

export type ReviewedMove = {
  ply: number;
  san: string;
  uci: string;
  color: 'w' | 'b';
  fenBefore: string;
  fenAfter: string;
  classification: Classification;
  loss: number; // win% lost by the mover
  accuracy: number;
  bestUci: string | null;
  bestSan: string | null;
  evalBefore: Score;
  evalAfter: Score;
  bestLineSan: string[];
};

export type GameReview = {
  moves: ReviewedMove[];
  evals: Score[]; // per position, index 0 = start
  accuracy: { w: number; b: number };
  counts: { w: Record<Classification, number>; b: Record<Classification, number> };
  /** Rough performance estimate per player derived from accuracy. */
  estimatedRating: { w: number; b: number };
};

type Analyze = (fen: string, opts?: AnalyzeOptions) => Promise<EngineResult>;

/**
 * Search depth for judging moves. Depth 12 misjudged whole games (in Morphy's Opera Game it rated
 * Black more accurate than Morphy); 14 gets them right at a third of the cost of 16. Fixed depth
 * keeps verdicts the same every time; the time cap only stops the rare exploding position.
 */
export const REVIEW_DEPTH = 14;
export const REVIEW_MOVETIME = 2500;
/** Coach games judge your move while you wait: same depth, a tighter cap. */
export const LIVE_SEARCH: AnalyzeOptions = { depth: 14, movetime: 1200 };

export type MoveComparison = { best: Score; played: Score; second?: Score };

/**
 * Score the played move against the engine's best move in ONE search restricted to just those two
 * moves, so both numbers come from the same tree. Comparing separate searches adds their noise
 * together and flags perfectly normal moves as mistakes.
 */
export async function compareWithBest(
  analyze: Analyze,
  before: PositionEval,
  uci: string,
  after: PositionEval,
  opts: AnalyzeOptions = {},
): Promise<MoveComparison> {
  if (!before.best) return { best: before.score, played: before.score };
  if (before.best === uci) {
    // You found the engine's move. Was it the only good one? Look at the runner-up in the same search.
    if (new Chess(before.fen).moves().length < 2) return { best: before.score, played: before.score };
    const r = await analyze(before.fen, { depth: REVIEW_DEPTH, movetime: REVIEW_MOVETIME, ...opts, multipv: 2 });
    const top = r.lines.find((l) => l.pv[0] === uci)?.score ?? before.score;
    return { best: top, played: top, second: r.lines.find((l) => l.pv[0] !== uci)?.score };
  }
  if (!after.best && !after.pv.length) return { best: before.score, played: after.score }; // mate / draw: exact
  const r = await analyze(before.fen, { depth: REVIEW_DEPTH, movetime: REVIEW_MOVETIME, ...opts, multipv: 2, searchmoves: [before.best, uci] });
  const played = r.lines.find((l) => l.pv[0] === uci)?.score ?? after.score;
  const best = r.lines.find((l) => l.pv[0] === before.best)?.score ?? before.score;
  return { best, played };
}

/**
 * Coach games: judge the move you just played with ONE search from the position before it.
 * The search that scores your move against the engine's best (or, if you played the best move,
 * finds the runner-up) also gives your opponent's best reply — the second move of your move's
 * line — so the position after your move doesn't need a search of its own.
 */
export async function judgeMove(
  analyze: Analyze,
  before: PositionEval,
  uci: string,
  fenAfter: string,
  opts: AnalyzeOptions = {},
): Promise<{ after: PositionEval; cmp: MoveComparison }> {
  const t = terminalScore(new Chess(fenAfter));
  if (t) {
    const after: PositionEval = { fen: fenAfter, score: t, best: null, pv: [] };
    return { after, cmp: { best: before.best === uci ? t : before.score, played: t } };
  }
  if (!before.best) {
    const after = await evaluatePosition(analyze, fenAfter, opts);
    return { after, cmp: { best: before.score, played: after.score } };
  }
  const isBest = before.best === uci;
  const r = await analyze(before.fen, {
    depth: REVIEW_DEPTH,
    movetime: REVIEW_MOVETIME,
    ...opts,
    multipv: 2,
    searchmoves: isBest ? undefined : [before.best, uci],
  });
  const mine = r.lines.find((l) => l.pv[0] === uci);
  if (!mine) {
    // (Shouldn't happen.) Fall back to searching the position after the move.
    const after = await evaluatePosition(analyze, fenAfter, opts);
    return { after, cmp: { best: before.score, played: after.score } };
  }
  const after: PositionEval = { fen: fenAfter, score: mine.score, best: mine.pv[1] ?? null, pv: mine.pv.slice(1) };
  if (isBest) return { after, cmp: { best: mine.score, played: mine.score, second: r.lines.find((l) => l.pv[0] !== uci)?.score } };
  const best = r.lines.find((l) => l.pv[0] === before.best)?.score ?? before.score;
  return { after, cmp: { best, played: mine.score } };
}

export async function evaluatePosition(analyze: Analyze, fen: string, opts: AnalyzeOptions = {}): Promise<PositionEval> {
  const chess = new Chess(fen);
  const t = terminalScore(chess);
  if (t) return { fen, score: t, best: null, pv: [] };
  const r = await analyze(fen, { depth: REVIEW_DEPTH, movetime: REVIEW_MOVETIME, multipv: 1, ...opts });
  const top = r.lines[0];
  return {
    fen,
    score: top?.score ?? { cp: 0 },
    best: r.bestmove,
    second: r.lines[1]?.score,
    pv: top?.pv ?? [],
  };
}

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** For the side to move: how much it can win by taking each enemy piece (knight or bigger), by square. */
function winnable(c: Chess): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of c.moves({ verbose: true })) {
    if (!t.captured || t.captured === 'p') continue;
    c.move(t);
    const recapture = c.moves({ verbose: true }).some((r) => r.to === t.to);
    c.undo();
    const gain = recapture ? VAL[t.captured] - VAL[t.piece] : VAL[t.captured];
    if (gain > (out.get(t.to) ?? 0)) out.set(t.to, gain);
  }
  return out;
}

/**
 * Does this move give up material? True when, after it, the opponent can take one of our pieces
 * (knight or bigger) and come out at least two points ahead — after what the move itself captured.
 * Pieces that were already hanging before the move don't count (that was decided earlier), unless
 * the move put a piece there. Only legal captures count, so pinned attackers don't.
 */
export function isSacrifice(fen: string, uci: string): boolean {
  const c = new Chess(fen);
  // What could the opponent already win before the move? (Pass the turn to them to see.)
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w';
  parts[3] = '-';
  let already = new Map<string, number>();
  try {
    // (When you're in check this position is illegal, but the captures it lists are still right.)
    already = winnable(new Chess(parts.join(' '), { skipValidation: true }));
  } catch {}
  let mv: Move;
  try {
    mv = c.move(uciToMove(uci));
  } catch {
    return false;
  }
  if (c.isCheckmate() || c.isDraw()) return false;
  const gained = mv.captured ? VAL[mv.captured] : 0;
  let worst = 0;
  for (const [sq, gain] of winnable(c)) {
    if (sq !== mv.to && (already.get(sq) ?? 0) >= gain) continue;
    worst = Math.max(worst, gain);
  }
  return worst - gained >= 2;
}

/** Extra context for judging a move: the position before your opponent's last move, and that move. */
export type MoveContext = {
  prev?: PositionEval;
  last?: { to: string; captured?: boolean };
  /** The mover's rating, when known: scales how much an advantage is worth (see winK). */
  rating?: number;
};

/**
 * Moves that are clearly the only option but not hard to find, so not "Great": recaptures, taking
 * a free or bigger piece, trades, and getting out of check with only a few legal moves.
 */
function obvious(fen: string, uci: string, ctx: MoveContext): boolean {
  if (ctx.last?.captured && uci.slice(2, 4) === ctx.last.to) return true;
  const c = new Chess(fen);
  if (c.inCheck() && c.moves().length <= 3) return true;
  try {
    const mv = c.move(uciToMove(uci));
    if (mv.captured && VAL[mv.captured] >= VAL[mv.piece]) return true;
    if (mv.captured && !c.moves({ verbose: true }).some((r) => r.to === mv.to)) return true;
  } catch {}
  return false;
}

const moverCp = (s: Score, mover: 'w' | 'b') => (mover === 'w' ? s.cp : -s.cp);

export function classifyMove(
  before: PositionEval,
  after: PositionEval,
  uci: string,
  color: 'w' | 'b',
  isBook: boolean,
  cmp?: MoveComparison,
  ctx: MoveContext = {},
): { classification: Classification; loss: number } {
  if (isBook) return { classification: 'book', loss: 0 };
  if (new Chess(before.fen).moves().length === 1) return { classification: 'forced', loss: 0 };
  // Delivering checkmate is always best.
  if (after.score.mate === 0) return { classification: 'best', loss: 0 };
  const bestScore = cmp?.best ?? before.score;
  const playedScore = cmp?.played ?? after.score;
  const k = winK(ctx.rating);
  const wb = moverWinPct(bestScore, color, k);
  const wa = moverWinPct(playedScore, color, k);
  const loss = Math.max(0, wb - wa);
  // The engine's move, or one it scores just as high in the same search.
  const top = (!!before.best && uci === before.best) || (!!cmp && moverCp(playedScore, color) >= moverCp(bestScore, color));
  const base: Classification = top ? 'best' : classifyLoss(loss);

  if (base === 'best' || base === 'excellent') {
    // Brilliant: a sound sacrifice — material given up, the position still fine afterwards, and you
    // weren't already completely winning.
    // A sacrifice that forces mate always counts.
    const mates = playedScore.mate !== undefined && (playedScore.mate > 0) === (color === 'w');
    if (wa >= 45 && (moverWinPct(before.score, color, k) < 95 || mates) && isSacrifice(before.fen, uci)) return { classification: 'brilliant', loss };
  }
  if (base === 'best') {
    // Great: the only good move — every alternative throws away a big part of the result.
    const second = cmp?.second ?? before.second;
    const ws = second ? moverWinPct(second, color, k) : undefined;
    if (ws !== undefined && wb - ws >= 15 && ws < 75 && wb < 98 && !obvious(before.fen, uci, ctx)) return { classification: 'great', loss };
    return { classification: 'best', loss };
  }
  const mine = (s: Score) => s.mate !== undefined && s.mate !== 0 && (s.mate > 0) === (color === 'w');
  if ((base === 'mistake' || base === 'blunder') && ctx.prev) {
    // Miss: your opponent's last move gave you a chance and you let it go — without making your own
    // position any worse than it was before their error.
    const wPrev = moverWinPct(ctx.prev.score, color, k);
    const missedMate = mine(bestScore) && playedScore.mate === undefined;
    if ((wb - wPrev >= 10 || missedMate) && wa >= wPrev - 5) return { classification: 'miss', loss };
  }
  if (base !== 'blunder') {
    // Miss, when you're already winning (where winning chances barely move): you had mate in one,
    // or a short forced mate and let it go, or a big material win (1.5+ pawns more) and took less.
    const missedMate = mine(bestScore) && (Math.abs(bestScore.mate!) === 1 || (Math.abs(bestScore.mate!) <= 3 && !mine(playedScore)));
    const b = moverCp(bestScore, color);
    const p = moverCp(playedScore, color);
    const missedWin = bestScore.mate === undefined && playedScore.mate === undefined && b >= 300 && p >= 100 && b - p >= 150;
    if (missedMate || missedWin) return { classification: 'miss', loss };
  }
  return { classification: base, loss };
}

function emptyCounts(): Record<Classification, number> {
  return { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, forced: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0 };
}

/**
 * Game accuracy per side: per-move accuracies, weighted by how sharp the position was at the time
 * (the spread of the win chances around that move), as Lichess does. Unlike Lichess there's no
 * harmonic mean on top: that let one bad blunder sink the whole game far below what chess.com shows.
 */
export function gameAccuracy(moves: { color: 'w' | 'b'; accuracy: number; evalBefore?: Score; evalAfter?: Score }[]): { w: number; b: number } {
  const n = moves.length;
  // White's win chance at every position (0 = start).
  const wins = n && moves[0].evalBefore ? [winPct(moves[0].evalBefore.cp), ...moves.map((m) => winPct((m.evalAfter ?? { cp: 0 }).cp))] : [];
  const size = Math.max(2, Math.min(8, Math.floor(n / 10)));
  const weightAt = (i: number) => {
    if (wins.length < 2) return 1;
    const from = Math.max(0, Math.min(i + 1 - size + 1, wins.length - size));
    const w = wins.slice(Math.max(0, from), Math.max(0, from) + size);
    const mean = w.reduce((x, y) => x + y, 0) / w.length;
    const sd = Math.sqrt(w.reduce((x, y) => x + (y - mean) ** 2, 0) / w.length);
    return Math.max(0.5, Math.min(12, sd));
  };
  const side = (c: 'w' | 'b') => {
    const xs = moves.map((m, i) => ({ a: m.accuracy, w: weightAt(i), c: m.color })).filter((m) => m.c === c);
    if (!xs.length) return 100;
    return xs.reduce((s, x) => s + x.a * x.w, 0) / xs.reduce((s, x) => s + x.w, 0);
  };
  return { w: side('w'), b: side('b') };
}

/** Rough playing strength for an accuracy, from typical accuracy-by-rating figures for online play. */
export function accuracyToRating(acc: number): number {
  const pts: [number, number][] = [[0, 100], [30, 250], [50, 500], [60, 750], [70, 1100], [78, 1450], [85, 1850], [90, 2200], [95, 2600], [100, 3000]];
  let r = 100;
  for (let i = 1; i < pts.length; i++) {
    const [a0, r0] = pts[i - 1];
    const [a1, r1] = pts[i];
    if (acc <= a1) {
      r = r0 + ((Math.max(a0, acc) - a0) / (a1 - a0)) * (r1 - r0);
      break;
    }
  }
  return Math.round(r / 50) * 50;
}

/** What the review is doing right now — drives the "coach is analysing" animation. */
export type ReviewStep = {
  /** 1: evaluating every position, 2: judging every move. */
  phase: 1 | 2;
  /** Position (ply) being looked at. */
  ply: number;
  score?: Score;
  /** Engine's best move in the position before this ply (UCI). */
  best?: string | null;
  /** From an engine reviewing a later stretch of the game: record it, but don't move the board. */
  background?: boolean;
  classification?: Classification;
};

export async function reviewGame(
  analyze: Analyze,
  startFen: string,
  sanMoves: string[],
  onProgress: (done: number, total: number, step?: ReviewStep) => void,
  bookPlies: number,
  tag: string,
  /** Engines available: the game is split into that many stretches, reviewed side by side. */
  lanes = 1,
  /** The players' ratings, when known (see winK). */
  ratings: { w?: number; b?: number } = {},
): Promise<GameReview> {
  const chess = new Chess(startFen);
  const fens = [chess.fen()];
  const played: Move[] = [];
  for (const san of sanMoves) {
    const m = chess.move(san);
    played.push(m);
    fens.push(chess.fen());
  }
  const n = played.length;
  // One line per position (multi-line searches are shallower per line and make scores swing),
  // then the played move is scored against the engine's best move from the same position, in one
  // search restricted to those two moves (same tree, so no noise). For engine moves that search
  // finds the runner-up instead (for "Great"). Doing both right after each other reuses the
  // engine's hash table, which roughly halves the time.
  const before: PositionEval[] = new Array(n);
  const after: PositionEval[] = new Array(n);
  const comparisons: (MoveComparison | undefined)[] = new Array(n);
  const ctxAt = (i: number): MoveContext => ({
    prev: i > 0 ? before[i - 1] : undefined,
    last: i > 0 ? { to: played[i - 1].to, captured: !!played[i - 1].captured } : undefined,
    rating: ratings[played[i].color],
  });

  // Split the game into stretches of about equal work (book moves need no comparison search),
  // one per engine; each engine reviews its stretch in order, all at the same time.
  const L = Math.max(1, Math.min(lanes, Math.floor(n / 6)));
  const cost = (i: number) => (i < bookPlies ? 1 : 2);
  const totalCost = played.reduce((t, _, i) => t + cost(i), 0);
  const bounds = [0];
  for (let i = 0, acc = 0, k = 1; i < n && k < L; i++) {
    acc += cost(i);
    if (acc >= (totalCost * k) / L) {
      bounds.push(i + 1);
      k++;
    }
  }
  bounds.push(n);
  // The board on the loading screen follows the first stretch still being reviewed.
  const laneDone = bounds.slice(1).map(() => false);
  const shown = () => laneDone.findIndex((d) => !d);
  let done = 0;
  const total = n || 1;
  let first: PositionEval | null = null;

  const reviewStretch = async (k: number, a: number, b: number) => {
    const an: Analyze = (fen, o) => analyze(fen, { ...o, lane: k });
    let prev = await evaluatePosition(an, fens[a], { tag });
    if (a === 0) first = prev;
    for (let i = a; i < b; i++) {
      const next = await evaluatePosition(an, fens[i + 1], { tag });
      before[i] = prev;
      after[i] = next;
      if (shown() === k) onProgress(Math.round(((done + 0.5) / total) * 1000), 1000, { phase: 1, ply: i + 1, score: next.score, best: prev.best });
      const uci = moveToUci(played[i]);
      comparisons[i] = i < bookPlies ? undefined : await compareWithBest(an, prev, uci, next, { tag });
      const { classification } = classifyMove(prev, next, uci, played[i].color, i < bookPlies, comparisons[i], ctxAt(i));
      done++;
      onProgress(Math.round((done / total) * 1000), 1000, { phase: 2, ply: i + 1, score: next.score, best: prev.best, classification, background: shown() !== k });
      prev = next;
    }
    laneDone[k] = true;
  };
  await Promise.all(bounds.slice(0, -1).map((a, k) => reviewStretch(k, a, bounds[k + 1])));
  if (!first) first = await evaluatePosition(analyze, fens[0], { tag }); // (a game with no moves)
  const evals: PositionEval[] = [first, ...after];
  onProgress(1000, 1000);
  const moves: ReviewedMove[] = played.map((m, i) => {
    const uci = moveToUci(m);
    const { classification, loss } = classifyMove(before[i], after[i], uci, m.color, i < bookPlies, comparisons[i], ctxAt(i));
    const b4 = before[i];
    const bestSan = b4.best ? (pvToSan(b4.fen, [b4.best], 1)[0] ?? null) : null;
    return {
      ply: i + 1,
      san: m.san,
      uci,
      color: m.color,
      fenBefore: b4.fen,
      fenAfter: after[i].fen,
      classification,
      loss,
      accuracy: classification === 'book' || classification === 'forced' ? 100 : moveAccuracy(loss),
      bestUci: b4.best,
      bestSan,
      evalBefore: b4.score,
      evalAfter: after[i].score,
      bestLineSan: pvToSan(b4.fen, b4.pv, 6),
    };
  });
  const counts = { w: emptyCounts(), b: emptyCounts() };
  for (const m of moves) counts[m.color][m.classification]++;
  const accuracy = gameAccuracy(moves);
  return {
    moves,
    evals: evals.map((e) => e.score),
    accuracy,
    counts,
    estimatedRating: { w: accuracyToRating(accuracy.w), b: accuracyToRating(accuracy.b) },
  };
}
