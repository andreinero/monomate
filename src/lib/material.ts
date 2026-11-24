// Captured pieces and material balance, worked out from a position (FEN) alone, so it is right
// for any position: live games, reviews, imported games, takebacks.

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q';
const START: Record<PieceType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VALUE: Record<PieceType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
/** Display order: pawns first, queen last. */
export const PIECE_ORDER: PieceType[] = ['p', 'n', 'b', 'r', 'q'];

export type Material = {
  /** Pieces each side has taken from the other (`w`: black pieces White captured). */
  taken: { w: PieceType[]; b: PieceType[] };
  /** Material lead in pawns for each side (0 for the side that is behind or level). */
  lead: { w: number; b: number };
};

export function material(fen: string): Material {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) {
    const t = ch.toLowerCase() as PieceType;
    if (!(t in START)) continue;
    count[ch === t ? 'b' : 'w'][t]++;
  }
  const takenFrom = (side: 'w' | 'b'): PieceType[] => {
    const c = count[side];
    // A promoted pawn shows up as an extra queen (etc.), not as a captured pawn.
    let promoted = PIECE_ORDER.filter((t) => t !== 'p').reduce((s, t) => s + Math.max(0, c[t] - START[t]), 0);
    const out: PieceType[] = [];
    for (const t of PIECE_ORDER) {
      let missing = Math.max(0, START[t] - c[t]);
      if (t === 'p') {
        const fromPromo = Math.min(missing, promoted);
        missing -= fromPromo;
        promoted -= fromPromo;
      }
      for (let i = 0; i < missing; i++) out.push(t);
    }
    return out;
  };
  const value = (side: 'w' | 'b') => PIECE_ORDER.reduce((s, t) => s + count[side][t] * VALUE[t], 0);
  const diff = value('w') - value('b');
  return { taken: { w: takenFrom('b'), b: takenFrom('w') }, lead: { w: Math.max(0, diff), b: Math.max(0, -diff) } };
}
