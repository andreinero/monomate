import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable as RNPressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../components/Press';
import { Btn, Text } from '../components/ui';
import { formatClock, newClock, pressClock, remaining, stopClock, switchClock, type Clock, type Side } from '../lib/clock';
import { buzz, tap } from '../lib/haptics';
import { playSound } from '../lib/sound';
import { B, C, P, themed } from '../lib/theme';
import { t } from '../lib/i18n';

/**
 * A chess clock for games on a real board: the phone lies between the players, each half faces
 * one of them (the top half is upside down), and you tap your half after your move. The first tap
 * starts the other player's clock, the way Black starts White's clock on a real one.
 */
type TC = { min: number; inc: number };
const PRESETS: TC[] = [
  { min: 1, inc: 0 },
  { min: 3, inc: 0 },
  { min: 3, inc: 2 },
  { min: 5, inc: 0 },
  { min: 5, inc: 3 },
  { min: 10, inc: 0 },
  { min: 10, inc: 5 },
  { min: 15, inc: 10 },
  { min: 30, inc: 0 },
  { min: 60, inc: 0 },
];
const KEY = 'gambit.chessclock.v1';
const LOW_MS = 10_000;
// The bottom half is 'w', the top half 'b' (just labels: whoever sits there).
const other = (s: Side): Side => (s === 'w' ? 'b' : 'w');
const tcLabel = (tc: TC) => (tc.inc ? `${tc.min} | ${tc.inc}` : t('{n} min', { n: tc.min }));
const fresh = (tc: TC) => newClock(tc.min * 60_000, tc.inc * 1000);
const clockTime = () => Date.now();

export default function ChessClock() {
  useKeepAwake(); // the screen must stay on for the whole game
  const insets = useSafeAreaInsets();
  const [tc, setTc] = useState<TC>({ min: 10, inc: 0 });
  const [clock, setClock] = useState<Clock>(() => fresh({ min: 10, inc: 0 }));
  const [moves, setMoves] = useState({ w: 0, b: 0 });
  // Whose clock was running when paused (null: not paused).
  const [paused, setPaused] = useState<Side | null>(null);
  const [flagged, setFlagged] = useState<Side | null>(null);
  const [picking, setPicking] = useState(false);
  // The time the display shows (refreshed ten times a second while a clock runs).
  const [now, setNow] = useState(clockTime);
  const clockRef = useRef(clock);
  useEffect(() => {
    clockRef.current = clock;
  }, [clock]);

  // The last time control used.
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        const v = raw ? (JSON.parse(raw) as TC) : null;
        if (v && v.min > 0) {
          setTc(v);
          setClock(fresh(v));
        }
      })
      .catch(() => {});
  }, []);

  // Redraw ten times a second while a clock runs, and catch the flag.
  const running = clock.turn;
  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      const c = clockRef.current;
      const t0 = clockTime();
      if (c.turn && remaining(c, c.turn, t0) <= 0) {
        setFlagged(c.turn);
        setClock(stopClock(c, t0));
        playSound('end');
        buzz();
      }
      setNow(t0);
    }, 100);
    return () => clearInterval(iv);
  }, [running]);

  const started = clock.turn !== null || paused !== null || moves.w + moves.b > 0;

  /** `side` tapped their half: their move is done, the other clock starts. */
  const press = (side: Side) => {
    if (flagged || paused || picking) return;
    const c = clock;
    // Only the player whose clock runs can press (or anyone, to start the game).
    if (c.turn !== null && c.turn !== side) return;
    tap();
    playSound('move');
    const t0 = clockTime();
    setClock(pressClock(c, side, other(side), t0));
    setNow(t0);
    if (c.turn !== null) setMoves((m) => ({ ...m, [side]: m[side] + 1 }));
  };

  const pause = () => {
    if (!clock.turn) return;
    const t0 = clockTime();
    setPaused(clock.turn);
    setClock(stopClock(clock, t0));
    setNow(t0);
  };
  const resume = () => {
    if (!paused) return;
    const t0 = clockTime();
    setClock(switchClock(clock, paused, t0));
    setNow(t0);
    setPaused(null);
  };

  const reset = (next = tc) => {
    setClock(fresh(next));
    setMoves({ w: 0, b: 0 });
    setPaused(null);
    setFlagged(null);
  };
  const askReset = () => {
    if (!started || flagged) return reset();
    if (clock.turn) pause();
    Alert.alert(t('Reset the clock?'), t('Both players start again with {tc}.', { tc: tcLabel(tc) }), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Reset clock'), style: 'destructive', onPress: () => reset() },
    ]);
  };

  const choose = (next: TC) => {
    setTc(next);
    reset(next);
    setPicking(false);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };
  const openPicker = () => {
    if (clock.turn) pause();
    setPicking(true);
  };

  const leave = () => {
    if (!started || flagged) return router.back();
    if (clock.turn) pause();
    Alert.alert(t('Leave the clock?'), t('The game’s times are lost.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Leave'), style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const half = (side: Side) => {
    const ms = remaining(clock, side, now);
    const active = clock.turn === side;
    const lost = flagged === side;
    const low = active && ms < LOW_MS;
    const bg = lost || low ? C.danger : active ? C.ink : C.bg;
    const fg = lost || low ? P.white : active ? C.bg : C.ink;
    const hint = lost
      ? t('TIME IS UP')
      : paused
        ? t('PAUSED')
        : !started
          ? t('TAP AFTER YOUR MOVE')
          : active
            ? t('YOUR MOVE')
            : '';
    return (
      <RNPressable
        onPressIn={() => press(side)}
        style={[styles.half, { backgroundColor: bg }, side === 'b' && styles.flip]}
        accessibilityRole="button"
        accessibilityLabel={`${side === 'w' ? t('Bottom player') : t('Top player')}: ${formatClock(ms)}`}
      >
        <Text style={[styles.time, { color: fg }]} numberOfLines={1} adjustsFontSizeToFit>
          {formatClock(ms)}
        </Text>
        <View style={styles.meta}>
          <Text style={[styles.metaText, { color: fg }]}>{t('MOVES {n}', { n: moves[side] })}</Text>
          {hint ? <Text style={[styles.metaText, { color: fg }]}>{hint}</Text> : null}
        </View>
      </RNPressable>
    );
  };

  return (
    <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {half('b')}
      <View style={styles.bar}>
        <BarBtn icon="✕" label={t('Close')} onPress={leave} />
        <BarBtn icon="↺" label={t('Reset')} onPress={askReset} />
        {paused ? (
          <BarBtn icon="▶" label={t('Resume')} onPress={resume} wide />
        ) : (
          <BarBtn icon="❚❚" label={t('Pause')} onPress={pause} wide disabled={!clock.turn} />
        )}
        <Pressable onPress={openPicker} style={styles.tcBtn} accessibilityLabel={t('Time control')}>
          <Text style={styles.tcText} numberOfLines={1}>
            {tcLabel(tc)}
          </Text>
        </Pressable>
      </View>
      {half('w')}

      {picking && <Picker current={tc} onPick={choose} onClose={() => setPicking(false)} />}
    </View>
  );
}

function BarBtn({ icon, label, onPress, wide, disabled }: { icon: string; label: string; onPress: () => void; wide?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.barBtn, wide && { flex: 1 }]} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={[styles.barIcon, disabled && { opacity: 0.35 }]}>{icon}</Text>
    </Pressable>
  );
}

/** Presets, plus your own minutes and increment. */
function Picker({ current, onPick, onClose }: { current: TC; onPick: (tc: TC) => void; onClose: () => void }) {
  const [min, setMin] = useState(current.min);
  const [inc, setInc] = useState(current.inc);
  const step = (v: number, d: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v + d));
  return (
    <View style={styles.overlay}>
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>{t('TIME CONTROL')}</Text>
        <ScrollView contentContainerStyle={styles.presets}>
          {PRESETS.map((p) => {
            const on = p.min === current.min && p.inc === current.inc;
            return (
              <Pressable key={`${p.min}_${p.inc}`} onPress={() => onPick(p)} style={[styles.preset, on && { backgroundColor: C.ink }]}>
                <Text style={[styles.presetText, on && { color: C.bg }]}>{tcLabel(p)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text style={styles.customLabel}>{t('CUSTOM')}</Text>
        <Stepper label={t('Minutes')} value={min} onMinus={() => setMin(step(min, min > 10 ? -5 : -1, 1, 180))} onPlus={() => setMin(step(min, min >= 10 ? 5 : 1, 1, 180))} />
        <Stepper label={t('Increment (seconds)')} value={inc} onMinus={() => setInc(step(inc, -1, 0, 60))} onPlus={() => setInc(step(inc, 1, 0, 60))} />
        <View style={styles.sheetBtns}>
          <Btn title={t('Cancel')} kind="secondary" onPress={onClose} style={{ flex: 1 }} />
          <Btn title={t('Use {tc}', { tc: tcLabel({ min, inc }) })} onPress={() => onPick({ min, inc })} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <View style={styles.stepper}>
      <Text style={styles.stepLabel}>{label}</Text>
      <Pressable onPress={onMinus} style={styles.stepBtn} accessibilityLabel={`${label} −`}>
        <Text style={styles.stepIcon}>−</Text>
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={onPlus} style={styles.stepBtn} accessibilityLabel={`${label} +`}>
        <Text style={styles.stepIcon}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: C.bg },
    half: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
    flip: { transform: [{ rotate: '180deg' }] },
    time: { fontFamily: 'mono', fontWeight: '700', fontSize: 96, letterSpacing: -2 },
    meta: { position: 'absolute', bottom: 16, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' },
    metaText: { fontFamily: 'mono', fontSize: 12, letterSpacing: 1.2, fontWeight: '700' },
    bar: { flexDirection: 'row', alignItems: 'stretch', borderTopWidth: B.w, borderBottomWidth: B.w, borderColor: C.ink, backgroundColor: C.bg, height: 56 },
    barBtn: { width: 64, alignItems: 'center', justifyContent: 'center', borderRightWidth: B.w, borderColor: C.ink },
    barIcon: { fontSize: 22, fontWeight: '700', color: C.ink },
    tcBtn: { minWidth: 96, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
    tcText: { fontFamily: 'mono', fontWeight: '700', fontSize: 15, color: C.ink },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 },
    sheet: { backgroundColor: C.bg, borderWidth: B.w, borderColor: C.ink, padding: 16, gap: 12, maxHeight: '90%' },
    sheetTitle: { fontWeight: '700', fontSize: 18, letterSpacing: 0.5 },
    presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    preset: { borderWidth: B.w, borderColor: C.ink, paddingVertical: 10, width: '30%', flexGrow: 1, alignItems: 'center' },
    presetText: { fontFamily: 'mono', fontWeight: '700', fontSize: 15 },
    customLabel: { fontFamily: 'mono', fontSize: 11, letterSpacing: 1.3, color: C.muted, marginTop: 4 },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepLabel: { flex: 1, fontSize: 15 },
    stepBtn: { width: 44, height: 44, borderWidth: B.w, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
    stepIcon: { fontSize: 22, fontWeight: '700' },
    stepValue: { fontFamily: 'mono', fontWeight: '700', fontSize: 18, minWidth: 40, textAlign: 'center' },
    sheetBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  }),
);
