// Checks the bots against the real Stockfish build:
//  1. weak bots grab a hanging queen (also when they're already far behind),
//  2. stronger bots beat weaker ones in short matches.
// Run: npx tsx scripts/bot-strength-test.ts [games-per-match]
import { createRequire } from 'node:module';
import { Chess } from 'chess.js';
import { parseInfo, type EngineResult } from '../src/engine/uci';
import { chooseBotMove, getBot } from '../src/engine/bots';
import type { AnalyzeOptions } from '../src/engine/EngineProvider';

const require = createRequire(import.meta.url);
const sf = require('stockfish/src/stockfish.asm.js')();
let handler: ((l: string) => void) | null = null;
sf.onmessage = (l: string) => handler?.(l);
const send = (c: string) => sf.postMessage(c, true);
let chain: Promise<unknown> = Promise.resolve();
function analyze(fen: string, o: AnalyzeOptions = {}): Promise<EngineResult> {
  const run = () =>
    new Promise<EngineResult>((resolve) => {
      const lines = new Map();
      const wtm = fen.split(' ')[1] === 'w';
      handler = (l) => {
        if (l.startsWith('info') && l.includes(' pv ')) {
          const p = parseInfo(l, wtm);
          if (p) lines.set(p.multipv, p);
        } else if (l.startsWith('bestmove')) {
          const bm = l.split(' ')[1];
          resolve({ fen, bestmove: bm && bm !== '(none)' ? bm : null, lines: [...lines.values()].sort((a, b) => a.multipv - b.multipv) });
        }
      };
      send(`setoption name MultiPV value ${o.multipv ?? 1}`);
      send(`position fen ${fen}`);
      // Cap search time so matches finish quickly in Node (the app uses the real settings).
      send(`go depth ${Math.min(o.depth ?? 12, 8)}`);
    });
  const p = chain.then(run);
  chain = p.catch(() => {});
  return p;
}

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const material = (c: Chess) => c.board().flat().reduce((s, p) => s + (p ? (p.color === 'w' ? 1 : -1) * VALUE[p.type] : 0), 0);

(async () => {
  send('uci');
  send('setoption name Contempt value 0');

  // 1. Hanging queen: Black's knight on c6 can take the white queen on b4 for free.
  const normal = 'r1bqkbnr/pppp1ppp/2n5/4p3/1Q2P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3';
  // Same, but Black has already lost queen and rooks (where the old bots played randomly).
  const losing = '2b1kbn1/pppp1ppp/2n5/4p3/1Q2P3/8/PPPP1PPP/RNB1KBNR b K - 0 3';
  const minRate: Record<string, number> = { pip: 0.7, rosa: 0.85, theo: 0.9, juno: 0.97 };
  for (const id of ['pip', 'rosa', 'theo', 'juno']) {
    for (const [label, fen] of [['normal', normal], ['already losing', losing]] as const) {
      let took = 0;
      const N = 40;
      // Knight (c6) or bishop (f8) — either takes the queen on b4.
      for (let i = 0; i < N; i++) if ((await chooseBotMove(analyze, fen, getBot(id), 't'))?.slice(2, 4) === 'b4') took++;
      check(`${id} takes a hanging queen (${label})`, took / N >= minRate[id], `${took}/${N}`);
    }
  }

  // 2. Short matches between neighbouring levels.
  const games = Number(process.argv[2] ?? 4);
  for (const [strong, weak] of [['rosa', 'pip'], ['theo', 'rosa'], ['juno', 'theo']]) {
    let score = 0;
    for (let g = 0; g < games; g++) {
      const c = new Chess();
      const white = g % 2 === 0 ? strong : weak;
      while (!c.isGameOver() && c.history().length < 160) {
        const id = c.turn() === 'w' ? white : white === strong ? weak : strong;
        const uci = await chooseBotMove(analyze, c.fen(), getBot(id), 'm');
        if (!uci) break;
        c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      }
      const strongIsWhite = white === strong;
      let s: number;
      if (c.isCheckmate()) s = (c.turn() === 'b') === strongIsWhite ? 1 : 0;
      else if (c.isGameOver()) s = 0.5;
      else {
        // Unfinished after 160 plies: decide on material.
        const m = material(c) * (strongIsWhite ? 1 : -1);
        s = m > 2 ? 1 : m < -2 ? 0 : 0.5;
      }
      score += s;
    }
    check(`${strong} beats ${weak}`, score > games / 2, `${score}/${games}`);
  }

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
