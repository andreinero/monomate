import { LichessError, streamEvents } from './api';
import { refreshSession } from './session';

/**
 * One shared Lichess event stream for the whole app (Lichess allows only a few open streams per
 * account). Anything that wants events — the Online screen, the app-wide challenge pop-up —
 * subscribes here; the stream is open while anyone is subscribed and reconnects by itself.
 */
type Listener = (e: any) => void;

/** A challenge someone sent you, as the app shows it. */
export type IncomingChallenge = { id: string; from: string; rating?: number; control: string; rated: boolean };

/** Challenges we can play in the app (standard chess, real-time clock); null for the rest. */
export function incomingChallenge(c: any): IncomingChallenge | null {
  if (!c || c.direction === 'out' || c.variant?.key !== 'standard' || c.timeControl?.type !== 'clock') return null;
  return { id: c.id, from: c.challenger?.name ?? '', rating: c.challenger?.rating, control: `${c.timeControl.limit / 60}+${c.timeControl.increment}`, rated: !!c.rated };
}

const listeners = new Set<Listener>();
// Challenges still waiting for an answer: a listener that joins late (the stream is already
// open, so Lichess won't resend them) gets them replayed.
const pending = new Map<string, unknown>();
let ctl: AbortController | null = null;

function dispatch(e: any) {
  if (e?.type === 'challenge' && e.challenge?.id) pending.set(e.challenge.id, e);
  else if ((e?.type === 'challengeCanceled' || e?.type === 'challengeDeclined') && e.challenge?.id) pending.delete(e.challenge.id);
  else if (e?.type === 'gameStart' && e.game?.gameId) pending.delete(e.game.gameId); // accepted (here or elsewhere)
  listeners.forEach((fn) => {
    try {
      fn(e);
    } catch {}
  });
}

function open() {
  if (ctl) return;
  const c = (ctl = new AbortController());
  pending.clear();
  (async () => {
    while (!c.signal.aborted) {
      let wait = 3000;
      try {
        await streamEvents(dispatch, c.signal);
      } catch (err) {
        if (err instanceof LichessError && err.status === 429) wait = 60000;
        if (err instanceof LichessError && err.status === 401) {
          refreshSession();
          break;
        }
      }
      if (!c.signal.aborted) await new Promise((r) => setTimeout(r, wait));
    }
    if (ctl === c) ctl = null;
  })();
}

/** Listen to the account's events (only while logged in to Lichess). Returns the unsubscribe. */
export function subscribeLichessEvents(fn: Listener): () => void {
  listeners.add(fn);
  if (ctl) pending.forEach((e) => fn(e));
  else open();
  return () => {
    listeners.delete(fn);
    if (!listeners.size && ctl) {
      ctl.abort();
      ctl = null;
    }
  };
}

/** Forget a challenge once it's been answered here. */
export const challengeAnswered = (id: string) => pending.delete(id);
