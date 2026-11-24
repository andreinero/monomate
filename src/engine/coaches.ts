import roastLines from '../data/roastLines.json';
import roastExtra from '../data/roastExtra.json';
import roastExtra2 from '../data/roastExtra2.json';
import roastBrutal from '../data/roastBrutal.json';
import roastBrutal2 from '../data/roastBrutal2.json';
import roastShort from '../data/roastShort.json';
import extraLines from '../data/extraCoachLines.json';
import extraLines2 from '../data/extraCoachLines2.json';
import detailVariants from '../data/detailVariants.json';
// MonoMate's coaches — original characters. Each has a personality expressed through their lines,
// their portrait (see components/Portrait.tsx) and their speaking voice (see lib/voice.ts).
import type { Who } from '../components/Portrait';
import { t, voiceText } from '../lib/i18n';

export type CoachLines = {
  tagline: string;
  /** Why you should pick this coach, said when you tap them in the coach picker. */
  pitch: string;
  hello: string[];
  thinking: string;
  praise: { brilliant: string[]; great: string[]; best: string[]; excellent: string[]; good: string[]; book: string[]; forced: string[] };
  inaccuracy: string[];
  mistake: string[];
  /** You didn't punish your opponent's error. */
  miss: string[];
  blunder: string[];
  retry: string;
  hint: string;
  idle: string[];
  win: string[];
  lose: string[];
  draw: string[];
  /** Short spoken openers; the specific detail is shown as text. */
  threat: string[];
  check: string[];
  opening: string[];
  review: { great: string[]; good: string[]; ok: string[]; bad: string[]; terrible: string[]; start: string[] };
  /** Game Review: openers for your *opponent's* moves. */
  opp: { blunder: string[]; mistake: string[]; inaccuracy: string[]; good: string[]; book: string[] };
};

export type Coach = { id: string; name: string; who: Who; bio: string; lines: CoachLines };

export const COACHES: Coach[] = [
  {
    id: 'sage',
    name: 'Coach Sage',
    who: 'sage',
    get bio() {
      return t('Calm and wise. Explains the why behind every move.');
    },
    lines: {
      tagline: 'Patience. Every move tells a story.',
      pitch: "Pick me if you want to understand chess, not just play it. I'll explain the why behind every move, calmly, patiently, and at your pace.",
      hello: ["Let's play. I'll comment on your moves — tap Hint whenever you're stuck.", 'Welcome. Take your time, and think before you touch a piece.'],
      get thinking() {
        return t('Hmm, let me look at that…');
      },
      praise: {
        great: ['Great find. That was the only move that holds.', 'Superb — the one move that works here.'],
        best: ["That's the best move. Nicely done.", 'Exactly what I would have played.'],
        excellent: ['Excellent, very close to the best.', 'A strong move. You are playing well.'],
        good: ['A good, solid move.', 'Reasonable. There was something a little stronger.'],
        book: ['A well-known opening move. Good theory.', 'Straight from the opening book.'],
        brilliant: ["Brilliant. A real sacrifice, and it works.", "Beautiful. You gave material for something better."],
        forced: ["The only legal move. Nothing to decide."],
      },
      inaccuracy: ["That's an inaccuracy.", 'Not quite the best.'],
      mistake: ["That's a mistake.", 'Hmm, that move is a mistake.'],
      blunder: ["Oops — that's a blunder.", 'Careful. That move is a blunder.'],
      miss: ["You missed a chance there.", "Your opponent slipped, and you let it go."],
      retry: 'Try again. Look for checks, captures and threats.',
      hint: "Here's a strong idea. Can you see why it works?",
      idle: ['Your move. Checks, captures and threats first.', 'Which of your pieces is doing the least?', 'Ask yourself: what does my opponent want next?'],
      win: ['Well played. You earned that one.'],
      lose: ["A loss is a lesson. Let's review it together."],
      draw: ['A fair result. Well fought.'],
      threat: ['Careful — look at what your opponent is threatening.', 'Watch out. Something is under attack.'],
      check: ["You're in check. Find a safe way out."],
      opening: ['A fine opening. Develop your pieces and fight for the center.'],
      review: { great: ['An outstanding game.'], good: ['A really solid game.'], ok: ['A decent game, with some chances missed.'], bad: ['A tough game — but there is a lot to learn here.'], terrible: ['I’ll be honest with you: that was a very poor game. Let’s learn from it.'], start: ['Let’s start from the beginning. Tap next to step through the game.'] },
      opp: { blunder: ['Your opponent blundered here.'], mistake: ['Your opponent made a mistake here.'], inaccuracy: ['Not your opponent’s most accurate move.'], good: ['A good move by your opponent.'], book: ['Your opponent is following opening theory.'] },
    },
  },
  {
    id: 'bolt',
    name: 'Coach Bolt',
    who: 'bolt',
    get bio() {
      return t('High energy, all hype. Treats every game like a final.');
    },
    lines: {
      tagline: "LET'S GOOO! Eyes on the board!",
      pitch: "Want to get better fast? Pick me! I'll keep you fired up, celebrate every great move, and push you to play your very best!",
      hello: ["Alright champ, game time! Let's crush it!", "Warm-up's over — let's GO!"],
      get thinking() {
        return t('Checking the replay…');
      },
      praise: {
        great: ['WHAT A MOVE! The only one that works — unreal!', 'Clutch! Absolute clutch!'],
        best: ['Boom! Best move!', "That's how it's done, champ!"],
        excellent: ['Yes! Great hustle!', 'Strong play — keep that energy!'],
        good: ['Solid! Keep pushing!', "Good move — there's even more in there!"],
        book: ['Textbook opening, love it!', 'Classic move. You know your stuff!'],
        brilliant: ["BRILLIANT! You gave it up and it WORKS!", "Sacrifice of the year, champ!"],
        forced: ["Only move! Keep rolling!"],
      },
      inaccuracy: ['Close, but not quite!', 'Little slip there!'],
      mistake: ['Ooh, fumble!', "That one's gonna hurt!"],
      blunder: ['WHOA, turnover! Big blunder!', 'Nooo — that drops the ball!'],
      miss: ["Ooh, you missed your shot there!", "They opened the door and you walked past!"],
      retry: 'Run it back! Find the better play!',
      hint: "Here's the play — go go go!",
      idle: ["Your turn! Let's see some fire!", 'Stay sharp — what are they plotting?', 'Find the attack!'],
      win: ['VICTORY! Champion stuff!'],
      lose: ["Tough loss — we'll bounce back stronger!"],
      draw: ['Draw! Hard-fought, respect!'],
      threat: ['Heads up! They are coming for you!', 'Defense! Something is under attack!'],
      check: ["Check! Get that king to safety, fast!"],
      opening: ['Great opening! Get those pieces in the game!'],
      review: { great: ['What a performance! Absolute legend!'], good: ['Strong game, champ!'], ok: ['Not bad — but we can push harder!'], bad: ["Rough one — let's learn and come back stronger!"], terrible: ['Ouch. That game was terrible! No sugar-coating it. Let’s fix it together!'], start: ['Here we go! Tap next and let’s break it down, move by move!'] },
      opp: { blunder: ['They blundered! Huge chance for you!'], mistake: ['They slipped up there!'], inaccuracy: ['A little slip from them!'], good: ['Nice move from them — stay sharp!'], book: ['Book move from them!'] },
    },
  },
  {
    id: 'nova',
    name: 'Coach Nova',
    who: 'nova',
    get bio() {
      return t('Curious and cheerful. Loves the science of chess.');
    },
    lines: {
      tagline: 'Every position is an experiment!',
      pitch: "Choose me if you love figuring things out! We'll treat every position like an experiment and discover the best ideas together.",
      hello: ["Hi! Let's run some experiments on the board today!", "Ooh, a fresh position. Let's see what we discover!"],
      get thinking() {
        return t('Running the numbers…');
      },
      praise: {
        great: ['Fascinating! You found the only move that works!', 'Brilliant deduction!'],
        best: ['Optimal! The engine agrees with you.', 'Perfect calculation!'],
        excellent: ['Very efficient — nearly optimal!', 'Great reasoning!'],
        good: ['A sound choice.', 'Good! A slightly better option existed.'],
        book: ['A proven opening move — well researched!', 'Opening theory, nicely applied.'],
        brilliant: ["Remarkable! A sacrifice that actually computes!", "Material down, position up. Brilliant!"],
        forced: ["One legal move. A trivial decision."],
      },
      inaccuracy: ['Hmm, slightly off the optimal path.', 'Small inefficiency there.'],
      mistake: ['Hypothesis rejected — that’s a mistake.', 'Oh no, the data says mistake.'],
      blunder: ['Experiment failed — that’s a blunder!', 'Whoops! That’s a big blunder.'],
      miss: ["Hmm, there was a winning idea you missed.", "Your opponent erred, but you didn't exploit it."],
      retry: "Let's test another idea!",
      hint: 'Here is a promising line. Why do you think it works?',
      idle: ['Your move! What patterns do you notice?', 'Which squares are weak right now?', 'Count the attackers and defenders!'],
      win: ['Result confirmed: you win! Wonderful!'],
      lose: ['Every loss is data. Let’s analyze it!'],
      draw: ['A balanced outcome — interesting game!'],
      threat: ['Interesting — your opponent is threatening something.', 'Alert! One of your pieces is under attack.'],
      check: ['Check! Let’s find the safest escape.'],
      opening: ['A classic opening. Let’s see how it develops!'],
      review: { great: ['Remarkable game — nearly flawless!'], good: ['A very solid result!'], ok: ['Some good ideas, and some to improve.'], bad: ['A tricky game — but full of lessons!'], terrible: ['Honestly? That game went terribly. The good news: lots to study!'], start: ['Let’s replay the whole experiment. Tap next to begin!'] },
      opp: { blunder: ['Interesting — your opponent blundered!'], mistake: ['A mistake by your opponent. Let’s see why.'], inaccuracy: ['Your opponent was a little imprecise.'], good: ['Your opponent found a solid idea.'], book: ['Your opponent knows this opening.'] },
    },
  },
  {
    id: 'knox',
    name: 'Coach Knox',
    who: 'knox',
    get bio() {
      return t('Strict and blunt. No excuses, no wasted moves.');
    },
    lines: {
      tagline: 'Discipline wins games.',
      pitch: "Pick me if you want results. No excuses, no sloppy moves. I will be tough on you, and you will improve.",
      hello: ['Listen up. No careless moves. Begin.', 'Focus, recruit. Every move counts.'],
      get thinking() {
        return t('Inspecting…');
      },
      praise: {
        great: ['Outstanding. The only move. Carry on.', 'That is precision. Well done, recruit.'],
        best: ['Correct. Best move.', 'Acceptable. That is the best move.'],
        excellent: ['Good. Nearly perfect.', 'Solid execution.'],
        good: ['Adequate. You can do better.', 'Passable. There was a stronger move.'],
        book: ['By the book. Good.', 'Standard procedure. Correct.'],
        brilliant: ["Brilliant. Calculated risk. Approved.", "A sacrifice that works. Outstanding, recruit."],
        forced: ["Only move. Execute."],
      },
      inaccuracy: ['Sloppy. Inaccuracy.', 'Imprecise. Tighten up.'],
      mistake: ['Mistake. Unacceptable.', 'That is a mistake, recruit.'],
      blunder: ['BLUNDER! Drop and give me twenty!', 'Disaster. That is a blunder.'],
      miss: ["Missed opportunity. The enemy was open.", "They gave you a target. You missed it."],
      retry: 'Again. Do it right this time.',
      hint: 'Study this move. Understand it.',
      idle: ['Your move. Check every threat.', 'No hesitation. No sloppiness.', 'Scan the board. All of it.'],
      win: ['Mission accomplished. Dismissed.'],
      lose: ['Defeat. Review it. Then do better.'],
      draw: ['A draw. Not a win. Keep training.'],
      threat: ['Threat detected. Defend.', 'Eyes up, recruit. You are under attack.'],
      check: ['Check. Move the king. Now.'],
      opening: ['Standard opening. Develop. Control the center.'],
      review: { great: ['Excellent work, recruit.'], good: ['Solid. Keep that discipline.'], ok: ['Acceptable. Not good enough yet.'], bad: ['Sloppy game. We train harder tomorrow.'], terrible: ['That was terrible, recruit. Unacceptable. We start over.'], start: ['From the top. Tap next. Pay attention.'] },
      opp: { blunder: ['The enemy blundered. Punish it.'], mistake: ['Mistake from your opponent. Take advantage.'], inaccuracy: ['Sloppy move from your opponent.'], good: ['Your opponent played well there. Respect it.'], book: ['Opening theory. Nothing new.'] },
    },
  },
];

// More variety: extra lines for every situation (scripts check none of them name moves or squares).
// Appended after the originals so existing recordings keep their keys.
for (const c of COACHES) for (const extra of [extraLines, extraLines2]) {
  const add = (extra as Record<string, Record<string, string[]>>)[c.id] ?? {};
  const L = c.lines as unknown as Record<string, unknown>;
  for (const [key, more] of Object.entries(add)) {
    const [group, sub] = key.split('.');
    const target = sub ? (L[group] as Record<string, string[]>)[sub] : (L[group] as string[]);
    if (Array.isArray(target)) target.push(...more);
  }
}

export const DEFAULT_COACH = 'sage';

export function getCoach(id: string | undefined): Coach {
  return COACHES.find((c) => c.id === id) ?? COACHES[0];
}

export const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

/**
 * "Shuffle bag": each coach goes through *all* lines for a situation, in random order, before any
 * line comes back — and never says the same line twice in a row (even across a reshuffle).
 */
const bags = new Map<string, { n: number; order: number[]; last: number }>();
export function nextIndex(key: string, n: number): number {
  if (n <= 1) return 0;
  let b = bags.get(key);
  if (!b || b.n !== n) b = { n, order: [], last: -1 };
  if (!b.order.length) {
    b.order = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b.order[i], b.order[j]] = [b.order[j], b.order[i]];
    }
    // The bag is drawn from the end: don't start the new round with the line just said.
    if (b.order[n - 1] === b.last) [b.order[0], b.order[n - 1]] = [b.order[n - 1], b.order[0]];
  }
  const i = b.order.pop()!;
  b.last = i;
  bags.set(key, b);
  return i;
}

/* ------------------------------------------------------------------------------------------------
 * Voice lines. Every fixed line has a key like "sage-praise.best-1" that maps to a pre-recorded clip
 * (scripts/make-voices.py). Lines with move-specific details are spoken only up to the fixed part.
 * --------------------------------------------------------------------------------------------- */
/** A line the coach says: `text` is exactly what is spoken (`voice` clips, in order); `chips` are move labels shown beside it. */
export type Spoken = { text: string; voice?: string[]; chips?: string[] };

/** A recorded line: German text in German (the clip key stays the same; see lib/voice.ts). */
const said = (key: string, text: string, chips?: string[]): Spoken => ({ text: voiceText(key, text), voice: [key], ...(chips ? { chips } : {}) });

/** Join several spoken parts into one line. */
export function joinSpoken(...parts: (Spoken | null | undefined)[]): Spoken {
  const ps = parts.filter(Boolean) as Spoken[];
  return {
    text: ps.map((p) => p.text).join(' '),
    voice: ps.flatMap((p) => p.voice ?? []),
    chips: ps.flatMap((p) => p.chips ?? []),
  };
}

const PIECES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' } as const;

/** Detail sentences shared by all coaches (each coach records them in their own voice). */
export const DETAILS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(PIECES).map(([k, n]) => [`hang.${k}`, `This leaves your ${n} hanging.`])),
  ...Object.fromEntries(Object.entries(PIECES).map(([k, n]) => [`wins.${k}`, `The best move wins a ${n}.`])),
  ...Object.fromEntries(Object.entries(PIECES).map(([k, n]) => [`attacked.${k}`, `Your ${n} is under attack!`])),
  'reply.check': 'It allows a strong check.',
  'reply.promote': 'It lets your opponent promote a pawn.',
  'reply.strong': 'Your opponent has a strong reply.',
  hadMate: 'You had a forced checkmate!',
  allowsMate: 'It allows your opponent to force checkmate.',
  better: 'There was a stronger move. Look at the arrow.',
  haveMate: 'You have a forced checkmate!',
  goodCapture: 'Good capture.',
  threatMate: 'Your opponent threatens checkmate!',
  // Game Review, your opponent's moves — told from your side of the board.
  ...Object.fromEntries(Object.entries(PIECES).map(([k, n]) => [`opp.hang.${k}`, `They left their ${n} hanging.`])),
  'opp.reply.check': 'Now you have a strong check.',
  'opp.reply.promote': 'Now you can promote a pawn.',
  'opp.reply.strong': 'Now you have a strong reply.',
  'opp.hadMate': 'They missed a forced checkmate.',
  'opp.allowsMate': 'Now you can force checkmate!',
  'opp.haveMate': 'Now they have a forced checkmate.',
  'opp.better': 'They had a stronger move. Look at the arrow.',
  'review.overview': 'Let’s go through the key moments of this game together.',
  'review.clean': 'You avoided any big mistakes.',
  'review.errors': "You made some mistakes. Let's look at them together.",
};

export function detail(coach: Coach, id: string, chips?: string[], scream = false): Spoken {
  // Roast mode: the same fact, said rudely (shared text, recorded in each coach's voice).
  if (roastMode) {
    const variants = ROAST_DETAILS[id];
    if (variants?.length) {
      // The brutal wordings when there are any for this fact.
      const from = brutalFrom(PACKS.map((p) => p.details), id);
      const i = pickRoast(`${coach.id}:roastdetail:${id}`, variants, from);
      // After a blunder, the brutal wordings have a screamed recording ("roastrage").
      const kind = scream && i >= from ? 'roastrage' : 'roastdetail';
      return said(`${coach.id}-${kind}.${id}-${i}`, variants[i], chips);
    }
  }
  // Several wordings of the same fact (the original first, so its recording keeps key -0).
  const all = [DETAILS[id], ...(DETAIL_VARIANTS[id] ?? [])];
  const i = nextIndex(`${coach.id}:detail:${id}`, all.length);
  return said(`${coach.id}-detail.${id}-${i}`, all[i], chips);
}

/** Alternative wordings of the detail sentences (shared text, recorded in each coach's voice). */
export const DETAIL_VARIANTS = detailVariants as Record<string, string[]>;

type ArrayCat = 'hello' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder' | 'idle' | 'win' | 'lose' | 'draw' | 'threat' | 'check' | 'opening';
type PraiseCat = keyof CoachLines['praise'];

// ---------- Roast mode (opt-in, explicit) ----------
// Swearing trash talk about your chess, in each coach's style. Off unless switched on in the Me tab.
let roastMode = false;
export const setRoastMode = (on: boolean) => {
  roastMode = on;
};
export const isRoastMode = () => roastMode;
type RoastPack = { coaches: Record<string, Record<string, string[]>>; details: Record<string, string[]> };
// Appended last so earlier recordings keep their numbers. The brutal pack makes up most of
// what's said about your errors, losses and bad games.
const PACKS: RoastPack[] = [
  { coaches: roastLines as RoastPack['coaches'], details: {} },
  roastExtra as RoastPack,
  roastExtra2 as RoastPack,
  roastBrutal as RoastPack,
  { coaches: roastBrutal2 as RoastPack['coaches'], details: {} },
  // Short jabs (max 9 words) so in-game reactions don't hold the game up.
  { coaches: roastShort as RoastPack['coaches'], details: {} },
];
/** Packs from here on are the brutal ones. */
const FIRST_BRUTAL = 3;
/** After an error, a loss or a bad game, only brutal lines are used (the coach hates you). */
const BRUTAL_ONLY = new Set<string>(['inaccuracy', 'mistake', 'blunder', 'lose', 'review.bad', 'review.terrible', 'retry', 'hint']);
/** Where the brutal lines start in a merged pool (earlier packs' lines come first). */
const brutalFrom = (pools: Record<string, string[]>[], cat: string) =>
  pools.slice(0, FIRST_BRUTAL).reduce((n, p) => n + (p[cat]?.length ?? 0), 0);
/** Pick from the brutal part of a pool when there is one, else from all of it. */
function pickRoast(key: string, all: string[], from: number): number {
  const harsh = all.length - from;
  return harsh > 0 ? from + nextIndex(key, harsh) : nextIndex(key, all.length);
}
/** Appends pools in order, so earlier lines keep their index (and their recording key). */
function mergePools(pools: Record<string, string[]>[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of pools) for (const [k, v] of Object.entries(p)) out[k] = [...(out[k] ?? []), ...v];
  return out;
}
/** Roast lines per coach and situation (results + everything said during a coach game). */
export const ROAST_LINES: Record<string, Record<string, string[]>> = Object.fromEntries(
  ['sage', 'bolt', 'nova', 'knox'].map((id) => [id, mergePools(PACKS.map((p) => p.coaches[id] ?? {}))]),
);
/** Roast versions of the detail sentences ("This leaves your knight hanging." …). */
export const ROAST_DETAILS = mergePools(PACKS.map((p) => p.details));
type RoastCat =
  | 'hello' | 'praise' | 'book' | 'inaccuracy' | 'mistake' | 'blunder' | 'win' | 'lose' | 'draw'
  | 'idle' | 'opening' | 'threat' | 'check' | 'retry' | 'hint'
  | 'review.ok' | 'review.bad' | 'review.terrible';
const ROASTABLE = new Set<string>(['hello', 'inaccuracy', 'mistake', 'blunder', 'win', 'lose', 'draw', 'idle', 'opening', 'threat', 'check']);

/** A roast line for `cat` (with probability `chance`) when roast mode is on, else null. */
function roast(coach: Coach, cat: RoastCat, chance = 1, maxWords?: number): Spoken | null {
  if (!roastMode || Math.random() > chance) return null;
  const arr = ROAST_LINES[coach.id]?.[cat];
  if (!arr?.length) return null;
  const from = BRUTAL_ONLY.has(cat) ? brutalFrom(PACKS.map((p) => p.coaches[coach.id] ?? {}), cat) : 0;
  let idx = arr.map((_, i) => i).filter((i) => i >= from);
  if (!idx.length) idx = arr.map((_, i) => i);
  // During a game, keep reactions short (when there are enough short ones to stay varied).
  if (maxWords) {
    const short = idx.filter((i) => words(arr[i]) <= maxWords);
    if (short.length >= 6) idx = short;
  }
  const i = idx[nextIndex(`${coach.id}:roast:${cat}${maxWords ? `:${maxWords}` : ''}`, idx.length)];
  return said(`${coach.id}-roast.${cat}-${i}`, arr[i]);
}

const words = (t: string) => t.split(/\s+/).length;
/** Longest line said during a game (when there are enough shorter ones to stay varied). */
export const IN_GAME_WORDS = 10;

/** `maxWords`: prefer lines at most this long (in-game reactions, so the game doesn't wait). */
export function line(coach: Coach, cat: ArrayCat, maxWords = IN_GAME_WORDS): Spoken {
  // Roast mode has no separate "miss" pool: a missed chance gets the mistake treatment.
  const rc = cat === 'miss' ? 'mistake' : cat;
  if (ROASTABLE.has(rc)) {
    const r = roast(coach, rc as RoastCat, 1, maxWords);
    if (r) return r;
  }
  const arr = coach.lines[cat];
  let idx = arr.map((_, i) => i);
  if (maxWords) {
    const short = idx.filter((i) => words(arr[i]) <= maxWords);
    if (short.length >= 6) idx = short;
  }
  const i = idx[nextIndex(`${coach.id}:${cat}${maxWords ? `:${maxWords}` : ''}`, idx.length)];
  return said(`${coach.id}-${cat}-${i}`, arr[i]);
}

export function praiseLine(coach: Coach, cat: PraiseCat): Spoken {
  // Roast mode: every bit of praise is backhanded.
  const r = roast(coach, cat === 'book' ? 'book' : 'praise', 1, IN_GAME_WORDS);
  if (r) return r;
  const arr = coach.lines.praise[cat];
  const i = nextIndex(`${coach.id}:praise.${cat}`, arr.length);
  return said(`${coach.id}-praise.${cat}-${i}`, arr[i]);
}

export function fixedLine(coach: Coach, cat: 'tagline' | 'pitch' | 'retry' | 'hint'): Spoken {
  if (cat === 'retry' || cat === 'hint') {
    const r = roast(coach, cat, 1, IN_GAME_WORDS);
    if (r) return r;
  }
  return said(`${coach.id}-${cat}-0`, coach.lines[cat]);
}

export function reviewLine(coach: Coach, cat: keyof CoachLines['review']): Spoken {
  if (cat === 'ok' || cat === 'bad' || cat === 'terrible') {
    const r = roast(coach, `review.${cat}`, 1, 14);
    if (r) return r;
  }
  const arr = coach.lines.review[cat];
  const i = nextIndex(`${coach.id}:review.${cat}`, arr.length);
  return said(`${coach.id}-review.${cat}-${i}`, arr[i]);
}

/** Game Review: a comment on your opponent's move (several variants per coach). */
export function oppLine(coach: Coach, cat: keyof CoachLines['opp']): Spoken {
  const arr = coach.lines.opp[cat];
  const i = nextIndex(`${coach.id}:opp.${cat}`, arr.length);
  return said(`${coach.id}-opp.${cat}-${i}`, arr[i]);
}

/** Every line that should be recorded, for scripts/make-voices.py. */
export function allCoachVoiceLines(): { key: string; who: string; text: string }[] {
  const out: { key: string; who: string; text: string }[] = [];
  for (const c of COACHES) {
    const L = c.lines as unknown as Record<string, unknown>;
    for (const [cat, val] of Object.entries(L)) {
      if (cat === 'thinking') continue; // filler, shown while the engine works
      if (typeof val === 'string') out.push({ key: `${c.id}-${cat}-0`, who: c.id, text: val });
      else if (Array.isArray(val)) val.forEach((t, i) => out.push({ key: `${c.id}-${cat}-${i}`, who: c.id, text: t }));
      else if (val && typeof val === 'object')
        for (const [sub, v] of Object.entries(val as Record<string, string | string[]>)) {
          if (typeof v === 'string') out.push({ key: `${c.id}-${cat}.${sub}-0`, who: c.id, text: v });
          else v.forEach((t, i) => out.push({ key: `${c.id}-${cat}.${sub}-${i}`, who: c.id, text: t }));
        }
    }
    for (const [id, text] of Object.entries(DETAILS)) {
      out.push({ key: `${c.id}-detail.${id}-0`, who: c.id, text });
      (DETAIL_VARIANTS[id] ?? []).forEach((t, i) => out.push({ key: `${c.id}-detail.${id}-${i + 1}`, who: c.id, text: t }));
    }
    // Blunders are screamed: the brutal blunder lines, and a second, screamed recording of the
    // brutal explanations ("roastrage"), use the coach's furious voice (make-voices.py: "<id>-angry").
    // Everything else keeps the normal voice.
    const coachPools = PACKS.map((p) => p.coaches[c.id] ?? {});
    for (const [cat, lines] of Object.entries(ROAST_LINES[c.id] ?? {})) {
      const from = cat === 'blunder' ? brutalFrom(coachPools, cat) : Infinity;
      lines.forEach((text, i) => out.push({ key: `${c.id}-roast.${cat}-${i}`, who: i >= from ? `${c.id}-angry` : c.id, text }));
    }
    for (const [id, lines] of Object.entries(ROAST_DETAILS)) {
      const from = brutalFrom(PACKS.map((p) => p.details), id);
      lines.forEach((text, i) => {
        out.push({ key: `${c.id}-roastdetail.${id}-${i}`, who: c.id, text });
        if (i >= from) out.push({ key: `${c.id}-roastrage.${id}-${i}`, who: `${c.id}-angry`, text });
      });
    }
  }
  return out;
}
