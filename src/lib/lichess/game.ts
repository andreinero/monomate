import { Chess, type Move } from 'chess.js';
import { t } from '../i18n';

/** Pure helpers for online games played through the Lichess Board API (no networking here). */

export type LichessColor = 'white' | 'black';

export type LichessPlayer = { id?: string; name?: string; rating?: number; title?: string | null; provisional?: boolean; aiLevel?: number };

/** `gameState` from the Board API game stream. Times are in milliseconds. */
export type GameState = {
  type?: 'gameState';
  moves: string; // UCI, space separated; castling is king-takes-rook (e1h1)
  wtime: number;
  btime: number;
  winc: number;
  binc: number;
  status: string;
  winner?: LichessColor;
  wdraw?: boolean;
  bdraw?: boolean;
};

/** `gameFull`: first message of the game stream. */
export type GameFull = {
  type: 'gameFull';
  id: string;
  rated: boolean;
  speed: string;
  clock?: { initial: number; increment: number } | null;
  white: LichessPlayer;
  black: LichessPlayer;
  initialFen?: string;
  state: GameState;
  variant?: { key: string };
};

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Random-opponent time controls (Lichess only allows Rapid and slower for third-party apps). */
export const SEEK_CONTROLS = [
  { time: 10, inc: 0 },
  { time: 10, inc: 5 },
  { time: 15, inc: 10 },
  { time: 30, inc: 0 },
  { time: 30, inc: 20 },
] as const;

/** Direct challenges may also be Blitz. */
export const CHALLENGE_CONTROLS = [
  { time: 3, inc: 2 },
  { time: 5, inc: 0 },
  { time: 5, inc: 3 },
  { time: 10, inc: 0 },
  { time: 10, inc: 5 },
  { time: 15, inc: 10 },
] as const;

export const controlLabel = (c: { time: number; inc: number }) => `${c.time}+${c.inc}`;

/** Lichess sends castling as king-to-rook (e1h1); chess.js wants king-two-squares (e1g1). */
export function fromLichessUci(uci: string, chess: Chess): { from: string; to: string; promotion?: string } {
  const from = uci.slice(0, 2);
  let to = uci.slice(2, 4);
  const promotion = uci.length > 4 ? uci[4] : undefined;
  const piece = chess.get(from as never);
  const target = chess.get(to as never);
  if (piece?.type === 'k' && target?.type === 'r' && target.color === piece.color) {
    to = (to[0] > from[0] ? 'g' : 'c') + from[1];
  }
  return { from, to, promotion };
}

/** Replays the game's moves. Stops at the first move it can't play (shouldn't happen). */
export function replay(moves: string, initialFen?: string): { chess: Chess; history: Move[] } {
  const chess = new Chess(!initialFen || initialFen === 'startpos' ? START_FEN : initialFen);
  const history: Move[] = [];
  for (const uci of moves.split(' ').filter(Boolean)) {
    try {
      history.push(chess.move(fromLichessUci(uci, chess)));
    } catch {
      break;
    }
  }
  return { chess, history };
}

export const isOngoing = (status: string) => status === 'created' || status === 'started';

/** Clock times right now: the side to move loses the time elapsed since the state arrived. */
export function liveClock(state: GameState, receivedAt: number, now: number): { w: number; b: number; running: 'w' | 'b' | null } {
  const plies = state.moves.split(' ').filter(Boolean).length;
  // Lichess starts the clocks once both players have made their first move.
  const running: 'w' | 'b' | null = isOngoing(state.status) && plies >= 2 ? (plies % 2 === 0 ? 'w' : 'b') : null;
  const elapsed = Math.max(0, now - receivedAt);
  return {
    w: Math.max(0, state.wtime - (running === 'w' ? elapsed : 0)),
    b: Math.max(0, state.btime - (running === 'b' ? elapsed : 0)),
    running,
  };
}

// Reasons stay English (they're saved with the game); screens translate them with t() when showing them.
const REASONS: Record<string, string> = {
  mate: 'Checkmate',
  resign: 'Resignation',
  stalemate: 'Stalemate',
  timeout: 'Opponent left',
  outoftime: 'Time out',
  draw: 'Draw agreed',
  aborted: 'Game aborted',
  noStart: 'Game never started',
  cheat: 'Cheat detected',
  insufficientMaterialClaim: 'Insufficient material',
  variantEnd: 'Game over',
  unknownFinish: 'Game over',
};

/** Result in PGN notation plus a readable reason. */
export function resultOf(status: string, winner?: LichessColor): { result: '1-0' | '0-1' | '1/2-1/2' | '*'; reason: string } {
  const reason = REASONS[status] ?? 'Game over';
  if (status === 'aborted' || status === 'noStart') return { result: '*', reason };
  if (winner === 'white') return { result: '1-0', reason };
  if (winner === 'black') return { result: '0-1', reason };
  return { result: '1/2-1/2', reason: status === 'outoftime' ? 'Time out vs insufficient material' : reason };
}

export const displayName = (p: LichessPlayer) => (p.aiLevel ? t('Stockfish level {n}', { n: p.aiLevel }) : `${p.title ? p.title + ' ' : ''}${p.name ?? p.id ?? t('Anonymous')}`);

/** Splits a streamed ND-JSON body into objects. Feed it text chunks as they arrive. */
export function ndjsonSplitter(onObject: (o: unknown) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue; // keep-alive
      try {
        onObject(JSON.parse(line));
      } catch {
        // ignore malformed lines
      }
    }
  };
}
