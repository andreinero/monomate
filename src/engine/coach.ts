import { Chess, type Square, type PieceSymbol, type Color } from 'chess.js';
import type { Classification, PositionEval } from './analysis';
import { isError, pvToSan, uciToMove } from './analysis';
import { IN_GAME_WORDS, detail, getCoach, joinSpoken, line, oppLine, praiseLine, type Coach, type Spoken } from './coaches';
import type { Mood } from '../components/Portrait';
import { explainMove, explainMoveBoth } from './explainMove';
import { lang, t } from '../lib/i18n';

/** Default coach (used where no coach was chosen, e.g. reviews of bot games). */
export const COACH = getCoach('sage');

/** How the coach's portrait should look after a move of this quality. */
export function moodFor(c: Classification | undefined): Mood {
  if (!c) return 'neutral';
  if (c === 'brilliant' || c === 'great' || c === 'best' || c === 'excellent') return 'happy';
  if (c === 'blunder') return 'surprised';
  if (c === 'mistake' || c === 'inaccuracy' || c === 'miss') return 'sad';
  return 'neutral';
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };


export type CoachFeedback = {
  classification: Classification;
  /** Exactly what the coach says (every sentence has a recorded clip). */
  text: string;
  /** Clip keys to play, in order. */
  voice: string[];
  /** Move labels shown under the speech bubble (e.g. "BETTER: Nf3"). */
  chips: string[];
  /** Suggested move to show with an arrow (UCI). */
  arrow?: string;
  /** True if the coach recommends trying again. */
  suggestRetry: boolean;
};

type PieceKey = 'p' | 'n' | 'b' | 'r' | 'q';
const isPiece = (p: PieceSymbol | undefined): p is PieceKey => !!p && p !== 'k';

/** What does the opponent's best reply do to us? */
/** What the best answer to a move does. `opp`: the move was your opponent's, so the answer is yours. */
function describeReply(coach: Coach, fenAfter: string, reply: string, opp = false, scream = false): Spoken | null {
  const c = new Chess(fenAfter);
  let mv;
  try {
    mv = c.move(uciToMove(reply));
  } catch {
    return null;
  }
  const p = opp ? 'opp.' : '';
  const chips = [opp ? t('YOUR REPLY: {san}', { san: mv.san }) : t('THEIR REPLY: {san}', { san: mv.san })];
  if (isPiece(mv.captured)) return detail(coach, `${p}hang.${mv.captured}`, chips, scream);
  if (mv.san.includes('+')) return detail(coach, `${p}reply.check`, chips, scream);
  if (mv.promotion) return detail(coach, `${p}reply.promote`, chips, scream);
  return detail(coach, `${p}reply.strong`, chips, scream);
}

export function coachOnPlayerMove(args: {
  classification: Classification;
  loss: number;
  before: PositionEval;
  after: PositionEval;
  playedSan: string;
  mover: Color;
  coach?: Coach;
}): CoachFeedback {
  const { classification, before, after, playedSan, mover } = args;
  const coach = args.coach ?? COACH;
  if (!isError(classification)) {
    let extra: Spoken | null = null;
    if (after.score.mate !== undefined && (after.score.mate > 0) === (mover === 'w') && after.score.mate !== 0) {
      extra = detail(coach, 'haveMate', [t('MATE IN {n}', { n: Math.abs(after.score.mate) })]);
    } else if (playedSan.includes('x') && classification !== 'book' && classification !== 'forced' && classification !== 'brilliant') {
      extra = detail(coach, 'goodCapture');
    }
    const sp = joinSpoken(praiseLine(coach, classification as Parameters<typeof praiseLine>[1]), extra);
    return { classification, text: sp.text, voice: sp.voice ?? [], chips: sp.chips ?? [], suggestRetry: false };
  }

  const bestSan = before.best ? pvToSan(before.fen, [before.best], 1)[0] : undefined;
  const hadMate = before.score.mate !== undefined && before.score.mate !== 0 && (before.score.mate > 0) === (mover === 'w');
  const allowsMate = after.score.mate !== undefined && after.score.mate !== 0 && (after.score.mate > 0) !== (mover === 'w');

  // A short reaction plus ONE explanation — the most important one. (The arrow shows the better
  // move, and "Accurate info from coach" has the full story.) Long chains made the game wait.
  const opener = line(coach, classification === 'blunder' ? 'blunder' : classification === 'mistake' ? 'mistake' : classification === 'miss' ? 'miss' : 'inaccuracy', IN_GAME_WORDS);
  // Roast mode: after a blunder the explanation is screamed too.
  const scream = classification === 'blunder';
  let why: Spoken | null = null;
  if (hadMate && bestSan) {
    why = detail(coach, 'hadMate', [t('MATE IN {n}: {san}', { n: Math.abs(before.score.mate!), san: bestSan })], scream);
  } else if (allowsMate && after.best) {
    const replySan = pvToSan(after.fen, [after.best], 1)[0];
    why = detail(coach, 'allowsMate', replySan ? [t('THEIR MATE: {san}', { san: replySan })] : [], scream);
  } else {
    let captured: PieceSymbol | undefined;
    try {
      if (before.best) captured = new Chess(before.fen).move(uciToMove(before.best)).captured;
    } catch {}
    const reply = after.best ? describeReply(coach, after.fen, after.best, false, scream) : null;
    // A concrete consequence (a hung piece, a check, a promotion) beats "you missed a capture",
    // which beats a vague "they have a strong reply". For a Miss, what you missed comes first.
    const concrete = reply && !reply.voice?.some((k) => k.includes('reply.strong'));
    if (classification === 'miss' && bestSan && isPiece(captured)) why = detail(coach, `wins.${captured}`, [t('BETTER: {san}', { san: bestSan })], scream);
    else if (concrete) why = reply;
    else if (bestSan && isPiece(captured)) why = detail(coach, `wins.${captured}`, [t('BETTER: {san}', { san: bestSan })], scream);
    // Nothing concrete to say: the reaction alone. The arrow (and the BETTER chip) shows the move.
    else why = bestSan ? { text: '', voice: [], chips: [t('BETTER: {san}', { san: bestSan })] } : null;
  }
  const parts: (Spoken | null)[] = [opener, why];
  const sp = joinSpoken(...parts);
  return {
    classification,
    text: sp.text.trim(),
    voice: sp.voice ?? [],
    chips: sp.chips ?? [],
    arrow: before.best ?? undefined,
    suggestRetry: classification === 'mistake' || classification === 'blunder' || classification === 'miss',
  };
}

/**
 * Game Review: the coach's comment on one of your *opponent's* moves, told from your side
 * ("They left their knight hanging", "Now you have a strong reply"). Every sentence is recorded.
 */
export function coachOnOpponentReviewMove(args: { classification: Classification; before: PositionEval; after: PositionEval; playedSan: string; mover: Color; coach: Coach }): CoachFeedback {
  const { classification, before, after, playedSan, mover, coach } = args;
  const opener = (cat: keyof Coach['lines']['opp']): Spoken => oppLine(coach, cat);
  if (classification === 'book') {
    const b = oppLine(coach, 'book');
    return { classification, text: b.text, voice: b.voice ?? [], chips: [], suggestRetry: false };
  }
  if (!isError(classification)) {
    const theyMate = after.score.mate !== undefined && after.score.mate !== 0 && (after.score.mate > 0) === (mover === 'w');
    const extra = theyMate ? detail(coach, 'opp.haveMate', [t('THEIR MATE IN {n}', { n: Math.abs(after.score.mate!) })]) : playedSan.includes('x') ? detail(coach, 'goodCapture') : null;
    const sp = joinSpoken(opener('good'), extra);
    return { classification, text: sp.text, voice: sp.voice ?? [], chips: sp.chips ?? [], suggestRetry: false };
  }

  const bestSan = before.best ? pvToSan(before.fen, [before.best], 1)[0] : undefined;
  const hadMate = before.score.mate !== undefined && before.score.mate !== 0 && (before.score.mate > 0) === (mover === 'w');
  const allowsMate = after.score.mate !== undefined && after.score.mate !== 0 && (after.score.mate > 0) !== (mover === 'w');
  const parts: (Spoken | null)[] = [opener(classification === 'blunder' ? 'blunder' : classification === 'mistake' || classification === 'miss' ? 'mistake' : 'inaccuracy')];
  if (hadMate && bestSan) {
    parts.push(detail(coach, 'opp.hadMate', [t('THEY HAD MATE IN {n}: {san}', { n: Math.abs(before.score.mate!), san: bestSan })]));
  } else if (allowsMate && after.best) {
    const replySan = pvToSan(after.fen, [after.best], 1)[0];
    parts.push(detail(coach, 'opp.allowsMate', replySan ? [t('YOUR MATE: {san}', { san: replySan })] : []));
  } else if (after.best) {
    parts.push(describeReply(coach, after.fen, after.best, true));
  }
  if (bestSan && !hadMate) {
    let captured: PieceSymbol | undefined;
    try {
      captured = new Chess(before.fen).move(uciToMove(before.best!)).captured;
    } catch {}
    // The "wins a piece" lines (and their variants) are worded to you ("You could have won…"),
    // so for your opponent's miss use the neutral line; the chip shows the move.
    const WINS = { p: 'THEY HAD: {san} (WINS A PAWN)', n: 'THEY HAD: {san} (WINS A KNIGHT)', b: 'THEY HAD: {san} (WINS A BISHOP)', r: 'THEY HAD: {san} (WINS A ROOK)', q: 'THEY HAD: {san} (WINS A QUEEN)' } as const;
    parts.push(detail(coach, 'opp.better', [t(isPiece(captured) ? WINS[captured] : 'THEY HAD: {san}', { san: bestSan })]));
  }
  const sp = joinSpoken(...parts);
  // Say what their better move would have done ("…d5: it strikes at the centre with a pawn").
  // Written only (the recorded line already points at the arrow).
  const why = bestSan && !hadMate ? betterMoveNote(before.fen, bestSan, 'Their better move was') : '';
  return { classification, text: why ? `${sp.text} ${why}` : sp.text, voice: sp.voice ?? [], chips: sp.chips ?? [], arrow: before.best ?? undefined, suggestRetry: false };
}

/** "Their better move was d5: it strikes at the centre with a pawn, challenging the pawn on e4." */
export function betterMoveNote(fen: string, san: string, lead: string): string {
  if (lang() === 'de') {
    // German keeps its capitals (nouns), so sentences aren't lower-cased and joined here: the
    // description comes as one verb phrase ("stößt … vor und greift den Bauern auf e4 an") when it can.
    const x = explainMoveBoth(fen, san);
    const L = t(lead);
    if (x.deVp) return `${L} ${san}: Er ${x.deVp}.`;
    return x.de ? `${L} ${san}. ${x.de}` : `${L} ${san}.`;
  }
  const desc = explainMove(fen, san).trim();
  if (!desc) return `${lead} ${san}.`;
  // explainMove writes short sentences ("Develops the knight. Attacks the pawn on e5."): join them
  // into one ("it develops the knight and attacks the pawn on e5").
  const lower = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);
  const sentences = desc.split(/(?<=[.!])\s+/).map((x) => x.replace(/[.!]$/, ''));
  const body = sentences.map(lower).join(' and ');
  // It starts with a verb ("develops…") or a noun phrase ("a solid pawn move: …").
  return /^an? /i.test(desc) ? `${lead} ${san}, ${body}.` : `${lead} ${san}: it ${body}.`;
}

export type Threat = { kind: 'mate'; san: string } | { kind: 'piece'; piece: PieceKey; square: Square; san: string };

/** What is the opponent of the side to move threatening right now? */
export function findThreat(fen: string): Threat | null {
  // When we're in check, that's the only thing that matters — the caller reports it.
  try {
    if (new Chess(fen).inCheck()) return null;
  } catch {
    return null;
  }
  const parts = fen.split(' ');
  const me = parts[1] as Color;
  const them: Color = me === 'w' ? 'b' : 'w';
  // Flip the side to move to see what the opponent could do if it were their turn.
  parts[1] = them;
  parts[3] = '-';
  let flipped: Chess;
  try {
    flipped = new Chess(parts.join(' '));
  } catch {
    return null;
  }
  if (flipped.inCheck()) return null;
  const moves = flipped.moves({ verbose: true });
  for (const m of moves) {
    flipped.move(m);
    const mate = flipped.isCheckmate();
    flipped.undo();
    if (mate) return { kind: 'mate', san: m.san };
  }
  let best: (Threat & { gain: number }) | null = null;
  for (const m of moves) {
    if (!isPiece(m.captured)) continue;
    flipped.move(m);
    // Can we recapture on that square?
    const defended = flipped.moves({ verbose: true }).some((r) => r.to === m.to);
    flipped.undo();
    const gain = defended ? VALUE[m.captured] - VALUE[m.piece] : VALUE[m.captured];
    if (gain >= 2 && (!best || gain > best.gain)) best = { kind: 'piece', piece: m.captured, square: m.to as Square, san: m.san, gain };
  }
  if (!best) return null;
  const { gain: _gain, ...threat } = best;
  return threat;
}

/** The coach's comment after the opponent moves. Every sentence is spoken; moves go in chips. */
export function coachOnOpponentMove(fenAfter: string, san: string, opening: string | null, coach: Coach = COACH): Spoken & { kind: 'threat' | 'check' | 'opening' | 'idle' } {
  const threat = findThreat(fenAfter);
  if (threat) {
    const d =
      threat.kind === 'mate'
        ? detail(coach, 'threatMate', [t('THREAT: {san}', { san: threat.san })])
        : detail(coach, `attacked.${threat.piece}`, [t('ON {sq}', { sq: threat.square.toUpperCase() }), t('THREAT: {san}', { san: threat.san })]);
    return { kind: 'threat', ...joinSpoken(line(coach, 'threat'), d) };
  }
  if (san.includes('+')) return { kind: 'check', ...line(coach, 'check'), chips: [t('CHECK: {san}', { san })] };
  if (opening) return { kind: 'opening', ...line(coach, 'opening'), chips: [opening.toUpperCase()] };
  return { kind: 'idle', ...line(coach, 'idle') };
}
