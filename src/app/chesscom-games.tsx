import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Btn, Label, PressSlab, Text } from '../components/ui';
import { ChesscomCard } from '../components/ChesscomCard';
import { recentGames, sideOf, toSavedGame, type ChesscomGame } from '../lib/chesscom';
import { store, useStored } from '../lib/storage';
import { C, themed } from '../lib/theme';
import { t } from '../lib/i18n';

/** chess.com time classes (translated where shown). */
const TIME_CLASS: Record<string, string> = { daily: 'DAILY', rapid: 'RAPID', blitz: 'BLITZ', bullet: 'BULLET' };

type Loaded = { user: string; games?: ChesscomGame[]; error?: string };

/** The linked chess.com account's latest games; tap one to open it in Game Review. */
export default function ChesscomGames() {
  const [profile] = useStored(store.profile, { name: 'You', botWins: {} });
  const user = profile.chesscom?.username;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [openError, setOpenError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    recentGames(user, 30).then(
      (games) => alive && setLoaded({ user, games }),
      (e) => alive && setLoaded({ user, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      alive = false;
    };
  }, [user, attempt]);

  const open = async (g: ChesscomGame) => {
    if (!user) return;
    try {
      const saved = toSavedGame(g, user);
      await store.saveGame(saved);
      setOpenError(null);
      router.push({ pathname: '/review', params: { id: saved.id } });
    } catch {
      setOpenError(t('Couldn’t read that game.'));
    }
  };

  const mine = loaded?.user === user ? loaded : null;
  // Not linked yet: link right here (just your username — public games, no password).
  if (!user)
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <ChesscomCard linked={undefined} gamesLink={false} />
        <Text style={styles.muted}>{t('Type your chess.com username and tap LINK. Your recent games appear here — tap one for a full Game Review.')}</Text>
      </ScrollView>
    );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}>
      <Label>{t('{user} · last {n} games', { user, n: mine?.games?.length ?? 30 })}</Label>
      {openError && <Text style={styles.error}>{openError}</Text>}
      {!mine && <ActivityIndicator color={C.ink} style={{ marginTop: 24 }} />}
      {mine?.error && (
        <View style={{ gap: 10 }}>
          <Text style={styles.error}>{mine.error}</Text>
          <Btn kind="secondary" title={t('Try again')} onPress={() => { setLoaded(null); setAttempt((a) => a + 1); }} />
        </View>
      )}
      {mine?.games?.length === 0 && <Text style={styles.muted}>{t('No standard chess games yet.')}</Text>}
      {mine?.games?.map((g) => {
        const side = sideOf(g, user) ?? 'w';
        const opp = side === 'w' ? g.black : g.white;
        const outcome = g.result === '1/2-1/2' ? 'DRAW' : g.result === '*' ? '·' : (g.result === '1-0') === (side === 'w') ? 'WIN' : 'LOSS';
        return (
          <PressSlab key={g.url} onPress={() => open(g)} style={styles.game}>
            <Text style={[styles.result, outcome === 'LOSS' && { color: C.danger }]}>{outcome === '·' ? outcome : t(outcome)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.gameTitle} numberOfLines={1}>{`${t('VS {name}', { name: opp.username.toUpperCase() })} · ${opp.rating}`}</Text>
              <Text style={styles.muted}>
                {TIME_CLASS[g.timeClass] ? t(TIME_CLASS[g.timeClass]) : g.timeClass.toUpperCase()} · {new Date(g.endTime * 1000).toLocaleDateString()} · {t(g.reason)}
              </Text>
            </View>
            <Text style={styles.go}>→</Text>
          </PressSlab>
        );
      })}
    </ScrollView>
  );
}

const styles = themed(() => StyleSheet.create({
  game: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  result: { fontFamily: 'mono', fontWeight: '700', fontSize: 13, minWidth: 40 },
  gameTitle: { fontWeight: '700', fontSize: 15 },
  go: { fontSize: 20, fontWeight: '700' },
  muted: { fontFamily: 'mono', color: C.muted, fontSize: 11, marginTop: 2 },
  error: { fontFamily: 'mono', fontSize: 11, color: C.danger },
}));
