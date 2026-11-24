import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { B, C, themed } from '../../lib/theme';
import { t } from '../../lib/i18n';
import { store, useStored } from '../../lib/storage';
import { Label, PressSlab, Rise, Slab, Text } from '../../components/ui';
import { RUSH_VARIANTS } from '../../lib/puzzles';

function Row({ n, title, sub, onPress }: { n: string; title: string; sub: string; onPress: () => void }) {
  return (
    <PressSlab onPress={onPress} style={styles.row}>
      <Text style={styles.num}>{n}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </PressSlab>
  );
}

export default function PuzzlesHub() {
  const [s] = useStored(store.puzzleStats, { rating: 1200, solved: 0, failed: 0, streak: 0, bestStreak: 0, seen: [] });
  const total = s.solved + s.failed;
  const stats = [
    [t('RATING'), String(s.rating)],
    [t('SOLVED'), String(s.solved)],
    [t('SUCCESS'), total ? `${Math.round((s.solved / total) * 100)}%` : '—'],
    [t('BEST RUN'), String(s.bestStreak)],
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
      <Rise index={0}>
        <Slab style={styles.stats}>
          {stats.map(([label, value], i) => (
            <View key={label} style={[styles.stat, i > 0 && { borderLeftWidth: B.w, borderColor: C.ink }]}>
              <Text style={styles.statValue}>{value}</Text>
              <Text style={styles.statLabel}>{label}</Text>
            </View>
          ))}
        </Slab>
      </Rise>
      <Rise index={1}>
        <Label style={{ marginTop: 6 }}>{t('Modes')}</Label>
      </Rise>
      <Rise index={2}>
        <Row n="A" title={t('RATED PUZZLES')} sub={t('Matched to your rating')} onPress={() => router.push({ pathname: '/puzzle', params: { mode: 'rated' } })} />
      </Rise>
      <Rise index={3}>
        <Row n="B" title={t('DAILY PUZZLE')} sub={t('A new one every day')} onPress={() => router.push({ pathname: '/puzzle', params: { mode: 'daily' } })} />
      </Rise>
      <Rise index={4}>
        <Row n="C" title={t('PUZZLE STREAK')} sub={t('Harder and harder · one miss ends it')} onPress={() => router.push({ pathname: '/puzzle', params: { mode: 'streak' } })} />
      </Rise>
      <Rise index={5}>
        <Row n="D" title={t('PUZZLE THEMES')} sub={t('Forks, pins, mates, endgames · 30 themes')} onPress={() => router.push('/puzzle-themes')} />
      </Rise>
      <Rise index={6} style={{ gap: 8 }}>
        <Label style={{ marginTop: 6 }}>{t('Puzzle rush · three strikes')}</Label>
        <View style={styles.rushRow}>
          {RUSH_VARIANTS.map((v) => (
            <PressSlab key={v.id} outerStyle={{ flex: 1 }} style={styles.rush} onPress={() => router.push({ pathname: '/puzzle', params: { mode: 'rush', rush: v.id } })}>
              <Text style={styles.rushLabel}>{t(v.label)}</Text>
              <Text style={styles.rushBest}>{s.rushBest?.[v.id] ?? 0}</Text>
              <Text style={styles.statLabel}>{t('BEST')}</Text>
            </PressSlab>
          ))}
        </View>
      </Rise>
      <Text style={styles.note}>{t('PUZZLES: LICHESS OPEN DATABASE (CC0) · OFFLINE PACK INCLUDED')}</Text>
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  stats: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  statValue: { fontFamily: 'mono', fontWeight: '700', fontSize: 22 },
  statLabel: { fontFamily: 'mono', fontSize: 9, letterSpacing: 1.2, color: C.muted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  num: { fontFamily: 'mono', fontWeight: '700', fontSize: 15, color: C.muted, borderRightWidth: B.w, borderColor: C.ink, paddingRight: 12 },
  title: { fontSize: 19, fontWeight: '700' },
  sub: { fontFamily: 'mono', fontSize: 11, color: C.muted, marginTop: 3 },
  arrow: { fontSize: 24, fontWeight: '700' },
  rushRow: { flexDirection: 'row', gap: 8 },
  rush: { alignItems: 'center', paddingVertical: 12 },
  rushLabel: { fontFamily: 'mono', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  rushBest: { fontFamily: 'mono', fontWeight: '700', fontSize: 28, marginTop: 4 },
  note: { fontFamily: 'mono', color: C.muted, fontSize: 9, letterSpacing: 1, textAlign: 'center', marginTop: 14 },
}));
