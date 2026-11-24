// UCI protocol helpers — no React Native dependencies, so they can be unit-tested in Node.

/** A score from White's point of view. `mate` > 0 means White mates. */
export type Score = { cp: number; mate?: number };

export type EngineLine = {
  multipv: number;
  depth: number;
  score: Score; // White POV
  pv: string[]; // UCI moves
};

export type EngineResult = {
  fen: string;
  bestmove: string | null;
  lines: EngineLine[];
};

/** Parse a Stockfish `info … pv …` line. Scores are converted to White's point of view. */
export function parseInfo(line: string, whiteToMove: boolean): EngineLine | null {
  const tokens = line.split(' ');
  let depth = 0;
  let multipv = 1;
  let score: Score | null = null;
  let pv: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') depth = Number(tokens[++i]);
    else if (t === 'multipv') multipv = Number(tokens[++i]);
    else if (t === 'score') {
      const kind = tokens[++i];
      const v = Number(tokens[++i]);
      // Skip bound-only scores; they are unreliable.
      if (tokens[i + 1] === 'lowerbound' || tokens[i + 1] === 'upperbound') return null;
      const sign = whiteToMove ? 1 : -1;
      if (kind === 'mate') {
        const m = v * sign;
        score = { cp: m > 0 ? 10000 - Math.abs(v) : -10000 + Math.abs(v), mate: m };
      } else {
        score = { cp: v * sign };
      }
    } else if (t === 'pv') {
      pv = tokens.slice(i + 1).filter((x) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(x));
      break;
    }
  }
  if (!score || !pv.length) return null;
  return { depth, multipv, score, pv };
}
