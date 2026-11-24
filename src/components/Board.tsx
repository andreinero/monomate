import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { Pressable } from './Press';
import Svg, { Polygon } from 'react-native-svg';
import { PieceIcon } from './PieceIcon';
import { Chess, type Square } from 'chess.js';
import { B, BOARD_THEMES, C, HIGHLIGHT, themed } from '../lib/theme';
import { Text } from './ui';
import { playSound, setSoundEnabled } from '../lib/sound';
import { tap } from '../lib/haptics';
import { useSettings } from '../lib/storage';
import { diffPositions, soundFor, type MoveAnim } from './boardDiff';

export type Arrow = { from: string; to: string; color?: string };

/** Shape options: `scale` thins the arrow, `tipGap` stops it short of the target square's centre. */
type ArrowShape = { scale?: number; tipGap?: number };

/**
 * Outline of a flat, hard-edged arrow: a square-ended shaft and a sharp head, as one polygon.
 * Knight moves get an L-shaped arrow (long leg first), the way the knight actually travels.
 */
export function arrowOutline(from: string, to: string, orientation: 'w' | 'b', sq: number, shape: ArrowShape = {}): [number, number][] {
  const f = squarePos(from, orientation);
  const t = squarePos(to, orientation);
  const c = (p: { col: number; row: number }): [number, number] => [(p.col + 0.5) * sq, (p.row + 0.5) * sq];
  const [x1, y1] = c(f);
  const [x2, y2] = c(t);
  const dc = t.col - f.col, dr = t.row - f.row;
  const knight = (Math.abs(dc) === 1 && Math.abs(dr) === 2) || (Math.abs(dc) === 2 && Math.abs(dr) === 1);
  const k = shape.scale ?? 1;
  const w = sq * 0.2 * k; // shaft
  const H = sq * 0.54 * k; // head width
  const h = sq * 0.38 * k; // head length
  const unit = (dx: number, dy: number): [number, number] => {
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const add = (p: [number, number], v: [number, number], k: number): [number, number] => [p[0] + v[0] * k, p[1] + v[1] * k];
  const left = (v: [number, number]): [number, number] => [-v[1], v[0]];
  const target: [number, number] = [x2, y2];
  // The last leg (towards the tip) and where it starts.
  const corner: [number, number] | null = knight ? (Math.abs(dr) === 2 ? [x1, y2] : [x2, y1]) : null;
  const legStart: [number, number] = corner ?? [x1, y1];
  const v = unit(target[0] - legStart[0], target[1] - legStart[1]);
  const tip = add(target, v, -(shape.tipGap ?? 0));
  const nv = left(v);
  const base = add(tip, v, -h);
  const head: [number, number][] = [add(base, nv, w / 2), add(base, nv, H / 2), tip, add(base, nv, -H / 2), add(base, nv, -w / 2)];
  // Start a little off the piece's centre so the piece stays visible.
  const tailGap = sq * 0.28;
  if (!corner) {
    const s0 = add([x1, y1], v, tailGap);
    return [add(s0, nv, w / 2), ...head, add(s0, nv, -w / 2)];
  }
  const u = unit(corner[0] - x1, corner[1] - y1);
  const nu = left(u);
  const s0 = add([x1, y1], u, tailGap);
  // Mitered outer/inner corners of the L.
  const kl = add(add(corner, nu, w / 2), nv, w / 2);
  const kr = add(add(corner, nu, -w / 2), nv, -w / 2);
  return [add(s0, nu, w / 2), kl, ...head, kr, add(s0, nu, -w / 2)];
}
export type Badge = { square: string; color: string; symbol: string };

type Props = {
  fen: string;
  size: number;
  orientation?: 'w' | 'b';
  /** Which side the user may move. null = view only. */
  movable?: 'w' | 'b' | 'both' | null;
  onMove?: (from: string, to: string, promotion?: string) => void;
  lastMove?: { from: string; to: string } | null;
  arrows?: Arrow[];
  highlights?: Record<string, string>;
  badge?: Badge | null;
  /** Animate moves without the move sounds (e.g. the review "scanning" through a game). */
  silent?: boolean;
  /** Live games: no last-move arrow (the from/to squares are still tinted). */
  hideLastMoveArrow?: boolean;
};

const FILES = 'abcdefgh';

function squareAt(col: number, row: number, orientation: 'w' | 'b'): string {
  const file = orientation === 'w' ? col : 7 - col;
  const rank = orientation === 'w' ? 7 - row : row;
  return FILES[file] + (rank + 1);
}

function squarePos(sq: string, orientation: 'w' | 'b') {
  const file = FILES.indexOf(sq[0]);
  const rank = Number(sq[1]) - 1;
  const col = orientation === 'w' ? file : 7 - file;
  const row = orientation === 'w' ? 7 - rank : rank;
  return { col, row };
}

const MOVE_MS = 220;

const PieceView = PieceIcon;

const NO_ARROWS: Arrow[] = [];

/** Only redraws when something it shows changes (not on every clock tick of the screen around it). */
export const Board = memo(BoardView);

function BoardView({
  fen,
  size,
  orientation = 'w',
  movable = null,
  onMove,
  lastMove,
  arrows,
  highlights,
  badge,
  silent,
  hideLastMoveArrow,
}: Props) {
  const settings = useSettings();
  // Last move as a white arrow (under any hint arrows), like the move markers on big chess sites.
  const allArrows: (Arrow & { last?: boolean })[] = [
    ...(!hideLastMoveArrow && settings.lastMoveArrow !== false && lastMove && lastMove.from !== lastMove.to ? [{ from: lastMove.from, to: lastMove.to, color: C.white, last: true }] : []),
    ...(arrows ?? NO_ARROWS),
  ];
  const theme = BOARD_THEMES[settings.boardTheme] ?? BOARD_THEMES.mono;
  const monoBoard = settings.boardTheme === 'mono' || settings.boardTheme === 'concrete' || !BOARD_THEMES[settings.boardTheme];
  const sq = size / 8;
  const chess = useMemo(() => {
    try {
      return new Chess(fen);
    } catch {
      return new Chess();
    }
  }, [fen]);
  const board = chess.board();
  const turn = chess.turn();
  const canMove = movable === 'both' || movable === turn;

  // Selection and pending promotion only apply to the position they were made in.
  const [sel, setSel] = useState<{ fen: string; sq: string } | null>(null);
  const [promoState, setPromoState] = useState<{ fen: string; from: string; to: string } | null>(null);
  const [dragFrom, setDragFrom] = useState<string | null>(null);
  const [dragPos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const start = useRef({ x: 0, y: 0, sq: '' as string, wasSelected: false });
  const selected = sel?.fen === fen ? sel.sq : null;
  const promo = promoState?.fen === fen ? promoState : null;
  // The touch handlers read the selection from this ref, which changes the moment you tap —
  // so quick taps work even when the screen hasn't caught up yet.
  const selNow = useRef<{ fen: string; sq: string } | null>(null);
  const setSelected = (sq: string | null) => {
    selNow.current = sq ? { fen, sq } : null;
    setSel(selNow.current);
  };
  const setPromo = (p: { from: string; to: string } | null) => setPromoState(p ? { fen, ...p } : null);

  // Move animation. When the position changes, diff it against the one on screen and slide the pieces.
  const [shownFen, setShownFen] = useState(fen);
  const [skipFen, setSkipFen] = useState<string | null>(null); // position a drag-and-drop move was made from
  const [moveEvt, setMoveEvt] = useState<{ diff: MoveAnim; animate: boolean; check: boolean } | null>(null);
  const [progress] = useState(() => new Animated.Value(1));
  if (shownFen !== fen) {
    setShownFen(fen);
    const diff = diffPositions(shownFen, fen);
    setMoveEvt(diff ? { diff, animate: settings.animateMoves && skipFen !== shownFen, check: chess.inCheck() } : null);
  }
  const anim = moveEvt?.animate ? moveEvt.diff : null;
  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);
  useLayoutEffect(() => {
    if (!moveEvt) return;
    // Your moves sound crisp; the opponent's a touch lower (side = the colour shown at the bottom).
    const sound = soundFor(moveEvt.diff, moveEvt.check, movable === 'both' ? null : orientation);
    if (!moveEvt.animate) {
      if (!silent) playSound(sound);
      return;
    }
    progress.setValue(0);
    // The "thock" lands with the piece.
    const a = Animated.timing(progress, { toValue: 1, duration: MOVE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    // Every move makes a sound — even if the next move cuts this animation short.
    let played = false;
    const play = () => {
      if (played) return;
      played = true;
      if (!silent) playSound(sound);
    };
    a.start(play);
    return () => {
      a.stop();
      play();
    };
    // Only re-run for a new move, not when the board is flipped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moveEvt, progress]);
  const animTo = new Set(anim?.movers.map((m) => m.to));
  const markDragged = () => setSkipFen(fen);

  const legalFrom = useMemo(() => {
    const map = new Map<string, { to: string; capture: boolean; promotion: boolean }[]>();
    if (!canMove) return map;
    for (const m of chess.moves({ verbose: true })) {
      const list = map.get(m.from) ?? [];
      if (!list.some((x) => x.to === m.to)) list.push({ to: m.to, capture: !!m.captured, promotion: !!m.promotion });
      map.set(m.from, list);
    }
    return map;
  }, [chess, canMove]);

  const targets = selected ? (legalFrom.get(selected) ?? []) : [];

  // Keep latest values for the PanResponder closures.
  const live = useRef({ fen, legalFrom, canMove, orientation, sq, onMove, setSelected, setPromo, markDragged });
  useLayoutEffect(() => {
    live.current = { fen, legalFrom, canMove, orientation, sq, onMove, setSelected, setPromo, markDragged };
  });

  const tryMove = (from: string, to: string): boolean => {
    const t = live.current.legalFrom.get(from)?.find((x) => x.to === to);
    if (!t) return false;
    if (t.promotion) {
      live.current.setPromo({ from, to });
    } else {
      live.current.onMove?.(from, to);
    }
    live.current.setSelected(null);
    return true;
  };

  const pointToSquare = (x: number, y: number): string | null => {
    const s = live.current.sq;
    const col = Math.floor(x / s);
    const row = Math.floor(y / s);
    if (col < 0 || col > 7 || row < 0 || row > 7) return null;
    return squareAt(col, row, live.current.orientation);
  };

  // The handlers below only read refs when a touch event fires, never during render.
  const responder = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { locationX: x, locationY: y } = e.nativeEvent;
          const s = pointToSquare(x, y);
          start.current = { x, y, sq: s ?? '', wasSelected: false };
          if (!s || !live.current.canMove) return;
          const cur = selNow.current?.fen === live.current.fen ? selNow.current.sq : null;
          if (cur && cur !== s && tryMove(cur, s)) return;
          if (live.current.legalFrom.has(s)) {
            start.current.wasSelected = cur === s;
            if (cur !== s) tap(); // a light tick as you pick up a piece
            live.current.setSelected(s);
            setDragFrom(s);
            dragPos.setValue({ x: x - live.current.sq / 2, y: y - live.current.sq / 2 });
          } else {
            live.current.setSelected(null);
          }
        },
        onPanResponderMove: (_e, g) => {
          dragPos.setValue({
            x: start.current.x + g.dx - live.current.sq / 2,
            y: start.current.y + g.dy - live.current.sq / 2,
          });
        },
        onPanResponderRelease: (_e, g) => {
          const from = start.current.sq;
          setDragFrom(null);
          if (!from || !live.current.legalFrom.has(from)) return;
          const target = pointToSquare(start.current.x + g.dx, start.current.y + g.dy);
          if (target && target !== from) {
            // The finger already carried the piece there, so don't slide it again.
            if (tryMove(from, target)) live.current.markDragged();
            else {
              live.current.setSelected(null);
              playSound('illegal');
            }
          } else if (start.current.wasSelected) {
            live.current.setSelected(null); // tapped the selected piece again
          }
        },
        onPanResponderTerminate: () => setDragFrom(null),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (const row of board) for (const p of row) if (p && p.type === 'k' && p.color === turn) return p.square;
    return null;
  }, [chess, board, turn]);

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const name = squareAt(col, row, orientation);
      const isLight = (col + row) % 2 === 0;
      const fileIdx = FILES.indexOf(name[0]);
      const rankIdx = Number(name[1]) - 1;
      const piece = board[7 - rankIdx][fileIdx];
      let overlay: string | undefined;
      if (lastMove && (lastMove.from === name || lastMove.to === name)) overlay = HIGHLIGHT.lastMove;
      if (highlights?.[name]) overlay = highlights[name];
      if (selected === name) overlay = HIGHLIGHT.selected;
      const target = targets.find((t) => t.to === name);
      const coordColor = monoBoard ? (isLight ? '#7a7a7a' : '#3d3d3d') : isLight ? theme.dark : theme.light;
      squares.push(
        <View
          key={name}
          style={{ position: 'absolute', left: col * sq, top: row * sq, width: sq, height: sq, backgroundColor: isLight ? theme.light : theme.dark }}
        >
          {overlay && <View style={[StyleSheet.absoluteFill, { backgroundColor: overlay }]} />}
          {checkSquare === name && <View style={styles.check} />}
          {col === 0 && <Text style={[styles.rankLabel, { color: coordColor, fontSize: sq * 0.19 }]}>{name[1]}</Text>}
          {row === 7 && <Text style={[styles.fileLabel, { color: coordColor, fontSize: sq * 0.19 }]}>{name[0]}</Text>}
          {piece && dragFrom !== name && !animTo.has(name) && (
            <View style={selected === name ? { transform: [{ scale: 1.1 }, { translateY: -sq * 0.04 }] } : undefined}>
              <PieceView code={piece.color + piece.type} size={sq} />
            </View>
          )}
          {target && settings.showLegalMoves && (
            <View style={[StyleSheet.absoluteFill, styles.center]}>
              {target.capture ? (
                <View style={{ width: sq - 6, height: sq - 6, borderWidth: sq * 0.07, borderColor: 'rgba(0,0,0,0.55)' }} />
              ) : (
                <View style={{ width: sq * 0.22, height: sq * 0.22, backgroundColor: 'rgba(0,0,0,0.45)' }} />
              )}
            </View>
          )}
        </View>,
      );
    }
  }

  const dragPiece = dragFrom ? chess.get(dragFrom as Square) : null;
  const promoColor = turn;

  return (
    <View style={[{ width: size, height: size }, NO_SELECT]}>
      <View style={{ width: size, height: size }} {...(movable ? responder.panHandlers : {})}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {squares}
          {anim?.ghosts.map((g) => {
            const p = squarePos(g.sq, orientation);
            return (
              <Animated.View
                key={'g' + g.sq}
                style={{
                  position: 'absolute',
                  left: p.col * sq,
                  top: p.row * sq,
                  opacity: progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0] }),
                  transform: [{ scale: progress.interpolate({ inputRange: [0, 0.55, 1], outputRange: [1, 1, 0.35] }) }],
                }}
              >
                <PieceView code={g.code} size={sq} />
              </Animated.View>
            );
          })}
          {anim?.movers.map((m) => {
            if (dragFrom === m.to) return null;
            const f = squarePos(m.from, orientation);
            const t = squarePos(m.to, orientation);
            return (
              <Animated.View
                key={'m' + m.to}
                style={{
                  position: 'absolute',
                  left: t.col * sq,
                  top: t.row * sq,
                  transform: [
                    { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [(f.col - t.col) * sq, 0] }) },
                    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [(f.row - t.row) * sq, 0] }) },
                    // Lift the piece off the board mid-flight, then set it down.
                    { scale: progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1.04, 1.16, 1] }) },
                  ],
                }}
              >
                <PieceView code={m.code} size={sq} />
              </Animated.View>
            );
          })}
          {allArrows.length > 0 && (
            <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
              {allArrows.map((a, i) => {
                const fill = a.color ?? C.ink;
                // The last-move arrow is slimmer and stops short of the piece that just moved.
                const pts = arrowOutline(a.from, a.to, orientation, sq, a.last ? { scale: 0.8, tipGap: sq * 0.3 } : {});
                const d = Math.max(2, sq * 0.06); // hard offset shadow, like the app's slabs
                const shadow = pts.map(([x, y]) => `${x + d},${y + d}`).join(' ');
                return (
                  <React.Fragment key={i}>
                    <Polygon points={shadow} fill={C.ink} />
                    <Polygon
                      points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
                      fill={fill}
                      stroke={fill === C.ink ? C.white : C.ink}
                      strokeWidth={Math.max(1.5, sq * 0.035)}
                      strokeLinejoin="miter"
                    />
                  </React.Fragment>
                );
              })}
            </Svg>
          )}
          {badge && (() => {
            const p = squarePos(badge.square, orientation);
            const r = sq * 0.38;
            return (
              <View style={[styles.badge, { left: (p.col + 1) * sq - r * 1.1, top: p.row * sq - r * 0.35, width: r * 1.15, height: r * 1.15, backgroundColor: badge.color }]}>
                <Text style={{ color: '#fff', fontWeight: '700', fontFamily: 'mono', fontSize: r * 0.5 }}>{badge.symbol}</Text>
              </View>
            );
          })()}
          <View style={styles.frame} />
          {dragPiece && (
            <Animated.View style={{ position: 'absolute', width: sq * 1.2, height: sq * 1.2, transform: [{ translateX: Animated.add(dragPos.x, -sq * 0.1) }, { translateY: Animated.add(dragPos.y, -sq * 0.25) }] }}>
              <PieceView code={dragPiece.color + dragPiece.type} size={sq * 1.2} />
            </Animated.View>
          )}
        </View>
      </View>
      {promo && (
        <Pressable style={[StyleSheet.absoluteFill, styles.promoBackdrop]} onPress={() => { setPromo(null); setSkipFen(null); }}>
          <View style={styles.promoBox}>
            {(['q', 'r', 'b', 'n'] as const).map((p) => (
              <Pressable
                key={p}
                style={[styles.promoItem, { width: sq * 1.1, height: sq * 1.1 }]}
                onPress={() => {
                  const m = promo;
                  setPromo(null);
                  onMove?.(m.from, m.to, p);
                }}
              >
                <PieceView code={promoColor + p} size={sq} />
              </Pressable>
            ))}
          </View>
        </Pressable>
      )}
    </View>
  );
}

// Stop the browser (desktop/web) from text-selecting the board while dragging.
const NO_SELECT = Platform.OS === 'web' ? ({ userSelect: 'none', WebkitUserSelect: 'none' } as object) : null;

const styles = themed(() => StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  rankLabel: { position: 'absolute', left: 3, top: 1, fontFamily: 'mono', fontWeight: '700' },
  fileLabel: { position: 'absolute', right: 3, bottom: 0, fontFamily: 'mono', fontWeight: '700' },
  check: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: HIGHLIGHT.check },
  badge: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: B.w, borderColor: C.ink },
  frame: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderWidth: B.w, borderColor: C.ink },
  promoBackdrop: { backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center' },
  promoBox: { flexDirection: 'row', backgroundColor: C.white, borderWidth: B.w, borderColor: C.ink, padding: 6, gap: 6 },
  promoItem: { alignItems: 'center', justifyContent: 'center', borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
}));
