import type { GameReview } from '../engine/analysis';
import type { SavedGame } from './storage';

/**
 * How well did you play? Accuracy, minus your errors (scaled to a 20-move game), minus a bit for
 * losing. Five honest verdicts, from "great" down to "terrible".
 */
export function verdict(r: Pick<GameReview, 'accuracy' | 'counts' | 'moves'>, g: Pick<SavedGame, 'playerColor' | 'result'>): 'great' | 'good' | 'ok' | 'bad' | 'terrible' {
  const me = g.playerColor;
  const c = r.counts[me];
  const myMoves = r.moves.filter((m) => m.color === me).length;
  const per20 = 20 / Math.max(myMoves, 10);
  let score = r.accuracy[me] - (c.blunder * 14 + (c.mistake + (c.miss ?? 0)) * 6 + c.inaccuracy * 2) * per20;
  const lost = (g.result === '1-0' && me === 'b') || (g.result === '0-1' && me === 'w');
  if (lost) score -= 6;
  return score >= 88 ? 'great' : score >= 76 ? 'good' : score >= 60 ? 'ok' : score >= 42 ? 'bad' : 'terrible';
}

