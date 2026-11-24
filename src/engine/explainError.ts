import { Chess, type Color, type PieceSymbol } from 'chess.js';
import type { Classification, PositionEval } from './analysis';
import { formatScore, pvToSan, uciToMove } from './analysis';
import { dePiece, dePronoun, explainMoveBoth, type MoveExplanation } from './explainMove';
import { lang, t } from '../lib/i18n';

/**
 * "Accurate info from coach": a concrete explanation of an inaccuracy, mistake or blunder —
 * what happened, why it's bad, what was better, and a tip for next time.
 * Built from the engine's evaluation (best move, best reply, scores) and the position itself.
 */
export type Explanation = {
  /** Short headline, e.g. "You left a piece hanging". */
  title: string;
  what: string;
  why: string;
  better: string;
  tip: string;
  /** Evaluation before → after, from the mover's side, e.g. "+0.4 → −2.6". */
  swing: string;
};

const NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => (s.endsWith('.') || s.endsWith('!') ? s : s + '.');
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** German: "Nf3 entwickelt den Springer." (the move as the subject), or "Nf3: Kurze Rochade: …". */
const deSays = (san: string, x: MoveExplanation) => (x.deVp ? `${san} ${x.deVp}.` : x.de ? `${san}: ${x.de}` : `${san}.`);
/** German description as a sentence after a colon: "Der Zug entwickelt den Springer." or the plain sentences. */
const deDesc = (x: MoveExplanation) => (x.deVp ? `Der Zug ${x.deVp}.` : x.de);

/** Score from the mover's point of view, formatted like "+1.2" or "M3". */
function moverScore(score: PositionEval['score'], mover: Color): string {
  const s = mover === 'w' ? score : { cp: -score.cp, mate: score.mate !== undefined ? -score.mate : undefined };
  return formatScore(s);
}

function play(fen: string, uci: string | null | undefined) {
  if (!uci) return null;
  const c = new Chess(fen);
  try {
    const m = c.move(uciToMove(uci));
    return { move: m, after: c };
  } catch {
    return null;
  }
}

function phaseTip(fen: string, plyGuess: number): string {
  const c = new Chess(fen);
  const pieces = c.board().flat().filter((p) => p && p.type !== 'k' && p.type !== 'p').length;
  if (plyGuess < 20 && pieces >= 12) return t('In the opening: develop your knights and bishops, fight for the centre and castle early. Avoid moving the same piece twice without a reason.');
  if (pieces <= 6) return t('In the endgame: bring your king into play, push passed pawns, and trade pieces when you are ahead.');
  return t('Before every move, ask three questions: What does my opponent threaten? Which of my pieces are undefended? Is there a check, capture or threat for me?');
}

/**
 * Explain one bad move. `mover` played `uci` from `before.fen` and reached `after.fen`;
 * `perspective` is whose move it was in the player's eyes ('you' or 'them').
 */
export function explainError(args: {
  classification: Classification;
  before: PositionEval;
  after: PositionEval;
  uci: string;
  mover: Color;
  perspective?: 'you' | 'them';
}): Explanation | null {
  const { classification, before, after, uci, mover } = args;
  if (!['inaccuracy', 'mistake', 'miss', 'blunder'].includes(classification)) return null;
  const you = (args.perspective ?? 'you') === 'you';
  const played = play(before.fen, uci);
  if (!played) return null;
  const playedSan = played.move.san;
  const bestSan = before.best ? (pvToSan(before.fen, [before.best], 1)[0] ?? null) : null;
  const reply = play(after.fen, after.best);
  const replySan = reply?.move.san ?? null;
  const best = play(before.fen, before.best);
  const swing = `${moverScore(before.score, mover)} → ${moverScore(after.score, mover)}`;
  const opp = mover === 'w' ? 'b' : 'w';
  // Words that change with the point of view.
  const W = you ? { subj: 'You', them: 'your opponent', Them: 'Your opponent' } : { subj: 'They', them: 'you', Them: 'You' };
  // German: the text is built from whole German sentences (cases and verb forms differ).
  const de = lang() === 'de';
  /** German subject + verb for the mover ("du hast" / "dein Gegner hat") and for the other side. */
  const D = you
    ? { Subj: 'Du', hatte: 'hattest', hat: 'hast', verliert: 'verlierst', Opp: 'Dein Gegner', kann: 'kann', antwortet: 'antwortet' }
    : { Subj: 'Dein Gegner', hatte: 'hatte', hat: 'hat', verliert: 'verliert', Opp: 'Du', kann: 'kannst', antwortet: 'antwortest' };
  const explain = (fen: string, san: string) => explainMoveBoth(fen, san);

  const bestX = bestSan && best ? explain(before.fen, bestSan) : null;
  const bestLine = bestSan && best ? `${bestSan}: ${lower(bestX!.en)}` : '';
  const betterText = de
    ? bestSan
      ? sentence(`${you ? 'Besser war' : 'Besser wäre'} ${bestX?.de ? `${bestSan}${you ? '' : ' gewesen'}: ${deDesc(bestX)}` : `${bestSan}${you ? '' : ' gewesen'}`}`)
      : t('Look for a move that keeps your pieces protected and your king safe.')
    : bestSan ? sentence(`${you ? 'Better was' : 'They should have played'} ${bestLine || bestSan}`) : 'Look for a move that keeps your pieces protected and your king safe.';

  // 1. Missed a forced checkmate.
  const hadMate = before.score.mate !== undefined && before.score.mate !== 0 && (before.score.mate > 0) === (mover === 'w');
  if (hadMate && bestSan) {
    const n = Math.abs(before.score.mate!);
    if (de) {
      return {
        title: t(you ? 'You missed a checkmate' : 'They missed a checkmate'),
        what: `${D.Subj} ${D.hatte} ${n === 1 ? 'Matt in einem Zug' : `ein forciertes Matt in ${n}`}, ${you ? 'hast' : 'hat'} aber stattdessen ${playedSan} gespielt.`,
        why: n === 1 ? `${bestSan} ist sofort Matt.` : `${bestSan} leitet den Mattangriff ein – jede Antwort verliert.`,
        better: n === 1 ? `Spiel ${bestSan}.` : `Spiel ${bestSan} und gib weiter Schach.`,
        tip: t('Always look at every check first, then captures, then threats. Forcing moves are where checkmates hide.'),
        swing,
      };
    }
    return {
      title: you ? 'You missed a checkmate' : 'They missed a checkmate',
      what: sentence(`${W.subj} had ${n === 1 ? 'checkmate in one move' : `a forced checkmate in ${n}`}, but played ${playedSan} instead`),
      why: n === 1 ? sentence(`${bestSan} is checkmate right away`) : sentence(`${bestSan} starts the mating attack — every reply loses`),
      better: n === 1 ? sentence(`Play ${bestSan}`) : sentence(`Play ${bestSan} and keep checking`),
      tip: 'Always look at every check first, then captures, then threats. Forcing moves are where checkmates hide.',
      swing,
    };
  }

  // 2. Walked into a forced checkmate.
  const allowsMate = after.score.mate !== undefined && after.score.mate !== 0 && (after.score.mate > 0) !== (mover === 'w');
  if (allowsMate && replySan) {
    const n = Math.abs(after.score.mate!);
    if (de) {
      const rx = explain(after.fen, replySan);
      return {
        title: t(you ? 'This allows checkmate' : 'They allowed checkmate'),
        what: `Nach ${playedSan} ${D.kann} ${D.Opp === 'Du' ? 'du' : 'dein Gegner'} ein Matt in ${n} erzwingen.`,
        why: rx.de ? `Es beginnt mit ${replySan}: ${deDesc(rx)}` : `Es beginnt mit ${replySan}.`,
        better: betterText,
        tip: t('Before you move, check your king: which enemy pieces can reach it, and which squares around it are weak?'),
        swing,
      };
    }
    return {
      title: you ? 'This allows checkmate' : 'They allowed checkmate',
      what: sentence(`After ${playedSan}, ${W.them} can force checkmate in ${n}`),
      why: sentence(`It starts with ${replySan} — ${lower(explain(after.fen, replySan).en)}`),
      better: betterText,
      tip: 'Before you move, check your king: which enemy pieces can reach it, and which squares around it are weak?',
      swing,
    };
  }

  // 3. The best reply wins material.
  // (Only if it really wins material: a capture you can simply take back is just a trade.)
  const replyGain = (() => {
    if (!reply?.move.captured || reply.move.captured === 'k') return 0;
    const recapture = reply.after.isAttacked(reply.move.to as never, mover);
    return VALUE[reply.move.captured] - (recapture ? VALUE[reply.move.piece] : 0);
  })();
  if (reply?.move.captured && reply.move.captured !== 'k' && replyGain > 0) {
    const lost = reply.move.captured;
    const sq = reply.move.to;
    const movedPieceLost = sq === played.move.to;
    const defenders = new Chess(after.fen).attackers(sq as never, mover).length;
    const reason = movedPieceLost
      ? `${you ? 'you' : 'they'} moved it to a square where it can be taken${defenders ? ' and the trade loses material' : ' and nothing protects it'}`
      : defenders
        ? `the exchange that follows loses material`
        : `${playedSan} left it without a defender`;
    const replyX = explain(after.fen, replySan!);
    const replyDesc = replyX.en;
    const fork = /forks/i.test(replyDesc);
    if (de) {
      const it = dePronoun(lost, 'acc');
      const reasonDe = movedPieceLost
        ? `${you ? 'du hast' : 'dein Gegner hat'} ${it} auf ein Feld gezogen, auf dem ${dePronoun(lost)} geschlagen werden kann${defenders ? ', und der Abtausch kostet Material' : `, und nichts deckt ${it}`}`
        : defenders
          ? 'der folgende Abtausch kostet Material'
          : `${playedSan} hat ${it} ohne Deckung gelassen`;
      return {
        title: `${D.Subj} ${D.verliert} ${dePiece(VALUE[lost] >= 3 ? lost : 'p', 'acc', false)}`,
        what: `Nach ${playedSan} ${D.verliert} ${you ? 'du' : 'dein Gegner'} ${dePiece(lost)} auf ${sq}.`,
        why: `${D.Opp} ${D.kann} ${replySan} spielen: ${capFirst(reasonDe)}.${fork ? ` ${deSays(replySan!, replyX)}` : ''}`,
        better: betterText,
        tip: t(movedPieceLost
          ? 'Before moving a piece, check its new square: who attacks it there, and who defends it?'
          : 'When a piece moves, it stops guarding the squares it used to. Ask what each move leaves behind.'),
        swing,
      };
    }
    return {
      title: VALUE[lost] >= 3 ? `${you ? 'You lose' : 'They lose'} a ${NAME[lost]}` : `${you ? 'You lose' : 'They lose'} a pawn`,
      what: `After ${playedSan}, ${you ? 'you lose' : 'they lose'} the ${NAME[lost]} on ${sq}.`,
      why: sentence(`${W.Them} can play ${replySan}${fork ? ` — ${lower(replyDesc)}` : ''}: ${reason}`),
      better: betterText,
      tip: movedPieceLost
        ? 'Before moving a piece, check its new square: who attacks it there, and who defends it?'
        : 'When a piece moves, it stops guarding the squares it used to. Ask what each move leaves behind.',
      swing,
    };
  }

  // 4. The best reply is a tactic (fork, pin, strong attack) even if it captures nothing yet.
  if (replySan) {
    const descX = explain(after.fen, replySan);
    const desc = descX.en;
    const tactic = /forks|pins|attacks the (queen|rook)|gives check/i.test(desc);
    if (tactic && de) {
      return {
        title: t(/forks/i.test(desc) ? 'This allows a fork' : /pins/i.test(desc) ? 'This allows a pin' : 'This allows a strong attack'),
        what: `Nach ${playedSan} ${you ? 'hat dein Gegner' : 'hast du'} ${replySan}.`,
        why: `${deSays(replySan, descX)} ${you ? 'Du kannst' : 'Dein Gegner kann'} nicht alles auf einmal abwehren.`,
        better: betterText,
        tip: t(/forks/i.test(desc)
          ? 'Watch for squares where an enemy knight or pawn could attack two of your pieces at once.'
          : /pins/i.test(desc)
            ? 'Avoid lining up your king or queen behind another piece on an open line or diagonal.'
            : 'Keep your king and queen away from open lines that enemy pieces can use.'),
        swing,
      };
    }
    if (tactic) {
      return {
        title: /forks/i.test(desc) ? 'This allows a fork' : /pins/i.test(desc) ? 'This allows a pin' : 'This allows a strong attack',
        what: sentence(`After ${playedSan}, ${W.them} has ${replySan}`),
        why: sentence(`${replySan} — ${lower(desc)} ${you ? 'You' : 'They'} can't deal with everything at once`),
        better: betterText,
        tip: /forks/i.test(desc)
          ? 'Watch for squares where an enemy knight or pawn could attack two of your pieces at once.'
          : /pins/i.test(desc)
            ? 'Avoid lining up your king or queen behind another piece on an open line or diagonal.'
            : 'Keep your king and queen away from open lines that enemy pieces can use.',
        swing,
      };
    }
  }

  // 5. Missed a chance to win material.
  if (best?.move.captured && best.move.captured !== 'k' && !played.move.captured) {
    const sq = best.move.to;
    const free = new Chess(best.after.fen()).attackers(sq as never, opp).length === 0;
    if (de) {
      return {
        title: t(you ? 'You missed a free capture' : 'They missed a capture'),
        what: `${D.Subj} ${you ? 'hättest' : 'hätte'} ${dePiece(best.move.captured)} auf ${sq} gewinnen können.`,
        why: `${bestSan} schlägt ${dePronoun(best.move.captured, 'acc')}${free ? ' und kann nicht zurückgeschlagen werden' : ' und gewinnt beim Abtausch Material'}; ${playedSan} lässt die Chance verstreichen.`,
        better: betterText,
        tip: t('Every move, scan for captures: is any enemy piece undefended, or attacked more times than it is defended?'),
        swing,
      };
    }
    return {
      title: you ? 'You missed a free capture' : 'They missed a capture',
      what: sentence(`${W.subj} could have won the ${NAME[best.move.captured]} on ${sq}`),
      why: sentence(`${bestSan} takes it${free ? ' and it cannot be taken back' : ' and comes out ahead in the exchange'}; ${playedSan} lets the chance slip`),
      better: betterText,
      tip: 'Every move, scan for captures: is any enemy piece undefended, or attacked more times than it is defended?',
      swing,
    };
  }

  // 6. Positional: no tactic, just a worse move.
  if (de) {
    const playedX = explain(before.fen, playedSan);
    const rx = replySan ? explain(after.fen, replySan) : null;
    return {
      title: t(classification === 'inaccuracy' ? 'Not the most accurate move' : classification === 'miss' ? (you ? 'You missed a chance' : 'They missed a chance') : 'This gives the advantage away'),
      what: `${playedX.deVp ? `${playedSan} ${playedX.deVp}.` : playedX.de ? `${playedSan}: ${playedX.de}` : `${playedSan} ist spielbar.`} Aber das ist hier nicht der beste Plan.`,
      why: replySan && rx ? `${D.Opp} ${D.antwortet} gut mit ${replySan}${rx.de ? `: ${deDesc(rx)}` : '.'}` : t('It gives your opponent an easier game.'),
      better: betterText,
      tip: phaseTip(before.fen, new Chess(before.fen).moveNumber() * 2),
      swing,
    };
  }
  return {
    title: classification === 'inaccuracy' ? 'Not the most accurate move' : classification === 'miss' ? (you ? 'You missed a chance' : 'They missed a chance') : 'This gives the advantage away',
    what: sentence(`${playedSan} ${lower(explain(before.fen, playedSan).en || 'is playable')}`.replace(/\.$/, '')) + ` But it is not the best plan here.`,
    why: replySan ? sentence(`${W.Them} ${you ? 'answers' : 'answer'} well with ${replySan}: ${lower(explain(after.fen, replySan).en)}`.replace(/\.\s*$/, '')) : 'It gives your opponent an easier game.',
    better: betterText,
    tip: phaseTip(before.fen, new Chess(before.fen).moveNumber() * 2),
    swing,
  };
}
