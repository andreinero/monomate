import { useEffect, useImperativeHandle, useRef } from 'react';
import { STOCKFISH_SRC } from './stockfishSource';
import { desktopLanes } from './engineLanes';
import type { EngineHostHandle, EngineHostProps } from './EngineHost';

export type { EngineHostHandle, EngineHostProps };

/** Desktop / web: each engine runs in a plain Web Worker — no WebView needed. */
export function EngineHost({ ref, onMessage, onCrash }: EngineHostProps) {
  const workers = useRef<Worker[]>([]);
  const handlers = useRef({ onMessage, onCrash });
  useEffect(() => {
    handlers.current = { onMessage, onCrash };
  });

  const start = () => {
    workers.current.forEach((w) => w.terminate());
    const url = URL.createObjectURL(new Blob([STOCKFISH_SRC], { type: 'application/javascript' }));
    workers.current = Array.from({ length: desktopLanes() }, (_, k) => {
      const w = new Worker(url);
      w.onmessage = (e) => handlers.current.onMessage(JSON.stringify({ t: 'line', l: String(e.data), w: k }));
      w.onerror = (e) => {
        handlers.current.onMessage(JSON.stringify({ t: 'err', m: String(e?.message), w: k }));
        handlers.current.onCrash();
      };
      return w;
    });
    handlers.current.onMessage(JSON.stringify({ t: 'boot', n: workers.current.length }));
  };

  useImperativeHandle(ref, () => ({
    send: (cmd, lane = 0) => (workers.current[lane] ?? workers.current[0])?.postMessage(cmd),
    reload: start,
  }));

  useEffect(() => {
    start();
    return () => workers.current.forEach((w) => w.terminate());
  }, []);
  return null;
}
