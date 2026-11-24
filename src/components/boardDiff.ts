// Pure helpers for move animation — no React Native imports, so they can be tested in Node.

const FILES = 'abcdefgh';

export type Mover = { from: string; to: string; code: string; fromCode: string };
export type MoveAnim = { movers: Mover[]; ghosts: { sq: string; code: string }[] };

/** Square → piece code ("wq") for the piece-placement field of a FEN. */
function placement(fen: string): Map<string, string> {
  const out = new Map<string, string>();
  fen.split(' ')[0].split('/').forEach((row, i) => {
    let f = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') f += Number(ch);
      else {
        out.set(FILES[f] + (8 - i), (ch === ch.toUpperCase() ? 'w' : 'b') + ch.toLowerCase());
        f++;
      }
    }
  });
  return out;
}

const dist = (a: string, b: string) => Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) + Math.abs(Number(a[1]) - Number(b[1]));

/**
 * Work out which pieces travelled between two positions, so any change (a move, castling, a takeback,
 * jumping through a game) can be animated. Unmatched disappearing pieces are captures and fade out.
 */
export function diffPositions(a: string, b: string): MoveAnim | null {
  const pa = placement(a);
  const pb = placement(b);
  const vanished = [...pa].filter(([s, c]) => pb.get(s) !== c);
  const appeared = [...pb].filter(([s, c]) => pa.get(s) !== c);
  if (!appeared.length || appeared.length > 8) return null;
  const used = new Set<string>();
  const movers: Mover[] = [];
  const claim = (to: string, ok: (code: string) => boolean): [string, string] | null => {
    let best: [string, string] | null = null;
    for (const [s, c] of vanished) if (!used.has(s) && ok(c) && (!best || dist(s, to) < dist(best[0], to))) best = [s, c];
    if (best) used.add(best[0]);
    return best;
  };
  for (const [to, code] of appeared) {
    // Same piece first; otherwise a promotion (or its undo): any piece of the same colour.
    const hit = claim(to, (c) => c === code) ?? claim(to, (c) => c[0] === code[0]);
    if (hit) movers.push({ from: hit[0], to, code, fromCode: hit[1] });
  }
  const ghosts = vanished.filter(([s]) => !used.has(s)).map(([sq, code]) => ({ sq, code }));
  return movers.length ? { movers, ghosts } : null;
}

export type MoveSoundKind = 'move' | 'moveOpp' | 'capture' | 'castle' | 'check' | 'promote';

/** Which sound a position change deserves (check beats promotion beats capture beats castle). */
export function soundFor(diff: MoveAnim, inCheck: boolean, ownColor: 'w' | 'b' | null): MoveSoundKind {
  if (inCheck) return 'check';
  if (diff.movers.some((m) => m.fromCode !== m.code && m.fromCode[1] === 'p')) return 'promote';
  if (diff.ghosts.length) return 'capture';
  const kings = diff.movers.filter((m) => m.code[1] === 'k').length;
  const rooks = diff.movers.filter((m) => m.code[1] === 'r').length;
  if (diff.movers.length === 2 && kings === 1 && rooks === 1) return 'castle';
  const mover = diff.movers[0]?.code[0];
  return ownColor && mover && mover !== ownColor ? 'moveOpp' : 'move';
}
