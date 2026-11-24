// End-to-end check of the chess logic against the real Stockfish build, in Node.
// Run: npx tsx scripts/engine-smoke-test.ts
import { createRequire } from 'node:module';
import { Chess } from 'chess.js';
import { parseInfo, type EngineResult } from '../src/engine/uci';
import { reviewGame, evaluatePosition, classifyMove, isSacrifice, judgeMove } from '../src/engine/analysis';
import { material } from '../src/lib/material';
import { chooseBotMove, BOTS, getBot } from '../src/engine/bots';
import { allBotVoiceLines, botReaction, botSays } from '../src/engine/botTalk';
import { coachOnOpponentMove, coachOnOpponentReviewMove, coachOnPlayerMove, findThreat } from '../src/engine/coach';
import { COACHES, DETAILS, DETAIL_VARIANTS, allCoachVoiceLines, detail, fixedLine, line, nextIndex, praiseLine, reviewLine, setRoastMode } from '../src/engine/coaches';
import { OPENINGS, bookDepth, openingFamilies, openingName, searchOpenings } from '../src/engine/openings';
import { explainMove } from '../src/engine/explainMove';
import { clampRating, ratingDelta, stakes } from '../src/lib/elo';
import { verdict } from '../src/lib/verdict';
import { explainError } from '../src/engine/explainError';
import { gameAccuracy } from '../src/engine/analysis';
import { AVATAR_PARTS, avatarSvg, randomAvatar } from '../src/lib/avatar';
import { PUZZLE_THEMES, RUSH_VARIANTS, offlinePuzzle, rushPuzzle } from '../src/lib/puzzles';
import { OPENING_GUIDES } from '../src/data/openingGuides';
import { lessonForGuide, lessonForLine, lessonForTrap, familySide } from '../src/lib/lessons';
import { diffPositions, soundFor } from '../src/components/boardDiff';
import { canStillMate, formatClock, newClock, parseTimeControl, pressClock, remaining, switchClock } from '../src/lib/clock';
import type { AnalyzeOptions } from '../src/engine/EngineProvider';

const require = createRequire(import.meta.url);
// The same WebAssembly build the app ships (src/engine/stockfishSource.ts).
const STOCKFISH = require('stockfish/src/stockfish.js');
const sf = STOCKFISH();
let handler: ((l: string) => void) | null = null;
sf.onmessage = (l: string) => handler?.(l);
const send = (c: string) => sf.postMessage(c, true);

// Serial queue that mirrors EngineProvider's behaviour.
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
      const restrict = o.searchmoves?.length ? ` searchmoves ${o.searchmoves.join(' ')}` : '';
      send((o.movetime ? `go movetime ${o.movetime}${o.depth ? ` depth ${o.depth}` : ''}` : `go depth ${o.depth ?? 12}`) + restrict);
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

(async () => {
  send('uci');
  send('setoption name Contempt value 0');
  send('setoption name Analysis Contempt value Off');

  // 1. Parser: black to move, score is converted to White POV.
  const pi = parseInfo('info depth 10 seldepth 12 multipv 1 score cp 50 nodes 1 pv e7e5 g1f3', false);
  check('parseInfo flips score for Black to move', pi?.score.cp === -50 && pi?.pv.length === 2);
  const pm = parseInfo('info depth 5 multipv 1 score mate -2 nodes 1 pv a2a3', true);
  check('parseInfo handles mate scores', pm?.score.mate === -2 && pm.score.cp < -9000);

  // 2. Engine finds mate in one (Scholar's mate pattern).
  const mateFen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3';
  const e = await evaluatePosition(analyze, 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', { depth: 10 });
  check('engine finds Qxf7#', e.best === 'h5f7' && e.score.mate === 1, `best=${e.best} mate=${e.score.mate}`);

  // 3. Classification: hanging the queen is a blunder; coach explains it.
  const before = await evaluatePosition(analyze, mateFen, { depth: 10 });
  const c = new Chess(mateFen);
  const mv = c.move('Qf3-a3'.replace('Qf3-a3', 'Qa3'));
  const after = await evaluatePosition(analyze, c.fen(), { depth: 10 });
  const cls = classifyMove(before, after, mv.from + mv.to, 'w', false);
  check('missing mate-in-1 is classified as a mistake or blunder', ['mistake', 'blunder'].includes(cls.classification), cls.classification);
  const fb = coachOnPlayerMove({ ...cls, before, after, playedSan: mv.san, mover: 'w' });
  check('coach mentions the missed mate', /checkmate/i.test(fb.text) && fb.suggestRetry && fb.chips.some((c) => c.includes('Qxf7#')), `${fb.text} | ${fb.chips.join(', ')}`);
  // "Accurate info from coach": the WHY? explanation names the missed mate and the better move.
  const ex = explainError({ classification: cls.classification, before, after, uci: mv.from + mv.to, mover: 'w' });
  check('explain: missed mate-in-1 is explained with the mating move', !!ex && /missed a checkmate/i.test(ex.title) && /Qxf7#/.test(ex.why + ex.better), ex ? `${ex.title} | ${ex.why} | ${ex.better}` : 'none');
  const exThem = explainError({ classification: cls.classification, before, after, uci: mv.from + mv.to, mover: 'w', perspective: 'them' });
  check('explain: opponent mistakes are told from your side', !!exThem && /^They/.test(exThem.title), exThem?.title);
  // Coach games judge a move with one search (judgeMove); it must agree with the two-search way.
  {
    const live = await judgeMove(analyze, before, mv.from + mv.to, c.fen(), { depth: 10 });
    const liveCls = classifyMove(before, live.after, mv.from + mv.to, 'w', false, live.cmp);
    check('one-search judging: missed mate still a mistake/blunder, reply found', ['mistake', 'blunder'].includes(liveCls.classification) && !!live.after.best, `${liveCls.classification} reply=${live.after.best}`);
    const top = await judgeMove(analyze, e, 'h5f7', new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4').move('Qxf7#') && 'r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4', { depth: 10 });
    check('one-search judging: Qxf7# is best', classifyMove(e, top.after, 'h5f7', 'w', false, top.cmp).classification === 'best');
  }
  check('explain: good moves get no WHY? panel', explainError({ classification: 'best', before, after, uci: mv.from + mv.to, mover: 'w' }) === null);
  // Every sentence the coach shows must have a recording, and the recordings must add up to the text.
  for (const coach of COACHES) {
    const recorded = new Map(allCoachVoiceLines().map((l) => [l.key, l.text]));
    const f = coachOnPlayerMove({ ...cls, before, after, playedSan: mv.san, mover: 'w', coach });
    const spoken = f.voice.map((k) => recorded.get(k));
    check(`voice: ${coach.id} says the whole line`, spoken.every(Boolean) && spoken.join(' ') === f.text, `${f.voice.join(',')} → "${f.text}"`);
  }

  // 4. Threat detection.
  const t = findThreat('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
  check('findThreat on a position already in check returns null', t === null);
  const t2 = findThreat('rnbqkbnr/ppp2ppp/8/3pp3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 3');
  check('findThreat runs on a quiet position', t2 === null || typeof t2 === 'object', JSON.stringify(t2));
  const t3 = findThreat('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3');
  check('findThreat spots the f7 mate threat', t3?.kind === 'mate' && t3.san === 'Qxf7#', JSON.stringify(t3));

  // 4b. Every line the coach can show in a game has recordings that add up to the text.
  {
    const fs = await import('node:fs');
    const clipKeys = new Set([...fs.readFileSync(new URL('../src/assets/voiceClips.ts', import.meta.url), 'utf8').matchAll(/^  "([^"]+)":/gm)].map((m) => m[1]));
    const recorded = new Map([...allCoachVoiceLines(), ...allBotVoiceLines(BOTS)].map((l) => [l.key, l.text]));
    const bad: string[] = [];
    const verify = (where: string, sp: { text: string; voice?: string[] }) => {
      const v = sp.voice ?? [];
      if (!v.length || v.some((k) => !clipKeys.has(k)) || v.map((k) => recorded.get(k)).join(' ') !== sp.text) bad.push(`${where}: ${v.join(',')} → "${sp.text}"`);
    };
    const games = [
      'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7 Kxf7 Qf3+ Ke6 Nc3 Ncb4 a3 Nxc2+ Kd1 Nxa1',
      'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5',
      'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7 g4 b5',
      'f3 e5 g4 Qh4#',
    ];
    for (const coach of COACHES) {
      for (const cat of ['hello', 'win', 'lose', 'draw'] as const) for (let i = 0; i < 6; i++) verify(`${coach.id} ${cat}`, line(coach, cat));
      for (const cat of ['retry', 'hint', 'pitch'] as const) verify(`${coach.id} ${cat}`, fixedLine(coach, cat));
      for (const cat of ['great', 'good', 'ok', 'bad', 'terrible', 'start'] as const) verify(`${coach.id} review.${cat}`, reviewLine(coach, cat));
      verify(`${coach.id} review.overview`, detail(coach, 'review.overview'));
      for (const g of games) {
        const c = new Chess();
        for (const san of g.split(' ')) {
          const m = c.move(san);
          const op = openingName(c.history())?.name ?? null;
          for (let i = 0; i < 3; i++) verify(`${coach.id} after ${m.san}`, coachOnOpponentMove(c.fen(), m.san, op, coach));
        }
      }
    }
    // Game Review, opponent's moves: every classification, with the real evaluations from above.
    for (const coach of COACHES) {
      for (const classification of ['blunder', 'mistake', 'inaccuracy', 'good', 'excellent', 'best', 'great', 'book'] as const) {
        verify(`${coach.id} opp ${classification}`, coachOnOpponentReviewMove({ classification, before, after, playedSan: 'Qa3', mover: 'w', coach }));
        verify(`${coach.id} opp ${classification} capture`, coachOnOpponentReviewMove({ classification, before, after, playedSan: 'Qxa3', mover: 'w', coach }));
      }
    }
    const opp = coachOnOpponentReviewMove({ classification: 'blunder', before, after, playedSan: 'Qa3', mover: 'w', coach: COACHES[0] });
    const missedMate = [DETAILS['opp.hadMate'], ...(DETAIL_VARIANTS['opp.hadMate'] ?? [])];
    check('review: an opponent blunder is described from your side', COACHES[0].lines.opp.blunder.some((l) => opp.text.startsWith(l)) && missedMate.some((d) => opp.text.endsWith(d)) && !/\byou had\b/i.test(opp.text), opp.text);
    // Roast mode: never when off; fully recorded when on.
    let leaked = 0;
    for (const coach of COACHES) for (let i = 0; i < 30; i++) if ((line(coach, 'blunder').voice ?? []).some((k) => k.includes('-roast.'))) leaked++;
    check('roast: no roast lines while roast mode is off', leaked === 0, `${leaked} leaked`);
    setRoastMode(true);
    let roasted = 0;
    for (const coach of COACHES) {
      for (let i = 0; i < 12; i++) {
        for (const cat of ['hello', 'inaccuracy', 'mistake', 'blunder', 'win', 'lose', 'draw', 'idle', 'opening', 'threat', 'check'] as const) {
          const sp = line(coach, cat);
          if ((sp.voice ?? []).some((k) => k.includes('-roast.'))) roasted++;
          verify(`${coach.id} roast ${cat}`, sp);
        }
        verify(`${coach.id} roast praise`, praiseLine(coach, 'good'));
        verify(`${coach.id} roast book`, praiseLine(coach, 'book'));
        for (const cat of ['retry', 'hint'] as const) verify(`${coach.id} roast ${cat}`, fixedLine(coach, cat));
        for (const id of ['hang.n', 'wins.q', 'attacked.r', 'reply.strong', 'hadMate', 'better', 'threatMate', 'goodCapture']) verify(`${coach.id} roast detail ${id}`, detail(coach, id));
        // A whole in-game comment (opener + detail) in roast mode is fully recorded too.
        verify(`${coach.id} roast feedback`, coachOnPlayerMove({ ...cls, before, after, playedSan: mv.san, mover: 'w', coach }));
        for (const cat of ['ok', 'bad', 'terrible'] as const) verify(`${coach.id} roast review.${cat}`, reviewLine(coach, cat));
      }
    }
    setRoastMode(false);
    check('roast: roast mode uses the roast lines', roasted > 300, `${roasted} roast picks`);
    // Bots: every line (greetings, endings, Whiskas's in-game musings) is recorded word for word.
    for (const b of BOTS) {
      for (const kind of ['greeting', 'win', 'lose', 'draw', 'move', 'capture', 'check', 'hurt'] as const) {
        for (let i = 0; i < 25; i++) {
          const s = botSays(b, kind);
          if (s) verify(`bot ${b.id} ${kind}`, { text: s.text, voice: [s.voice] });
        }
      }
    }
    const whiskas = getBot('biscuit');
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(botSays(whiskas, 'move')!.text);
    check('whiskas: muses with many different lines', seen.size >= 15, `${seen.size} different`);
    const quiet = new Chess();
    const e4 = quiet.move('e4');
    check('bots without talk stay quiet during the game', botReaction(getBot('pip'), e4, undefined, 10) === null);
    let talked = 0;
    for (let i = 0; i < 200; i++) if (botReaction(whiskas, e4, undefined, 5)) talked++;
    check('whiskas: talks now and then, not every move', talked > 30 && talked < 120 && botReaction(whiskas, e4, undefined, 1) === null, `${talked}/200`);
    check('voice: every in-game coach line is fully recorded', bad.length === 0, bad.slice(0, 3).join(' || '));
  }

  // 4c. No-repeat picker: every line once per round, never the same line twice in a row.
  {
    const seq = Array.from({ length: 10 * 50 }, () => nextIndex('test:bag', 10));
    let rounds = true;
    for (let r = 0; r < 50; r++) if (new Set(seq.slice(r * 10, r * 10 + 10)).size !== 10) rounds = false;
    const backToBack = seq.some((x, i) => i > 0 && x === seq[i - 1]);
    check('lines: all lines used before any repeats', rounds);
    check('lines: never the same line twice in a row', !backToBack);
  }

  // 5. Openings.
  check('opening name: Italian Game', openingName(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'])?.name === 'Italian Game');
  check('book depth stops when leaving theory', bookDepth(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Kd6']) === 5);
  check('opening database has 3,000+ named lines', OPENINGS.length > 3000, String(OPENINGS.length));
  check('opening name: Najdorf', openingName('e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'.split(' '))?.name === 'Sicilian Defense: Najdorf Variation');
  check('opening name follows transpositions', openingName('d4 e6 c4 d5'.split(' '))?.name.startsWith("Queen's Gambit Declined") ?? false, openingName('d4 e6 c4 d5'.split(' '))?.name);
  check('opening search finds the Caro-Kann', searchOpenings('caro kann').some((o) => o.family === 'Caro-Kann Defense'));
  check('opening search by ECO', searchOpenings('B90').every((o) => o.eco === 'B90') && searchOpenings('B90').length > 0);
  check('families: Sicilian is a Black opening, Italian a White one', familySide('Sicilian Defense') === 'b' && familySide('Italian Game') === 'w');
  check('explain: development + attack', explainMove(new Chess().fen(), 'e4') !== '' && /attacks the pawn on e5/i.test(explainMove('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'Nf3')));
  check('explain: pin', /pins the knight on c3 to the king/i.test(explainMove('rnbqkb1r/pppp1ppp/4pn2/8/2PP4/2N5/PP2PPPP/R1BQKBNR b KQkq - 2 3', 'Bb4')));
  check('explain: fork', /forks/i.test(explainMove('r1bqkb1r/ppp2ppp/2n5/3np1N1/2B5/8/PPPP1PPP/RNBQK2R w KQkq - 0 6', 'Nxf7')));
  check('explain: pawn break', /strikes at the centre with a pawn, challenging the pawn on e4/i.test(explainMove('rnbqkb1r/pppppppp/5n2/8/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 2 2', 'd5')));
  {
    // Your opponent's inaccuracy: the coach names THEIR better move and what it does — never "you".
    const fen = 'rnbqkb1r/pppppppp/5n2/8/4P3/2N5/PPPP1PPP/R1BQKBNR b KQkq - 2 2';
    const before = { fen, score: { cp: -30 }, best: 'd7d5', pv: ['d7d5'] };
    const afterFen = new Chess(fen);
    afterFen.move('a6');
    const after = { fen: afterFen.fen(), score: { cp: 60 }, best: 'e4e5', pv: ['e4e5'] };
    const fb = coachOnOpponentReviewMove({ classification: 'inaccuracy', before, after, playedSan: 'a6', mover: 'b', coach: COACHES[0] });
    check('review: their better move is named and explained', /Their better move was d5: it strikes at the centre/.test(fb.text) && !/\byou could\b/i.test(fb.text), fb.text);
  }
  let explained = 0;
  for (const o of OPENINGS) {
    const c = new Chess();
    for (const san of o.moves.split(' ')) {
      if (explainMove(c.fen(), san)) explained++;
      c.move(san);
    }
  }
  check('every move of every opening gets an explanation', explained === OPENINGS.reduce((n, o) => n + o.plies, 0));
  check('families group all lines', openingFamilies().reduce((n, f) => n + f.lines.length, 0) === OPENINGS.length);

  // 5b. Opening guides and lessons.
  for (const g of OPENING_GUIDES) {
    const l = lessonForGuide(g.id);
    if (!l || l.notes.length !== l.moves.length || l.notes.some((n) => !n)) check(`lesson ${g.id} has a note per move`, false);
    g.traps?.forEach((_, i) => {
      if (!lessonForTrap(g.id, i)) check(`trap ${g.id}#${i} loads`, false);
    });
  }
  check(`all ${OPENING_GUIDES.length} guides load as lessons`, OPENING_GUIDES.every((g) => lessonForGuide(g.id)));
  const najdorf = lessonForLine(OPENINGS.findIndex((o) => o.name === 'Sicilian Defense: Najdorf Variation'));
  const knights = lessonForLine(OPENINGS.findIndex((o) => o.name === 'Indian Defense: Knights Variation'));
  check('catch-all families don\'t borrow an unrelated guide', !!knights && !knights.guide, knights?.guide?.id);
  check('Budapest guide is titled by its variation', lessonForGuide('budapest-gambit')?.title.startsWith('Budapest') ?? false, lessonForGuide('budapest-gambit')?.title);
  check('a database line becomes a lesson for Black', najdorf?.side === 'b' && najdorf.notes.every(Boolean));

  // 5a. Avatars: every option draws, without the metadata block react-native-svg can't use.
  {
    const base = randomAvatar();
    let bad = 0;
    for (const p of AVATAR_PARTS) for (const o of [...p.options, ...(p.optional ? [null] : [])]) {
      const svg = avatarSvg({ ...base, [p.key]: o });
      if (!svg.startsWith('<svg') || svg.includes('<metadata')) bad++;
    }
    check('avatar: every part option renders', bad === 0, `${bad} bad`);
    check('avatar: glasses/beard can be removed', !avatarSvg({ ...base, glasses: null, beard: null }).includes('undefined'));
  }

  // 5a2. Honest verdicts: blunders and losses count, not just accuracy.
  {
    type Cls = 'best' | 'excellent' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder' | 'great';
    const ACC: Record<Cls, number> = { best: 100, great: 100, book: 100, excellent: 97, good: 92, inaccuracy: 75, mistake: 45, blunder: 8 };
    const game = (mine: Cls[], result: string) => {
      const moves = mine.flatMap((c) => [{ color: 'w' as const, accuracy: ACC[c], classification: c }, { color: 'b' as const, accuracy: 95, classification: 'excellent' as Cls }]);
      const counts = { w: Object.fromEntries(Object.keys(ACC).map((k) => [k, mine.filter((x) => x === k).length])), b: {} } as any;
      return verdict({ accuracy: gameAccuracy(moves), counts, moves } as any, { playerColor: 'w', result } as any);
    };
    const rep = (c: Cls, n: number) => Array(n).fill(c) as Cls[];
    check('verdict: a clean win is great', game([...rep('book', 4), ...rep('best', 12), ...rep('excellent', 9)], '1-0') === 'great');
    check('verdict: one blunder in a won game is not "great"', game([...rep('book', 4), ...rep('best', 10), ...rep('excellent', 10), 'blunder'], '1-0') !== 'great');
    const awful = game([...rep('book', 3), ...rep('good', 8), ...rep('blunder', 4), ...rep('mistake', 4), ...rep('inaccuracy', 4)], '0-1');
    check('verdict: four blunders and a loss is "terrible"', awful === 'terrible', awful);
    const avg = gameAccuracy([...rep('excellent', 24).map(() => ({ color: 'w' as const, accuracy: 97 })), { color: 'w', accuracy: 8 }]).w;
    // (No harmonic mean any more — it sank games far below chess.com — but a blunder still shows.)
    check('accuracy: one blunder clearly lowers a 25-move game (97 → below 94)', avg < 94, avg.toFixed(1));
  }

  // 5b2. Elo.
  check('elo: even game, win +20 / draw 0 / loss −20 while provisional', JSON.stringify(stakes(1200, 1200, 0)) === '{"win":20,"draw":0,"loss":-20}', JSON.stringify(stakes(1200, 1200, 0)));
  check('elo: smaller steps after 20 games', ratingDelta(1200, 1200, 1, 25) === 10);
  check('elo: beating a much stronger bot pays more', ratingDelta(800, 2000, 1, 0) > 35 && ratingDelta(2000, 800, 1, 0) <= 1);
  check('elo: losing to a much weaker bot costs more', ratingDelta(2000, 800, 0, 0) < -35);
  check('elo: rating stays within 100–3200', clampRating(40) === 100 && 100 + ratingDelta(100, 2700, 0, 0) >= 100);

  // 5c. Puzzle pack.
  let badPuzzles = 0;
  const seenIds = new Set<string>();
  for (let rating = 400; rating <= 2900; rating += 25) {
    const p = offlinePuzzle(rating, []);
    if (seenIds.has(p.id)) continue;
    seenIds.add(p.id);
    const c = new Chess(p.fen);
    try {
      for (const u of p.solution) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    } catch {
      badPuzzles++;
    }
  }
  check('bundled puzzles have legal solutions', badPuzzles === 0, `${badPuzzles} bad of ${seenIds.size}`);
  check('every puzzle theme has bundled puzzles', PUZZLE_THEMES.every((t) => offlinePuzzle(1500, [], t.id).themes.includes(t.id)));
  const rush: number[] = [];
  const used: string[] = [];
  for (let i = 0; i < 40; i++) {
    const p = rushPuzzle(i, used);
    used.push(p.id);
    rush.push(p.rating);
  }
  check('puzzle rush gets harder and never repeats', rush[39] > rush[0] + 1000 && new Set(used).size === used.length, `${rush[0]} → ${rush[39]}`);
  check('rush variants: 3 min, 5 min, survival', RUSH_VARIANTS.map((v) => v.seconds).join() === '180,300,0');

  // 6. Every bot returns a legal move.
  const pos = new Chess();
  pos.move('e4');
  for (const b of BOTS) {
    const uci = await chooseBotMove(analyze, pos.fen(), { ...b, movetime: b.movetime ? 300 : undefined, depth: Math.min(b.depth, 10) }, 't');
    let legal = false;
    try {
      new Chess(pos.fen()).move({ from: uci!.slice(0, 2), to: uci!.slice(2, 4), promotion: uci![4] });
      legal = true;
    } catch {}
    check(`bot ${b.name} plays a legal move`, legal, String(uci));
  }

  // 6b. Move-animation diffing.
  const play = (fen: string, ...sans: string[]) => { const g = new Chess(fen); sans.forEach((x) => g.move(x)); return g.fen(); };
  const startFen = new Chess().fen();
  const d1 = diffPositions(startFen, play(startFen, 'e4'));
  check('anim: simple move slides one piece', d1?.movers.length === 1 && d1.movers[0].from === 'e2' && d1.movers[0].to === 'e4', JSON.stringify(d1));
  const preCastle = play(startFen, 'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5');
  const d2 = diffPositions(preCastle, play(preCastle, 'O-O'));
  check('anim: castling slides king and rook', d2?.movers.length === 2 && d2.movers.some((m) => m.from === 'e1' && m.to === 'g1') && d2.movers.some((m) => m.from === 'h1' && m.to === 'f1'), JSON.stringify(d2?.movers));
  const preCap = play(startFen, 'e4', 'd5');
  const d3 = diffPositions(preCap, play(preCap, 'exd5'));
  check('anim: capture slides attacker, fades victim', d3?.movers[0]?.from === 'e4' && d3.movers[0].to === 'd5' && d3.ghosts.length === 1 && d3.ghosts[0].sq === 'd5', JSON.stringify(d3));
  const preEp = play(startFen, 'e4', 'a6', 'e5', 'd5');
  const d4 = diffPositions(preEp, play(preEp, 'exd6'));
  check('anim: en passant fades the captured pawn', d4?.movers[0]?.from === 'e5' && d4.ghosts.length === 1 && d4.ghosts[0].sq === 'd5', JSON.stringify(d4));
  const prePromo = '8/P6k/8/8/8/8/8/K7 w - - 0 1';
  const d5 = diffPositions(prePromo, play(prePromo, 'a8=Q'));
  check('anim: promotion slides pawn square to queen', d5?.movers[0]?.from === 'a7' && d5.movers[0].to === 'a8' && d5.movers[0].code === 'wq', JSON.stringify(d5));
  const d6 = diffPositions(play(preCap, 'exd5'), preCap);
  check('anim: takeback slides back and restores', d6?.movers[0]?.from === 'd5' && d6.movers[0].to === 'e4', JSON.stringify(d6));

  // 6b2. Move sounds.
  const snd = (before: string, ...sans: string[]) => { const g = new Chess(before); sans.forEach((x) => g.move(x)); return soundFor(diffPositions(before, g.fen())!, g.inCheck(), 'w'); };
  check('sound: own move', snd(startFen, 'e4') === 'move');
  check('sound: opponent move', snd(play(startFen, 'e4'), 'e5') === 'moveOpp');
  check('sound: capture', snd(preCap, 'exd5') === 'capture');
  check('sound: castle', snd(preCastle, 'O-O') === 'castle');
  check('sound: promotion', snd(prePromo, 'a8=Q') === 'promote');
  check('sound: check', snd('4k3/8/8/8/8/8/8/4K2R w - - 0 1', 'Rh8+') === 'check');

  // 6c. Chess clock.
  const tcp = parseTimeControl('600+0')!;
  check('clock: 10 min parses', tcp.baseMs === 600_000 && tcp.incMs === 0);
  check('clock: untimed parses to null', parseTimeControl('none') === null);
  check('clock: URL-safe and URL-mangled ids parse', parseTimeControl('600_0')?.baseMs === 600_000 && parseTimeControl('180 2')?.incMs === 2_000);
  let ck = newClock(tcp.baseMs, tcp.incMs);
  check('clock: nothing runs before the first move', remaining(ck, 'w', 99_999) === 600_000 && ck.turn === null);
  ck = pressClock(ck, 'w', 'b', 1_000); // White's first move is free
  check('clock: first move costs no time', ck.w === 600_000 && ck.turn === 'b');
  check("clock: Black's time runs", remaining(ck, 'b', 6_000) === 595_000 && remaining(ck, 'w', 6_000) === 600_000);
  ck = pressClock(ck, 'b', 'w', 6_000);
  check('clock: Black charged 5s, White now running', ck.b === 595_000 && ck.turn === 'w');
  ck = pressClock(ck, 'w', 'b', 16_000);
  check('clock: White charged 10s', ck.w === 590_000);
  let inc = pressClock(pressClock(newClock(180_000, 2_000), 'w', 'b', 0), 'b', 'w', 4_000);
  check('clock: increment added after moving', inc.b === 178_000, String(inc.b));
  inc = switchClock(inc, 'b', 10_000); // takeback: White's 6s still counts, Black's clock restarts
  check('clock: takeback switches clock and keeps used time', inc.w === 174_000 && inc.turn === 'b', `${inc.w} ${inc.turn}`);
  check('clock: flag at zero', remaining(ck, 'b', 16_000 + 600_000) === 0);
  check('clock: lone king cannot mate', !canStillMate('8/8/8/4k3/8/8/8/K6Q w - - 0 1', 'b'));
  check('clock: king + knight cannot mate', !canStillMate('8/8/8/4k3/8/8/8/K5nQ w - - 0 1', 'b'));
  check('clock: queen can mate', canStillMate('8/8/8/4k3/8/8/8/K6Q w - - 0 1', 'w'));
  check('clock: formats 10:00 / 4:07 / 0:09.4', formatClock(600_000) === '10:00' && formatClock(246_100) === '4:07' && formatClock(9_450) === '0:09.4', `${formatClock(600_000)} ${formatClock(246_100)} ${formatClock(9_450)}`);

  // 7. Full game review of a short miniature.
  const moves = ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'];
  const t0 = Date.now();
  const r = await reviewGame(analyze, new Chess().fen(), moves, () => {}, bookDepth(moves), 'review');
  const nf6 = r.moves[5];
  check('review covers every move', r.moves.length === moves.length);
  const early = r.moves.slice(0, 4).filter((m) => ['mistake', 'blunder'].includes(m.classification));
  check('normal opening moves are never mistakes or blunders', early.length === 0, r.moves.slice(0, 5).map((m) => `${m.san}:${m.classification}`).join(' '));
  check('…Nf6?? is a blunder', nf6.classification === 'blunder', `${nf6.classification}, best=${nf6.bestSan}`);
  check('Qxf7# is best', r.moves[6].classification === 'best', r.moves[6].classification);
  check('White accuracy > Black accuracy', r.accuracy.w > r.accuracy.b, `${r.accuracy.w.toFixed(1)} vs ${r.accuracy.b.toFixed(1)}`);
  console.log(`      review took ${Date.now() - t0} ms for ${moves.length + 1} positions`);

  // 8. Morphy's Opera Game: the classic queen sacrifice must come out Brilliant, the forced
  //    reply Forced, and Morphy clearly more accurate (depth 12 used to get this backwards).
  const opera = 'e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#'.split(' ');
  const t1 = Date.now();
  const ro = await reviewGame(analyze, new Chess().fen(), opera, () => {}, bookDepth(opera), 'review');
  const clsOf = (san: string) => ro.moves.find((m) => m.san === san)?.classification;
  check('Opera Game: Qb8+ is brilliant', clsOf('Qb8+') === 'brilliant', clsOf('Qb8+'));
  check('Opera Game: Nxb8 is forced', clsOf('Nxb8') === 'forced', clsOf('Nxb8'));
  check('Opera Game: Rd8# is best', clsOf('Rd8#') === 'best', clsOf('Rd8#'));
  check('Opera Game: no brilliant/great for Black, no blunder for White', !ro.moves.some((m) => (m.color === 'b' && ['brilliant', 'great'].includes(m.classification)) || (m.color === 'w' && m.classification === 'blunder')));
  check('Opera Game: Morphy more accurate', ro.accuracy.w > ro.accuracy.b, `${ro.accuracy.w.toFixed(1)} vs ${ro.accuracy.b.toFixed(1)}`);
  check('sacrifice detector: queen trade is not a sacrifice, an undefended knight next to the king is', !isSacrifice('3qk3/8/8/8/8/8/3Q4/4K3 w - - 0 1', 'd2d8') && isSacrifice('4k3/p7/8/6N1/8/8/P7/4K3 w - - 0 1', 'g5f7'));
  console.log(`      Opera Game review took ${Date.now() - t1} ms`);

  // Split between two engines (in the app each runs on its own core; here they share one): the
  // stretches join up into the same full review.
  const steps: { ply: number; background?: boolean }[] = [];
  const r2 = await reviewGame(analyze, new Chess().fen(), opera, (_d, _t, st) => st && st.phase === 2 && steps.push(st), bookDepth(opera), 'review', 2);
  const cls2 = (san: string) => r2.moves.find((m) => m.san === san)?.classification;
  check('two engines: every move reviewed once', r2.moves.length === opera.length && new Set(steps.map((x) => x.ply)).size === opera.length, `${steps.length} steps`);
  check('two engines: Qb8+ brilliant, Nxb8 forced, Rd8# best', cls2('Qb8+') === 'brilliant' && cls2('Nxb8') === 'forced' && cls2('Rd8#') === 'best', `${cls2('Qb8+')} ${cls2('Nxb8')} ${cls2('Rd8#')}`);
  check('two engines: the later stretch runs in the background', steps.some((x) => x.background) && steps.some((x) => !x.background));
  check('two engines: eval graph covers every position', r2.evals.length === opera.length + 1);
  if (process.env.SHOW) console.log(ro.moves.map((m) => `${m.san}:${m.classification}:${m.loss.toFixed(1)}`).join(' '));

  // 9. Captured pieces / material balance.
  {
    const m0 = material(new Chess().fen());
    check('material: nothing taken at the start', !m0.taken.w.length && !m0.taken.b.length && !m0.lead.w && !m0.lead.b);
    const g = new Chess();
    for (const mv of ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qxg2', 'Bxg2']) g.move(mv);
    const m1 = material(g.fen());
    check('material: White took a pawn and the queen, Black two pawns, White +8', m1.taken.w.join('') === 'pq' && m1.taken.b.join('') === 'pp' && m1.lead.w === 8 && m1.lead.b === 0, JSON.stringify(m1));
    // White's h-pawn became a second queen: nothing of White's was captured.
    const promo = material('rnbqkbnr/pppppppp/8/8/8/7Q/PPPPPPP1/RNBQKBNR w KQkq - 0 1');
    check('material: a promoted pawn is not shown as captured', promo.taken.b.length === 0 && promo.lead.w === 8, JSON.stringify(promo));
  }

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
