import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, StyleSheet, View, ScrollView } from 'react-native';
import { Pressable } from '../components/Press';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Chess, type Move } from 'chess.js';
import { Board, type Arrow } from '../components/Board';
import { ArrowKeys, BoardFrame, Btn, Chips, EVAL_BAR_WIDTH, EvalBar, IconBtn, MoveList, MoveTable, PlayerTag, SIDE_PANEL, Slab, SpeechBubble, TAG_HEIGHT, Text, Toolbar, WideBoard, useWide } from '../components/ui';
import { playSound } from '../lib/sound';
import { useEngine, CancelledError, type Score } from '../engine/EngineProvider';
import { chooseBotMove, getBot, trueRating } from '../engine/bots';
import { material } from '../lib/material';
import { useMyName } from '../lib/myName';
import { classifyMove, evaluatePosition, isError, judgeMove, uciToMove, CLASS_META, LIVE_SEARCH, type PositionEval } from '../engine/analysis';
import { coachOnOpponentMove, coachOnPlayerMove, moodFor, type CoachFeedback } from '../engine/coach';
import { fixedLine, getCoach, line, type Spoken } from '../engine/coaches';
import { isWho, type Mood } from '../components/Portrait';
import { hush, isSpeaking, playVoice, setVoiceEnabled, waitForVoice } from '../lib/voice';
import { botReaction, botSays } from '../engine/botTalk';
import { bookDepth, openingName } from '../engine/openings';
import { newId, store, useSettings, useStored, type SavedGame } from '../lib/storage';
import { ratingDelta, signed } from '../lib/elo';
import { botGamesRated, useMyRating } from '../lib/rating';
import { canStillMate, newClock, parseTimeControl, pressClock, remaining, stopClock, switchClock, timeControlLabel, type Clock, type Side } from '../lib/clock';
import { B, C, P, themed } from '../lib/theme';
import { useMoveBrowser } from '../lib/moveBrowser';
import { explainError, type Explanation } from '../engine/explainError';
import { ExplainSheet, WhyButton } from '../components/ExplainSheet';
import { t, voiceText } from '../lib/i18n';

type Mode = 'bot' | 'coach' | 'local';
// `reason` stays English (it's saved with the game); it's translated where it's shown.
type Result = { result: SavedGame['result']; reason: string };

function gameOverResult(c: Chess): Result | null {
  if (c.isCheckmate()) return { result: c.turn() === 'w' ? '0-1' : '1-0', reason: 'Checkmate' };
  if (c.isStalemate()) return { result: '1/2-1/2', reason: 'Stalemate' };
  if (c.isInsufficientMaterial()) return { result: '1/2-1/2', reason: 'Insufficient material' };
  if (c.isThreefoldRepetition()) return { result: '1/2-1/2', reason: 'Repetition' };
  if (c.isDraw()) return { result: '1/2-1/2', reason: '50-move rule' };
  return null;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

type GameParams = { mode?: Mode; bot?: string; color?: 'w' | 'b' | 'r'; tc?: string; k?: string; coach?: string };

/**
 * The router reuses this screen when only its params change (e.g. Rematch, or a deep link while a game
 * is open). Keying on the params guarantees a brand-new game with fresh state and a fresh clock.
 */
export default function GameScreen() {
  const p = useLocalSearchParams<GameParams>();
  return <GameScreenInner key={[p.mode, p.bot, p.color, p.tc, p.k, p.coach].join('|')} />;
}

function GameScreenInner() {
  const params = useLocalSearchParams<GameParams>();
  const mode: Mode = params.mode ?? 'bot';
  const bot = getBot(params.bot);
  const engine = useEngine();
  const settings = useSettings();
  const coach = getCoach(params.coach ?? settings.coachId);
  const botWho = isWho(bot.id) ? bot.id : undefined;
  const insets = useSafeAreaInsets();

  const [playerColor] = useState<'w' | 'b'>(() =>
    params.color === 'b' ? 'b' : params.color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : 'w',
  );
  const [chess] = useState(() => new Chess());
  const [tag] = useState(() => 'game-' + newId());
  const gameId = useRef(newId());
  const alive = useRef(true);

  const [fen, setFen] = useState(chess.fen());
  const [moves, setMoves] = useState<string[]>([]);
  // ‹ › — look back at earlier positions while the game goes on.
  const browse = useMoveBrowser(moves);
  const wide = useWide();
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [orientation, setOrientation] = useState<'w' | 'b'>(playerColor);
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [greeting] = useState(() => botSays(bot, 'greeting'));
  const [botLine, setBotLine] = useState(greeting?.text ?? voiceText(`${bot.id}-greeting-0`, bot.greeting));
  /** Bot moves since the bot last said something (chatty bots only). */
  const sinceTalk = useRef(0);
  const [hello] = useState(() => line(coach, 'hello'));
  const [coachChips, setCoachChips] = useState<string[]>([]);
  const [botVoiceKey, setBotVoiceKey] = useState<string | undefined>(greeting?.voice);
  const [botMood, setBotMood] = useState<Mood>('happy');
  const [coachMood, setCoachMood] = useState<Mood>('happy');
  const [coachText, setCoachText] = useState(
    () => hello.text,
  );
  const [feedback, setFeedback] = useState<CoachFeedback | null>(null);
  /** Classification tag shown in the coach's bubble (with the line that explains it). */
  const [bubbleClass, setBubbleClass] = useState<CoachFeedback['classification'] | null>(null);
  // "Accurate info from coach": the explanation behind the WHY? button, and whether it's open.
  const [bubbleExplain, setBubbleExplain] = useState<Explanation | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [awaiting, setAwaiting] = useState(false); // waiting for Retry/Continue after a mistake
  const [evalScore, setEvalScore] = useState<Score | undefined>(undefined);
  const evalCache = useRef<PositionEval | null>(null);
  /** The engine's view right after your last move (before your opponent replied). */
  const lastAfter = useRef<PositionEval | null>(null);
  /** The coach's evaluation of the current position, while it's still being worked out. */
  const pendingEval = useRef<{ fen: string; p: Promise<PositionEval> } | null>(null);
  // The coach is explaining an error (with an arrow): the bot lets them finish before it moves.
  const explaining = useRef(false);
  const over = useRef(false);

  // Elo: games against bots are rated unless you use Undo or Hint.
  const [profile] = useStored(store.profile, { name: 'You', botWins: {} });
  const myName = useMyName();
  const [assisted, setAssisted] = useState(false);
  const assistedRef = useRef(false);
  const [ratingChange, setRatingChange] = useState<{ before: number; after: number } | null>(null);
  const myRating = useMyRating();
  const ratedGame = mode === 'bot' && profile.rating !== undefined && !myRating.lichess;

  // Chess clock (coach games are untimed — you're there to think and learn).
  const tc = mode === 'coach' ? null : parseTimeControl(params.tc);
  const [clock, setClock] = useState<Clock | null>(() => (tc ? newClock(tc.baseMs, tc.incMs) : null));
  const clockRef = useRef(clock);

  const sync = useCallback(() => {
    setFen(chess.fen());
    setMoves(chess.history());
    const h = chess.history({ verbose: true });
    const lm = h[h.length - 1];
    setLastMove(lm ? { from: lm.from, to: lm.to } : null);
  }, [chess]);

  /** The coach says a line; the bubble shows it when the voice starts, so text and speech always match. */
  const say = useCallback(
    (sp: Spoken, mood: Mood, opts?: { interrupt?: boolean; cls?: CoachFeedback['classification']; arrow?: string; explain?: Explanation | null }) => {
      if (mode !== 'coach') return;
      playVoice(sp.voice, {
        interrupt: opts?.interrupt,
        onStart: () => {
          if (!alive.current) return;
          setCoachText(sp.text);
          setCoachChips(sp.chips ?? []);
          setCoachMood(mood);
          setBubbleClass(opts?.cls ?? null);
          setBubbleExplain(opts?.explain ?? null);
          // "Look at the arrow": draw the better move as the coach says it.
          const a = opts?.arrow;
          if (a) setArrows([{ from: a.slice(0, 2), to: a.slice(2, 4) }]);
        },
      });
    },
    [mode],
  );

  const finish = useCallback(
    async (r: Result) => {
      over.current = true;
      setClock((c) => c && stopClock(c, Date.now()));
      setTimeout(() => playSound('end'), 260);
      setResult(r);
      setShowResult(true);
      const g: SavedGame = {
        id: gameId.current,
        date: Date.now(),
        mode,
        botId: mode === 'local' ? undefined : bot.id,
        playerColor,
        startFen: new Chess().fen(),
        moves: chess.history(),
        result: r.result,
        reason: r.reason,
      };
      // Rated: bot games, no Undo/Hint, and both sides have moved.
      if (mode === 'bot' && !assistedRef.current && g.moves.length >= 2 && botGamesRated()) {
        const p = await store.profile();
        if (p.rating !== undefined) {
          const score = r.result === '1/2-1/2' ? 0.5 : (r.result === '1-0') === (playerColor === 'w') ? 1 : 0;
          const before = p.rating;
          // Against the bot's true strength (Whiskas's "100" is a disguise).
          const after = before + ratingDelta(before, trueRating(bot), score, p.ratedGames ?? 0);
          g.rating = { before, after };
          setRatingChange(g.rating);
          await store.saveProfile({
            ...p,
            rating: after,
            ratedGames: (p.ratedGames ?? 0) + 1,
            ratingHistory: [...(p.ratingHistory ?? []), { date: Date.now(), rating: after }].slice(-200),
          });
        }
      }
      if (g.moves.length > 0) await store.saveGame(g);
      if (mode !== 'local') {
        const won = (r.result === '1-0' && playerColor === 'w') || (r.result === '0-1' && playerColor === 'b');
        const lost = (r.result === '1-0' && playerColor === 'b') || (r.result === '0-1' && playerColor === 'w');
        const end = botSays(bot, won ? 'lose' : lost ? 'win' : 'draw');
        if (end) {
          setBotLine(end.text);
          setBotVoiceKey(end.voice);
        }
        if (won) {
          const p = await store.profile();
          p.botWins[bot.id] = (p.botWins[bot.id] ?? 0) + 1;
          await store.saveProfile(p);
          setBotMood('sad');
          say(line(coach, 'win'), 'happy');
        } else if (lost) {
          setBotMood('happy');
          say(line(coach, 'lose'), 'sad');
        } else {
          setBotMood('neutral');
          say(line(coach, 'draw'), 'neutral');
        }
      }
    },
    [bot, chess, coach, mode, playerColor, say],
  );

  const applyMove = useCallback(
    (m: { from: string; to: string; promotion?: string }): Move | null => {
      let mv: Move;
      try {
        mv = chess.move(m);
      } catch {
        return null;
      }
      if (settings.haptics) Haptics.impactAsync(mv.captured ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      sync();
      const r = gameOverResult(chess);
      const t = Date.now();
      setClock((c) => c && pressClock(c, mv.color, r ? null : chess.turn(), t));
      if (r) finish(r);
      return mv;
    },
    [chess, finish, settings.haptics, sync],
  );

  const prefetchEval = useCallback(async () => {
    if (mode !== 'coach' || chess.isGameOver()) return;
    const f = chess.fen();
    try {
      const p = evaluatePosition(engine.analyze, f, { ...LIVE_SEARCH, tag });
      // If you move before this finishes, your move's verdict waits for it instead of starting over.
      pendingEval.current = { fen: f, p };
      const e = await p;
      if (alive.current && chess.fen() === f) {
        evalCache.current = e;
        setEvalScore(e.score);
      }
    } catch (e) {
      if (!(e instanceof CancelledError)) console.warn(e);
    }
  }, [chess, engine, mode, tag]);

  const botTurn = useCallback(async () => {
    if (chess.isGameOver() || mode === 'local') return;
    setThinking(true);
    const t0 = Date.now();
    const fenAtStart = chess.fen();
    try {
      // On the clock, the bot budgets its thinking time so it never loses on time.
      const c = clockRef.current;
      const timeLeft = c ? remaining(c, chess.turn() as Side, Date.now()) : undefined;
      const uci = await chooseBotMove(engine.analyze, fenAtStart, bot, tag, timeLeft);
      const elapsed = Date.now() - t0;
      // A short, human-looking pause — but not when its clock is running low.
      if (elapsed < 700 && (timeLeft === undefined || timeLeft > 30000)) await wait(700 - elapsed + Math.random() * 400);
      // In coach games the bot lets the coach finish explaining an error (SKIP cuts it short);
      // after a good move it waits only a moment, then plays while the coach keeps talking.
      if (mode === 'coach') await waitForVoice(explaining.current ? 12000 : 1500);
      // The position may have changed meanwhile (Undo / Retry): never play a stale move.
      if (!alive.current || over.current || !uci || chess.fen() !== fenAtStart) return;
      const mv = applyMove(uciToMove(uci));
      setArrows([]);
      // Chatty bots (Whiskas) comment on the game now and then.
      if (mv && mode === 'bot' && !chess.isGameOver()) {
        sinceTalk.current++;
        const kind = botReaction(bot, mv, chess.history({ verbose: true }).at(-2), sinceTalk.current);
        const s = kind && botSays(bot, kind);
        if (s) {
          sinceTalk.current = 0;
          setBotLine(s.text);
          setBotVoiceKey(s.voice);
          setBotMood(kind === 'capture' || kind === 'check' ? 'happy' : 'neutral');
        }
      }
      if (mv && mode === 'coach' && !chess.isGameOver()) {
        setFeedback(null);
        const comment = coachOnOpponentMove(chess.fen(), mv.san, openingName(chess.history())?.name ?? null, coach);
        // Still talking about your move: skip small talk, so the coach never lags behind the game.
        // Threats and checks are always said.
        const urgent = comment.kind === 'threat' || comment.kind === 'check';
        if (urgent || !isSpeaking()) say(comment, urgent ? 'surprised' : 'neutral');
        prefetchEval();
      }
    } catch (e) {
      if (!(e instanceof CancelledError)) console.warn(e);
    } finally {
      if (alive.current) setThinking(false);
    }
  }, [applyMove, bot, chess, coach, engine, mode, prefetchEval, say, tag]);

  // Start: bot moves first if the player is Black.
  useEffect(() => {
    alive.current = true;
    playSound('start');
    if (mode === 'coach') playVoice(hello.voice);
    // Kick off the engine once on mount (bot opens as White, or the coach pre-evaluates).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (mode !== 'local' && playerColor === 'b') botTurn();
    else prefetchEval();
    return () => {
      alive.current = false;
      engine.cancel(tag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onUserMove = useCallback(
    async (from: string, to: string, promotion?: string) => {
      if (result) return;
      if (mode !== 'local' && (chess.turn() !== playerColor || thinking || awaiting)) return;
      const fenBefore = chess.fen();
      setArrows([]);
      // Your move cuts the coach off: no point finishing a comment on a position that's gone.
      if (mode === 'coach') hush();
      const mv = applyMove({ from, to, promotion });
      if (!mv) return;
      if (mode === 'local') return;

      if (mode === 'coach') {
        // The move ended the game: the coach's win/draw line from finish() stays.
        if (over.current) return;
        // Show that the coach is thinking without replacing (or cutting off) what they're saying.
        setCoachChips(['THINKING…']);
        setFeedback(null);
        setThinking(true);
        try {
          const before =
            evalCache.current?.fen === fenBefore
              ? evalCache.current
              : pendingEval.current?.fen === fenBefore
                ? await pendingEval.current.p
                : await evaluatePosition(engine.analyze, fenBefore, { ...LIVE_SEARCH, tag });
          const history = chess.history();
          const isBook = bookDepth(history) >= history.length;
          const uci = mv.from + mv.to + (mv.promotion ?? '');
          // One search judges the move and finds your opponent's best reply. Opening-book moves
          // need no search at all.
          const { after, cmp } = isBook
            ? { after: { fen: chess.fen(), score: before.score, best: null, pv: [] } as PositionEval, cmp: undefined }
            : await judgeMove(engine.analyze, before, uci, chess.fen(), { ...LIVE_SEARCH, tag });
          if (!alive.current || over.current) return;
          setEvalScore(after.score);
          // For "Miss": the position before your opponent's last move (after your previous move).
          const verbose = chess.history({ verbose: true });
          const last = verbose.at(-2);
          const prev = lastAfter.current && last && lastAfter.current.fen === last.before ? lastAfter.current : undefined;
          lastAfter.current = after;
          const { classification, loss } = classifyMove(before, after, uci, mv.color, isBook, cmp, {
            prev,
            last: last ? { to: last.to, captured: !!last.captured } : undefined,
          });
          const fb = coachOnPlayerMove({ classification, loss, before, after, playedSan: mv.san, mover: mv.color, coach });
          setFeedback(fb);
          explaining.current = isError(classification);
          const explain = settings.coachDetails !== false ? explainError({ classification, before, after, uci, mover: mv.color }) : null;
          say({ text: fb.text, voice: fb.voice, chips: fb.chips }, moodFor(classification), { cls: classification, arrow: fb.arrow, explain });
          if (fb.suggestRetry && !chess.isGameOver()) {
            setThinking(false);
            setAwaiting(true);
            return;
          }
        } catch (e) {
          if (e instanceof CancelledError) return;
          console.warn(e);
        }
        setThinking(false);
      }
      botTurn();
    },
    [applyMove, awaiting, botTurn, chess, coach, engine, mode, playerColor, result, say, settings.coachDetails, tag, thinking],
  );

  const retry = () => {
    chess.undo();
    sync();
    setAwaiting(false);
    setArrows([]);
    setFeedback(null);
    say(fixedLine(coach, 'retry'), 'neutral', { interrupt: true });
    prefetchEval();
  };

  const continueAnyway = () => {
    setAwaiting(false);
    setArrows([]);
    botTurn();
  };

  /**
   * Take your move back and play the better one for you (it was found for the position before
   * your move); then the game goes on. Retry, by contrast, lets you look for it yourself.
   */
  const showBetter = () => {
    const better = feedback?.arrow;
    if (!better) return retry();
    hush();
    chess.undo();
    sync();
    setAwaiting(false);
    setArrows([]);
    setFeedback(null);
    const mv = applyMove(uciToMove(better));
    if (!mv) return;
    say({ text: t("{san} was the better move. Let's continue from here.", { san: mv.san }) }, 'happy', { interrupt: true });
    if (!over.current) botTurn();
  };

  /** Undo and Hint make a rated game unrated — ask first. */
  const assist = (kind: 'Undo' | 'Hint', action: () => void) => {
    if (!ratedGame || assistedRef.current) return action();
    const what = t(kind);
    Alert.alert(t('Use {what}?', { what }), t("Using {what} makes this game unrated. Your rating won't change.", { what }), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Use {what}', { what }),
        onPress: () => {
          assistedRef.current = true;
          setAssisted(true);
          action();
        },
      },
    ]);
  };

  const hint = async () => {
    if (thinking || result || chess.turn() !== playerColor) return;
    try {
      const f = chess.fen();
      const e = evalCache.current?.fen === f ? evalCache.current : await evaluatePosition(engine.analyze, f, { tag });
      evalCache.current = e;
      if (e.best && chess.fen() === f) {
        setArrows([{ from: e.best.slice(0, 2), to: e.best.slice(2, 4) }]);
        if (mode === 'coach') {
          say(fixedLine(coach, 'hint'), 'happy', { interrupt: true });
        }
      }
    } catch {}
  };

  const takeback = () => {
    if (result || chess.history().length === 0) return;
    engine.cancel(tag);
    if (mode === 'local') {
      chess.undo();
    } else {
      // Undo back to the player's turn.
      chess.undo();
      while (chess.history().length && chess.turn() !== playerColor) chess.undo();
    }
    setThinking(false);
    setAwaiting(false);
    setArrows([]);
    setFeedback(null);
    setCoachChips([]);
    // Anything the coach was about to say refers to moves that are gone now.
    if (mode === 'coach') hush();
    sync();
    const t = Date.now();
    setClock((c) => c && switchClock(c, chess.history().length ? chess.turn() : null, t));
    if (mode !== 'local' && chess.turn() !== playerColor) botTurn();
    else prefetchEval();
  };

  // Running out of time loses — unless the opponent can't possibly checkmate, then it's a draw.
  const flag = useCallback(
    (side: Side) => {
      if (over.current) return;
      engine.cancel(tag);
      const other: Side = side === 'w' ? 'b' : 'w';
      if (settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      finish(
        canStillMate(chess.fen(), other)
          ? { result: side === 'w' ? '0-1' : '1-0', reason: 'Timeout' }
          : { result: '1/2-1/2', reason: 'Timeout vs insufficient material' },
      );
    },
    [chess, engine, finish, settings.haptics, tag],
  );

  // Characters speak their lines aloud.
  useEffect(() => setVoiceEnabled(settings.voice), [settings.voice]);
  useEffect(() => {
    if (mode === 'bot') playVoice(botVoiceKey);
  }, [botLine, botVoiceKey, mode]);
  useEffect(() => () => hush(), []);

  const flagRef = useRef(flag);
  useEffect(() => {
    clockRef.current = clock;
    flagRef.current = flag;
  });
  const clockOn = !!clock;
  useEffect(() => {
    if (!clockOn || result) return;
    // Only checks for a flag: the clock faces tick by themselves, so the screen doesn't redraw.
    const id = setInterval(() => {
      const t = Date.now();
      const c = clockRef.current;
      if (c?.turn && remaining(c, c.turn, t) <= 0) flagRef.current(c.turn);
    }, 100);
    return () => clearInterval(id);
  }, [clockOn, result]);

  const clockFor = (side: Side) => (clock ? { ms: clock[side], running: clock.turn === side, since: clock.since } : undefined);

  const resign = () => {
    if (result) return;
    Alert.alert(t('Resign?'), t('Are you sure you want to resign this game?'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Resign'),
        style: 'destructive',
        onPress: () => {
          engine.cancel(tag);
          const loser = mode === 'local' ? chess.turn() : playerColor;
          finish({ result: loser === 'w' ? '0-1' : '1-0', reason: loser === 'w' ? 'White resigned' : 'Black resigned' });
        },
      },
    ]);
  };

  const openReview = async () => {
    if (!result) {
      // Save an unfinished game so it can be reviewed.
      await store.saveGame({
        id: gameId.current, date: Date.now(), mode, botId: mode === 'local' ? undefined : bot.id, playerColor,
        startFen: new Chess().fen(), moves: chess.history(), result: '*', reason: 'Unfinished',
      });
    }
    setShowResult(false);
    router.push({ pathname: '/review', params: { id: gameId.current } });
  };

  const movable = result ? null : mode === 'local' ? 'both' : thinking || awaiting ? null : playerColor;
  const opening = useMemo(() => openingName(moves), [moves]);
  const playerWon = result && ((result.result === '1-0' && playerColor === 'w') || (result.result === '0-1' && playerColor === 'b'));

  const shownFen = browse.position?.fen ?? fen;
  const mat = useMemo(() => material(shownFen), [shownFen]);
  const capOf = (color: 'w' | 'b') => ({ pieces: mat.taken[color], color, lead: mat.lead[color] });
  const tagFor = (color: 'w' | 'b', right?: string) =>
    mode === 'local' ? (
      <PlayerTag name={color === 'w' ? t('White') : t('Black')} self={color === 'w'} active={!result && chess.turn() === color} right={right} clock={clockFor(color)} captured={capOf(color)} />
    ) : color === playerColor ? (
      <PlayerTag
        name={myName}
        self
        me={profile}
        sub={myRating.value !== undefined ? `${myRating.value}${mode === 'bot' ? ` · ${myRating.lichess ? t('CASUAL') : assisted ? t('UNRATED') : t('RATED')}` : ''}` : undefined}
        active={!result && chess.turn() === color}
        right={right}
        clock={clockFor(color)}
        captured={capOf(color)}
      />
    ) : (
      <PlayerTag name={bot.name} who={botWho} mood={botMood} sub={`${bot.rating}${thinking && chess.turn() === color ? ` · ${t('THINKING')}` : ''}`} active={!result && chess.turn() === color} right={right} clock={clockFor(color)} captured={capOf(color)} />
    );

  const resultTitle =
    mode === 'local'
      ? result?.result === '1-0' ? t('WHITE WINS') : result?.result === '0-1' ? t('BLACK WINS') : t('DRAW')
      : playerWon ? t('YOU WIN') : result?.result === '1/2-1/2' ? t('DRAW') : t('{name} WINS', { name: bot.name.toUpperCase() });

  const boardArea = (
    <BoardFrame reserved={TAG_HEIGHT * 2} inset={mode === 'coach' ? EVAL_BAR_WIDTH : 0}>
      {(size) => (
        // The name bars span the board (not the whole window on wide screens).
        <View style={{ width: size + (mode === 'coach' ? EVAL_BAR_WIDTH : 0), alignSelf: 'center' }}>
          {tagFor(orientation === 'w' ? 'b' : 'w')}
          <View style={{ flexDirection: 'row', alignSelf: 'center' }}>
            {mode === 'coach' && <EvalBar score={evalScore} height={size} flipped={orientation === 'b'} />}
            <Board
              fen={browse.position?.fen ?? fen}
              hideLastMoveArrow
              size={size}
              orientation={orientation}
              movable={browse.viewing ? null : movable}
              onMove={onUserMove}
              lastMove={browse.position ? browse.position.lastMove : lastMove}
              arrows={browse.viewing ? undefined : arrows}
            />
          </View>
          {tagFor(orientation, opening && moves.length <= 14 ? opening.name.toUpperCase() : undefined)}
        </View>
      )}
    </BoardFrame>
  );
  const botBubble =
    mode === 'bot' ? (
      <View style={{ paddingTop: 10 }}>
        <SpeechBubble name={bot.name} who={botWho} mood={botMood} text={botLine} skippable />
      </View>
    ) : null;
  const coachBubble =
    mode === 'coach' ? (
      <ScrollView style={wide ? styles.coachBoxWide : styles.coachBox} contentContainerStyle={{ paddingTop: 6, paddingBottom: 6 }}>
        <SpeechBubble
          name={coach.name}
          who={coach.who}
          mood={coachMood}
          portraitSize={48}
          text={coachText}
          skippable
          badge={
            bubbleClass ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.classTag, { backgroundColor: CLASS_META[bubbleClass].color }]}>
                  <Text style={styles.classTagText}>
                    {CLASS_META[bubbleClass].symbol} {t(CLASS_META[bubbleClass].label).toUpperCase()}
                  </Text>
                </View>
                {bubbleExplain && settings.coachDetails !== false && <WhyButton onPress={() => setWhyOpen(true)} />}
              </View>
            ) : null
          }
        >
          {coachChips.length > 0 && <Chips items={coachChips.map((c) => t(c))} />}
        </SpeechBubble>
      </ScrollView>
    ) : null;
  const controls = (
    <>
        {browse.viewing && (
          <Pressable onPress={browse.live} style={styles.viewing}>
            <Text style={styles.viewingText}>
              {t('VIEWING MOVE {n} · TAP TO RETURN TO THE GAME', { n: Math.ceil((browse.ply ?? 0) / 2) })}
            </Text>
          </Pressable>
        )}
        {awaiting ? (
          <View style={styles.decisionBar}>
            <Btn small title={t('Retry')} icon="↺" style={{ flex: 1 }} onPress={retry} />
            <Btn small kind="secondary" title={t('Play best')} style={{ flex: 1 }} onPress={showBetter} />
            <Btn small kind="secondary" title={t('Go on')} style={{ flex: 1 }} onPress={continueAnyway} />
          </View>
        ) : (
          <Toolbar>
            <IconBtn icon="×" label={t('Resign')} hold={900} onPress={resign} disabled={!!result} />
            <IconBtn icon="↺" label={t('Undo')} onPress={() => assist('Undo', takeback)} disabled={!!result || moves.length === 0} />
            {mode !== 'local' && <IconBtn icon="?" label={t('Hint')} onPress={() => assist('Hint', hint)} disabled={!!result || thinking} />}
            <IconBtn icon="‹" label={t('Back')} onPress={browse.back} disabled={!browse.canBack} />
            <IconBtn icon="›" label={t('Next')} onPress={browse.forward} disabled={!browse.canForward} />
            <IconBtn icon="⇅" label={t('Flip')} onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
          </Toolbar>
        )}
    </>
  );
  const moveItems = moves.map((san) => ({ san }));

  return (
    <View style={wide ? [styles.wide, { paddingBottom: insets.bottom + 16 }] : { flex: 1, paddingBottom: insets.bottom }}>
      <Stack.Screen options={{ title: (mode === 'coach' ? t('COACH GAME') : mode === 'local' ? t('PASS & PLAY') : t('VS {name}', { name: bot.name.toUpperCase() })) + (timeControlLabel(params.tc) ? ` · ${timeControlLabel(params.tc)!.toUpperCase()}` : '') }} />
      <ArrowKeys onLeft={browse.back} onRight={browse.forward} />
      {wide ? (
        <>
          <WideBoard reserved={TAG_HEIGHT * 2} inset={mode === 'coach' ? EVAL_BAR_WIDTH : 0}>{boardArea}</WideBoard>
          <View style={styles.widePanel}>
            {botBubble}
            {coachBubble}
            <MoveTable moves={moveItems} current={browse.ply ?? moves.length} onSelect={browse.select} />
            <View style={styles.wideControls}>{controls}</View>
          </View>
        </>
      ) : (
        <>
          <MoveList moves={moveItems} current={browse.ply ?? moves.length} onSelect={browse.select} />
          {botBubble}
          {boardArea}
          {coachBubble}
          {controls}
        </>
      )}

      <ExplainSheet explanation={whyOpen ? bubbleExplain : null} coachName={coach.name} onClose={() => setWhyOpen(false)} />
      <Modal visible={showResult} transparent animationType="fade" onRequestClose={() => setShowResult(false)}>
        <View style={styles.backdrop}>
          <Stamp visible={showResult}>
            <Slab outerStyle={styles.resultOuter} style={styles.resultCard}>
              <Text style={styles.resultKicker}>{t('GAME OVER')}</Text>
              <Text style={styles.resultTitle}>{resultTitle}</Text>
              <View style={styles.resultRule} />
              <Text style={styles.resultSub}>{(result ? t(result.reason) : '').toUpperCase()} · {result?.result}</Text>
              {ratingChange ? (
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingLabel}>{t('RATING')}</Text>
                  <Text style={styles.ratingValue}>
                    {ratingChange.before} → {ratingChange.after}
                  </Text>
                  <Text style={[styles.ratingDelta, { backgroundColor: ratingChange.after >= ratingChange.before ? C.good : C.danger }]}>
                    {signed(ratingChange.after - ratingChange.before)}
                  </Text>
                </View>
              ) : mode === 'bot' ? (
                <Text style={styles.unrated}>{t('UNRATED GAME')}{assisted ? ` · ${t('UNDO/HINT USED')}` : ''}</Text>
              ) : null}
              {mode !== 'local' && <Text style={styles.resultQuote}>“{botLine}”</Text>}
              <Btn title={t('Game Review')} icon="≡" onPress={openReview} style={{ alignSelf: 'stretch', marginTop: 18 }} />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, alignSelf: 'stretch' }}>
                <Btn kind="secondary" title={t('Rematch')} style={{ flex: 1 }} onPress={() => { setShowResult(false); router.replace({ pathname: '/game', params: { mode, bot: bot.id, color: playerColor === 'w' ? 'b' : 'w', tc: params.tc ?? 'none', k: newId(), coach: coach.id } }); }} />
                <Btn kind="secondary" title={t('Close')} style={{ flex: 1 }} onPress={() => setShowResult(false)} />
              </View>
            </Slab>
          </Stamp>
        </View>
      </Modal>
    </View>
  );
}

/** Slams its child onto the screen like a rubber stamp: oversized and tilted, then settles. */
function Stamp({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!visible) return;
    v.setValue(0);
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 9 }).start();
  }, [visible, v]);
  return (
    <Animated.View
      style={{
        width: '100%',
        maxWidth: 380,
        opacity: v.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        transform: [
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1.5, 1] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-9deg', '-1.5deg'] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  classTag: { paddingHorizontal: 6, paddingVertical: 1, borderWidth: B.w, borderColor: C.ink },
  classTagText: { color: '#fff', fontFamily: 'mono', fontWeight: '700', fontSize: 10, letterSpacing: 0.8 },
  // Room for the longest coach line (4 lines) plus the move labels, so nothing is ever cut off.
  coachBox: { height: 162, flexGrow: 0 },
  // Wide screens: board left, side panel right.
  wide: { flex: 1, flexDirection: 'row', gap: 20, paddingHorizontal: 20, paddingTop: 12, justifyContent: 'center' },
  widePanel: { width: SIDE_PANEL, gap: 12 },
  wideControls: { borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  coachBoxWide: { maxHeight: 260, flexGrow: 0 },
  viewing: { backgroundColor: C.ink, paddingVertical: 8, alignItems: 'center' },
  viewingText: { color: C.white, fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  decisionBar: { flexDirection: 'row', gap: 4, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, backgroundColor: C.white, borderTopWidth: B.w, borderColor: C.ink },
  backdrop: { flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: 22 },
  resultOuter: { width: '100%', maxWidth: 380 },
  resultCard: { padding: 22, alignItems: 'center' },
  resultKicker: { fontFamily: 'mono', fontSize: 11, letterSpacing: 3, color: C.muted },
  resultTitle: { fontSize: 38, lineHeight: 42, fontWeight: '700', letterSpacing: -1, marginTop: 6, textAlign: 'center' },
  resultRule: { height: B.w * 2, backgroundColor: C.ink, alignSelf: 'stretch', marginVertical: 12 },
  resultSub: { fontFamily: 'mono', fontSize: 12, letterSpacing: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  ratingLabel: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1.5, color: C.muted },
  ratingValue: { fontFamily: 'mono', fontWeight: '700', fontSize: 20 },
  ratingDelta: { fontFamily: 'mono', fontWeight: '700', fontSize: 14, color: P.white, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden' },
  unrated: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1.5, color: C.muted, marginTop: 12 },
  resultQuote: { fontSize: 15, marginTop: 10, textAlign: 'center' },
}));
