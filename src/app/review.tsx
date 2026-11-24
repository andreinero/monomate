import { useEffect, useMemo, useRef, useState } from 'react';
import { useMyName } from '../lib/myName';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Chess } from 'chess.js';
import { Board, type Arrow } from '../components/Board';
import { ArrowKeys, BoardFrame, Btn, CapturedRow, Chips, EVAL_BAR_WIDTH, EvalBar, EvalGraph, IconBtn, Label, MoveList, MoveTable, Rise, SIDE_PANEL, Slab, SpeechBubble, Text, Toolbar, WideBoard, useWide } from '../components/ui';
import { useEngine, CancelledError } from '../engine/EngineProvider';
import { material } from '../lib/material';
import { CLASS_META, isError, accuracyToRating, formatScore, gameAccuracy, reviewGame, type Classification, type GameReview, type ReviewStep } from '../engine/analysis';
import { coachOnOpponentReviewMove, coachOnPlayerMove, moodFor } from '../engine/coach';
import { detail, getCoach, joinSpoken, reviewLine, type Coach, type Spoken } from '../engine/coaches';
import { hush, isSpeaking, playVoice, setVoiceEnabled, waitForVoice } from '../lib/voice';
import { Portrait, type Mood } from '../components/Portrait';
import { bookDepth, openingName } from '../engine/openings';
import { getBot } from '../engine/bots';
import { newId, store, useSettings, useStored, type SavedGame } from '../lib/storage';
import { exportGame } from '../lib/lichess/api';
import { explainError, type Explanation } from '../engine/explainError';
import { ExplainSheet, WhyButton } from '../components/ExplainSheet';
import { signed } from '../lib/elo';
import { verdict } from '../lib/verdict';
import { B, C, P, themed } from '../lib/theme';
import { t } from '../lib/i18n';

// v2: brilliant / great / miss / forced and deeper analysis — older cached reviews are redone.
// v3: rating-aware verdicts, misses when already winning, accuracy without the harmonic mean.
const REVIEW_KEY = (id: string) => `gambit.review.v3.${id}`;
const NAME_H = 24;
const ORDER: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];

export default function ReviewScreen() {
  const params = useLocalSearchParams<{ id?: string; moves?: string; fen?: string }>();
  const engine = useEngine();
  const settings = useSettings();
  const coach = getCoach(settings.coachId);
  useEffect(() => setVoiceEnabled(settings.voice), [settings.voice]);
  useEffect(() => () => hush(), []);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = useWide();
  const tag = useRef('review-' + newId()).current;

  const [game, setGame] = useState<SavedGame | null>(null);
  const [review, setReview] = useState<GameReview | null>(null);
  const [progress, setProgress] = useState(0);
  const [profile] = useStored(store.profile, { name: 'You', botWins: {} });
  const myName = useMyName();
  const [whyOpen, setWhyOpen] = useState(false);
  // Real Lichess ratings for online games (fetched once for games saved before we stored them).
  const [lichessRatings, setLichessRatings] = useState<{ me?: number; diff?: number; opp?: number } | null>(null);
  // Live view of the analysis: the board scans through the game as the engine works.
  const [scan, setScan] = useState<(ReviewStep & { classes: Record<number, Classification> }) | null>(null);
  const [ply, setPly] = useState(0);
  const [fastForward, setFastForward] = useState(false);
  // Auto: the review plays itself, one move after the coach has finished talking about the last one.
  const [auto, setAuto] = useState(false);
  const ffTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => {
    if (ffTimer.current) clearInterval(ffTimer.current);
  }, []);
  const [showSummary, setShowSummary] = useState(true);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [error, setError] = useState<string | null>(null);

  // Load the game.
  useEffect(() => {
    (async () => {
      if (params.id) {
        const g = await store.game(params.id);
        if (!g) return setError(t('Game not found.'));
        setGame(g);
        setOrientation(g.playerColor);
      } else if (params.moves !== undefined) {
        const startFen = params.fen || new Chess().fen();
        setGame({
          id: 'adhoc', date: Date.now(), mode: 'import', playerColor: new Chess(startFen).turn(), startFen,
          moves: params.moves ? params.moves.split(' ') : [], result: '*', reason: 'Analysis',
        });
      }
    })();
  }, [params.id, params.moves, params.fen]);

  useEffect(() => {
    if (!game || game.mode !== 'online' || !game.id.startsWith('lichess-') || game.lichessRating?.diff !== undefined) return;
    let alive = true;
    exportGame(game.id.slice('lichess-'.length))
      .then(async (g) => {
        const mine = game.playerColor === 'w' ? g.players.white : g.players.black;
        const theirs = game.playerColor === 'w' ? g.players.black : g.players.white;
        if (!alive) return;
        setLichessRatings({ me: mine.rating, diff: mine.ratingDiff, opp: theirs.rating });
        await store.saveGame({ ...game, lichessRating: { before: mine.rating, diff: mine.ratingDiff }, opponent: { name: game.opponent?.name ?? 'Opponent', rating: theirs.rating } });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [game]);

  // Run (or load cached) review.
  useEffect(() => {
    if (!game) return;
    let alive = true;
    (async () => {
      const cacheKey = REVIEW_KEY(game.id + ':' + game.moves.length);
      if (game.id !== 'adhoc') {
        const cached = await AsyncStorage.getItem(cacheKey).catch(() => null);
        if (cached) {
          // Older reviews: recompute accuracy with the current (stricter) method.
          const r: GameReview = JSON.parse(cached);
          r.accuracy = gameAccuracy(r.moves);
          r.estimatedRating = { w: accuracyToRating(r.accuracy.w), b: accuracyToRating(r.accuracy.b) };
          setReview(r);
          return;
        }
      }
      try {
        const book = game.startFen === new Chess().fen() ? bookDepth(game.moves) : 0;
        const r = await reviewGame(
          engine.analyze,
          game.startFen,
          game.moves,
          (d, t, step) => {
            if (!alive) return;
            setProgress(d / t);
            if (step)
              setScan((prev) => {
                const classes = step.classification ? { ...(prev?.classes ?? {}), [step.ply]: step.classification } : (prev?.classes ?? {});
                // Another engine's stretch further on: mark its move, keep the board where it is.
                if (step.background && prev) return { ...prev, classes };
                return { ...step, classes };
              });
          },
          book,
          tag,
          engine.lanes(),
          // The players' ratings, when the game has them (imported and online games).
          { [game.playerColor]: game.self?.rating, [game.playerColor === 'w' ? 'b' : 'w']: game.opponent?.rating },
        );
        if (!alive) return;
        setReview(r);
        if (game.id !== 'adhoc') {
          await AsyncStorage.setItem(cacheKey, JSON.stringify(r)).catch(() => {});
          await store.saveGame({ ...game, accuracy: r.accuracy });
        }
      } catch (e) {
        if (!(e instanceof CancelledError)) setError(String(e));
      }
    })();
    return () => {
      alive = false;
      engine.cancel(tag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id, game?.moves.length]);

  // Positions and from/to squares for the "analysing" animation (available before the review is).
  const { scanFens, moveSquares } = useMemo(() => {
    if (!game) return { scanFens: [] as string[], moveSquares: [] as { from: string; to: string }[] };
    const c = new Chess(game.startFen);
    const f = [c.fen()];
    const sq: { from: string; to: string }[] = [];
    for (const m of game.moves) {
      const x = c.move(m);
      sq.push({ from: x.from, to: x.to });
      f.push(c.fen());
    }
    return { scanFens: f, moveSquares: sq };
  }, [game]);
  const named = !!game && (game.mode === 'online' || (game.mode === 'import' && !!game.opponent));
  // Your name in this game: your chess.com username for chess.com games, else your account name.
  const selfName = game?.self?.name ?? myName;
  const opponentLabel = game ? (named ? (game.opponent?.name ?? t('Opponent')) : game.mode === 'bot' || game.mode === 'coach' ? getBot(game.botId).name : null)?.toUpperCase() : null;

  const fens = useMemo(() => {
    if (!game) return [];
    const c = new Chess(game.startFen);
    const out = [c.fen()];
    for (const m of game.moves) {
      c.move(m);
      out.push(c.fen());
    }
    return out;
  }, [game]);


  // The coach picks one of several lines at random — once per move (and once for the summary),
  // so re-renders never swap the line mid-sentence.
  const step = useMemo(
    () => (review && game && !showSummary ? stepView(review, game, ply, coach, settings.coachDetails !== false) : null),
    [review, game, ply, coach, settings.coachDetails, showSummary],
  );
  const summaryLine = useMemo(() => (review && game ? summary(review, game, coach) : null), [review, game, coach]);

  const total = review?.moves.length ?? 0;
  const stepText = step?.text ?? '';
  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      // Give the coach a moment to start, then wait until he's done (SKIP moves on straight away).
      await sleep(ply === 0 ? 300 : 700);
      if (cancelled) return;
      if (isSpeaking()) await waitForVoice(25000);
      // No voice for this line (or voices off): leave time to read it.
      else if (stepText) await sleep(Math.min(7000, 900 + stepText.length * 45));
      await sleep(450);
      if (cancelled) return;
      if (ply >= total) setAuto(false);
      else setPly(ply + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [auto, ply, total, stepText]);

  if (error) return <Text style={[styles.center, { color: C.danger }]}>{error}</Text>;
  if (game && !review && scan) {
    // The coach "goes through the game": the board replays every move as the engine checks it.
    const p = Math.min(scan.ply, game.moves.length);
    const mv = p > 0 ? moveSquares[p - 1] : null;
    const cls = scan.classes[p];
    const pct = Math.round(progress * 100);
    const who = (c: 'w' | 'b') => (game.mode === 'local' || (game.mode === 'import' && !named) ? (c === 'w' ? t('WHITE') : t('BLACK')) : c === game.playerColor ? selfName.toUpperCase() : (opponentLabel ?? t('OPPONENT')));
    return (
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        <Stack.Screen options={{ title: t('GAME REVIEW') }} />
        <MoveList moves={game.moves.map((san, i) => ({ san, classification: scan.classes[i + 1] }))} current={p} />
        <View style={styles.scanHead}>
          <Portrait who={coach.who} size={44} mood="neutral" talkKey={p} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.scanTitle}>{t('{name} IS ANALYSING', { name: coach.name.toUpperCase() })}</Text>
            <Text style={styles.scanSub}>
              {t('JUDGING EVERY MOVE · MOVE {n} OF {total}', { n: Math.max(1, Math.ceil(p / 2)), total: Math.ceil(game.moves.length / 2) })}
            </Text>
            <View style={styles.scanTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
          </View>
          <Text style={styles.scanPct}>{pct}%</Text>
        </View>
        <BoardFrame reserved={NAME_H * 2} inset={EVAL_BAR_WIDTH}>
          {(size) => (
            <>
              <NameLine name={who(orientation === 'w' ? 'b' : 'w')} fen={scanFens[p]} color={orientation === 'w' ? 'b' : 'w'} />
              <View style={{ flexDirection: 'row', alignSelf: 'center' }}>
                <EvalBar score={scan.score} height={size} flipped={orientation === 'b'} />
                <Board
                  fen={scanFens[p]}
                  size={size}
                  orientation={orientation}
                  lastMove={mv}
                  // While a move is being judged, show the engine's choice for that turn.
                  arrows={scan.phase === 1 && scan.best ? [{ from: scan.best.slice(0, 2), to: scan.best.slice(2, 4) }] : []}
                  badge={mv && cls ? { square: mv.to, color: CLASS_META[cls].color, symbol: CLASS_META[cls].symbol } : null}
                />
              </View>
              <NameLine name={who(orientation)} fen={scanFens[p]} color={orientation} />
            </>
          )}
        </BoardFrame>
      </View>
    );
  }
  if (!game || !review) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: t('GAME REVIEW') }} />
        <Text style={styles.loadingPct}>{String(Math.round(progress * 100)).padStart(2, '0')}%</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.loadingTitle}>{t('{name} IS REVIEWING YOUR GAME', { name: coach.name.toUpperCase() })}</Text>
      </View>
    );
  }

  const opponentName = named ? (game.opponent?.name ?? t('Opponent')) : game.mode === 'bot' || game.mode === 'coach' ? getBot(game.botId).name : null;
  const names = {
    w: opponentName ? (game.playerColor === 'w' ? selfName : opponentName) : t('White'),
    b: opponentName ? (game.playerColor === 'b' ? selfName : opponentName) : t('Black'),
  };
  const opening = openingName(game.moves);

  // Real ratings (not an estimate): Lichess ratings online, MonoMate vs the bot's rating offline.
  type Cell = { value?: number; diff?: number };
  const ratingRow: { label: string; w: Cell; b: Cell } | null = (() => {
    const mine = (me: Cell, opp: Cell) => (game.playerColor === 'w' ? { w: me, b: opp } : { w: opp, b: me });
    if (game.mode === 'online') {
      const me = { value: lichessRatings?.me ?? game.lichessRating?.before, diff: lichessRatings?.diff ?? game.lichessRating?.diff };
      return { label: t('LICHESS RATING'), ...mine(me, { value: lichessRatings?.opp ?? game.opponent?.rating }) };
    }
    if (game.mode === 'import' && game.self) {
      return { label: t('CHESS.COM RATING'), ...mine({ value: game.self.rating }, { value: game.opponent?.rating }) };
    }
    if (game.mode === 'bot' || game.mode === 'coach') {
      const me = game.rating ? { value: game.rating.before, diff: game.rating.after - game.rating.before } : { value: profile.rating };
      return { label: t('RATING'), ...mine(me, { value: getBot(game.botId).rating }) };
    }
    return null;
  })();

  if (showSummary) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: insets.bottom + 20, width: '100%', maxWidth: 640, alignSelf: 'center' }}>
        <Stack.Screen options={{ title: t('GAME REVIEW') }} />
        <Rise index={0}>
          <SpeechBubble name={coach.name} who={coach.who} mood={summaryMood(review, game)} portraitSize={64} text={summaryLine?.text ?? ''} skippable />
          <Speak voice={summaryLine?.voice} text={summaryLine?.text ?? ''} />
        </Rise>
        <Rise index={1}>
          <Slab style={styles.card}>
            <View style={[styles.row, styles.headRow]}>
              <Text style={[styles.cell, styles.head]}> </Text>
              <Text style={[styles.cellNum, styles.head]} numberOfLines={1}>{names.w.toUpperCase()}</Text>
              <Text style={[styles.cellNum, styles.head]} numberOfLines={1}>{names.b.toUpperCase()}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.cell}>{t('ACCURACY')}</Text>
              <View style={[styles.accBox, { backgroundColor: P.white }]}>
                <Text style={[styles.accText, { color: P.black }]}>{review.accuracy.w.toFixed(1)}</Text>
              </View>
              <View style={[styles.accBox, { backgroundColor: P.black }]}>
                <Text style={[styles.accText, { color: P.white }]}>{review.accuracy.b.toFixed(1)}</Text>
              </View>
            </View>
            {ratingRow && (
              <View style={styles.row}>
                <Text style={styles.cell}>{ratingRow.label}</Text>
                {(['w', 'b'] as const).map((c) => (
                  <Text key={c} style={styles.cellNum}>
                    {ratingRow[c].value ?? '—'}
                    {ratingRow[c].diff !== undefined ? <Text style={[styles.diff, { color: ratingRow[c].diff! >= 0 ? C.good : C.danger }]}> {signed(ratingRow[c].diff!)}</Text> : null}
                  </Text>
                ))}
              </View>
            )}
            <View style={styles.divider} />
            {ORDER.map((k) => (
              <View key={k} style={styles.row}>
                <View style={[styles.cell, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <View style={[styles.sym, { backgroundColor: CLASS_META[k].color }]}>
                    <Text style={styles.symText}>{CLASS_META[k].symbol}</Text>
                  </View>
                  <Text style={styles.cellLabel}>{CLASS_META[k].label.toUpperCase()}</Text>
                </View>
                <Text style={styles.cellNum}>{review.counts.w[k]}</Text>
                <Text style={styles.cellNum}>{review.counts.b[k]}</Text>
              </View>
            ))}
          </Slab>
        </Rise>
        {opening && (
          <Rise index={2}>
            <Label>{t('Opening — {name}', { name: opening.name })}</Label>
          </Rise>
        )}
        <Rise index={3}>
          <EvalGraph evals={review.evals} width={Math.min(width, 640) - 32} height={70} current={0} />
        </Rise>
        <Rise index={4}>
          <Btn title={t('Start Review  →')} onPress={() => { setShowSummary(false); setPly(0); }} />
        </Rise>
      </ScrollView>
    );
  }

  const move = ply > 0 ? review.moves[ply - 1] : null;
  const meta = move ? CLASS_META[move.classification] : null;
  const arrows: Arrow[] = [];
  if (move && move.bestUci && move.bestUci !== move.uci && !['best', 'great', 'book'].includes(move.classification)) {
    arrows.push({ from: move.bestUci.slice(0, 2), to: move.bestUci.slice(2, 4) });
  }

  const explanation = step?.text ?? '';
  const explanationVoice = step?.voice;
  const explanationChips = step?.chips ?? [];
  const theirMove = !!step?.theirs;
  const explanation_ = step?.explain ?? null;

  /** Stepping step-by-step through moves (with the move sounds) to the next key move. */
  const stopFastForward = () => {
    if (ffTimer.current) clearInterval(ffTimer.current);
    ffTimer.current = null;
    setFastForward(false);
  };
  /** Any manual navigation stops a fast-forward or Auto first. */
  const goPly = (p: number | ((prev: number) => number)) => {
    stopFastForward();
    setAuto(false);
    setPly(p);
  };
  const toggleAuto = () => {
    stopFastForward();
    if (auto) {
      setAuto(false);
      hush();
      return;
    }
    // From the end, start over.
    if (ply >= review.moves.length) setPly(0);
    setAuto(true);
  };
  const jumpKey = (dir: 1 | -1) => {
    let target = -1;
    for (let i = ply + dir; i >= 1 && i <= review.moves.length; i += dir) {
      if (['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'].includes(review.moves[i - 1].classification)) {
        target = i;
        break;
      }
    }
    if (target < 0) return;
    stopFastForward();
    setAuto(false);
    if (dir < 0 || target - ply <= 1) return setPly(target);
    // Play through the moves in between quickly — each one animates and clicks — and stop on the key move.
    setFastForward(true);
    let p = ply;
    ffTimer.current = setInterval(() => {
      p += 1;
      setPly(p);
      if (p >= target) stopFastForward();
    }, 170);
  };

  const moveItems = review.moves.map((m) => ({ san: m.san, classification: m.classification }));
  const keys = <ArrowKeys onLeft={() => goPly((p) => Math.max(0, p - 1))} onRight={() => goPly((p) => Math.min(review.moves.length, p + 1))} />;
  const coachBubble = (
    <ScrollView style={wide ? styles.coachBoxWide : styles.coachBox} contentContainerStyle={{ paddingVertical: 8 }}>
      <Speak voice={fastForward ? undefined : explanationVoice} text={fastForward ? '' : explanation} />
      <SpeechBubble
        name={coach.name}
        who={coach.who}
        // Your opponent's mistakes are good news for you.
        mood={!move ? 'neutral' : theirMove ? (isError(move.classification) ? 'happy' : 'neutral') : moodFor(move.classification)}
        portraitSize={48}
        text={explanation}
        skippable
        badge={
          meta ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={[styles.classTag, { backgroundColor: meta.color }]}>
                <Text style={styles.classTagText}>
                  {meta.symbol} {meta.label.toUpperCase()} · {formatScore(move!.evalAfter)}
                </Text>
              </View>
              {explanation_ && <WhyButton onPress={() => setWhyOpen(true)} />}
            </View>
          ) : null
        }
      >
        {explanationChips.length > 0 && <Chips items={explanationChips} scroll />}
      </SpeechBubble>
    </ScrollView>
  );
  const boardArea = (
    <BoardFrame reserved={NAME_H * 2} inset={EVAL_BAR_WIDTH}>
      {(size) => (
        <View style={{ width: size + EVAL_BAR_WIDTH, alignSelf: 'center' }}>
          <NameLine name={(orientation === 'w' ? names.b : names.w).toUpperCase()} fen={fens[ply]} color={orientation === 'w' ? 'b' : 'w'} />
          <View style={{ flexDirection: 'row', alignSelf: 'center' }}>
            <EvalBar score={review.evals[ply]} height={size} flipped={orientation === 'b'} />
            <Board
              fen={fens[ply]}
              size={size}
              orientation={orientation}
              lastMove={move ? { from: move.uci.slice(0, 2), to: move.uci.slice(2, 4) } : null}
              arrows={arrows}
              badge={move && meta ? { square: move.uci.slice(2, 4), color: meta.color, symbol: meta.symbol } : null}
            />
          </View>
          <NameLine name={(orientation === 'w' ? names.w : names.b).toUpperCase()} fen={fens[ply]} color={orientation} />
        </View>
      )}
    </BoardFrame>
  );
  const toolbar = (
    <Toolbar>
      <IconBtn icon="«" label={t('Start')} onPress={() => goPly(0)} disabled={ply === 0} />
      <IconBtn icon="‹" label={t('Back')} onPress={() => goPly((p) => Math.max(0, p - 1))} disabled={ply === 0} />
      <IconBtn icon="›" label={t('Next')} onPress={() => goPly((p) => Math.min(review.moves.length, p + 1))} disabled={ply === review.moves.length} />
      <IconBtn icon={auto ? '❚❚' : '▶\uFE0E'} label={auto ? t('Stop') : t('Auto')} onPress={toggleAuto} />
      <IconBtn icon="!" label={t('Key move')} onPress={() => jumpKey(1)} />
      <IconBtn icon="⇅" label={t('Flip')} onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
      <IconBtn icon="≡" label={t('Summary')} onPress={() => { setAuto(false); setShowSummary(true); }} />
    </Toolbar>
  );

  if (wide) {
    return (
      <View style={[styles.wide, { paddingBottom: insets.bottom + 16 }]}>
        <Stack.Screen options={{ title: t('GAME REVIEW') }} />
        {keys}
        <WideBoard reserved={NAME_H * 2} inset={EVAL_BAR_WIDTH}>{boardArea}</WideBoard>
        <View style={styles.widePanel}>
          {coachBubble}
          <EvalGraph evals={review.evals} width={SIDE_PANEL} height={56} current={ply} onSelect={goPly} />
          <MoveTable moves={moveItems} current={ply} onSelect={goPly} />
          <View style={styles.wideControls}>{toolbar}</View>
        </View>
        <ExplainSheet explanation={whyOpen ? explanation_ : null} coachName={coach.name} onClose={() => setWhyOpen(false)} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom }}>
      <Stack.Screen options={{ title: t('GAME REVIEW') }} />
      {keys}
      <MoveList moves={moveItems} current={ply} onSelect={goPly} />
      {coachBubble}
      {boardArea}
      <View style={{ alignSelf: 'center', paddingVertical: 6 }}>
        <EvalGraph evals={review.evals} width={width - 24} height={44} current={ply} onSelect={goPly} />
      </View>
      {toolbar}
      <ExplainSheet explanation={whyOpen ? explanation_ : null} coachName={coach.name} onClose={() => setWhyOpen(false)} />
    </View>
  );
}

/**
 * Says `text` whenever it changes, replacing whatever was being said (you're stepping through moves).
 * Keyed on the words themselves: a re-render with the same line must not restart it.
 */
function Speak({ voice, text }: { voice?: string[]; text: string }) {
  const key = `${(voice ?? []).join('|')}#${text}`;
  useEffect(() => {
    const keys = key.split('#')[0];
    if (keys) playVoice(keys.split('|'), { interrupt: true });
    else hush();
  }, [key]);
  return null;
}

/** What the coach says (and shows) for the move at `ply` while stepping through the game. */
function stepView(review: GameReview, game: SavedGame, ply: number, coach: Coach, details: boolean) {
  const move = ply > 0 ? review.moves[ply - 1] : null;
  if (!move) {
    // The starting position: the coach's spoken opener for stepping through the game.
    const start = reviewLine(coach, 'start');
    return { text: start.text, voice: start.voice, chips: [] as string[], theirs: false, explain: null as Explanation | null };
  }
  const nextMove = review.moves[ply];
  const before = { fen: move.fenBefore, score: move.evalBefore, best: move.bestUci, pv: [] };
  const after = { fen: move.fenAfter, score: move.evalAfter, best: nextMove?.bestUci ?? null, pv: [] };
  // Your opponent's move: the coach talks about *their* move from your side of the board.
  // (Imported games count when we know which side you were — e.g. your chess.com games.)
  const knowsSides = game.mode !== 'local' && (game.mode !== 'import' || !!game.opponent);
  const theirs = knowsSides && move.color !== game.playerColor;
  const explain = details ? explainError({ classification: move.classification, before, after, uci: move.uci, mover: move.color, perspective: theirs ? 'them' : 'you' }) : null;
  const fb = theirs
    ? coachOnOpponentReviewMove({ classification: move.classification, before, after, playedSan: move.san, mover: move.color, coach })
    : coachOnPlayerMove({ classification: move.classification, loss: move.loss, before, after, playedSan: move.san, mover: move.color, coach });
  // The bubble holds exactly what the coach says; moves and lines go in the chips.
  const chips = [t('PLAYED: {san}', { san: move.san }), ...fb.chips];
  if (!['best', 'great', 'book'].includes(move.classification) && move.bestLineSan.length) chips.push(t('LINE: {line}', { line: move.bestLineSan.join(' ') }));
  return { text: fb.text, voice: fb.voice, chips, theirs, explain };
}

function summaryMood(r: GameReview, g: SavedGame): Mood {
  if (g.mode === 'local' || g.mode === 'import') return 'neutral';
  const v = verdict(r, g);
  return v === 'great' || v === 'good' ? 'happy' : v === 'ok' ? 'neutral' : 'sad';
}

/** Coach's verdict on the game: a recorded opener in their voice, then the numbers as text. */
function summary(r: GameReview, g: SavedGame, coach: Coach): Spoken {
  const me = g.mode === 'local' || g.mode === 'import' ? null : g.playerColor;
  // No "you" (pass & play, imported games): a spoken overview; the numbers are in the table below.
  if (!me) return detail(coach, 'review.overview');
  const c = r.counts[me];
  const opener = reviewLine(coach, verdict(r, g));
  const tail = detail(coach, c.blunder + c.mistake === 0 ? 'review.clean' : 'review.errors');
  return joinSpoken(opener, tail);
}

/** A player's name above/below the board, with the pieces they've taken in the shown position. */
function NameLine({ name, fen, color }: { name: string; fen: string | undefined; color: 'w' | 'b' }) {
  const m = fen ? material(fen) : null;
  return (
    <View style={styles.nameLine}>
      <Text style={styles.playerLine} numberOfLines={1}>{name}</Text>
      {m ? <CapturedRow pieces={m.taken[color]} color={color} lead={m.lead[color]} size={14} /> : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  center: { textAlign: 'center', marginTop: 40 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  loadingPct: { fontFamily: 'mono', fontWeight: '700', fontSize: 72, letterSpacing: -2 },
  loadingTitle: { fontFamily: 'mono', fontSize: 11, letterSpacing: 1.5, color: C.muted, marginTop: 16, textAlign: 'center' },
  scanHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  scanTitle: { fontWeight: '700', fontSize: 15 },
  scanSub: { fontFamily: 'mono', fontSize: 9, letterSpacing: 1, color: C.muted },
  scanTrack: { height: 8, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, marginTop: 2 },
  scanPct: { fontFamily: 'mono', fontWeight: '700', fontSize: 22, minWidth: 58, textAlign: 'right' },
  diff: { fontFamily: 'mono', fontWeight: '700', fontSize: 12 },
  progressTrack: { width: '100%', height: 22, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  progressFill: { height: '100%', backgroundColor: C.ink },
  card: { padding: 12, gap: 7 },
  row: { flexDirection: 'row', alignItems: 'center' },
  headRow: { borderBottomWidth: B.w, borderColor: C.ink, paddingBottom: 6 },
  cell: { flex: 1.7, fontFamily: 'mono', fontSize: 12, letterSpacing: 0.5 },
  cellLabel: { fontFamily: 'mono', fontSize: 12 },
  cellNum: { flex: 1, fontFamily: 'mono', fontWeight: '700', fontSize: 15, textAlign: 'center' },
  head: { color: C.muted, fontSize: 11 },
  accBox: { flex: 1, marginHorizontal: 4, borderWidth: B.w, borderColor: C.ink, paddingVertical: 6, alignItems: 'center' },
  accText: { fontFamily: 'mono', fontWeight: '700', fontSize: 20 },
  sym: { width: 26, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: B.w, borderColor: C.ink },
  symText: { color: '#fff', fontFamily: 'mono', fontWeight: '700', fontSize: 10 },
  divider: { height: B.w, backgroundColor: C.ink, marginVertical: 4 },
  classTag: { paddingHorizontal: 6, paddingVertical: 1, borderWidth: B.w, borderColor: C.ink },
  classTagText: { color: '#fff', fontFamily: 'mono', fontWeight: '700', fontSize: 10, letterSpacing: 0.8 },
  wide: { flex: 1, flexDirection: 'row', gap: 20, paddingHorizontal: 20, paddingTop: 12, justifyContent: 'center' },
  widePanel: { width: SIDE_PANEL, gap: 12 },
  wideControls: { borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  coachBoxWide: { maxHeight: 280, flexGrow: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, height: NAME_H },
  playerLine: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 1, lineHeight: NAME_H, flexShrink: 1 },
  // Room for a four-line explanation plus one row of move labels.
  coachBox: { height: 168, flexGrow: 0 },
}));
