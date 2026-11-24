import { Chess } from 'chess.js';
import { OPENING_GUIDES, type OpeningGuide } from '../data/openingGuides';
import { OPENINGS, openingFamilies, openingName, type Opening } from '../engine/openings';
import { explainMove } from '../engine/explainMove';

/** Everything the opening screen needs to teach one line. */
export type Lesson = {
  /** Storage key for "learned". */
  key: string;
  title: string;
  subtitle: string;
  eco: string;
  family: string;
  moves: string[];
  /** The side the learner plays (and practises). */
  side: 'w' | 'b';
  /** One explanation per ply. */
  notes: string[];
  /** Hand-written guide for this opening family, if there is one. */
  guide?: OpeningGuide;
  /** Set when the lesson is one of a guide's traps. */
  trapNote?: string;
};

export const GUIDE_BY_ID = new Map(OPENING_GUIDES.map((g) => [g.id, g]));

/** Guides for a family, most beginner-friendly first. */
export function guidesForFamily(family: string): OpeningGuide[] {
  const rank = { beginner: 0, intermediate: 1, advanced: 2 };
  return OPENING_GUIDES.filter((g) => g.name === family).sort((a, b) => rank[a.level] - rank[b.level]);
}

/** Who "owns" a family: the side whose move first gives it its name (1.e4 c5 → Black, …Bc4 → White). */
export function familySide(family: string): 'w' | 'b' {
  const f = openingFamilies().find((x) => x.family === family);
  const first = f?.lines.reduce((a, b) => (b.plies < a.plies ? b : a));
  return first && first.plies % 2 === 0 ? 'b' : 'w';
}

/** "1. e4 e5 2. Nf3 Nc6" */
export function numbered(moves: string[], from = 0): string {
  return moves
    .map((m, i) => {
      const ply = from + i;
      return ply % 2 === 0 ? `${ply / 2 + 1}. ${m}` : i === 0 ? `${(ply + 1) / 2}… ${m}` : m;
    })
    .join(' ');
}

/** Move number label for a ply: "3." for White's third move, "3…" for Black's. */
export function moveLabel(ply: number): string {
  return ply % 2 === 0 ? `${ply / 2 + 1}.` : `${(ply + 1) / 2}…`;
}

/** Notes for each ply: the guide's hand-written note while the line follows it, otherwise generated. */
function notesFor(moves: string[], guide?: OpeningGuide, override?: Record<number, string>): string[] {
  const guideMoves = guide?.moves.split(' ') ?? [];
  const c = new Chess();
  let prev: { to: string; captured?: string } | null = null;
  let following = !!guide;
  return moves.map((san, i) => {
    following = following && guideMoves[i] === san;
    const note = override?.[i] ?? (following && guide ? guide.notes[i] : explainMove(c.fen(), san, prev));
    const m = c.move(san);
    prev = { to: m.to, captured: m.captured };
    return note;
  });
}

function variationOf(moves: string): string {
  return openingName(moves.split(' '))?.opening.variation ?? '';
}

export function guideSubtitle(g: OpeningGuide): string {
  return variationOf(g.moves);
}

/** Catch-all dataset families: a guide filed under one (e.g. the Budapest under "Indian Defense") only covers its own variation. */
const GENERIC_FAMILIES = new Set(['Indian Defense', "Queen's Pawn Game", "King's Pawn Game"]);
const head = (variation: string) => variation.split(',')[0].trim();

/** Card title: the family name, or the variation for guides filed under a catch-all family. */
export function guideTitle(g: OpeningGuide): string {
  return GENERIC_FAMILIES.has(g.name) ? head(guideSubtitle(g)) || g.name : g.name;
}

export function lessonForGuide(id: string): Lesson | null {
  const g = GUIDE_BY_ID.get(id);
  if (!g) return null;
  const moves = g.moves.split(' ');
  return { key: `guide:${g.id}`, title: guideTitle(g), subtitle: guideSubtitle(g), eco: g.eco, family: g.name, moves, side: g.side, notes: notesFor(moves, g), guide: g };
}

export function lessonForTrap(id: string, index: number): Lesson | null {
  const g = GUIDE_BY_ID.get(id);
  const t = g?.traps?.[index];
  if (!g || !t) return null;
  const moves = t.moves.split(' ');
  // The trap is learnt from the side that springs it: the side making the last move.
  const side = moves.length % 2 === 1 ? 'w' : 'b';
  return {
    key: `trap:${g.id}:${index}`,
    title: t.name,
    subtitle: g.name,
    eco: g.eco,
    family: g.name,
    moves,
    side,
    notes: notesFor(moves, g, { [moves.length - 1]: t.note }),
    guide: g,
    trapNote: t.note,
  };
}

export function lessonForLine(index: number): Lesson | null {
  const o: Opening | undefined = OPENINGS[index];
  if (!o) return null;
  const moves = o.moves.split(' ');
  // Prefer the guide whose main line this variation follows the longest.
  const guides = guidesForFamily(o.family);
  const shared = (g: OpeningGuide) => {
    const gm = g.moves.split(' ');
    let n = 0;
    while (n < moves.length && gm[n] === moves[n]) n++;
    return n;
  };
  // In catch-all families, only a guide for the same variation applies.
  const eligible = GENERIC_FAMILIES.has(o.family) ? guides.filter((g) => head(guideSubtitle(g)) === head(o.variation)) : guides;
  const guide = eligible.sort((a, b) => shared(b) - shared(a))[0];
  return {
    key: `line:${o.moves}`,
    title: o.family,
    subtitle: o.variation,
    eco: o.eco,
    family: o.family,
    moves,
    side: guide?.side ?? familySide(o.family),
    notes: notesFor(moves, guide),
    guide,
  };
}
