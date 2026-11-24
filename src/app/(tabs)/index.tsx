import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { B, C, themed } from '../../lib/theme';
import { store, useStored } from '../../lib/storage';
import { getBot } from '../../engine/bots';
import { DEFAULT_TIME_CONTROL } from '../../lib/clock';
import { Label, PressSlab, Rise, Text } from '../../components/ui';
import { useMyRating } from '../../lib/rating';
import { t } from '../../lib/i18n';

function ModeRow({ n, title, sub, onPress }: { n: number; title: string; sub: string; onPress: () => void }) {
  return (
    <PressSlab onPress={onPress} style={styles.row}>
      <Text style={styles.num}>{String(n).padStart(2, '0')}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>{sub}</Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </PressSlab>
  );
}

/** "12 moves" (full moves), with the singular for one. */
const movesText = (n: number) => (n === 1 ? t('1 move') : t('{n} moves', { n }));

export default function Home() {
  const [games] = useStored(store.games, []);
  const myRating = useMyRating();
  const last = games[0];

  const rows = [
    { title: t('PLAY BOTS'), sub: t('10 opponents · 100 to 2700'), go: () => router.push({ pathname: '/bots', params: { mode: 'bot' } }) },
    { title: t('PLAY ONLINE'), sub: t('Real opponents · via Lichess'), go: () => router.push('/online') },
    { title: t('PLAY WITH COACH'), sub: t('Live tips and explanations'), go: () => router.push({ pathname: '/bots', params: { mode: 'coach' } }) },
    { title: t('CHESS.COM REVIEW'), sub: t('Link your username · review your games'), go: () => router.push('/chesscom-games') },
    { title: t('ANALYSIS BOARD'), sub: t('Any position, full engine'), go: () => router.push('/analysis') },
    { title: t('PASS & PLAY'), sub: t('Two players · 10 min each'), go: () => router.push({ pathname: '/game', params: { mode: 'local', tc: DEFAULT_TIME_CONTROL } }) },
    { title: t('CHESS CLOCK'), sub: t('For games on a real board'), go: () => router.push('/chess-clock') },
  ];

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Rise index={0}>
        <Text style={styles.hero} numberOfLines={1} adjustsFontSizeToFit>
          MonoMate
        </Text>
      </Rise>
      {myRating.value !== undefined && (
        <Rise index={0}>
          <PressSlab onPress={() => router.push('/profile')} style={styles.ratings}>
            <View style={styles.ratingCell}>
              <Text style={styles.ratingNum}>{myRating.value}</Text>
              <Text style={styles.ratingLabel}>{myRating.label}</Text>
            </View>
          </PressSlab>
        </Rise>
      )}
      {rows.map((r, i) => (
        <Rise key={r.title} index={i + 1}>
          <ModeRow n={i + 1} title={r.title} sub={r.sub} onPress={r.go} />
        </Rise>
      ))}

      {last && (
        <Rise index={rows.length + 1} style={{ marginTop: 10, gap: 8 }}>
          <Label>{t('Last game')}</Label>
          <PressSlab onPress={() => router.push({ pathname: '/review', params: { id: last.id } })} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{last.mode === 'local' ? t('PASS & PLAY') : last.mode === 'online' ? t('VS {name} · ONLINE', { name: (last.opponent?.name ?? t('OPPONENT')).toUpperCase() }) : last.mode === 'import' ? t('VS {name} · IMPORTED', { name: (last.opponent?.name ?? t('OPPONENT')).toUpperCase() }) : `VS ${getBot(last.botId).name.toUpperCase()}`}</Text>
              <Text style={styles.sub}>
                {last.result} · {t(last.reason)} · {movesText(Math.ceil(last.moves.length / 2))}
              </Text>
            </View>
            <Text style={styles.review}>{t('REVIEW →')}</Text>
          </PressSlab>
        </Rise>
      )}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 32 },
  hero: { fontSize: 44, lineHeight: 44, fontWeight: '700', letterSpacing: -1.5, marginBottom: 10, marginTop: 4 },
  ratings: { flexDirection: 'row', marginBottom: 4 },
  ratingCell: { flex: 1, alignItems: 'center', paddingVertical: 10 },
  ratingNum: { fontFamily: 'mono', fontWeight: '700', fontSize: 26 },
  ratingLabel: { fontFamily: 'mono', fontSize: 9, letterSpacing: 1.3, color: C.muted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, gap: 14 },
  num: { fontFamily: 'mono', fontWeight: '700', fontSize: 15, color: C.muted, borderRightWidth: B.w, borderColor: C.ink, paddingRight: 12 },
  title: { fontSize: 19, fontWeight: '700', letterSpacing: 0.3 },
  sub: { fontFamily: 'mono', fontSize: 11, color: C.muted, marginTop: 3 },
  arrow: { fontSize: 24, fontWeight: '700' },
  review: { fontFamily: 'mono', fontWeight: '700', fontSize: 12 },
}));
