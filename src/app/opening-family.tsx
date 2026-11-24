import { FlatList, StyleSheet, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { openingFamilies } from '../engine/openings';
import { guidesForFamily, guideSubtitle, numbered } from '../lib/lessons';
import { store, useStored } from '../lib/storage';
import { Label, PressSlab, Text } from '../components/ui';
import { B, C, themed } from '../lib/theme';
import { t } from '../lib/i18n';

/** Every named line of one opening family. */
export default function OpeningFamilyScreen() {
  const { family } = useLocalSearchParams<{ family: string }>();
  const fam = openingFamilies().find((f) => f.family === family);
  const guides = guidesForFamily(family ?? '');
  const [learned] = useStored(store.learned, {});
  if (!fam) return null;
  return (
    <>
      <Stack.Screen options={{ title: fam.family.toUpperCase() }} />
      <FlatList
        data={fam.lines}
        keyExtractor={(o) => String(o.index)}
        contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 6 }}>
            {guides.length > 0 && <Label>{t('Guided lessons')}</Label>}
            {guides.map((g) => (
              <PressSlab key={g.id} onPress={() => router.push({ pathname: '/opening', params: { guide: g.id } })} style={styles.guide}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{(guideSubtitle(g) || g.name).toUpperCase()}</Text>
                  <Text style={styles.sub} numberOfLines={2}>{g.summary}</Text>
                </View>
                <Text style={styles.tag}>{learned[`guide:${g.id}`] ? '■' : t(g.level.slice(0, 3).toUpperCase())}</Text>
              </PressSlab>
            ))}
            <Label style={{ marginTop: guides.length ? 8 : 0 }}>{fam.lines.length === 1 ? t('1 line') : t('{n} lines', { n: fam.lines.length })}</Label>
          </View>
        }
        renderItem={({ item: o }) => (
          <PressSlab onPress={() => router.push({ pathname: '/opening', params: { line: String(o.index) } })} style={styles.row} shadow={3}>
            <Text style={styles.eco}>{o.eco}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={2}>{o.variation || t('Main line')}</Text>
              <Text style={styles.moves} numberOfLines={1}>{numbered(o.moves.split(' '))}</Text>
            </View>
            {learned[`line:${o.moves}`] ? <Text style={styles.done}>■</Text> : null}
          </PressSlab>
        )}
      />
    </>
  );
}

const styles = themed(() => StyleSheet.create({
  guide: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: C.white },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, color: C.muted, marginTop: 3, lineHeight: 16 },
  tag: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1, borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 6, paddingVertical: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12 },
  eco: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, color: C.muted, borderRightWidth: B.w, borderColor: C.ink, paddingRight: 10 },
  name: { fontSize: 14, fontWeight: '700' },
  moves: { fontFamily: 'mono', fontSize: 11, color: C.muted, marginTop: 2 },
  done: { fontSize: 14 },
}));
