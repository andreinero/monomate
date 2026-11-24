/**
 * How many engines run side by side, each in its own worker on its own CPU core (Game Review
 * splits the game between them). Phones: 2 — they have two fast cores; an engine on a slow core
 * would hold the others up. Desktop: up to 4, leaving a core for the app itself.
 */
export const ENGINE_LANES = 2;

export function desktopLanes(): number {
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2;
  return Math.min(4, Math.max(1, cores - 1));
}
