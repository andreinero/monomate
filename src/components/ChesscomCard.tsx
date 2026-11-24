import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Pressable } from './Press';
import { Slab, Text } from './ui';
import { player as chesscomPlayer, stats as chesscomStats, type ChesscomRatings } from '../lib/chesscom';
import { store, type Profile } from '../lib/storage';
import { B, C, F, themed } from '../lib/theme';
import { t } from '../lib/i18n';

/** Rating categories (translated where shown). */
const PERF_LABELS = { rapid: 'RAPID', blitz: 'BLITZ', bullet: 'BULLET' } as const;

/** chess.com account: just a username (public data, no login), with its current ratings. */
export function ChesscomCard({ linked, gamesLink = true }: { linked: Profile['chesscom']; gamesLink?: boolean }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<{ user: string; r?: ChesscomRatings; failed?: boolean } | null>(null);
  const user = linked?.username;

  useEffect(() => {
    if (!user) return;
    let alive = true;
    chesscomStats(user).then(
      (r) => alive && setRatings({ user, r }),
      () => alive && setRatings({ user, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [user]);

  const link = async () => {
    if (!input.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const pl = await chesscomPlayer(input);
      const p = await store.profile();
      await store.saveProfile({ ...p, chesscom: { username: pl.username, linkedAt: Date.now() } });
      setInput('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    const p = await store.profile();
    await store.saveProfile({ ...p, chesscom: undefined });
  };

  const mine = ratings?.user === user ? ratings : null;
  const line = !mine
    ? t('LOADING RATINGS…')
    : mine.failed
      ? t('RATINGS UNAVAILABLE')
      : (['rapid', 'blitz', 'bullet'] as const).filter((k) => mine.r?.[k] !== undefined).map((k) => `${t(PERF_LABELS[k])} ${mine.r![k]}`).join(' · ') || t('NO RATED GAMES YET');

  return (
    <Slab style={{ padding: 14, gap: 12 }}>
      <View>
        <Text style={styles.lichessName} numberOfLines={1}>{user ?? 'CHESS.COM'}</Text>
        <Text style={styles.statLabel}>{user ? `CHESS.COM · ${line}` : t('LINK YOUR USERNAME · PUBLIC DATA ONLY, NO PASSWORD')}</Text>
      </View>
      <View style={styles.cardRule} />
      {user ? (
        <View style={styles.cardRow}>
          <Pressable onPress={() => router.push('/chesscom-games')} hitSlop={6} style={{ flex: 1 }} disabled={!gamesLink}>
            <Text style={styles.cardLink}>{gamesLink ? t('REVIEW YOUR CHESS.COM GAMES →') : t('LINKED')}</Text>
          </Pressable>
          <Pressable onPress={unlink} hitSlop={6}>
            <Text style={[styles.cardLink, { color: C.muted }]}>{t('UNLINK')}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.cardRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            onSubmitEditing={link}
            placeholder={t('chess.com username')}
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            editable={!busy}
            style={styles.input}
          />
          <Pressable onPress={link} disabled={busy || !input.trim()} style={[styles.change, (busy || !input.trim()) && { opacity: 0.4 }]}>
            <Text style={styles.changeText}>{busy ? '…' : t('LINK')}</Text>
          </Pressable>
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </Slab>
  );
}

const styles = themed(() => StyleSheet.create({
  lichessName: { fontWeight: '700', fontSize: 20 },
  statLabel: { fontFamily: 'mono', fontSize: 9, letterSpacing: 1.2, color: C.muted, marginTop: 2 },
  cardRule: { height: B.w, backgroundColor: C.ink },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardLink: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  change: { borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 12, paddingVertical: 8 },
  changeText: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  input: { flex: 1, minWidth: 0, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingHorizontal: 10, paddingVertical: 8, fontFamily: F.mono, fontSize: 14, color: C.ink },
  error: { fontFamily: 'mono', fontSize: 11, color: C.danger },
}));
