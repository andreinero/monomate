import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '../../components/Press';
import { router, useIsFocused } from 'expo-router';
import { Chess } from 'chess.js';
import { Board } from '../../components/Board';
import { BoardFrame, Btn, EVAL_BAR_WIDTH, EvalBar, IconBtn, MoveList, Slab, Text, Toolbar } from '../../components/ui';
import { useEngine, CancelledError, type EngineLine } from '../../engine/EngineProvider';
import { formatScore, pvToSan, terminalScore } from '../../engine/analysis';
import { openingName } from '../../engine/openings';
import { newId } from '../../lib/storage';
import { B, C, F, themed } from '../../lib/theme';
import { t } from '../../lib/i18n';

const START = new Chess().fen();
const OPENING_H = 26;
const LINE_H = 28;

export default function AnalysisScreen() {
  const engine = useEngine();
  const focused = useIsFocused();
  const [tag] = useState(() => 'analysis-' + newId());

  const [startFen, setStartFen] = useState(START);
  const [line, setLine] = useState<string[]>([]); // SAN moves
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<'w' | 'b'>('w');
  const [result, setResult] = useState<{ fen: string; lines: EngineLine[] }>({ fen: '', lines: [] });
  const [engineOn, setEngineOn] = useState(true);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const fens = useMemo(() => {
    const c = new Chess(startFen);
    const out = [c.fen()];
    for (const m of line) {
      c.move(m);
      out.push(c.fen());
    }
    return out;
  }, [startFen, line]);
  const fen = fens[ply];

  const lastMove = useMemo(() => {
    if (ply === 0) return null;
    const c = new Chess(fens[ply - 1]);
    const m = c.move(line[ply - 1]);
    return { from: m.from, to: m.to };
  }, [fens, line, ply]);

  // Checkmate/stalemate positions are scored without the engine.
  const terminal = useMemo(() => terminalScore(new Chess(fen)), [fen]);
  const lines: EngineLine[] = terminal
    ? [{ multipv: 1, depth: 0, score: terminal, pv: [] }]
    : result.fen === fen
      ? result.lines
      : [];

  // Live engine analysis for the current position.
  useEffect(() => {
    if (!engineOn || !focused || terminal) return;
    const timer = setTimeout(() => {
      engine.cancel(tag);
      engine
        .analyze(fen, { depth: 16, multipv: 3, tag, onUpdate: (l) => setResult({ fen, lines: l }) })
        .then((r) => setResult({ fen, lines: r.lines }))
        .catch((e) => {
          if (!(e instanceof CancelledError)) console.warn(e);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      engine.cancel(tag);
    };
  }, [fen, engineOn, focused, engine, tag, terminal]);

  const onMove = (from: string, to: string, promotion?: string) => {
    const c = new Chess(fen);
    let m;
    try {
      m = c.move({ from, to, promotion });
    } catch {
      return;
    }
    // If the move matches the existing continuation, just step forward; otherwise branch.
    if (line[ply] === m.san) setPly(ply + 1);
    else {
      setLine([...line.slice(0, ply), m.san]);
      setPly(ply + 1);
    }
  };

  const playUci = (uci: string) => onMove(uci.slice(0, 2), uci.slice(2, 4), uci[4]);

  const doImport = () => {
    const text = importText.trim();
    if (!text) return;
    const c = new Chess();
    try {
      if (/^[rnbqkpRNBQKP1-8]+(\/[rnbqkpRNBQKP1-8]+){7}\s[wb]/.test(text)) {
        c.load(text);
        setStartFen(c.fen());
        setLine([]);
        setPly(0);
      } else {
        c.loadPgn(text);
        const header = c.getHeaders?.() ?? {};
        const moves = c.history();
        setStartFen(header.FEN ?? START);
        setLine(moves);
        setPly(moves.length);
      }
      setImportOpen(false);
      setImportText('');
    } catch {
      Alert.alert(t('Could not read that'), t('Paste a valid PGN game or a FEN position.'));
    }
  };

  const reset = () => {
    setStartFen(START);
    setLine([]);
    setPly(0);
  };

  const top = lines[0];
  const opening = startFen === START ? openingName(line.slice(0, ply)) : null;
  const isMate = new Chess(fen).isCheckmate();

  return (
    <View style={{ flex: 1 }}>
      <MoveList moves={line.map((san) => ({ san }))} current={ply} onSelect={setPly} />

      <BoardFrame reserved={OPENING_H} inset={EVAL_BAR_WIDTH}>
        {(size) => (
          <>
            <View style={{ flexDirection: 'row', alignSelf: 'center' }}>
              <EvalBar score={engineOn ? top?.score : undefined} height={size} flipped={orientation === 'b'} />
              <Board
                fen={fen}
                size={size}
                orientation={orientation}
                movable="both"
                onMove={onMove}
                lastMove={lastMove}
                arrows={engineOn && top?.pv[0] ? [{ from: top.pv[0].slice(0, 2), to: top.pv[0].slice(2, 4), color: C.ink }] : []}
              />
            </View>
            <Text style={styles.opening} numberOfLines={1}>
              {opening ? opening.name.toUpperCase() : ' '}
            </Text>
          </>
        )}
      </BoardFrame>

      <Slab outerStyle={styles.engineOuter} style={styles.engineBox}>
        <Pressable onPress={() => setEngineOn((v) => !v)} style={styles.engineHead} hitSlop={8}>
          <Text style={styles.engineTitle}>STOCKFISH {engineOn && top && top.depth ? t('· DEPTH {n}', { n: top.depth }) : ''}</Text>
          <View style={[styles.onOff, engineOn && { backgroundColor: C.ink }]}>
            <Text style={[styles.onOffText, engineOn && { color: C.white }]}>{engineOn ? t('ON') : t('OFF')}</Text>
          </View>
        </Pressable>
        {[0, 1, 2].map((i) => {
          const l = engineOn ? lines[i] : undefined;
          return (
            <Pressable key={i} disabled={!l?.pv[0]} onPress={() => l?.pv[0] && playUci(l.pv[0])} style={styles.lineRow}>
              {l ? (
                <>
                  <Text style={[styles.score, { backgroundColor: l.score.cp >= 0 ? C.white : C.ink, color: l.score.cp >= 0 ? C.ink : C.white }]}>
                    {formatScore(l.score)}
                  </Text>
                  <Text style={styles.pv} numberOfLines={1}>
                    {l.pv.length ? pvToSan(fen, l.pv, 10).join(' ') : isMate ? t('Checkmate') : t('Draw')}
                  </Text>
                </>
              ) : (
                <Text style={[styles.pv, { color: C.muted }]}>{engineOn && i === 0 && !terminal ? t('THINKING…') : ''}</Text>
              )}
            </Pressable>
          );
        })}
      </Slab>

      <Toolbar>
        <IconBtn icon="«" label={t('Start')} onPress={() => setPly(0)} disabled={ply === 0} />
        <IconBtn icon="‹" label={t('Back')} onPress={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0} />
        <IconBtn icon="›" label={t('Next')} onPress={() => setPly((p) => Math.min(line.length, p + 1))} disabled={ply >= line.length} />
        <IconBtn icon="⇅" label={t('Flip')} onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
        <IconBtn icon="+" label={t('Import')} onPress={() => setImportOpen(true)} />
        <IconBtn icon="≡" label={t('Review')} disabled={line.length === 0}
          onPress={() => router.push({ pathname: '/review', params: { moves: line.join(' '), fen: startFen } })} />
        <IconBtn icon="×" label={t('Reset')} onPress={reset} />
      </Toolbar>

      <Modal visible={importOpen} transparent animationType="slide" onRequestClose={() => setImportOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.modal}>
            <Text style={styles.h2}>{t('IMPORT GAME / POSITION')}</Text>
            <TextInput
              value={importText}
              onChangeText={setImportText}
              placeholder={t('Paste PGN (1. e4 e5 2. Nf3 …) or FEN')}
              placeholderTextColor={C.muted}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Btn kind="secondary" title={t('Cancel')} style={{ flex: 1 }} onPress={() => setImportOpen(false)} />
              <Btn title={t('Load')} style={{ flex: 1 }} onPress={doImport} />
            </View>
            <Btn
              kind="secondary"
              title={t('Review a chess.com game  →')}
              onPress={() => {
                setImportOpen(false);
                router.push('/chesscom-games');
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  opening: { fontFamily: 'mono', fontSize: 11, letterSpacing: 1, color: C.muted, textAlign: 'center', height: OPENING_H, lineHeight: OPENING_H },
  engineOuter: { marginLeft: 12, marginRight: 12 + B.shadow, marginBottom: 8 + B.shadow },
  engineBox: { paddingHorizontal: 10, paddingVertical: 8, gap: 4 },
  engineHead: { flexDirection: 'row', justifyContent: 'space-between', height: 24, alignItems: 'center' },
  engineTitle: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  onOff: { borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 8, paddingVertical: 1 },
  onOffText: { fontFamily: 'mono', fontWeight: '700', fontSize: 11 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: LINE_H },
  score: { width: 60, textAlign: 'center', fontFamily: 'mono', fontWeight: '700', fontSize: 13, paddingVertical: 2, borderWidth: B.w, borderColor: C.ink, overflow: 'hidden' },
  pv: { fontFamily: 'mono', flex: 1, fontSize: 13 },
  h2: { fontSize: 18, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  modal: { backgroundColor: C.white, padding: 16, gap: 12, paddingBottom: 36, borderTopWidth: B.w * 2, borderColor: C.ink },
  input: { backgroundColor: C.white, color: C.ink, borderWidth: B.w, borderColor: C.ink, padding: 12, minHeight: 140, textAlignVertical: 'top', fontSize: 13, fontFamily: F.mono },
}));
