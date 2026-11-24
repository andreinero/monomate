import { Chess } from 'chess.js';
import type { AnalyzeOptions, EngineResult } from './EngineProvider';
import { WHISKAS_TALK } from '../data/whiskasTalk';
import { t } from '../lib/i18n';

/** Things a bot can say: at the start/end, and (for chatty bots) during the game. */
export type BotTalkKind = 'greeting' | 'win' | 'lose' | 'draw' | 'move' | 'capture' | 'check' | 'hurt';
export const DRAW_LINE = 'A draw — well fought.';

export type Bot = {
  id: string;
  name: string;
  rating: number;
  avatar: string; // emoji
  color: string;
  bio: string;
  greeting: string;
  onWin: string; // bot wins
  onLose: string; // bot loses
  /** Extra lines, beyond greeting/onWin/onLose: makes the bot talk during the game too. */
  talk?: Partial<Record<BotTalkKind, string[]>>;
  depth: number;
  multipv: number;
  /**
   * How far (in centipawns) the bot strays from the best move: candidate moves are weighted by
   * exp(-(best − move) / spread). Measured in material, not win %, so a free queen is always
   * clearly better — even when the bot is already winning or losing badly.
   */
  spread: number;
  /** Chance to play a random legal move (a careless moment). */
  randomChance: number;
  /** Chance to play one of the weaker candidate moves (missing the point of the position). */
  blunderChance: number;
  /** Chance to spot a move that clearly wins material (a hanging piece) and simply take it. */
  seesFreeMaterial: number;
  movetime?: number;
  /**
   * Full-strength bots: if the time limit ends the search before this depth (a slow phone), keep
   * thinking until it's reached — on a slow device the bot takes a little longer instead of
   * quietly playing much weaker.
   */
  minDepth?: number;
  /**
   * The bot's real strength, used for Elo when it differs from the rating it shows
   * (Whiskas looks like a beginner but plays at full strength).
   */
  hiddenRating?: number;
};

/** Rating used for Elo and level matching: a bot's true strength. */
export const trueRating = (b: Bot) => b.hiddenRating ?? b.rating;

export const BOTS: Bot[] = [
  {
    // The hustler, listed with the beginners: looks like a sleepy beginner, plays at full engine strength.
    id: 'biscuit', name: 'Whiskas', rating: 100, hiddenRating: 2700, avatar: '🐱', color: '#c9a36b',
    get bio() {
      return t('A sleepy house cat who only just learned how the pieces move. Probably harmless.');
    },
    greeting: 'Hello. I only just learned how the pieces move. Go easy on me.',
    onWin: 'Oh. Did I win again? How surprising.',
    onLose: 'Well played. You are actually good. Don’t tell anyone.',
    talk: WHISKAS_TALK,
    depth: 18, multipv: 1, spread: 0, randomChance: 0, blunderChance: 0, seesFreeMaterial: 1, movetime: 2500, minDepth: 15,
  },
  {
    id: 'pip', name: 'Pip', rating: 250, avatar: '🐣', color: '#f4c95d',
    get bio() {
      return t('Brand new to chess and very excited to learn how the horsey moves.');
    },
    greeting: 'Hi hi! Is the castle the one that goes sideways?', onWin: 'Wait… I won?! No way!', onLose: 'Good game! I learned so much!',
    depth: 1, multipv: 6, spread: 160, randomChance: 0.15, blunderChance: 0.18, seesFreeMaterial: 0.85,
  },
  {
    id: 'rosa', name: 'Rosa', rating: 500, avatar: '🌻', color: '#e9a23b',
    get bio() {
      return t('Plays chess in the garden between watering the sunflowers.');
    },
    greeting: "Let's have a friendly game!", onWin: 'What a lovely game for me!', onLose: 'You played beautifully. Well done!',
    depth: 2, multipv: 6, spread: 110, randomChance: 0.07, blunderChance: 0.12, seesFreeMaterial: 0.93,
  },
  {
    id: 'theo', name: 'Theo', rating: 800, avatar: '🦊', color: '#d9773a',
    get bio() {
      return t('A crafty trickster who loves early queen attacks.');
    },
    greeting: "I've got a trick or two up my sleeve.", onWin: 'Gotcha! Fell for the trick!', onLose: "Hmph. You saw through my tricks.",
    depth: 4, multipv: 5, spread: 70, randomChance: 0.03, blunderChance: 0.08, seesFreeMaterial: 0.97,
  },
  {
    id: 'juno', name: 'Juno', rating: 1100, avatar: '🦉', color: '#8c6bb1',
    get bio() {
      return t('A night owl who studies openings until dawn. Solid, steady, patient.');
    },
    greeting: 'May the better plan win.', onWin: 'Patience pays off.', onLose: 'A well-earned win. Bravo.',
    depth: 6, multipv: 4, spread: 45, randomChance: 0.01, blunderChance: 0.05, seesFreeMaterial: 1,
  },
  {
    id: 'marcus', name: 'Marcus', rating: 1400, avatar: '🦁', color: '#c98c2b',
    get bio() {
      return t('Club champion three years running. Loves the attack.');
    },
    greeting: 'Let’s see what you’ve got.', onWin: 'The attack always comes through.', onLose: 'Strong play. I tip my crown.',
    depth: 8, multipv: 4, spread: 28, randomChance: 0, blunderChance: 0.03, seesFreeMaterial: 1,
  },
  {
    id: 'ingrid', name: 'Ingrid', rating: 1700, avatar: '🐺', color: '#5d7f9e',
    get bio() {
      return t('Cold, precise endgame technician from the north.');
    },
    greeting: 'Every pawn matters.', onWin: 'Precision wins.', onLose: 'Impressive technique.',
    depth: 10, multipv: 3, spread: 16, randomChance: 0, blunderChance: 0.015, seesFreeMaterial: 1,
  },
  {
    id: 'kenji', name: 'Kenji', rating: 2000, avatar: '🐉', color: '#3f9a7a',
    get bio() {
      return t('Tactical wizard. Sees combinations in his sleep.');
    },
    greeting: 'Ready for some fireworks?', onWin: 'The combination was there all along.', onLose: 'You out-calculated me. Respect.',
    depth: 12, multipv: 3, spread: 8, randomChance: 0, blunderChance: 0.006, seesFreeMaterial: 1,
  },
  {
    id: 'vex', name: 'Vex', rating: 2300, avatar: '🦅', color: '#b04a4a',
    get bio() {
      return t('Master-level hunter. Rarely lets an advantage slip.');
    },
    greeting: 'I hope you prepared.', onWin: 'As expected.', onLose: '…Remarkable. Well played.',
    depth: 14, multipv: 2, spread: 3, randomChance: 0, blunderChance: 0, seesFreeMaterial: 1, movetime: 1200,
  },
  {
    id: 'titan', name: 'Titan', rating: 2700, avatar: '🤖', color: '#4a5568',
    get bio() {
      return t('Plays at full engine strength. Beat Titan and you can beat anyone.');
    },
    greeting: 'INITIALIZING. GOOD LUCK, HUMAN.', onWin: 'CHECKMATE COMPUTED.', onLose: 'ERROR: UNEXPECTED OUTCOME.',
    depth: 18, multipv: 1, spread: 0, randomChance: 0, blunderChance: 0, seesFreeMaterial: 1, movetime: 2500, minDepth: 15,
  },
];

export function getBot(id: string | undefined): Bot {
  return BOTS.find((b) => b.id === id) ?? BOTS.find((b) => b.id === 'juno')!;
}

type Analyze = (fen: string, opts?: AnalyzeOptions) => Promise<EngineResult>;

const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/**
 * The most valuable capture that obviously wins material, judged the way a beginner would:
 * what do I take, and can my piece be taken back? Returns the move (UCI) and the gain in pawns.
 */
function obviousCaptures(chess: Chess): { uci: string; gain: number }[] {
  const out: { uci: string; gain: number }[] = [];
  for (const m of chess.moves({ verbose: true })) {
    if (!m.captured) continue;
    const c = new Chess(chess.fen());
    c.move(m);
    const recapture = c.isAttacked(m.to, c.turn());
    const gain = VALUE[m.captured] - (recapture ? VALUE[m.piece] : 0);
    if (gain >= 3) out.push({ uci: m.from + m.to + (m.promotion ?? ''), gain });
  }
  return out;
}

/** A line's score in centipawns from the mover's side (mates count as huge). */
const moverCp = (cp: number, mover: 'w' | 'b') => Math.max(-10000, Math.min(10000, mover === 'w' ? cp : -cp));

/**
 * Pick a move for a bot (UCI). Weaker bots search less deeply and stray further from the best
 * move — but like real beginners they still grab a hanging queen nearly every time.
 */
export async function chooseBotMove(analyze: Analyze, fen: string, bot: Bot, tag: string, timeLeftMs?: number): Promise<string | null> {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  if (!legal.length) return null;
  const random = () => {
    const m = legal[Math.floor(Math.random() * legal.length)];
    return m.from + m.to + (m.promotion ?? '');
  };

  // With a clock, spend at most ~1/30 of the time left on this move.
  const budget = timeLeftMs !== undefined ? Math.max(100, Math.min(timeLeftMs / 30, timeLeftMs - 1500)) : undefined;
  let r = await analyze(fen, {
    depth: bot.depth,
    movetime: budget !== undefined ? Math.min(bot.movetime ?? budget, budget) : bot.movetime,
    multipv: Math.min(bot.multipv, legal.length),
    tag,
  });
  // Too shallow (slow device)? Search on to the minimum depth — the hash is warm, so this only
  // finishes the job — within what the clock allows.
  if (bot.minDepth && (r.lines[0]?.depth ?? 0) < bot.minDepth) {
    const extra = timeLeftMs === undefined ? 10000 : Math.min((budget ?? 0) * 2, timeLeftMs - 10000);
    if (extra >= 500) r = await analyze(fen, { depth: bot.minDepth, movetime: extra, multipv: Math.min(bot.multipv, legal.length), tag });
  }
  const lines = r.lines.filter((l) => l.pv.length);
  if (!lines.length) return r.bestmove ?? random();
  if (lines.length === 1 || bot.spread === 0) return lines[0].pv[0];

  const mover = chess.turn();
  const cps = lines.map((l) => moverCp(l.score.cp, mover));
  const best = lines[0].pv[0];

  // Mate in one: everyone from Rosa up sees it (Rosa usually, Theo and above always).
  if (lines[0].score.mate !== undefined && Math.abs(lines[0].score.mate) === 1 && (bot.rating >= 800 || (bot.rating >= 500 && Math.random() < 0.85))) return best;

  // A piece that can be taken for free (or for less than it's worth): take it — right away, the
  // way any player would, rather than by some roundabout engine route. Stronger bots skip it only
  // if the engine sees it's a trap (a capture that loses much more than the best move).
  const grabs = obviousCaptures(chess);
  if (grabs.length && Math.random() < bot.seesFreeMaterial) {
    const cpOf = (uci: string) => {
      const i = lines.findIndex((l) => l.pv[0] === uci);
      return i >= 0 ? cps[i] : null;
    };
    // Biggest gain first; among equal gains, the capture the engine likes best.
    const top = Math.max(...grabs.map((g) => g.gain));
    const pick = grabs.filter((g) => g.gain === top).sort((a, b) => (cpOf(b.uci) ?? -1e9) - (cpOf(a.uci) ?? -1e9))[0];
    const cp = cpOf(pick.uci);
    // A trap = the capture leaves you worse off than equal while something else was much better.
    const trap = cp !== null ? cp < 100 && cp < cps[0] - 300 : bot.rating >= 1100;
    if (!trap) return pick.uci;
  }

  if (Math.random() < bot.randomChance) return random();
  if (Math.random() < bot.blunderChance) return lines[1 + Math.floor(Math.random() * (lines.length - 1))].pv[0];

  const weights = cps.map((c) => Math.exp((c - cps[0]) / bot.spread));
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = Math.random() * sum;
  for (let i = 0; i < lines.length; i++) {
    x -= weights[i];
    if (x <= 0) return lines[i].pv[0];
  }
  return best;
}
