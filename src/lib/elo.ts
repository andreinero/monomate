/** Elo rating for games against bots (each bot has a fixed rating). */

export const MIN_RATING = 100;
export const MAX_RATING = 3200;
/** Games before a rating stops being provisional (and the K-factor drops). */
export const PROVISIONAL_GAMES = 20;

/** Starting levels offered when the player picks their rating. `title`/`sub` are English dictionary keys: shown via t(). */
export const RATING_LEVELS = [
  { rating: 400, title: 'New to chess', sub: 'I know how the pieces move' },
  { rating: 800, title: 'Beginner', sub: 'I play casually with friends' },
  { rating: 1200, title: 'Intermediate', sub: 'I know basic tactics and openings' },
  { rating: 1600, title: 'Advanced', sub: 'I play online or at a club often' },
  { rating: 2000, title: 'Expert', sub: 'I play serious tournaments' },
] as const;

export const clampRating = (r: number) => Math.round(Math.min(MAX_RATING, Math.max(MIN_RATING, r)));

/** Probability-weighted expected score (0..1) against an opponent. */
export function expectedScore(player: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - player) / 400));
}

/** Bigger steps while the rating is still settling. */
export function kFactor(games: number): number {
  return games < PROVISIONAL_GAMES ? 40 : 20;
}

/** Rating change for a result: score 1 = win, 0.5 = draw, 0 = loss. */
export function ratingDelta(player: number, opponent: number, score: 0 | 0.5 | 1, games: number): number {
  const d = Math.round(kFactor(games) * (score - expectedScore(player, opponent)));
  return clampRating(player + d) - player;
}

/** What a win, draw and loss would do — shown before a rated game. */
export function stakes(player: number, opponent: number, games: number) {
  return { win: ratingDelta(player, opponent, 1, games), draw: ratingDelta(player, opponent, 0.5, games), loss: ratingDelta(player, opponent, 0, games) };
}

export const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
