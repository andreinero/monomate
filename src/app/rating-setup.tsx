import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '../components/Press';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Rise, Text } from '../components/ui';
import { RATING_LEVELS, clampRating } from '../lib/elo';
import { store } from '../lib/storage';
import { B, C, F, themed } from '../lib/theme';
import { t } from '../lib/i18n';

/** Pick a starting Elo rating — once. After that the rating only changes through rated games. */
export default function RatingSetup() {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(800);
  const [text, setText] = useState(String(rating));

  const set = (r: number) => {
    const v = clampRating(r);
    setRating(v);
    setText(String(v));
  };

  const save = async (rating: number) => {
    const p = await store.profile();
    // Already chosen (e.g. this screen was opened twice): never overwrite it.
    if (p.rating !== undefined) return router.canGoBack() ? router.back() : router.replace('/');
    const history = [...(p.ratingHistory ?? []), { date: Date.now(), rating }];
    await store.saveProfile({ ...p, rating, ratedGames: 0, ratingHistory: history.slice(-200) });
    // Start puzzles near the same level if none have been played yet.
    const ps = await store.puzzleStats();
    if (ps.solved + ps.failed === 0) await store.savePuzzleStats({ ...ps, rating });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const level = [...RATING_LEVELS].reverse().find((l) => rating >= l.rating) ?? RATING_LEVELS[0];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: t('WELCOME'), headerBackVisible: false, gestureEnabled: false }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Rise index={0}>
          <Text style={styles.hero}>{t("WHAT'S YOUR\nRATING?")}</Text>
          <Text style={styles.lead}>
            {t('Pick the level closest to you, or type your exact rating from another site. You choose it once — after that it only goes up when you win and down when you lose rated games against bots.')}
          </Text>
        </Rise>
        {RATING_LEVELS.map((l, i) => {
          const on = level.rating === l.rating;
          return (
            <Rise key={l.rating} index={i + 1}>
              <Pressable onPress={() => set(l.rating)} style={({ pressed }) => [styles.level, (on || pressed) && { backgroundColor: C.ink }]}>
                {({ pressed }) => {
                  const fg = on || pressed ? C.white : C.ink;
                  return (
                    <>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.levelTitle, { color: fg }]}>{t(l.title).toUpperCase()}</Text>
                        <Text style={[styles.levelSub, { color: on || pressed ? C.white : C.muted }]}>{t(l.sub)}</Text>
                      </View>
                      <Text style={[styles.levelRating, { color: fg }]}>{l.rating}</Text>
                    </>
                  );
                }}
              </Pressable>
            </Rise>
          );
        })}
        <Rise index={7} style={{ gap: 8, marginTop: 6 }}>
          <Text style={styles.small}>{t('EXACT RATING')}</Text>
          <View style={styles.stepper}>
            {[-100, -10].map((d) => (
              <Pressable key={d} onPress={() => set(rating + d)} style={styles.step}>
                <Text style={styles.stepText}>{d}</Text>
              </Pressable>
            ))}
            <TextInput
              value={text}
              onChangeText={(s) => setText(s.replace(/[^0-9]/g, '').slice(0, 4))}
              onEndEditing={() => set(Number(text) || rating)}
              onSubmitEditing={() => set(Number(text) || rating)}
              keyboardType="number-pad"
              returnKeyType="done"
              style={styles.input}
              selectTextOnFocus
            />
            {[10, 100].map((d) => (
              <Pressable key={d} onPress={() => set(rating + d)} style={styles.step}>
                <Text style={styles.stepText}>+{d}</Text>
              </Pressable>
            ))}
          </View>
        </Rise>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Btn
          title={t('Start at {rating}  →', { rating: clampRating(Number(text) || rating) })}
          // Use the typed value even if the field hasn't been submitted yet.
          onPress={() => save(clampRating(Number(text) || rating))}
        />
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  hero: { fontSize: 40, lineHeight: 41, fontWeight: '700', letterSpacing: -1.4, marginTop: 4 },
  lead: { fontSize: 15, lineHeight: 21, marginTop: 10, marginBottom: 6 },
  level: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingVertical: 12, paddingHorizontal: 14 },
  levelTitle: { fontWeight: '700', fontSize: 17 },
  levelSub: { fontFamily: 'mono', fontSize: 11, marginTop: 3 },
  levelRating: { fontFamily: 'mono', fontWeight: '700', fontSize: 22 },
  small: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1.4, color: C.muted },
  stepper: { flexDirection: 'row', borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  step: { paddingHorizontal: 12, justifyContent: 'center', borderRightWidth: B.w, borderLeftWidth: 0, borderColor: C.ink },
  stepText: { fontFamily: 'mono', fontWeight: '700', fontSize: 13 },
  footer: { padding: 16, paddingTop: 12, backgroundColor: C.bg, borderTopWidth: B.w, borderColor: C.ink },
  input: { flex: 1, minWidth: 0, textAlign: 'center', fontFamily: F.mono, fontWeight: '700', fontSize: 26, paddingVertical: 10, color: C.ink, borderRightWidth: B.w, borderColor: C.ink },
}));
