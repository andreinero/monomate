import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { B, C, themed } from '../lib/theme';
import { t } from '../lib/i18n';
import { store, useStored } from '../lib/storage';
import { PressSlab, Rise, Text } from '../components/ui';
import { PUZZLE_THEMES, themeName } from '../lib/puzzles';

/** Pick a tactic or phase to practise. Online puzzles come from Lichess; offline ones from the bundled pack. */
export default function PuzzleThemes() {
  const [s] = useStored(store.puzzleStats, { rating: 1200, solved: 0, failed: 0, streak: 0, bestStreak: 0, seen: [] });
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}>
      {PUZZLE_THEMES.map((th, i) => {
        const solved = s.themeSolved?.[th.id] ?? 0;
        return (
          <Rise key={th.id} index={Math.min(i, 10)}>
            <PressSlab onPress={() => router.push({ pathname: '/puzzle', params: { mode: 'theme', theme: th.id } })} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{themeName(th.id).toUpperCase()}</Text>
                <Text style={styles.sub}>{t(th.sub)}</Text>
              </View>
              <View style={styles.count}>
                <Text style={styles.countNum}>{solved}</Text>
                <Text style={styles.countLabel}>{t('SOLVED')}</Text>
              </View>
            </PressSlab>
          </Rise>
        );
      })}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  title: { fontSize: 17, fontWeight: '700' },
  sub: { fontFamily: 'mono', fontSize: 11, color: C.muted, marginTop: 3 },
  count: { alignItems: 'center', borderLeftWidth: B.w, borderColor: C.ink, paddingLeft: 12, minWidth: 58 },
  countNum: { fontFamily: 'mono', fontWeight: '700', fontSize: 18 },
  countLabel: { fontFamily: 'mono', fontSize: 8, letterSpacing: 1, color: C.muted },
}));
