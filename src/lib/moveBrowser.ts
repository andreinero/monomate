import { useMemo, useState } from 'react';
import { Chess } from 'chess.js';

/**
 * Step back and forward through a game in progress (like the ‹ › buttons under a chess board).
 * `ply` is the position being viewed, or null for the live position. Any new move returns to live.
 */
export function useMoveBrowser(moves: string[], startFen?: string) {
  const [view, setView] = useState<{ ply: number; len: number } | null>(null);
  const len = moves.length;
  const ply = view && view.len === len && view.ply < len ? view.ply : null;

  const position = useMemo(() => {
    if (ply === null) return null;
    const c = new Chess(startFen);
    let last: { from: string; to: string } | null = null;
    for (const san of moves.slice(0, ply)) {
      const m = c.move(san);
      last = { from: m.from, to: m.to };
    }
    return { fen: c.fen(), lastMove: last };
  }, [ply, moves, startFen]);

  return {
    /** Viewed ply, or null when showing the live game. */
    ply,
    viewing: ply !== null,
    /** Position to show while viewing (null when live). */
    position,
    canBack: (ply ?? len) > 0,
    canForward: ply !== null,
    back: () => setView({ ply: Math.max(0, (ply ?? len) - 1), len }),
    forward: () => setView(ply === null || ply + 1 >= len ? null : { ply: ply + 1, len }),
    select: (p: number) => setView(p >= len ? null : { ply: p, len }),
    live: () => setView(null),
  };
}
