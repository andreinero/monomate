import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '../../components/Press';
import { router } from 'expo-router';
import { OPENING_GUIDES, type OpeningGuide } from '../../data/openingGuides';
import { OPENINGS, openingFamilies, searchOpenings, type Opening, type OpeningFamily } from '../../engine/openings';
import { guideSubtitle, guideTitle, numbered } from '../../lib/lessons';
import { store, useStored, type Learned } from '../../lib/storage';
import { Label, PressSlab, Rise, Text } from '../../components/ui';
import { B, C, F, themed } from '../../lib/theme';
import { lang, t } from '../../lib/i18n';

// Titles are translated where they're shown.
const SECTIONS: { title: string; groups: OpeningGuide['group'][] }[] = [
  { title: 'Play as White', groups: ['e4', 'd4', 'flank'] },
  { title: 'Black against 1.e4', groups: ['vs-e4'] },
  { title: 'Black against 1.d4', groups: ['vs-d4'] },
  { title: 'Black against the rest', groups: ['vs-flank'] },
];
const LEVEL = { beginner: 0, intermediate: 1, advanced: 2 };

type Row = { kind: 'family'; f: OpeningFamily } | { kind: 'line'; o: Opening };

export default function Learn() {
  const [q, setQ] = useState('');
  const [learned] = useStored(store.learned, {} as Learned);
  const families = openingFamilies();
  const rows: Row[] = useMemo(
    () => (q.trim() ? searchOpenings(q).map((o) => ({ kind: 'line' as const, o })) : families.map((f) => ({ kind: 'family' as const, f }))),
    [q, families],
  );
  const learnedGuides = OPENING_GUIDES.filter((g) => learned[`guide:${g.id}`]).length;

  const header = (
    <View style={{ gap: 10 }}>
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('Search 3,800+ openings, ECO or moves')}
          placeholderTextColor={C.muted}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
      {!q.trim() && (
        <>
          <Rise index={0}>
            <Text style={styles.progress}>
              {t('{done}/{total} GUIDED OPENINGS LEARNED', { done: learnedGuides, total: OPENING_GUIDES.length })}
            </Text>
          </Rise>
          {SECTIONS.map((s, si) => {
            const guides = OPENING_GUIDES.filter((g) => s.groups.includes(g.group)).sort((a, b) => LEVEL[a.level] - LEVEL[b.level]);
            if (!guides.length) return null;
            return (
              <Rise key={s.title} index={si + 1} style={{ gap: 8 }}>
                <Label>{t(s.title)}</Label>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }} style={{ marginHorizontal: -16 }}>
                  <View style={{ width: 6 }} />
                  {guides.map((g) => (
                    <GuideCard key={g.id} g={g} done={!!learned[`guide:${g.id}`]} />
                  ))}
                </ScrollView>
              </Rise>
            );
          })}
          <Label style={{ marginTop: 8 }}>{t('All openings · {n} lines', { n: OPENINGS.length.toLocaleString(lang() === 'de' ? 'de-DE' : 'en-US') })}</Label>
        </>
      )}
    </View>
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => (r.kind === 'family' ? `f:${r.f.family}` : `l:${r.o.index}`)}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}
      ListEmptyComponent={<Text style={styles.empty}>{t('No opening matches “{q}”.', { q })}</Text>}
      renderItem={({ item }) =>
        item.kind === 'family' ? (
          <Pressable onPress={() => router.push({ pathname: '/opening-family', params: { family: item.f.family } })} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.paper }]}>
            <Text style={styles.eco}>{item.f.eco.slice(0, 1)}</Text>
            <Text style={styles.family} numberOfLines={1}>
              {item.f.family}
            </Text>
            <Text style={styles.count}>{item.f.lines.length}</Text>
            <Text style={styles.chev}>→</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push({ pathname: '/opening', params: { line: String(item.o.index) } })} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.paper }]}>
            <Text style={styles.eco}>{item.o.eco}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.lineName} numberOfLines={2}>
                {item.o.name}
              </Text>
              <Text style={styles.moves} numberOfLines={1}>
                {numbered(item.o.moves.split(' '))}
              </Text>
            </View>
            <Text style={styles.chev}>→</Text>
          </Pressable>
        )
      }
    />
  );
}

function GuideCard({ g, done }: { g: OpeningGuide; done: boolean }) {
  const sub = guideSubtitle(g);
  return (
    <PressSlab outerStyle={{ width: 206 }} style={styles.card} onPress={() => router.push({ pathname: '/opening', params: { guide: g.id } })}>
      <View style={styles.cardTop}>
        <Text style={styles.level}>{t(g.level.toUpperCase())}</Text>
        {done && <Text style={styles.level}>{t('■ LEARNED')}</Text>}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {guideTitle(g)}
      </Text>
      <Text style={styles.cardSub} numberOfLines={1}>
        {sub || g.eco}
      </Text>
      <Text style={styles.cardMoves} numberOfLines={2}>
        {numbered(g.moves.split(' ').slice(0, 6))}
      </Text>
    </PressSlab>
  );
}

const styles = themed(() => StyleSheet.create({
  searchWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingHorizontal: 10 },
  searchIcon: { fontSize: 18, marginRight: 6 },
  search: { flex: 1, minWidth: 0, paddingVertical: 11, fontFamily: F.mono, fontSize: 13, color: C.ink },
  progress: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1.2, color: C.muted },
  card: { padding: 12, height: 138, backgroundColor: C.white },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  level: { fontFamily: 'mono', fontSize: 9, letterSpacing: 1.2, color: C.muted },
  cardTitle: { fontSize: 17, fontWeight: '700', marginTop: 6, lineHeight: 20 },
  cardSub: { fontFamily: 'mono', fontSize: 10, color: C.muted, marginTop: 2 },
  cardMoves: { fontFamily: 'mono', fontSize: 11, marginTop: 'auto' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingVertical: 10, paddingHorizontal: 12 },
  eco: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, color: C.muted, minWidth: 30 },
  family: { flex: 1, fontSize: 15, fontWeight: '700' },
  count: { fontFamily: 'mono', fontSize: 11, color: C.muted },
  chev: { fontSize: 18, fontWeight: '700' },
  lineName: { fontSize: 14, fontWeight: '700' },
  moves: { fontFamily: 'mono', fontSize: 11, color: C.muted, marginTop: 2 },
  empty: { fontFamily: 'mono', color: C.muted, textAlign: 'center', marginTop: 20 },
}));
