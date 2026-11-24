import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
  useWindowDimensions,
  Platform,
  type ScrollViewInstance,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { Pressable } from './Press';
import { hush, useSpeaking } from '../lib/voice';
import Svg, { Path, Line, Rect } from 'react-native-svg';
import { B, C, F, P, appTheme, themed } from '../lib/theme';
import { formatScore, winPct, CLASS_META, type Classification } from '../engine/analysis';
import { formatClock } from '../lib/clock';
import type { Score } from '../engine/EngineProvider';
import { Portrait, type Mood, type Who } from './Portrait';
import { PieceIcon } from './PieceIcon';
import { PIECE_ORDER, type PieceType } from '../lib/material';
import { ProfilePicture, type MyPicture } from './UserAvatar';
import { t } from '../lib/i18n';

/* ----------------------------------------------------------------------------------------------
 * Typography. Custom fonts ignore `fontWeight`, so map weight → family here. Use
 * `fontFamily: 'mono'` in a style to get Space Mono.
 * -------------------------------------------------------------------------------------------- */
export function Text({ style, ...rest }: TextProps) {
  const flat = StyleSheet.flatten(style) ?? {};
  const w = String(flat.fontWeight ?? '400');
  const heavy = w === 'bold' || Number(w) >= 600;
  const mono = flat.fontFamily === 'mono';
  const family = mono ? (heavy ? F.monoBold : F.mono) : heavy ? F.bold : F.regular;
  return <RNText {...rest} style={[{ color: C.text }, style, { fontFamily: family, fontWeight: 'normal' }]} />;
}

/* ----------------------------------------------------------------------------------------------
 * Surfaces: a bordered box with a hard, unblurred offset shadow.
 * -------------------------------------------------------------------------------------------- */
export function Slab({ children, style, outerStyle, shadow = B.shadow }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; outerStyle?: StyleProp<ViewStyle>; shadow?: number }) {
  return (
    <View style={[{ marginRight: shadow, marginBottom: shadow }, outerStyle]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.ink, transform: [{ translateX: shadow }, { translateY: shadow }] }]} />
      <View style={[styles.slab, style]}>{children}</View>
    </View>
  );
}

/** A slab that physically sinks into its shadow when pressed. */
export function PressSlab({
  children,
  onPress,
  style,
  outerStyle,
  disabled,
  shadow = B.shadow,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  outerStyle?: StyleProp<ViewStyle>;
  disabled?: boolean;
  shadow?: number;
}) {
  const [sink] = useState(() => new Animated.Value(0));
  const to = (v: number) => Animated.spring(sink, { toValue: v, useNativeDriver: true, speed: 40, bounciness: v ? 0 : 8 }).start();
  const shift = sink.interpolate({ inputRange: [0, 1], outputRange: [0, shadow] });
  return (
    <Pressable onPress={onPress} disabled={disabled} onPressIn={() => to(1)} onPressOut={() => to(0)} style={[{ marginRight: shadow, marginBottom: shadow, opacity: disabled ? 0.4 : 1 }, outerStyle]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.ink, transform: [{ translateX: shadow }, { translateY: shadow }] }]} />
      <Animated.View style={[styles.slab, style, { transform: [{ translateX: shift }, { translateY: shift }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Slab style={[{ padding: 14 }, style]}>{children}</Slab>;
}

/** Section label: small, mono, uppercase, letter-spaced. */
export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={styles.label}>{children}</Text>
    </View>
  );
}

/** Staggered entrance: slides up and fades in, `index` sets the delay. */
export function Rise({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 420, delay: 60 * index, easing: Easing.out(Easing.exp), useNativeDriver: true }).start();
  }, [v, index]);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Square monogram used instead of avatars: black tile with a white initial (or inverted). */
export function Monogram({ name, size = 40, inverted }: { name: string; size?: number; inverted?: boolean }) {
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View style={[styles.mono, { width: size, height: size, backgroundColor: inverted ? C.white : C.ink }]}>
      <Text style={{ color: inverted ? C.ink : C.white, fontSize: size * 0.5, fontWeight: '700', fontFamily: 'mono' }}>{letter}</Text>
    </View>
  );
}

/* ----------------------------------------------------------------------------------------------
 * Buttons
 * -------------------------------------------------------------------------------------------- */
export function Btn({
  title,
  onPress,
  kind = 'primary',
  icon,
  style,
  disabled,
  small,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  small?: boolean;
}) {
  const inner = (fg: string) => (
    <>
      {icon ? <Text style={[styles.btnIcon, { color: fg }, small && { fontSize: 14 }]}>{icon}</Text> : null}
      <Text style={[styles.btnText, { color: fg }, small && { fontSize: 13 }]} numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
    </>
  );
  if (kind === 'secondary') {
    return (
      <PressSlab onPress={onPress} disabled={disabled} outerStyle={style} style={[styles.btn, small && styles.btnSmall]}>
        {inner(C.ink)}
      </PressSlab>
    );
  }
  // Primary / danger: solid block that flips to its inverse while pressed.
  const solid = kind === 'danger' ? C.danger : C.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: pressed ? C.white : kind === 'ghost' ? 'transparent' : solid, borderWidth: B.w, borderColor: kind === 'ghost' ? 'transparent' : solid, opacity: disabled ? 0.35 : 1 },
        style,
      ]}
    >
      {({ pressed }) => inner(pressed || kind === 'ghost' ? solid : C.white)}
    </Pressable>
  );
}

/** Bottom toolbar container with a heavy top rule. */
export function Toolbar({ children }: { children: React.ReactNode }) {
  return <View style={styles.toolbar}>{children}</View>;
}

export function IconBtn({
  icon,
  label,
  onPress,
  disabled,
  hold,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Only fires after being held this long (ms); a quick tap just says "HOLD". For moves you can't take back. */
  hold?: number;
}) {
  if (hold) return <HoldIconBtn icon={icon} label={label} onPress={onPress} disabled={disabled} hold={hold} />;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: C.ink }, { opacity: disabled ? 0.3 : 1 }]}>
      {({ pressed }) => (
        <>
          <Text style={[styles.iconBtnIcon, pressed && { color: C.white }]}>{icon}</Text>
          <Text style={[styles.iconBtnLabel, pressed && { color: C.white }]} numberOfLines={1}>
            {label.toUpperCase()}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Icon button that has to be held down: it fills up while held and fires when full. */
function HoldIconBtn({ icon, label, onPress, disabled, hold }: { icon: string; label: string; onPress: () => void; disabled?: boolean; hold: number }) {
  const [fill] = useState(() => new Animated.Value(0));
  const [holding, setHolding] = useState(false);
  const [hint, setHint] = useState(false);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }, []);

  const start = () => {
    fired.current = false;
    setHolding(true);
    fill.setValue(0);
    Animated.timing(fill, { toValue: 1, duration: hold, easing: Easing.linear, useNativeDriver: false }).start();
  };
  const end = () => {
    setHolding(false);
    fill.stopAnimation();
    fill.setValue(0);
  };
  const tapped = () => {
    if (fired.current) return;
    // A quick tap: explain instead of acting.
    setHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), 2200);
  };
  const fire = () => {
    fired.current = true;
    end();
    setHint(false);
    onPress();
  };

  return (
    <Pressable
      onPressIn={start}
      onPressOut={end}
      onPress={tapped}
      onLongPress={fire}
      delayLongPress={hold}
      disabled={disabled}
      accessibilityHint={t('Hold to {label}', { label: label.toLowerCase() })}
      style={[styles.iconBtn, { opacity: disabled ? 0.3 : 1, overflow: 'hidden' }]}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: C.danger, transform: [{ scaleY: fill }], transformOrigin: 'bottom' }]}
      />
      <Text style={[styles.iconBtnIcon, holding && { color: P.white }]}>{icon}</Text>
      <Text style={[styles.iconBtnLabel, (holding || hint) && { color: holding ? P.white : C.danger }]} numberOfLines={1}>
        {hint ? t('HOLD TO {label}', { label: label.toUpperCase() }) : label.toUpperCase()}
      </Text>
    </Pressable>
  );
}

/* ----------------------------------------------------------------------------------------------
 * Chess widgets
 * -------------------------------------------------------------------------------------------- */
export const EVAL_BAR_WIDTH = 12;
export const TAG_HEIGHT = 40;

/** Vertical evaluation bar. White's share grows from the bottom when White is at the bottom. */
export function EvalBar({ score, height, flipped }: { score?: Score; height: number; flipped?: boolean }) {
  const pct = score ? (score.mate !== undefined ? (score.mate > 0 || (score.mate === 0 && score.cp > 0) ? 100 : 0) : winPct(score.cp)) : 50;
  const [anim] = useState(() => new Animated.Value(pct));
  useEffect(() => {
    Animated.timing(anim, { toValue: pct, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct, anim]);
  const whiteH = anim.interpolate({ inputRange: [0, 100], outputRange: [0, height - 2 * B.w] });
  const label = formatScore(score).replace('+', '');
  const whiteAhead = pct >= 50;
  return (
    <View style={[styles.evalBar, { height }]}>
      <Animated.View style={[styles.evalWhite, flipped ? { top: 0 } : { bottom: 0 }, { height: whiteH }]} />
      <Text style={[styles.evalText, whiteAhead !== !!flipped ? { bottom: 3, color: P.black } : { top: 3, color: P.white }]} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
    </View>
  );
}

export type MoveListItem = { san: string; classification?: Classification };

export function MoveList({ moves, current, onSelect }: { moves: MoveListItem[]; current: number; onSelect?: (ply: number) => void }) {
  const ref = useRef<ScrollViewInstance>(null);
  const pairX = useRef<number[]>([]);
  const viewW = useRef(0);
  // Keep the current move in view: the end for a live game, the selected move when browsing.
  useEffect(() => {
    if (current >= moves.length) {
      ref.current?.scrollToEnd({ animated: true });
      return;
    }
    const x = pairX.current[Math.floor(Math.max(0, current - 1) / 2)];
    if (x !== undefined) ref.current?.scrollTo({ x: Math.max(0, x - viewW.current / 2 + 50), animated: true });
  }, [current, moves.length]);
  const pairs = Array.from({ length: Math.ceil(moves.length / 2) }, (_, k) => k * 2).map((i) => (
      <View
        key={i}
        style={styles.movePair}
        onLayout={(e) => {
          const x = e.nativeEvent.layout.x;
          pairX.current[i / 2] = x;
          // The selected move was laid out after we tried to scroll to it (e.g. opening a review mid-game).
          if (current < moves.length && Math.floor(Math.max(0, current - 1) / 2) === i / 2) ref.current?.scrollTo({ x: Math.max(0, x - viewW.current / 2 + 50), animated: false });
        }}
      >
        <Text style={styles.moveNum}>{i / 2 + 1}.</Text>
        {[i, i + 1].map((j) =>
          moves[j] ? (
            <Pressable key={j} onPress={() => onSelect?.(j + 1)} style={[styles.moveItem, current === j + 1 && styles.moveItemActive]}>
              {moves[j].classification && ['brilliant', 'great', 'best', 'inaccuracy', 'mistake', 'miss', 'blunder'].includes(moves[j].classification!) ? (
                <View style={[styles.dot, { backgroundColor: CLASS_META[moves[j].classification!].color }]} />
              ) : null}
              <Text style={[styles.moveText, current === j + 1 && { color: C.white }]}>{moves[j].san}</Text>
            </Pressable>
          ) : null,
        )}
      </View>
  ));
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.moveList}
      contentContainerStyle={{ paddingHorizontal: 10, alignItems: 'center' }}
      onLayout={(e) => (viewW.current = e.nativeEvent.layout.width)}
    >
      {pairs.length ? pairs : <Text style={[styles.moveText, { color: C.muted }]}>{t('— NO MOVES YET —')}</Text>}
    </ScrollView>
  );
}

/** Small mono labels for moves and squares shown under a speech bubble (not spoken). */
export function Chips({ items, scroll }: { items: string[]; scroll?: boolean }) {
  const chips = items.map((item) => (
    <View key={item} style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>
        {item}
      </Text>
    </View>
  ));
  // `scroll`: keep them on one line and swipe sideways (for long lines like "LINE: …").
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.chips, { flexWrap: 'nowrap' }]} style={{ flexGrow: 0 }}>
      {chips}
    </ScrollView>
  ) : (
    <View style={styles.chips}>{chips}</View>
  );
}

/** Speaker + message box. The text slides in whenever it changes. */
/** SKIP ›: stop the character talking (shown only while someone is speaking). */
function SkipVoice() {
  const speaking = useSpeaking();
  if (!speaking) return null;
  return (
    <Pressable onPress={hush} hitSlop={10} style={({ pressed }) => [styles.skip, pressed && { backgroundColor: C.ink }]} accessibilityLabel={t('Skip line')}>
      {({ pressed }) => <Text style={[styles.skipText, pressed && { color: C.white }]}>{t('SKIP ›')}</Text>}
    </Pressable>
  );
}

export function SpeechBubble({
  name,
  text,
  children,
  who,
  mood,
  portraitSize = 56,
  badge,
  skippable,
}: {
  avatar?: string;
  name: string;
  text: string;
  color?: string;
  children?: React.ReactNode;
  /** Draw this character's portrait (with `mood`) instead of a monogram. */
  who?: Who;
  mood?: Mood;
  portraitSize?: number;
  /** Small tag shown next to the name (e.g. the move's classification). */
  badge?: React.ReactNode;
  /** Show a SKIP button while a voice line is playing. */
  skippable?: boolean;
}) {
  const [v] = useState(() => new Animated.Value(1));
  const [shown, setShown] = useState(text);
  if (shown !== text) {
    setShown(text);
    v.setValue(0);
  }
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [shown, v]);
  return (
    <View style={styles.bubbleRow}>
      {who ? <Portrait who={who} size={portraitSize} mood={mood} talkKey={text} /> : <Monogram name={name} size={42} />}
      <Slab outerStyle={{ flex: 1 }} style={styles.bubble}>
        <View style={styles.bubbleHead}>
          <Text style={styles.bubbleName} numberOfLines={1}>
            {name.toUpperCase()}
          </Text>
          <View style={styles.bubbleTags}>
            {badge}
            {skippable && <SkipVoice />}
          </View>
        </View>
        <Animated.View style={{ opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
          <Text style={styles.bubbleText}>{text}</Text>
          {children}
        </Animated.View>
      </Slab>
    </View>
  );
}

/**
 * Fills the remaining vertical space and hands its children the largest board size that fits
 * (rounded down to a multiple of 8 so squares land on whole points).
 */
export function BoardFrame({ reserved = 0, inset = 0, children }: { reserved?: number; inset?: number; children: (size: number) => React.ReactNode }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const size = Math.floor(Math.max(0, Math.min(box.w - inset, box.h - reserved)) / 8) * 8;
  return (
    <View style={styles.frame} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {box.h > 0 ? children(size) : null}
    </View>
  );
}

/**
 * Wide screens (desktop window, tablet in landscape): board on the left, everything else in a
 * side panel, instead of one tall phone column with empty space either side.
 */
export function useWide(): boolean {
  const { width, height } = useWindowDimensions();
  return width >= 820 && width > height * 1.15;
}

/** Desktop: ← / → step through the moves (does nothing on phones). */
export function ArrowKeys({ onLeft, onRight }: { onLeft: () => void; onRight: () => void }) {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const w = globalThis as unknown as {
      addEventListener: (t: string, f: (e: { key: string; target?: { tagName?: string } }) => void) => void;
      removeEventListener: (t: string, f: (e: { key: string; target?: { tagName?: string } }) => void) => void;
    };
    const onKey = (e: { key: string; target?: { tagName?: string } }) => {
      if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') onLeft();
      else if (e.key === 'ArrowRight') onRight();
    };
    w.addEventListener('keydown', onKey);
    return () => w.removeEventListener('keydown', onKey);
  }, [onLeft, onRight]);
  return null;
}

/**
 * The board column on wide screens: only as wide as the board it holds (the board's size follows
 * the column height), so board and side panel sit together in the middle of the window.
 * `reserved` / `inset` as for BoardFrame.
 */
export function WideBoard({ reserved, inset = 0, children }: { reserved: number; inset?: number; children: React.ReactNode }) {
  const [h, setH] = useState(0);
  return (
    <View style={{ flex: 1, maxWidth: h ? Math.max(240, h - reserved + inset) : undefined }} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      {children}
    </View>
  );
}

/** Width of the side panel next to the board on wide screens. */
export const SIDE_PANEL = 400;

/** The move list as a table ("1. e4 e5"), for the side panel on wide screens. */
export function MoveTable({ moves, current, onSelect }: { moves: MoveListItem[]; current: number; onSelect?: (ply: number) => void }) {
  const ref = useRef<ScrollViewInstance>(null);
  const rowY = useRef<number[]>([]);
  const viewH = useRef(0);
  useEffect(() => {
    if (current >= moves.length) {
      ref.current?.scrollToEnd({ animated: true });
      return;
    }
    const y = rowY.current[Math.floor(Math.max(0, current - 1) / 2)];
    if (y !== undefined) ref.current?.scrollTo({ y: Math.max(0, y - viewH.current / 2), animated: true });
  }, [current, moves.length]);
  const rows = Array.from({ length: Math.ceil(moves.length / 2) }, (_, k) => k * 2);
  return (
    <ScrollView ref={ref} style={styles.moveTable} onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}>
      {rows.length ? (
        rows.map((i) => (
          <View key={i} style={[styles.moveRow, (i / 2) % 2 === 1 && { backgroundColor: C.paper }]} onLayout={(e) => (rowY.current[i / 2] = e.nativeEvent.layout.y)}>
            <Text style={styles.moveRowNum}>{i / 2 + 1}.</Text>
            {[i, i + 1].map((j) => {
              const m = moves[j];
              if (!m) return <View key={j} style={styles.moveCell} />;
              const meta = m.classification ? CLASS_META[m.classification] : null;
              const marked = !!meta && !['best', 'excellent', 'good', 'book', 'forced'].includes(m.classification!);
              return (
                <Pressable key={j} onPress={() => onSelect?.(j + 1)} style={[styles.moveCell, current === j + 1 && styles.moveItemActive]}>
                  {marked ? (
                    <View style={[styles.moveSym, { backgroundColor: meta!.color }]}>
                      <Text style={styles.moveSymText}>{meta!.symbol}</Text>
                    </View>
                  ) : null}
                  <Text style={[styles.moveText, current === j + 1 && { color: C.white }]}>{m.san}</Text>
                </Pressable>
              );
            })}
          </View>
        ))
      ) : (
        <Text style={[styles.moveText, { color: C.muted, padding: 12 }]}>{t('— NO MOVES YET —')}</Text>
      )}
    </ScrollView>
  );
}

export type ClockProp = { ms: number; running: boolean; since?: number };

/**
 * A chess clock that ticks on its own, so the screen around it (and the board) doesn't have to
 * redraw ten times a second — that made taps lag on real phones.
 */
const ClockFace = React.memo(function ClockFace({ ms, running, since }: ClockProp) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = running && since !== undefined;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [ticking]);
  const left = ticking ? Math.max(0, ms - Math.max(0, now - since!)) : ms;
  const low = running && left < 20_000;
  return (
    <View style={[styles.clock, running && styles.clockRunning, low && styles.clockLow]}>
      <Text style={[styles.clockText, running && { color: C.white }]}>{formatClock(left)}</Text>
    </View>
  );
});

export function PlayerTag({
  name,
  sub,
  active,
  right,
  clock,
  self,
  who,
  mood,
  me,
  flair,
  flag,
  captured,
}: {
  avatar?: string;
  name: string;
  sub?: string;
  color?: string;
  active?: boolean;
  right?: string;
  /** Time left: `ms` as of `since` (epoch ms). A running clock counts down by itself. */
  clock?: ClockProp;
  /** Draw the monogram inverted (used for the human player). */
  self?: boolean;
  /** Show this character's portrait instead of a monogram. */
  who?: Who;
  mood?: Mood;
  /** The player's own photo / avatar (shown instead of a monogram when set). */
  me?: MyPicture;
  /** Lichess flair id (e.g. "activity.lichess-horsey"), shown next to the name. */
  flair?: string;
  /** Lichess country / flag code, shown next to the name. */
  flag?: string;
  /** Pieces this player has captured, and their material lead (shown under the name). */
  captured?: { pieces: PieceType[]; color: 'w' | 'b'; lead: number };
}) {
  return (
    <View style={styles.playerTag}>
      {me && (me.photo || me.avatar) ? <ProfilePicture me={me} size={30} /> : who ? <Portrait who={who} size={30} mood={mood} /> : <Monogram name={name} size={28} inverted={self} />}
      <View style={styles.playerMid}>
        <View style={styles.playerRow}>
          <Text style={styles.playerName} numberOfLines={1}>
            {name.toUpperCase()}
          </Text>
          {flair ? <Image source={{ uri: `https://lichess1.org/assets/flair/img/${flair}.webp` }} style={{ width: 18, height: 18 }} /> : null}
          {flag ? <Image source={{ uri: `https://lichess1.org/assets/flags/${encodeURIComponent(flag)}.webp` }} style={{ width: 20, height: 20 }} accessibilityLabel={t('Flag: {code}', { code: flag.replace(/^_/, '') })} /> : null}
          {sub ? <Text style={styles.playerSub} numberOfLines={1}>{sub}</Text> : null}
          {active ? <View style={styles.activeMark} /> : null}
        </View>
        {captured && (captured.pieces.length > 0 || captured.lead > 0) ? <CapturedRow {...captured} /> : null}
      </View>
      {right ? <Text style={styles.tagRight} numberOfLines={1}>{right}</Text> : null}
      {clock ? <ClockFace {...clock} /> : null}
    </View>
  );
}

/** The pieces a player has taken (same kinds overlap, like a little stack), then "+3" if ahead. */
export function CapturedRow({ pieces, color, lead, size = 15 }: { pieces: PieceType[]; color: 'w' | 'b'; lead: number; size?: number }) {
  // `color` is the capturing player; the pieces drawn are the opponent's.
  const them = color === 'w' ? 'b' : 'w';
  // Black pieces would vanish on the black theme's page: sit them on a light-grey strip.
  const backing = appTheme() === 'black' && them === 'b' && pieces.length > 0 ? { backgroundColor: '#C7C7C7', paddingHorizontal: 3 } : null;
  return (
    <View style={[styles.capRow, backing]}>
      {PIECE_ORDER.map((kind) => {
        const n = pieces.filter((p) => p === kind).length;
        if (!n) return null;
        return (
          <View key={kind} style={{ flexDirection: 'row', marginRight: 3 }}>
            {Array.from({ length: n }, (_, i) => (
              <View key={i} style={{ marginLeft: i ? -size * 0.55 : 0 }}>
                <PieceIcon code={them + kind} size={size} />
              </View>
            ))}
          </View>
        );
      })}
      {lead > 0 ? <Text style={styles.capLead}>+{lead}</Text> : null}
    </View>
  );
}

/** Evaluation graph used in Game Review: White's share in white, Black's in black. */
export function EvalGraph({ evals, width, height, current, onSelect }: { evals: Score[]; width: number; height: number; current: number; onSelect?: (i: number) => void }) {
  if (evals.length < 2) return null;
  const pts = evals.map((s, i) => {
    const w = s.mate !== undefined ? (s.cp > 0 ? 100 : 0) : winPct(s.cp);
    return { x: (i / (evals.length - 1)) * width, y: height - (w / 100) * height };
  });
  const d = `M0,${height} ` + pts.map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` L${width},${height} Z`;
  const cx = pts[Math.min(current, pts.length - 1)];
  return (
    <Pressable onPress={(e) => onSelect?.(Math.round((e.nativeEvent.locationX / width) * (evals.length - 1)))} style={{ width, height, borderWidth: B.w, borderColor: C.ink, backgroundColor: P.black }}>
      <Svg width={width - 2 * B.w} height={height - 2 * B.w} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <Path d={d} fill={P.white} />
        <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#8a8a8a" strokeWidth={1} strokeDasharray="3,3" />
        {cx && <Rect x={cx.x - 1.5} y={0} width={3} height={height} fill={C.danger} />}
      </Svg>
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  slab: { backgroundColor: C.card, borderWidth: B.w, borderColor: C.ink },
  label: { fontFamily: 'mono', fontSize: 11, letterSpacing: 1.5, color: C.muted, textTransform: 'uppercase' },
  mono: { alignItems: 'center', justifyContent: 'center', borderWidth: B.w, borderColor: C.ink },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 10 },
  btnText: { fontSize: 15, fontWeight: '700', letterSpacing: 1.2 },
  btnIcon: { fontSize: 17, fontWeight: '700' },
  toolbar: { flexDirection: 'row', backgroundColor: C.white, borderTopWidth: B.w, borderColor: C.ink },
  iconBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 5 },
  iconBtnIcon: { fontSize: 20, fontWeight: '700', lineHeight: 24 },
  iconBtnLabel: { fontFamily: 'mono', fontSize: 9, letterSpacing: 0.8, marginTop: 2 },
  evalBar: { width: EVAL_BAR_WIDTH, backgroundColor: P.black, borderWidth: B.w, borderColor: C.ink, overflow: 'hidden' },
  evalWhite: { position: 'absolute', left: 0, right: 0, backgroundColor: P.white },
  evalText: { position: 'absolute', left: 0, right: 0, fontFamily: 'mono', fontWeight: '700', fontSize: 7, textAlign: 'center' },
  moveList: { maxHeight: 36, minHeight: 36, backgroundColor: C.white, borderBottomWidth: B.w, borderColor: C.ink },
  movePair: { flexDirection: 'row', alignItems: 'center', marginRight: 8 },
  moveNum: { fontFamily: 'mono', color: C.muted, fontSize: 13, marginRight: 2 },
  moveItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 3 },
  moveItemActive: { backgroundColor: C.ink },
  moveText: { fontFamily: 'mono', fontWeight: '700', fontSize: 14 },
  dot: { width: 7, height: 7, marginRight: 4, borderWidth: 1, borderColor: C.ink },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12 },
  bubble: { paddingHorizontal: 12, paddingVertical: 9 },
  bubbleHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 3, minHeight: 18 },
  bubbleName: { flexShrink: 1, fontFamily: 'mono', fontSize: 10, letterSpacing: 1.5, color: C.muted },
  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTags: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  skip: { borderWidth: 1.5, borderColor: C.ink, paddingHorizontal: 6, paddingVertical: 1 },
  skipText: { fontFamily: 'mono', fontWeight: '700', fontSize: 10, letterSpacing: 1 },
  frame: { flex: 1, justifyContent: 'center', overflow: 'hidden' },
  moveTable: { flex: 1, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  moveRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, height: 30 },
  moveRowNum: { width: 40, fontFamily: 'mono', color: C.muted, fontSize: 12 },
  moveCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, height: 26, paddingHorizontal: 6 },
  moveSym: { minWidth: 18, height: 16, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center' },
  moveSymText: { color: '#fff', fontFamily: 'mono', fontWeight: '700', fontSize: 9 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  chip: { borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '100%' },
  chipText: { fontFamily: 'mono', fontWeight: '700', fontSize: 10, letterSpacing: 0.5 },
  playerTag: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: TAG_HEIGHT },
  playerMid: { flex: 1, minWidth: 0, justifyContent: 'center' },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  capRow: { flexDirection: 'row', alignItems: 'center', height: 16, marginTop: 1 },
  capLead: { fontFamily: 'mono', fontSize: 11, color: C.muted, marginLeft: 2 },
  playerName: { flexShrink: 1, fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  playerSub: { fontFamily: 'mono', color: C.muted, fontSize: 12 },
  activeMark: { width: 8, height: 8, backgroundColor: C.ink },
  tagRight: { flexShrink: 1, maxWidth: '45%', textAlign: 'right', fontFamily: 'mono', color: C.muted, fontSize: 11 },
  clock: { minWidth: 88, height: 32, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  clockRunning: { backgroundColor: C.ink },
  clockLow: { backgroundColor: C.danger, borderColor: C.danger },
  clockText: { fontFamily: 'mono', fontWeight: '700', fontSize: 19, fontVariant: ['tabular-nums'] },
}));
