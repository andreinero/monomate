import React, { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { EngineHost, type EngineHostHandle } from './EngineHost';
import { parseInfo } from './uci';
import type { EngineLine, EngineResult } from './uci';

export type { Score, EngineLine, EngineResult } from './uci';

export type AnalyzeOptions = {
  depth?: number;
  movetime?: number;
  multipv?: number;
  /** Restrict the search to these root moves (UCI). */
  searchmoves?: string[];
  /** Jobs can be cancelled by tag (e.g. when a screen unmounts). */
  tag?: string;
  /** Called with intermediate lines while searching. */
  onUpdate?: (lines: EngineLine[]) => void;
  /**
   * Which engine to use (0 by default). Several engines run side by side on separate CPU cores;
   * Game Review splits the game between them. Lanes the device doesn't have fall back to 0.
   */
  lane?: number;
};

type Job = AnalyzeOptions & {
  fen: string;
  resolve: (r: EngineResult) => void;
  reject: (e: Error) => void;
};

type EngineApi = {
  analyze: (fen: string, opts?: AnalyzeOptions) => Promise<EngineResult>;
  cancel: (tag: string) => void;
  /** How many engines are running (for splitting work between them). */
  lanes: () => number;
};

const EngineContext = createContext<EngineApi | null>(null);

export function useEngine(): EngineApi {
  const ctx = useContext(EngineContext);
  if (!ctx) throw new Error('useEngine must be used inside <EngineProvider>');
  return ctx;
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

/** One engine: its own queue of jobs and the job it's working on. */
type Lane = {
  ready: boolean;
  queue: Job[];
  current: { job: Job; lines: Map<number, EngineLine>; cancelled: boolean } | null;
};
const newLane = (): Lane => ({ ready: false, queue: [], current: null });

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const host = useRef<EngineHostHandle>(null);
  // Until the host reports how many engines it started, everything goes to engine 0.
  const lanes = useRef<Lane[]>([newLane()]);

  const send = useCallback((cmd: string, lane: number) => {
    host.current?.send(cmd, lane);
  }, []);

  const pump = useCallback(
    (l: number) => {
      const lane = lanes.current[l];
      if (!lane || !lane.ready || lane.current) return;
      const job = lane.queue.shift();
      if (!job) return;
      lane.current = { job, lines: new Map(), cancelled: false };
      send(`setoption name MultiPV value ${job.multipv ?? 1}`, l);
      send(`position fen ${job.fen}`, l);
      const restrict = job.searchmoves?.length ? ` searchmoves ${job.searchmoves.join(' ')}` : '';
      if (job.movetime) send(`go movetime ${job.movetime}${job.depth ? ` depth ${job.depth}` : ''}${restrict}`, l);
      else send(`go depth ${job.depth ?? 12}${restrict}`, l);
    },
    [send],
  );

  const onMessage = useCallback(
    (data: string) => {
      let msg: { t: string; l?: string; m?: string; w?: number; n?: number };
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (msg.t === 'boot') {
        // All engines start together; jobs already waiting are kept (on engine 0).
        const n = Math.max(1, msg.n ?? 1);
        const waiting = lanes.current.flatMap((ln) => ln.queue);
        lanes.current = Array.from({ length: n }, newLane);
        lanes.current[0].queue = waiting;
        for (let l = 0; l < n; l++) {
          send('uci', l);
          send('setoption name Hash value 32', l);
          // Stockfish 10 biases scores toward the side to move by default ("contempt"); analysis needs neutral scores.
          send('setoption name Contempt value 0', l);
          send('setoption name Analysis Contempt value Off', l);
          send('isready', l);
        }
        return;
      }
      if (msg.t === 'err') {
        console.warn('[engine]', msg.m);
        return;
      }
      const l = msg.w ?? 0;
      const lane = lanes.current[l];
      if (!lane) return;
      const line = msg.l ?? '';
      if (line === 'readyok' && !lane.ready) {
        lane.ready = true;
        pump(l);
        return;
      }
      const cur = lane.current;
      if (!cur) return;
      const whiteToMove = cur.job.fen.split(' ')[1] === 'w';
      if (line.startsWith('info') && line.includes(' pv ')) {
        const parsed = parseInfo(line, whiteToMove);
        if (parsed) {
          cur.lines.set(parsed.multipv, parsed);
          if (parsed.multipv === (cur.job.multipv ?? 1) && cur.job.onUpdate && !cur.cancelled) {
            cur.job.onUpdate([...cur.lines.values()].sort((a, b) => a.multipv - b.multipv));
          }
        }
      } else if (line.startsWith('bestmove')) {
        const bm = line.split(' ')[1];
        lane.current = null;
        if (cur.cancelled) cur.job.reject(new CancelledError());
        else
          cur.job.resolve({
            fen: cur.job.fen,
            bestmove: bm && bm !== '(none)' ? bm : null,
            lines: [...cur.lines.values()].sort((a, b) => a.multipv - b.multipv),
          });
        pump(l);
      }
    },
    [pump, send],
  );

  // If the OS kills the engine's process, fail the in-flight jobs and reload the engines.
  const restart = useCallback(() => {
    const old = lanes.current;
    old.forEach((ln) => ln.current?.job.reject(new Error('engine restarted')));
    // Waiting jobs wait on engine 0 until the engines report back (see 'boot').
    lanes.current = [{ ...newLane(), queue: old.flatMap((ln) => ln.queue) }];
    host.current?.reload();
  }, []);

  const api = useMemo<EngineApi>(
    () => ({
      analyze: (fen, opts = {}) =>
        new Promise<EngineResult>((resolve, reject) => {
          const l = opts.lane !== undefined && opts.lane < lanes.current.length ? opts.lane : 0;
          lanes.current[l].queue.push({ ...opts, fen, resolve, reject });
          pump(l);
        }),
      cancel: (tag) => {
        lanes.current.forEach((lane, l) => {
          lane.queue = lane.queue.filter((j) => {
            if (j.tag === tag) {
              j.reject(new CancelledError());
              return false;
            }
            return true;
          });
          if (lane.current && lane.current.job.tag === tag && !lane.current.cancelled) {
            lane.current.cancelled = true;
            send('stop', l);
          }
        });
      },
      lanes: () => lanes.current.length,
    }),
    [pump, send],
  );

  return (
    <EngineContext.Provider value={api}>
      {children}
      <EngineHost ref={host} onMessage={onMessage} onCrash={restart} />
    </EngineContext.Provider>
  );
}
