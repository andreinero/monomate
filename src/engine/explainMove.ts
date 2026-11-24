import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { lang, t } from '../lib/i18n';

/**
 * Describes what a move does in plain English, from the position alone:
 * development, the centre, castling, captures, checks, pins, attacks and defence.
 * Used for opening lines that don't have a hand-written note.
 */
const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const FILES = 'abcdefgh';
const CENTRE = ['d4', 'e4', 'd5', 'e5'];

/* ---------- German grammar helpers (also used by explainError and coach) ---------- */
export type DeCase = 'nom' | 'acc' | 'dat';
const DE_NOUN: Record<PieceSymbol, string> = { p: 'Bauer', n: 'Springer', b: 'Läufer', r: 'Turm', q: 'Dame', k: 'König' };
const DE_ART = {
  def: { m: { nom: 'der', acc: 'den', dat: 'dem' }, f: { nom: 'die', acc: 'die', dat: 'der' } },
  indef: { m: { nom: 'ein', acc: 'einen', dat: 'einem' }, f: { nom: 'eine', acc: 'eine', dat: 'einer' } },
} as const;
/** A piece with its German article: dePiece('p', 'acc') → "den Bauern", dePiece('q', 'acc', false) → "eine Dame". */
export function dePiece(p: PieceSymbol, kase: DeCase = 'acc', definite = true): string {
  const art = DE_ART[definite ? 'def' : 'indef'][p === 'q' ? 'f' : 'm'][kase];
  // "Bauer" is a weak noun: den/dem Bauern.
  return `${art} ${p === 'p' && kase !== 'nom' ? 'Bauern' : DE_NOUN[p]}`;
}
/** German pronoun for a piece: er/ihn (masculine pieces), sie (the queen). */
export const dePronoun = (p: PieceSymbol, kase: 'nom' | 'acc' = 'nom') => (p === 'q' ? 'sie' : kase === 'nom' ? 'er' : 'ihn');
/** "a, b und c". */
export const deList = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} und ${xs[xs.length - 1]}`);

/**
 * One sentence of the description, in English and German. `vp` is the German sentence as a
 * lower-case verb phrase without a subject ("entwickelt den Springer"), when it has one, so
 * sentences can be joined ("Er entwickelt den Springer und greift …").
 */
type Part = { en: string; de: string; vp?: string };
const vpOf = (de: string) => de.charAt(0).toLowerCase() + de.slice(1).replace(/[.!]$/, '');
/** Joins verb phrases; after one that already has an "und", the last gets "außerdem" after its verb. */
function deJoin(vps: string[]): string {
  if (vps.length < 2) return vps.join('');
  const head = vps.slice(0, -1);
  let last = vps[vps.length - 1];
  if (head.some((v) => v.includes(' und '))) last = last.replace(' ', ' außerdem ');
  return `${head.join(', ')} und ${last}`;
}
/** A sentence; the German defaults to the dictionary translation of the English. `verb`: the German starts with a verb. */
const P = (en: string, de: string = t(en), verb = true): Part => ({ en, de, ...(verb ? { vp: vpOf(de) } : {}) });

type Board = ReturnType<Chess['board']>;
const rc = (sq: string): [number, number] => [8 - Number(sq[1]), FILES.indexOf(sq[0])];
const toSq = (r: number, c: number) => (FILES[c] + (8 - r)) as Square;
const on = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

const RAYS: Record<'b' | 'r', [number, number][]> = {
  b: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  r: [[1, 0], [-1, 0], [0, 1], [0, -1]],
};
const KNIGHT: [number, number][] = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

/** Squares attacked by the piece standing on `sq`. */
function attacksFrom(board: Board, sq: string): Square[] {
  const [r, c] = rc(sq);
  const p = board[r][c];
  if (!p) return [];
  const out: Square[] = [];
  const slide = (dirs: [number, number][]) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (on(rr, cc)) {
        out.push(toSq(rr, cc));
        if (board[rr][cc]) break;
        rr += dr;
        cc += dc;
      }
    }
  };
  if (p.type === 'p') {
    const dr = p.color === 'w' ? -1 : 1;
    for (const dc of [-1, 1]) if (on(r + dr, c + dc)) out.push(toSq(r + dr, c + dc));
  } else if (p.type === 'n') {
    for (const [dr, dc] of KNIGHT) if (on(r + dr, c + dc)) out.push(toSq(r + dr, c + dc));
  } else if (p.type === 'k') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && on(r + dr, c + dc)) out.push(toSq(r + dr, c + dc));
  } else {
    if (p.type === 'b' || p.type === 'q') slide(RAYS.b);
    if (p.type === 'r' || p.type === 'q') slide(RAYS.r);
  }
  return out;
}

/** "pins the knight on c6 to the king", if the moved slider creates a pin (`de`: the German phrase). */
function pinFrom(board: Board, sq: string, us: Color): { en: string; de: string } | null {
  const [r, c] = rc(sq);
  const p = board[r][c]!;
  const dirs = p.type === 'b' ? RAYS.b : p.type === 'r' ? RAYS.r : p.type === 'q' ? [...RAYS.b, ...RAYS.r] : [];
  for (const [dr, dc] of dirs) {
    let rr = r + dr, cc = c + dc;
    let first: { type: PieceSymbol; sq: string } | null = null;
    while (on(rr, cc)) {
      const x = board[rr][cc];
      if (x) {
        if (x.color === us) break;
        if (!first) first = { type: x.type, sq: toSq(rr, cc) };
        else {
          if (first.type !== 'k' && (x.type === 'k' || (VALUE[x.type] > VALUE[first.type] && VALUE[x.type] > VALUE[p.type]))) {
            return {
              en: `pins the ${NAME[first.type]} on ${first.sq} to the ${NAME[x.type]}`,
              de: `fesselt ${dePiece(first.type)} auf ${first.sq} an ${dePiece(x.type)}`,
            };
          }
          break;
        }
      }
      rr += dr;
      cc += dc;
    }
  }
  return null;
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The description in English and German. `deVp`: the German as one verb phrase ("entwickelt den Springer und …"), when every sentence allows it. */
export type MoveExplanation = { en: string; de: string; deVp: string | null };

/** What a move does, in the app's language. */
export function explainMove(fenBefore: string, san: string, prev?: { to: string; captured?: string } | null): string {
  const x = explainMoveBoth(fenBefore, san, prev);
  return lang() === 'de' ? x.de : x.en;
}

/** What a move does, in English and German (the English drives tactic detection in explainError). */
export function explainMoveBoth(fenBefore: string, san: string, prev?: { to: string; captured?: string } | null): MoveExplanation {
  const c = new Chess(fenBefore);
  let m;
  try {
    m = c.move(san);
  } catch {
    return { en: '', de: '', deVp: null };
  }
  const us = m.color;
  const them: Color = us === 'w' ? 'b' : 'w';
  const before = new Chess(fenBefore);
  const board = c.board();
  const backRank = us === 'w' ? '1' : '8';
  const piece = NAME[m.piece];
  const parts: Part[] = [];
  const skip = new Set<string>();
  const done = (): MoveExplanation => ({
    en: parts.map((p) => p.en).join(' '),
    de: parts.map((p) => p.de).join(' '),
    deVp: parts.length && parts.every((p) => p.vp) ? deJoin(parts.map((p) => p.vp!)) : null,
  });

  // --- What the move is ---
  if (m.isKingsideCastle()) parts.push(P('Castles kingside: the king gets to safety and the rook joins the game.', undefined, false));
  else if (m.isQueensideCastle()) parts.push(P('Castles queenside: the king tucks away and the rook lands on the central d-file.', undefined, false));
  else if (m.isPromotion()) parts.push(P(`Promotes the pawn to a ${NAME[m.promotion!]}.`, `Wandelt den Bauern in ${dePiece(m.promotion!, 'acc', false)} um.`));
  else if (m.isEnPassant()) parts.push(P('Captures en passant, taking the pawn that just went past.'));
  else if (m.captured) {
    if (prev?.captured && prev.to === m.to) parts.push(P(`Recaptures on ${m.to}, restoring the material balance.`, t('Recaptures on {sq}, restoring the material balance.', { sq: m.to })));
    else parts.push(P(`Takes the ${NAME[m.captured]} on ${m.to}.`, `Schlägt ${dePiece(m.captured)} auf ${m.to}.`));
  } else if (m.piece === 'p') {
    const f = m.to[0];
    const pawnHits = attacksFrom(board, m.to);
    const challenged = pawnHits.find((s) => {
      const x = c.get(s);
      return x && x.color === them && x.type === 'p';
    });
    // A pawn that hits an enemy pawn in the middle of the board: a pawn break.
    const breaks = challenged && ['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5'].includes(challenged);
    if (breaks) parts.push(P(`Strikes at the centre with a pawn, challenging the pawn on ${challenged}.`, t('Strikes at the centre with a pawn, challenging the pawn on {sq}.', { sq: challenged })));
    else if (CENTRE.includes(m.to)) parts.push(P(m.isBigPawn() ? 'Grabs space in the centre and opens lines for the bishop and queen.' : 'Claims a central square.'));
    else if (['e3', 'd3', 'e6', 'd6'].includes(m.to)) parts.push(P('A solid pawn move: it supports the centre and opens a path for a bishop.', undefined, false));
    else if (['c4', 'c5', 'f4', 'f5'].includes(m.to)) parts.push(P('Fights for the centre from the side.'));
    else if (['g3', 'g6', 'b3', 'b6'].includes(m.to)) {
      const sq = `${f === 'g' ? 'g' : 'b'}${us === 'w' ? 2 : 7}`;
      parts.push(P(`Prepares to fianchetto the bishop on ${sq}.`, t('Prepares to fianchetto the bishop on {sq}.', { sq })));
    } else if (m.to === 'c3') parts.push(P('Prepares to support a pawn on d4.'));
    else if (m.to === 'c6') parts.push(P('Prepares to support a pawn on d5.'));
    else if (['a3', 'h3', 'a6', 'h6'].includes(m.to) && pawnHits.some((s) => !c.get(s))) {
      const free = pawnHits.filter((s) => !c.get(s));
      parts.push(P(`A useful little move: it keeps enemy pieces off ${list(free)}.`, `Ein nützlicher kleiner Zug: Er hält gegnerische Figuren von ${deList(free)} fern.`, false));
    } else if (!pawnHits.some((s) => c.get(s)?.color === them && c.get(s)?.type !== 'p')) {
      const wing = 'abc'.includes(f) ? 'queenside' : 'fgh'.includes(f) ? 'kingside' : 'centre';
      parts.push(P(`Gains space on the ${wing}.`, `Gewinnt Raum ${wing === 'queenside' ? 'am Damenflügel' : wing === 'kingside' ? 'am Königsflügel' : 'im Zentrum'}.`));
    }
    if (challenged && !m.captured && !breaks) parts.push({ en: `It challenges the pawn on ${challenged}.`, de: `Er greift den Bauern auf ${challenged} an.`, vp: `greift den Bauern auf ${challenged} an` });
    if (challenged) skip.add(challenged);
  } else if ((m.piece === 'n' || m.piece === 'b') && m.from[1] === backRank) {
    if (m.piece === 'b' && ['b2', 'g2', 'b7', 'g7'].includes(m.to)) parts.push(P('Fianchettoes the bishop onto the long diagonal.'));
    else if (m.piece === 'n' && ['c3', 'f3', 'c6', 'f6'].includes(m.to)) parts.push(P('Develops the knight toward the centre.'));
    else parts.push(P(`Develops the ${piece}.`, `Entwickelt ${dePiece(m.piece)}.`));
  } else if (m.piece === 'q') parts.push(P(m.from === (us === 'w' ? 'd1' : 'd8') ? 'Brings the queen into play.' : 'Repositions the queen.'));
  else if (m.piece === 'r') parts.push(P(['d', 'e'].includes(m.to[0]) ? 'Puts the rook on a central file.' : 'Brings the rook into play.'));
  else if (m.piece === 'k') parts.push(P('Moves the king.'));
  else parts.push(P(`Repositions the ${piece}.`, `Stellt ${dePiece(m.piece)} um.`));

  // --- What it does next ---
  if (m.san.endsWith('#')) {
    parts.push(P('Checkmate!', undefined, false));
    return done();
  }
  // Each extra in English and German ("gives check" / "gibt Schach").
  const extras: { en: string; de: string }[] = [];
  if (m.san.endsWith('+')) extras.push({ en: 'gives check', de: 'gibt Schach' });
  const pin = m.piece === 'b' || m.piece === 'r' || m.piece === 'q' ? pinFrom(board, m.to, us) : null;
  if (pin) extras.push(pin);

  const hits = attacksFrom(board, m.to);
  const targets = hits
    .map((s) => ({ s, p: c.get(s) }))
    .filter(({ s, p }) => p && p.color === them && p.type !== 'k' && !skip.has(s) && !(pin && pin.en.includes(s)))
    // Worth mentioning: a bigger piece, or one we now attack more times than it is defended.
    .filter(({ s, p }) => VALUE[p!.type] > VALUE[m.piece] || c.attackers(s, us).length > c.attackers(s, them).length)
    .sort((a, b) => VALUE[b.p!.type] - VALUE[a.p!.type])
    .slice(0, 2);
  if (targets.length === 2 && (m.piece === 'n' || m.piece === 'p')) {
    const [a, b] = [targets[0].p!.type, targets[1].p!.type];
    extras.push({ en: `forks the ${NAME[a]} and the ${NAME[b]}`, de: `gabelt ${dePiece(a)} und ${dePiece(b)}` });
  } else if (targets.length) {
    extras.push({
      en: `attacks ${list(targets.map(({ s, p }) => `the ${NAME[p!.type]} on ${s}`))}`,
      de: `greift ${deList(targets.map(({ s, p }) => `${dePiece(p!.type)} auf ${s}`))} an`,
    });
  }

  // Defends a piece that is under attack and was short of defenders.
  const defended = hits.find((s) => {
    const p = c.get(s);
    if (!p || p.color !== us || p.type === 'k') return false;
    const attackers = c.attackers(s, them).length;
    return attackers > 0 && before.attackers(s, us).filter((x) => x !== m.from).length < attackers;
  });
  if (defended) {
    const p = c.get(defended)!.type;
    extras.push({ en: `defends the ${NAME[p]} on ${defended}`, de: `deckt ${dePiece(p)} auf ${defended}` });
  }

  // Pressure on a piece that is attacked but adequately defended (e.g. Bb5 against Nc6).
  const pressured = !targets.length && !pin ? hits.find((s) => {
    const p = c.get(s);
    return p && p.color === them && p.type !== 'p' && p.type !== 'k' && !skip.has(s);
  }) : undefined;
  if (pressured) {
    const p = c.get(pressured)!.type;
    extras.push({ en: `puts pressure on the ${NAME[p]} on ${pressured}`, de: `setzt ${dePiece(p)} auf ${pressured} unter Druck` });
  }

  if (extras.length) {
    const shown = extras.slice(0, 2);
    parts.push(P(cap(list(shown.map((e) => e.en))) + '.', cap(deList(shown.map((e) => e.de))) + '.'));
  } else if ((m.piece === 'n' || m.piece === 'b') && !m.captured) {
    const eyes = hits.filter((s) => CENTRE.includes(s));
    if (eyes.length) parts.push({ en: `It eyes ${list(eyes)}.`, de: `Er nimmt ${deList(eyes)} ins Visier.`, vp: `nimmt ${deList(eyes)} ins Visier` });
  }
  return done();
}
