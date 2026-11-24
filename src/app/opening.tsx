import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../components/Press';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Chess } from 'chess.js';
import { Board, type Arrow } from '../components/Board';
import { BoardFrame, Btn, IconBtn, MoveList, Text, Toolbar } from '../components/ui';
import { lessonForGuide, lessonForLine, lessonForTrap, moveLabel, numbered, guidesForFamily, type Lesson } from '../lib/lessons';
import { openingFamilies } from '../engine/openings';
import { store, useSettings, useStored } from '../lib/storage';
import { playSound } from '../lib/sound';
import { B, C, P, themed } from '../lib/theme';
import { t } from '../lib/i18n';

const NOTE_H = 104;
const REPLY_DELAY = 550;
const MOVE_SOUND_DELAY = 260;

type Practice = 'yours' | 'theirs' | 'wrong' | 'done';

export default function OpeningScreen() {
  const { guide, line, trap } = useLocalSearchParams<{ guide?: string; line?: string; trap?: string }>();
  const lesson = useMemo(
    () => (guide && trap !== undefined ? lessonForTrap(guide, Number(trap)) : guide ? lessonForGuide(guide) : line !== undefined ? lessonForLine(Number(line)) : null),
    [guide, line, trap],
  );
  if (!lesson) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text>{t('Opening not found.')}</Text>
      </View>
    );
  }
  return <LessonView key={lesson.key} lesson={lesson} />;
}

function LessonView({ lesson }: { lesson: Lesson }) {
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [learned] = useStored(store.learned, {});
  const n = lesson.moves.length;

  // Positions and moves along the line.
  const { fens, played } = useMemo(() => {
    const c = new Chess();
    const f = [c.fen()];
    const p: { from: string; to: string; promotion?: string }[] = [];
    for (const san of lesson.moves) {
      const m = c.move(san);
      p.push({ from: m.from, to: m.to, promotion: m.promotion });
      f.push(c.fen());
    }
    return { fens: f, played: p };
  }, [lesson]);

  const [mode, setMode] = useState<'study' | 'practice'>('study');
  const [ply, setPly] = useState(0);
  const [orientation, setOrientation] = useState<'w' | 'b'>(lesson.side);
  const [practice, setPractice] = useState<Practice>('yours');
  const [tempFen, setTempFen] = useState<string | null>(null);
  const [highlights, setHighlights] = useState<Record<string, string>>({});
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [infoOpen, setInfoOpen] = useState(false);
  const alive = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    alive.current = true;
    const pending = timers.current;
    return () => {
      alive.current = false;
      pending.forEach(clearTimeout);
    };
  }, []);

  const later = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(() => alive.current && fn(), ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current.length = 0;
  };

  const moverAt = (i: number): 'w' | 'b' => (i % 2 === 0 ? 'w' : 'b');

  /** In practice, play the opponent's book moves until it's the learner's turn. */
  const autoplay = (from: number) => {
    if (from >= n) {
      setPractice('done');
      store.markLearned(lesson.key);
      if (settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    }
    if (moverAt(from) === lesson.side) {
      setPractice('yours');
      return;
    }
    setPractice('theirs');
    later(REPLY_DELAY, () => {
      setPly(from + 1);
      setHighlights({});
      autoplay(from + 1);
    });
  };

  const startPractice = () => {
    clearTimers();
    setMode('practice');
    setOrientation(lesson.side);
    setPly(0);
    setTempFen(null);
    setHighlights({});
    setArrows([]);
    setMistakes(0);
    later(250, () => autoplay(0));
  };

  const stopPractice = () => {
    clearTimers();
    setMode('study');
    setTempFen(null);
    setHighlights({});
    setArrows([]);
  };

  const onMove = (from: string, to: string, promotion?: string) => {
    if (mode !== 'practice' || practice !== 'yours') return;
    const expected = played[ply];
    if (from === expected.from && to === expected.to && (!expected.promotion || expected.promotion === promotion)) {
      setArrows([]);
      setHighlights({ [to]: 'rgba(30,158,87,0.55)' });
      setPly(ply + 1);
      autoplay(ply + 1);
      return;
    }
    // Not the book move: show it briefly, then take it back.
    const c = new Chess(fens[ply]);
    try {
      c.move({ from, to, promotion });
    } catch {
      return;
    }
    setTempFen(c.fen());
    setHighlights({ [to]: 'rgba(225,6,0,0.6)' });
    setPractice('wrong');
    setMistakes((m) => m + 1);
    if (settings.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    later(MOVE_SOUND_DELAY, () => playSound('illegal'));
    later(900, () => {
      setTempFen(null);
      setHighlights({});
      setPractice('yours');
    });
  };

  const hint = () => {
    if (mode !== 'practice' || practice !== 'yours') return;
    const e = played[ply];
    setArrows([{ from: e.from, to: e.to }]);
  };

  const fen = tempFen ?? fens[ply];
  const lastMove = ply > 0 ? played[ply - 1] : null;
  const youPlay = lesson.side === 'w' ? t('YOU PLAY WHITE') : t('YOU PLAY BLACK');
  const isLearned = !!learned[lesson.key];

  const banner =
    mode === 'study'
      ? null
      : practice === 'yours'
        ? { text: lesson.trapNote ? t('YOUR MOVE — PLAY THE TRAP MOVE') : t('YOUR MOVE — PLAY THE BOOK MOVE'), bg: C.ink, fg: C.white }
        : practice === 'theirs'
          ? { text: t('OPPONENT IS MOVING…'), bg: C.white, fg: C.ink }
          : practice === 'wrong'
            ? { text: t('× NOT IN THIS LINE — TRY AGAIN'), bg: C.danger, fg: P.white }
            : {
                text: !mistakes ? t('✓ LINE COMPLETE · PERFECT') : mistakes === 1 ? t('✓ LINE COMPLETE · 1 MISTAKE') : t('✓ LINE COMPLETE · {n} MISTAKES', { n: mistakes }),
                bg: C.good,
                fg: P.white,
              };

  const noteTitle = ply > 0 ? `${moveLabel(ply - 1)} ${lesson.moves[ply - 1]}` : lesson.trapNote ? t('THE TRAP') : youPlay;
  const noteText =
    ply > 0
      ? lesson.notes[ply - 1]
      : mode === 'practice'
        ? lesson.side === 'w'
          ? t('Play the white moves of this line from memory. Tap Hint if you get stuck.')
          : t('Play the black moves of this line from memory. Tap Hint if you get stuck.')
        : lesson.trapNote
          ? t('Step through to see how the trap works. {note}', { note: lesson.trapNote })
          : (lesson.guide?.summary ?? t('Step through the {name} move by move. Tap › to begin.', { name: lesson.subtitle || lesson.title }));

  return (
    <View style={{ flex: 1, paddingBottom: insets.bottom }}>
      <Stack.Screen options={{ title: lesson.title.toUpperCase() }} />
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.subtitle} numberOfLines={1}>
            {(lesson.subtitle || t('Main line')).toUpperCase()}
          </Text>
          <Text style={styles.meta}>
            {lesson.eco} · {t('{n} MOVES', { n })} · {youPlay}
            {isLearned ? ` · ${t('■ LEARNED')}` : ''}
          </Text>
        </View>
        <Pressable onPress={() => setInfoOpen(true)} style={styles.infoBtn} hitSlop={6}>
          <Text style={styles.infoText}>{t('ABOUT')}</Text>
        </Pressable>
      </View>
      {banner ? (
        <View style={[styles.banner, { backgroundColor: banner.bg }]}>
          <Text style={[styles.bannerText, { color: banner.fg }]}>{banner.text}</Text>
        </View>
      ) : (
        <MoveList moves={lesson.moves.map((san) => ({ san }))} current={ply} onSelect={(p) => setPly(p)} />
      )}

      <BoardFrame reserved={NOTE_H}>
        {(size) => (
          <>
            <View style={{ alignSelf: 'center' }}>
              <Board
                fen={fen}
                size={size}
                orientation={orientation}
                movable={mode === 'practice' && practice === 'yours' ? lesson.side : null}
                onMove={onMove}
                lastMove={tempFen ? null : lastMove}
                highlights={highlights}
                arrows={arrows}
              />
            </View>
            <View style={[styles.note, { width: size }]}>
              <Text style={styles.noteTitle}>{noteTitle}</Text>
              <Text style={styles.noteText} numberOfLines={4}>
                {noteText}
              </Text>
            </View>
          </>
        )}
      </BoardFrame>

      {mode === 'study' ? (
        <Toolbar>
          <IconBtn icon="«" label={t('Start')} onPress={() => setPly(0)} disabled={ply === 0} />
          <IconBtn icon="‹" label={t('Back')} onPress={() => setPly((p) => Math.max(0, p - 1))} disabled={ply === 0} />
          <IconBtn icon="›" label={t('Next')} onPress={() => setPly((p) => Math.min(n, p + 1))} disabled={ply >= n} />
          <IconBtn icon="»" label={t('End')} onPress={() => setPly(n)} disabled={ply >= n} />
          <IconBtn icon="⇅" label={t('Flip')} onPress={() => setOrientation((o) => (o === 'w' ? 'b' : 'w'))} />
          <IconBtn icon="▶" label={t('Practice')} onPress={startPractice} />
        </Toolbar>
      ) : practice === 'done' ? (
        <View style={styles.actions}>
          <Btn kind="secondary" title={t('Study')} style={{ flex: 1 }} onPress={stopPractice} />
          <Btn title={t('Again  ↺')} style={{ flex: 1 }} onPress={startPractice} />
        </View>
      ) : (
        <Toolbar>
          <IconBtn icon="×" label={t('Stop')} onPress={stopPractice} />
          <IconBtn icon="?" label={t('Hint')} onPress={hint} disabled={practice !== 'yours'} />
          <IconBtn icon="↺" label={t('Restart')} onPress={startPractice} />
        </Toolbar>
      )}

      <InfoSheet lesson={lesson} open={infoOpen} onClose={() => setInfoOpen(false)} />
    </View>
  );
}

/** Opening background: summary, plans, what to watch out for, traps and variations. */
function InfoSheet({ lesson, open, onClose }: { lesson: Lesson; open: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const g = lesson.guide;
  const fam = openingFamilies().find((f) => f.family === lesson.family);
  const otherGuides = guidesForFamily(lesson.family).filter((x) => x.id !== g?.id || lesson.trapNote);
  const go = (params: Record<string, string>) => {
    onClose();
    router.push({ pathname: '/opening', params });
  };
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} numberOfLines={2}>
              {lesson.title.toUpperCase()}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            <Text style={styles.mono}>
              {lesson.eco} · {numbered(lesson.moves)}
            </Text>
            {g ? (
              <>
                <Text style={styles.body}>{g.summary}</Text>
                <Text style={styles.section}>{t('KEY IDEAS')}</Text>
                {g.ideas.map((idea) => (
                  <View key={idea} style={styles.bullet}>
                    <View style={styles.bulletMark} />
                    <Text style={[styles.body, { flex: 1 }]}>{idea}</Text>
                  </View>
                ))}
                <Text style={styles.section}>{t('WATCH OUT')}</Text>
                <Text style={styles.body}>{g.watchOut}</Text>
                {g.traps?.length ? <Text style={styles.section}>{t('TRAPS')}</Text> : null}
                {g.traps?.map((tr, i) => (
                  <Pressable key={tr.name} onPress={() => go({ guide: g.id, trap: String(i) })} style={styles.linkRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.linkTitle}>{tr.name.toUpperCase()}</Text>
                      <Text style={styles.linkSub}>{tr.note}</Text>
                    </View>
                    <Text style={styles.arrow}>→</Text>
                  </Pressable>
                ))}
              </>
            ) : (
              <Text style={styles.body}>{t('Each move comes with an explanation of what it does. Use Practice to learn the line by heart.')}</Text>
            )}
            {otherGuides.length > 0 && <Text style={styles.section}>{t('GUIDES')}</Text>}
            {otherGuides.map((x) => (
              <Pressable key={x.id} onPress={() => go({ guide: x.id })} style={styles.linkRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.linkTitle}>{x.name.toUpperCase()}</Text>
                  <Text style={styles.linkSub}>{numbered(x.moves.split(' ').slice(0, 8))}…</Text>
                </View>
                <Text style={styles.arrow}>→</Text>
              </Pressable>
            ))}
            {fam && (
              <Btn
                kind="secondary"
                title={t('All {n} {family} lines  →', { n: fam.lines.length, family: lesson.family })}
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/opening-family', params: { family: lesson.family } });
                }}
              />
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  subtitle: { fontWeight: '700', fontSize: 15 },
  meta: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1, color: C.muted, marginTop: 2 },
  infoBtn: { borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 6 },
  infoText: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  banner: { paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: B.w, borderBottomWidth: B.w, borderColor: C.ink },
  bannerText: { fontFamily: 'mono', fontWeight: '700', fontSize: 13, letterSpacing: 1, textAlign: 'center' },
  note: { alignSelf: 'center', height: NOTE_H - 8, marginTop: 8, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 8 },
  noteTitle: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  noteText: { fontSize: 14, lineHeight: 19, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 6, padding: 14, paddingRight: 10, borderTopWidth: B.w, borderColor: C.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '82%', backgroundColor: C.bg, borderTopWidth: B.w, borderColor: C.ink, padding: 16, gap: 10 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetTitle: { flex: 1, fontWeight: '700', fontSize: 22, letterSpacing: -0.3 },
  close: { fontSize: 30, lineHeight: 30, fontWeight: '700' },
  mono: { fontFamily: 'mono', fontSize: 12, lineHeight: 18 },
  body: { fontSize: 15, lineHeight: 21 },
  section: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1.5, color: C.muted, marginTop: 4 },
  bullet: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bulletMark: { width: 8, height: 8, backgroundColor: C.ink, marginTop: 7 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, padding: 10 },
  linkTitle: { fontWeight: '700', fontSize: 14 },
  linkSub: { fontFamily: 'mono', fontSize: 11, color: C.muted, marginTop: 2 },
  arrow: { fontSize: 20, fontWeight: '700' },
}));
