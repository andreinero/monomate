// Chess clock logic — pure functions, no React Native imports (unit-tested in scripts/engine-smoke-test.ts).
import { Chess } from 'chess.js';

export type Side = 'w' | 'b';

/**
 * "600_0" = 10 minutes, no increment. "none" = untimed.
 * Underscore rather than "+" because a "+" in a URL query is read back as a space.
 */
export type TimeControlId = 'none' | '180_2' | '300_0' | '600_0' | '900_10' | '1800_0';

export const TIME_CONTROLS: { id: TimeControlId; label: string; sub: string }[] = [
  { id: 'none', label: '∞', sub: 'No timer' },
  { id: '180_2', label: '3 | 2', sub: 'Blitz' },
  { id: '300_0', label: '5 min', sub: 'Blitz' },
  { id: '600_0', label: '10 min', sub: 'Rapid' },
  { id: '900_10', label: '15 | 10', sub: 'Rapid' },
  { id: '1800_0', label: '30 min', sub: 'Classical' },
];

export const DEFAULT_TIME_CONTROL: TimeControlId = '600_0';

export function parseTimeControl(id: string | undefined): { baseMs: number; incMs: number } | null {
  const m = /^(\d+)[_+ ](\d+)$/.exec((id ?? '').trim());
  if (!m) return null;
  return { baseMs: Number(m[1]) * 1000, incMs: Number(m[2]) * 1000 };
}

export function timeControlLabel(id: string | undefined): string | null {
  return TIME_CONTROLS.find((t) => t.id === id && t.id !== 'none')?.label ?? null;
}

/**
 * Remaining time per side, as of `since`. `turn` is whose clock is running (null = stopped).
 * Like a real game, nobody's clock runs until White has made the first move.
 */
export type Clock = { w: number; b: number; turn: Side | null; since: number; incMs: number };

export function newClock(baseMs: number, incMs: number): Clock {
  return { w: baseMs, b: baseMs, turn: null, since: 0, incMs };
}

export function remaining(c: Clock, side: Side, now: number): number {
  if (c.turn !== side) return c[side];
  return Math.max(0, c[side] - Math.max(0, now - c.since));
}

/** Charge the running side for the time used so far and stop the clock. */
export function stopClock(c: Clock, now: number): Clock {
  if (!c.turn) return c;
  return { ...c, [c.turn]: remaining(c, c.turn, now), turn: null, since: now };
}

/** `mover` has just moved: charge their time, add the increment, and start `next`'s clock. */
export function pressClock(c: Clock, mover: Side, next: Side | null, now: number): Clock {
  const started = c.turn !== null; // the very first move of the game doesn't use time
  const stopped = stopClock(c, now);
  const w = mover === 'w' && started ? stopped.w + c.incMs : stopped.w;
  const b = mover === 'b' && started ? stopped.b + c.incMs : stopped.b;
  return { ...stopped, w, b, turn: next, since: now };
}

/** Restart the clock for `side` without charging anyone (e.g. after a takeback). */
export function switchClock(c: Clock, side: Side | null, now: number): Clock {
  const stopped = stopClock(c, now);
  // Before the first move (or after taking it back) nothing runs.
  return { ...stopped, turn: side, since: now };
}

/** Can `side` still checkmate with the material it has? (Used when the opponent runs out of time.) */
export function canStillMate(fen: string, side: Side): boolean {
  const pieces = new Chess(fen)
    .board()
    .flat()
    .filter((p): p is NonNullable<typeof p> => !!p && p.color === side && p.type !== 'k');
  if (pieces.length === 0) return false;
  if (pieces.length === 1 && (pieces[0].type === 'n' || pieces[0].type === 'b')) return false;
  return true;
}

/** 10:00, 4:07, and tenths under 20 seconds: 0:09.4 */
export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  if (total < 20_000) {
    const s = Math.floor(total / 1000);
    const tenth = Math.floor((total % 1000) / 100);
    return `0:${String(s).padStart(2, '0')}.${tenth}`;
  }
  const secs = Math.ceil(total / 1000);
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
