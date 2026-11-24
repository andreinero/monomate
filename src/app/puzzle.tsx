import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Chess } from 'chess.js';
import { Board, type Arrow } from '../components/Board';
import { BoardFrame, Btn, IconBtn, PressSlab, Text, Toolbar } from '../components/ui';
import { RUSH_VARIANTS, dailyPuzzle, nextPuzzle, rushPuzzle, themeLabel, themeName, updateRating, type Puzzle, type RushVariant } from '../lib/puzzles';
import { store, useSettings, type PuzzleStats } from '../lib/storage';
import { uciToMove } from '../engine/analysis';
import { playSound } from '../lib/sound';
import { B, C, P, themed } from '../lib/theme';
import { lang, t } from '../lib/i18n';

// Let the move's own sound finish before the 'wrong' knock.
const MOVE_SOUND_DELAY = 260;

type Status = 'loading' | 'playing' | 'correct' | 'wrong' | 'solved' | 'failed' | 'over';
type Mode = 'rated' | 'daily' | 'streak' | 'rush' | 'theme';
const RUSH_STRIKES = 3;

const THEMES_H = 28;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function PuzzleScreen() {
  const { mode: modeParam, theme, rush: rushParam } = useLocalSearchParams<{ mode?: Mode; theme?: string; rush?: RushVariant }>();
  const mode: Mode = modeParam ?? 'rated';
  const rushVariant = RUSH_VARIANTS.find((v) => v.id === rushParam) ?? RUSH_VARIANTS[0];
  const rushSeconds = mode === 'rush' ? rushVariant.seconds : 0;
  const insets = useSafeAreaInsets();
  const settings = useSettings();

  const [stats, setStats] = useState<PuzzleStats | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [online, setOnline] = useState(true);
  const [fen, setFen] = useState(new Chess().fen());
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [ratingDelta, setRatingDelta] = useState<number | null>(null);
  const [highlights, setHighlights] = useState<Record<string, string>>({});
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [streak, setStreak] = useState(0);
  const chess = useRef(new Chess());
  const step = useRef(0);
  const rated = useRef(true); // first attempt only, no hints
  const alive = useRef(true);
  // Puzzle Rush
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [rushLog, setRushLog] = useState<boolean[]>([]);
  const [rushBest, setRushBest] = useState<number | null>(null);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const rushIndex = useRef(0);
  const rushUsed = useRef<string[]>([]);
  const scoreRef = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const playerColor = puzzle ? (new Chess(puzzle.fen).turn() as 'w' | 'b') : 'w';

  const setup = useCallback((p: Puzzle) => {
    chess.current = new Chess(p.fen);
    step.current = 0;
    rated.current = mode === 'rated';
    setPuzzle(p);
    setFen(p.fen);
    setLastMove(p.lastMove ? { from: p.lastMove.slice(0, 2), to: p.lastMove.slice(2, 4) } : null);
    setHighlights({});
    setArrows([]);
    setRatingDelta(null);
    setStatus('playing');
  }, [mode]);

  const load = useCallback(async () => {
    setStatus('loading');
    const s = await store.puzzleStats();
    setStats(s);
    if (mode === 'daily') {
      const d = await dailyPuzzle();
      if (d) {
        setOnline(true);
        return setup(d);
      }
    }
    if (mode === 'rush') {
      const p = rushPuzzle(rushIndex.current, rushUsed.current);
      rushUsed.current.push(p.id);
      setOnline(true);
      setup(p);
      if (rushSeconds > 0) setDeadline((d) => d ?? Date.now() + rushSeconds * 1000);
      return;
    }
    const rating = mode === 'streak' ? 700 + streak * 60 : s.rating;
    const { puzzle: p, online: o } = await nextPuzzle(rating, s.seen, mode === 'theme' ? theme : undefined);
    if (!alive.current) return;
    setOnline(o);
    setup(p);
  }, [mode, setup, streak, theme, rushSeconds]);

  useEffect(() => {
    // Fetch the first puzzle on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** End of a Puzzle Rush (time up or out of lives): save the best score. */
  const endRush = async () => {
    setStatus('over');
    setDeadline(null);
    const s = await store.puzzleStats();
    const best = Math.max(s.rushBest?.[rushVariant.id] ?? 0, scoreRef.current);
    setRushBest(best);
    await store.savePuzzleStats({ ...s, rushBest: { ...s.rushBest, [rushVariant.id]: best } });
    if (settings.sound) playSound('end');
  };

  // Rush clock: tick, and finish when time runs out.
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => {
      const ts = Date.now();
      setNow(ts);
      if (ts >= deadline) {
        clearInterval(id);
        endRush();
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline]);

  /** Rush: record the result and go straight to the next puzzle. */
  const rushNext = async (solved: boolean) => {
    setRushLog((l) => [...l, solved]);
    if (solved) {
      scoreRef.current++;
      setScore(scoreRef.current);
    }
    const nextStrikes = strikes + (solved ? 0 : 1);
    setStrikes(nextStrikes);
    await wait(solved ? 350 : 700);
    if (!alive.current) return;
    if (nextStrikes >= RUSH_STRIKES) return endRush();
    if (rushSeconds > 0 && deadline !== null && Date.now() >= deadline) return;
    rushIndex.current++;
    load();
  };

  const restartRush = () => {
    rushIndex.current = 0;
    rushUsed.current = [];
    scoreRef.current = 0;
    setScore(0);
    setStrikes(0);
    setRushLog([]);
    setRushBest(null);
    setDeadline(null);
    load();
  };

  const recordResult = async (solved: boolean) => {
    if (!puzzle) return;
    const s = await store.puzzleStats();
    const next: PuzzleStats = { ...s, seen: [...s.seen, puzzle.id] };
    if (rated.current && mode === 'rated') {
      const games = s.solved + s.failed;
      const r = updateRating(s.rating, puzzle.rating, solved, games);
      setRatingDelta(r - s.rating);
      next.rating = r;
      if (solved) next.solved++;
      else next.failed++;
      next.streak = solved ? s.streak + 1 : 0;
      next.bestStreak = Math.max(s.bestStreak, next.streak);
    }
    if (mode === 'theme' && theme && solved) next.themeSolved = { ...s.themeSolved, [theme]: (s.themeSolved?.[theme] ?? 0) + 1 };
    rated.current = false;
    await store.savePuzzleStats(next);
    setStats(next);
  };

  const onMove = async (from: string, to: string, promotion?: string) => {
    if (!puzzle || status !== 'playing') return;
    const expected = puzzle.solution[step.current];
    let mv;
    try {
      mv = chess.current.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = from + to + (mv.promotion ?? '');
    setFen(chess.current.fen());
    setLastMove({ from, to });
    setArrows([]);
    // Any checkmating move is accepted, as alternative mates are equally valid.
    const correct = uci === expected || chess.current.isCheckmate();
    if (!correct) {
      if (settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setTimeout(() => playSound('illegal'), MOVE_SOUND_DELAY);
      setHighlights({ [to]: 'rgba(225,6,0,0.6)' });
      setStatus('wrong');
      if (mode === 'rush') return rushNext(false);
      if (mode === 'streak') {
        setStatus('over');
        await store.savePuzzleStats({ ...(await store.puzzleStats()), bestStreak: Math.max(stats?.bestStreak ?? 0, streak) });
        return;
      }
      await recordResult(false);
      return;
    }
    setHighlights({ [to]: 'rgba(30,158,87,0.55)' });
    step.current++;
    if (step.current >= puzzle.solution.length || chess.current.isCheckmate()) {
      if (settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setStatus('solved');
      if (mode === 'rush') return rushNext(true);
      if (mode === 'streak') setStreak((s) => s + 1);
      await recordResult(true);
      return;
    }
    setStatus('correct');
    await wait(450);
    if (!alive.current) return;
    const reply = puzzle.solution[step.current];
    const r = chess.current.move(uciToMove(reply));
    step.current++;
    setFen(chess.current.fen());
    setLastMove({ from: r.from, to: r.to });
    setHighlights({});
    setStatus('playing');
  };

  const retry = () => {
    if (!puzzle) return;
    const keepRated = rated.current;
    setup(puzzle);
    rated.current = keepRated && false;
  };

  const hint = () => {
    if (!puzzle || status !== 'playing') return;
    rated.current = mode === 'rated' ? rated.current : false;
    // Using a hint in rated mode counts as a failed attempt.
    if (mode === 'rated' && rated.current) recordResult(false);
    const exp = puzzle.solution[step.current];
    if (Object.keys(highlights).length === 0) setHighlights({ [exp.slice(0, 2)]: 'rgba(30,158,87,0.55)' });
    else setArrows([{ from: exp.slice(0, 2), to: exp.slice(2, 4) }]);
  };

  const showSolution = async () => {
    if (!puzzle) return;
    if (status === 'playing' && mode === 'rated' && rated.current) await recordResult(false);
    setStatus('failed');
    // Rewind to the start, then play the whole solution.
    const c = new Chess(puzzle.fen);
    chess.current = c;
    setFen(c.fen());
    setHighlights({});
    for (const u of puzzle.solution) {
      await wait(650);
      if (!alive.current) return;
      const m = c.move(uciToMove(u));
      setFen(c.fen());
      setLastMove({ from: m.from, to: m.to });
    }
  };

  const themes = (puzzle?.themes ?? []).map(themeLabel).filter(Boolean).slice(0, 3) as string[];
  const done = mode === 'rush' ? status === 'over' : status === 'solved' || status === 'failed' || status === 'wrong' || status === 'over';
  const timeLeft = deadline === null ? rushSeconds * 1000 : Math.max(0, deadline - now);
  const secsLeft = Math.ceil(timeLeft / 1000);
  const clock = `${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')}`;

  const banner = (() => {
    switch (status) {
      case 'loading': return { text: t('LOADING PUZZLE…'), bg: C.white, fg: C.ink };
      case 'playing': return { text: playerColor === 'w' ? t('WHITE TO MOVE — FIND THE BEST MOVE') : t('BLACK TO MOVE — FIND THE BEST MOVE'), bg: C.ink, fg: C.white };
      case 'correct': return { text: t('✓ CORRECT — KEEP GOING'), bg: C.good, fg: P.white };
      case 'solved': return { text: `${t('✓ SOLVED')}${ratingDelta !== null ? `   ${ratingDelta >= 0 ? '+' : ''}${ratingDelta}` : ''}`, bg: C.good, fg: P.white };
      case 'wrong': return { text: `${t('× NOT THE BEST MOVE')}${ratingDelta !== null ? `   ${ratingDelta}` : ''}`, bg: C.danger, fg: P.white };
      case 'failed': return { text: t('SOLUTION'), bg: C.white, fg: C.ink };
      case 'over':
        if (mode === 'rush') return { text: strikes >= RUSH_STRIKES ? t('THREE STRIKES — SCORE {score}', { score }) : t('TIME UP — SCORE {score}', { score }), bg: C.ink, fg: C.white };
        return { text: t('STREAK OVER — {n} SOLVED', { n: streak }), bg: C.danger, fg: P.white };
    }
  })();

  const title =
    mode === 'daily' ? t('DAILY PUZZLE')
    : mode === 'streak' ? t('PUZZLE STREAK · {n}', { n: streak })
    : mode === 'rush' ? t('PUZZLE RUSH · {label}', { label: t(rushVariant.label) })
    : mode === 'theme' && theme ? themeName(theme).toUpperCase()
    : t('RATED PUZZLES');

  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom }}>
      <Stack.Screen options={{ title }} />
      {mode === 'rush' ? (
        <View style={styles.header}>
          <View>
            <Text style={styles.small}>{t('SCORE')}</Text>
            <Text style={styles.big}>{score}</Text>
          </View>
          <View style={styles.strikes}>
            {Array.from({ length: RUSH_STRIKES }, (_, i) => (
              <View key={i} style={[styles.strike, i < strikes && { backgroundColor: C.danger, borderColor: C.danger }]}>
                <Text style={[styles.strikeText, i < strikes && { color: P.white }]}>×</Text>
              </View>
            ))}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.small}>{rushSeconds ? t('TIME') : t('PUZZLE')}</Text>
            <Text style={[styles.big, rushSeconds > 0 && timeLeft < 15000 && { color: C.danger }]}>{rushSeconds ? clock : rushLog.length + 1}</Text>
          </View>
        </View>
      ) : (
      <View style={styles.header}>
        <View>
          <Text style={styles.small}>{mode === 'rated' ? t('YOUR RATING') : mode === 'streak' ? t('STREAK') : t('TODAY')}</Text>
          <Text style={styles.big}>{mode === 'rated' ? (stats?.rating ?? '—') : mode === 'streak' ? streak : new Date().toLocaleDateString(lang() === 'de' ? 'de-DE' : undefined)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.small}>{t('PUZZLE')} {puzzle ? `#${puzzle.id}` : ''}{online ? '' : t(' · OFFLINE')}</Text>
          <Text style={styles.big}>{puzzle && (done || mode !== 'rated') ? puzzle.rating : '????'}</Text>
        </View>
      </View>
      )}
      <Banner text={banner.text} bg={banner.bg} fg={banner.fg} />
      {mode === 'rush' && (
        <View style={styles.rushLog}>
          {rushLog.slice(-24).map((ok, i) => (
            <View key={i} style={[styles.rushDot, { backgroundColor: ok ? C.good : C.danger }]} />
          ))}
        </View>
      )}
      <BoardFrame reserved={THEMES_H}>
        {(size) => (
          <>
            {status === 'loading' ? (
              <View style={{ width: size, height: size, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.ink }}>
                <ActivityIndicator color={C.ink} size="large" />
              </View>
            ) : (
              <View style={{ alignSelf: 'center' }}>
                <Board
                  fen={fen}
                  hideLastMoveArrow
                  size={size}
                  orientation={playerColor}
                  movable={status === 'playing' ? playerColor : null}
                  onMove={onMove}
                  lastMove={lastMove}
                  highlights={highlights}
                  arrows={arrows}
                />
              </View>
            )}
            <Text style={styles.themes} numberOfLines={1}>
              {mode === 'rush'
                ? status === 'over'
                  ? `${t('BEST {label}: {n}', { label: t(rushVariant.label), n: rushBest ?? score })}${rushBest !== null && score >= rushBest && score > 0 ? t(' · NEW RECORD') : ''}`
                  : puzzle ? t('RATING {n}', { n: puzzle.rating }) : ' '
                : done && themes.length > 0 ? themes.join(' · ').toUpperCase() : ' '}
            </Text>
          </>
        )}
      </BoardFrame>
      {done ? (
        <View style={styles.actions}>
          {/* Close: back to the Puzzles tab, however you got here (themes list, daily → more, …). */}
          <PressSlab onPress={() => router.dismissTo('/puzzles')} style={styles.close}>
            <Text style={styles.closeText} accessibilityLabel={t('Close')}>✕</Text>
          </PressSlab>
          {status === 'over' ? (
            <Btn title={t('Try again')} icon="↺" style={{ flex: 1 }} onPress={() => { if (mode === 'rush') return restartRush(); setStreak(0); load(); }} />
          ) : (
            <>
              {status === 'wrong' && <Btn kind="secondary" title={t('Retry')} style={{ flex: 1 }} onPress={retry} />}
              {status === 'wrong' && <Btn kind="secondary" title={t('Solution')} style={{ flex: 1 }} onPress={showSolution} />}
              {mode !== 'daily' && <Btn title={t('Next  →')} style={{ flex: 1 }} onPress={load} />}
              {mode === 'daily' && <Btn title={t('More puzzles  →')} style={{ flex: 1 }} onPress={() => router.replace({ pathname: '/puzzle', params: { mode: 'rated' } })} />}
            </>
          )}
        </View>
      ) : (
        <Toolbar>
          <IconBtn icon="?" label={t('Hint')} onPress={hint} disabled={status !== 'playing' || mode === 'streak' || mode === 'rush'} />
          <IconBtn icon="◎" label={t('Solution')} onPress={showSolution} disabled={status !== 'playing' || mode === 'streak' || mode === 'rush'} />
          <IconBtn icon="»" label={t('Skip')} onPress={load} disabled={mode === 'daily' || mode === 'streak' || mode === 'rush'} />
        </Toolbar>
      )}
      <Text style={styles.credit}>{t('PUZZLES: LICHESS OPEN DATABASE (CC0)')}</Text>
    </View>
  );
}

/** Full-width status strip that snaps in whenever its message changes. */
function Banner({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  const [v] = useState(() => new Animated.Value(1));
  const [shown, setShown] = useState(text);
  if (shown !== text) {
    setShown(text);
    v.setValue(0);
  }
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 10 }).start();
  }, [shown, v]);
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Animated.View style={{ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }] }}>
        <Text style={[styles.bannerText, { color: fg }]}>{text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 8 },
  small: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1.2, color: C.muted },
  big: { fontFamily: 'mono', fontWeight: '700', fontSize: 26 },
  banner: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: B.w, borderBottomWidth: B.w, borderColor: C.ink },
  bannerText: { fontFamily: 'mono', fontWeight: '700', fontSize: 13, letterSpacing: 1, textAlign: 'center' },
  themes: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1, color: C.muted, textAlign: 'center', height: THEMES_H, lineHeight: THEMES_H },
  actions: { flexDirection: 'row', gap: 6, padding: 14, paddingRight: 10, borderTopWidth: B.w, borderColor: C.ink },
  close: { width: 50, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: 'mono', fontWeight: '700', fontSize: 18, color: C.ink },
  strikes: { flexDirection: 'row', gap: 6, alignSelf: 'center' },
  strike: { width: 26, height: 26, borderWidth: B.w, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  strikeText: { fontFamily: 'mono', fontWeight: '700', fontSize: 16, lineHeight: 18 },
  rushLog: { flexDirection: 'row', gap: 3, paddingHorizontal: 14, paddingTop: 6, height: 14 },
  rushDot: { width: 8, height: 8 },
  credit: { fontFamily: 'mono', color: C.muted, fontSize: 8, letterSpacing: 1, textAlign: 'center', paddingVertical: 4 },
}));
