import { useEffect, useMemo, useState } from 'react';
import { Animated, FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../components/Press';
import { router, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Btn, Text } from '../components/ui';
import { UserAvatar } from '../components/UserAvatar';
import { AVATAR_PARTS, randomAvatar, type AvatarConfig } from '../lib/avatar';
import { store, useStored } from '../lib/storage';
import { deletePhoto } from '../lib/photo';
import { B, C, themed } from '../lib/theme';
import { t } from '../lib/i18n';

const COLS = 4;

/** Build your own avatar in the same drawn style as the coaches. */
export default function AvatarEditor() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [profile] = useStored(store.profile, { name: 'You', botWins: {} });
  const [fallback] = useState(randomAvatar);
  const [draft, setDraft] = useState<AvatarConfig | null>(null);
  const [part, setPart] = useState(0);
  const cfg = draft ?? profile.avatar ?? fallback;
  const p = AVATAR_PARTS[part];

  // Little bounce on every change.
  const [bounce] = useState(() => new Animated.Value(1));
  const cfgKey = JSON.stringify(cfg);
  useEffect(() => {
    bounce.setValue(0.92);
    Animated.spring(bounce, { toValue: 1, useNativeDriver: true, speed: 22, bounciness: 12 }).start();
  }, [cfgKey, bounce]);

  const choices = useMemo(() => [...(p.optional ? [null] : []), ...p.options], [p]);
  const tile = Math.floor((width - 32 - (COLS - 1) * 8) / COLS);

  const save = async (avatar: AvatarConfig | undefined) => {
    const prof = await store.profile();
    // A saved avatar replaces any photo.
    deletePhoto(prof.photo);
    await store.saveProfile({ ...prof, avatar, photo: undefined });
    router.back();
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t('YOUR AVATAR') }} />
      <View style={styles.preview}>
        <Animated.View style={{ transform: [{ scale: bounce }] }}>
          <UserAvatar config={cfg} size={150} />
        </Animated.View>
        <Btn small kind="secondary" title={t('Random')} icon="↻" onPress={() => setDraft(randomAvatar())} style={{ marginTop: 12 }} />
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {AVATAR_PARTS.map((x, i) => (
            <Pressable key={x.key} onPress={() => setPart(i)} style={[styles.tab, part === i && { backgroundColor: C.ink }]}>
              <Text style={[styles.tabText, part === i && { color: C.white }]}>{t(x.label).toUpperCase()}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <FlatList
        key={p.key}
        data={choices}
        numColumns={COLS}
        keyExtractor={(o) => o ?? 'none'}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 8 }}
        columnWrapperStyle={{ gap: 8 }}
        initialNumToRender={12}
        windowSize={5}
        renderItem={({ item }) => {
          const on = (cfg[p.key] ?? null) === item;
          return (
            <Pressable onPress={() => setDraft({ ...cfg, [p.key]: item })} style={[styles.choice, on && styles.choiceOn]}>
              {item === null ? (
                <View style={[styles.none, { width: tile - 8, height: tile - 8 }]}>
                  <Text style={styles.noneText}>{t('NONE')}</Text>
                </View>
              ) : (
                <UserAvatar config={{ ...cfg, [p.key]: item }} size={tile - 8} />
              )}
            </Pressable>
          );
        }}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {profile.avatar && <Btn kind="secondary" title={t('Use letter')} style={{ flex: 1 }} onPress={() => save(undefined)} />}
        <Btn title={t('Save  →')} style={{ flex: 1 }} onPress={() => save(cfg)} />
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  preview: { alignItems: 'center', paddingVertical: 16, borderBottomWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  tabs: { paddingHorizontal: 16, paddingVertical: 10, gap: 6 },
  tab: { borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.white },
  tabText: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  choice: { padding: 2, borderWidth: B.w, borderColor: 'transparent' },
  choiceOn: { borderColor: C.ink, backgroundColor: C.ink },
  none: { borderWidth: B.w, borderColor: C.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: C.paper },
  noneText: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  footer: { flexDirection: 'row', gap: 10, padding: 16, paddingTop: 12, borderTopWidth: B.w, borderColor: C.ink, backgroundColor: C.bg },
}));
