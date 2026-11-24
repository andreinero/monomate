import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from '../components/Press';
import { router, Stack } from 'expo-router';
import { Btn, Card, Label, Rise, Text } from '../components/ui';
import { LichessFriends, type Invite } from '../components/LichessFriends';
import { B, C, F, themed } from '../lib/theme';
import { LICHESS, acceptChallenge, challenge, declineChallenge, playing, seek, LichessError } from '../lib/lichess/api';
import { challengeAnswered, incomingChallenge, subscribeLichessEvents, type IncomingChallenge } from '../lib/lichess/events';
import { CHALLENGE_CONTROLS, SEEK_CONTROLS, controlLabel } from '../lib/lichess/game';
import { store, useSettings } from '../lib/storage';
import { loginWithLichess, logoutOfLichess, useLichess } from '../lib/lichess/session';
import { t } from '../lib/i18n';

type Incoming = IncomingChallenge;
type Ongoing = { id: string; opponent: string; myTurn: boolean };
type Waiting = { kind: 'seek' | 'challenge'; control: string; rated: boolean; name?: string; since: number; abort: AbortController };
/** Colour choices for a challenge (translated where shown). */
const COLOR_LABELS = { random: 'Random', white: 'White', black: 'Black' } as const;
const clockNow = () => Date.now();

/** Play real people through Lichess: random opponents (Rapid or slower) or a friend by username. */
export default function OnlineLobby() {
  const session = useLichess();
  const me = session.account;
  const settings = useSettings();
  const focus = !!settings.focusMode;
  const [rated, setRated] = useState(true);
  const [friend, setFriend] = useState('');
  const [friendControl, setFriendControl] = useState(3);
  const [friendColor, setFriendColor] = useState<'random' | 'white' | 'black'>('random');
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [ongoing, setOngoing] = useState<Ongoing[]>([]);
  const [waiting, setWaiting] = useState<Waiting | null>(null);
  // Messages appear next to the section they belong to.
  const [message, setMessageState] = useState<{ text: string; where: 'seek' | 'friend' | 'top' } | null>(null);
  const setMessage = (text: string | null, where: 'seek' | 'friend' | 'top' = 'top') => setMessageState(text ? { text, where } : null);
  const [seekControl, setSeekControl] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const opened = useRef(new Set<string>());
  const waitingRef = useRef<Waiting | null>(null);

  const openGame = (id: string) => {
    if (opened.current.has(id)) return;
    opened.current.add(id);
    waitingRef.current?.abort.abort();
    waitingRef.current = null;
    setWaiting(null);
    router.push({ pathname: '/online-game', params: { id } });
  };

  // Event stream (shared with the app-wide challenge pop-up): new games, incoming challenges.
  useEffect(() => {
    if (session.status !== 'loggedIn') return;
    const unsubscribe = subscribeLichessEvents((e) => {
      if (e.type === 'gameStart' && e.game) {
        const g = e.game;
        if (g.speed === 'correspondence' || g.compat?.board === false) return;
        setOngoing((list) => [...list.filter((x) => x.id !== g.gameId), { id: g.gameId, opponent: g.opponent?.username ?? '', myTurn: !!g.isMyTurn }]);
        setIncoming((list) => list.filter((x) => x.id !== g.gameId));
        // A game we were waiting for (seek or challenge) — or any new one with no moves yet.
        if (waitingRef.current || g.hasMoved === false) openGame(g.gameId);
      } else if (e.type === 'gameFinish' && e.game) {
        setOngoing((list) => list.filter((x) => x.id !== e.game.gameId));
      } else if (e.type === 'challenge') {
        const c = incomingChallenge(e.challenge);
        if (c) setIncoming((list) => [...list.filter((x) => x.id !== c.id), c]);
      } else if ((e.type === 'challengeCanceled' || e.type === 'challengeDeclined') && e.challenge) {
        setIncoming((list) => list.filter((x) => x.id !== e.challenge.id));
      }
    });
    return () => {
      unsubscribe();
      waitingRef.current?.abort.abort();
    };
  }, [session.status]);

  // Ongoing games straight from Lichess (so you can always get back into a game).
  useEffect(() => {
    if (session.status !== 'loggedIn') return;
    let alive = true;
    playing()
      .then((list) => {
        if (!alive) return;
        const realtime = list.filter((g) => g.speed !== 'correspondence');
        setOngoing((cur) => [
          ...cur.filter((x) => !realtime.some((g) => g.gameId === x.id)),
          ...realtime.map((g) => ({ id: g.gameId, opponent: g.opponent?.username ?? '', myTurn: !!g.isMyTurn })),
        ]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session.status]);

  // Tick the "searching…" timer.
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [waiting]);

  /**
   * After a seek or challenge ends, ask Lichess directly which new game exists (instead of relying
   * only on the event stream) and open it. Returns false if no new game shows up.
   */
  const openNewGame = async (before: Set<string>): Promise<boolean> => {
    for (let i = 0; i < 6; i++) {
      try {
        const g = (await playing()).find((x) => !before.has(x.gameId) && x.speed !== 'correspondence');
        if (g) {
          openGame(g.gameId);
          return true;
        }
      } catch {
        // try again
      }
      if (!waitingRef.current) return true; // already opened via the event stream (or cancelled)
      await new Promise((r) => setTimeout(r, 1200));
    }
    return false;
  };
  const ongoingIds = async () => new Set((await playing().catch(() => [])).map((g) => g.gameId));

  const startWaiting = (kind: Waiting['kind'], info: { control: string; rated: boolean; name?: string }) => {
    waitingRef.current?.abort.abort();
    const w: Waiting = { kind, ...info, since: clockNow(), abort: new AbortController() };
    waitingRef.current = w;
    setWaiting(w);
    setNow(clockNow());
    setMessage(null);
    return w;
  };
  const stopWaiting = (msg?: string) => {
    const where = waitingRef.current?.kind === 'challenge' ? 'friend' : 'seek';
    waitingRef.current?.abort.abort();
    waitingRef.current = null;
    setWaiting(null);
    if (msg) setMessage(msg, where);
  };

  const findOpponent = async (c: { time: number; inc: number }) => {
    const w = startWaiting('seek', { control: controlLabel(c), rated });
    const before = await ongoingIds();
    try {
      await seek({ ...c, rated }, w.abort.signal);
      // Lichess closes the seek when an opponent accepts it (or when it expires): find the new game.
      if (waitingRef.current !== w || w.abort.signal.aborted) return;
      if (!(await openNewGame(before)) && waitingRef.current === w) stopWaiting(t('No opponent found. Try again or pick another time control.'));
    } catch (e) {
      if (waitingRef.current === w) stopWaiting(e instanceof Error ? e.message : String(e));
    }
  };

  const challengeFriend = () => {
    const name = friend.trim();
    if (!name) return setMessage(t('Type your friend’s Lichess username.'), 'friend');
    sendChallenge({ username: name, control: CHALLENGE_CONTROLS[friendControl], color: friendColor, rated });
  };

  const sendChallenge = async ({ username: name, control: c, color, rated: isRated }: Invite) => {
    const w = startWaiting('challenge', { control: controlLabel(c), rated: isRated, name });
    const before = await ongoingIds();
    try {
      const done = await challenge(name, { ...c, rated: isRated, color }, w.abort.signal);
      if (waitingRef.current !== w) return;
      if (done === 'declined') stopWaiting(t('{name} declined the challenge.', { name }));
      else if (done === 'canceled') stopWaiting(t('The challenge was canceled.'));
      else if (!(await openNewGame(before)) && waitingRef.current === w) stopWaiting(t('The challenge ended without a game. Try again.'));
    } catch (e) {
      if (waitingRef.current === w) stopWaiting(e instanceof LichessError && e.status === 404 ? t('No Lichess player called “{name}”.', { name }) : e instanceof Error ? e.message : String(e));
    }
  };

  const respond = async (c: Incoming, accept: boolean) => {
    setIncoming((list) => list.filter((x) => x.id !== c.id));
    challengeAnswered(c.id);
    try {
      if (accept) {
        await acceptChallenge(c.id);
        openGame(c.id);
      } else await declineChallenge(c.id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  if (session.status === 'unknown') {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('PLAY ONLINE') }} />
        <ActivityIndicator color={C.ink} />
      </View>
    );
  }

  if (session.status === 'loggedOut' || !me) {
    return (
      <ScrollView contentContainerStyle={styles.wrap}>
        <Stack.Screen options={{ title: t('PLAY ONLINE') }} />
        <Rise index={0}>
          <Text style={styles.hero}>{t('PLAY REAL\nPEOPLE.')}</Text>
          <Text style={styles.lead}>
            {t('MonoMate plays online through Lichess — the free, open-source chess server with millions of players. Log in with a free Lichess account to get matched with opponents around the world.')}
          </Text>
        </Rise>
        <Rise index={1}>
          <Card style={{ gap: 8 }}>
            <Text style={styles.ruleTitle}>{t('FAIR PLAY')}</Text>
            <Text style={styles.rule}>■ {t('No coach, hints or engine during online games — that’s Lichess’s rule, and it keeps games fair.')}</Text>
            <Text style={styles.rule}>■ {t('Random opponents: Rapid or slower (10 minutes and up). Blitz is possible when you challenge a friend.')}</Text>
            <Text style={styles.rule}>■ {t('Online games use your Lichess rating. Game Review still works after the game.')}</Text>
          </Card>
        </Rise>
        {session.error && <Text style={styles.error}>{session.error}</Text>}
        <Rise index={2} style={{ gap: 10 }}>
          <Btn title={t('Log in with Lichess  →')} onPress={() => loginWithLichess()} />
          <Pressable onPress={() => Linking.openURL(`${LICHESS}/signup`)} hitSlop={8}>
            <Text style={styles.link}>{t('NO ACCOUNT? CREATE ONE FREE ON LICHESS.ORG')}</Text>
          </Pressable>
        </Rise>
      </ScrollView>
    );
  }

  const perfs = me.perfs ?? {};
  const rating = (k: 'rapid' | 'classical' | 'blitz') => (perfs[k] ? String(perfs[k]!.rating) : '—');

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: t('PLAY ONLINE') }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Rise index={0}>
          <Card style={styles.account}>
            <View style={{ flex: 1 }}>
              <Text style={styles.small}>LICHESS</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.username}>{(me.title ? me.title + ' ' : '') + me.username}</Text>
                {me.flair ? <Image source={{ uri: `https://lichess1.org/assets/flair/img/${me.flair}.webp` }} style={{ width: 24, height: 24 }} /> : null}
              </View>
              <Text style={styles.small}>
                {t('RAPID {rapid} · CLASSICAL {classical} · BLITZ {blitz}', { rapid: rating('rapid'), classical: rating('classical'), blitz: rating('blitz') })}
              </Text>
            </View>
            <Pressable onPress={() => logoutOfLichess()} style={styles.smallBtn} hitSlop={6}>
              <Text style={styles.smallBtnText}>{t('LOG OUT')}</Text>
            </Pressable>
          </Card>
        </Rise>

        {message?.where === 'top' && <Text style={styles.error}>{message.text}</Text>}

        {ongoing.length > 0 && (
          <Rise index={1} style={{ gap: 8 }}>
            <Label>{t('Your games')}</Label>
            {ongoing.map((g) => (
              <Pressable key={g.id} onPress={() => router.push({ pathname: '/online-game', params: { id: g.id } })} style={styles.row}>
                <Text style={styles.rowTitle}>{t('VS {name}', { name: (focus || !g.opponent ? t('Opponent') : g.opponent).toUpperCase() })}</Text>
                <Text style={styles.rowSub}>{g.myTurn ? t('YOUR MOVE') : t('THEIR MOVE')} →</Text>
              </Pressable>
            ))}
          </Rise>
        )}

        {incoming.length > 0 && (
          <Rise index={1} style={{ gap: 8 }}>
            <Label>{t('Challenges for you')}</Label>
            {incoming.map((c) => (
              <View key={c.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{(c.from || t('Someone')).toUpperCase()}{c.rating ? ` · ${c.rating}` : ''}</Text>
                  <Text style={styles.rowSub}>{c.control} · {c.rated ? t('RATED') : t('CASUAL')}</Text>
                </View>
                <Pressable onPress={() => respond(c, false)} style={styles.smallBtn}>
                  <Text style={styles.smallBtnText}>{t('NO')}</Text>
                </Pressable>
                <Pressable onPress={() => respond(c, true)} style={[styles.smallBtn, { backgroundColor: C.ink }]}>
                  <Text style={[styles.smallBtnText, { color: C.white }]}>{t('PLAY')}</Text>
                </Pressable>
              </View>
            ))}
          </Rise>
        )}

        <Rise index={2}>
          <LichessFriends onInvite={sendChallenge} />
        </Rise>

        <Rise index={2} style={{ gap: 8 }}>
          <View style={styles.labelRow}>
            <View style={{ flex: 1 }}>
              <Label>{t('Focus mode')}</Label>
              <Text style={styles.focusSub}>{t('HIDES YOUR OPPONENT’S NAME, PICTURE AND RATING UNTIL THE GAME ENDS')}</Text>
            </View>
            <Pressable onPress={() => store.saveSettings({ ...settings, focusMode: !focus })} style={styles.toggle} hitSlop={6}>
              <Text style={[styles.toggleText, !focus && styles.toggleOn]}>{t('OFF')}</Text>
              <Text style={[styles.toggleText, focus && styles.toggleOn]}>{t('ON')}</Text>
            </Pressable>
          </View>
          <View style={styles.labelRow}>
            <Label>{t('Random opponent')}</Label>
            <Pressable onPress={() => setRated((r) => !r)} style={styles.toggle} hitSlop={6}>
              <Text style={[styles.toggleText, !rated && styles.toggleOn]}>{t('CASUAL')}</Text>
              <Text style={[styles.toggleText, rated && styles.toggleOn]}>{t('RATED')}</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {SEEK_CONTROLS.map((c, i) => {
              const on = seekControl === i;
              return (
                <Pressable key={controlLabel(c)} onPress={() => setSeekControl(i)} style={[styles.tile, on && { backgroundColor: C.ink }]}>
                  <Text style={[styles.tileMain, on && { color: C.white }]}>{controlLabel(c)}</Text>
                  <Text style={[styles.tileSub, on && { color: C.white }]}>{c.time >= 30 ? t('CLASSICAL') : t('RAPID')}</Text>
                </Pressable>
              );
            })}
          </View>
          <Btn title={t('Find opponent · {control}  →', { control: controlLabel(SEEK_CONTROLS[seekControl]) })} onPress={() => findOpponent(SEEK_CONTROLS[seekControl])} />
          {message?.where === 'seek' && <Text style={styles.error}>{message.text}</Text>}
        </Rise>

        <Rise index={3} style={{ gap: 8 }}>
          <Label>{t('Challenge a friend')}</Label>
          <TextInput
            value={friend}
            onChangeText={setFriend}
            placeholder={t("Friend's Lichess username")}
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <View style={styles.grid}>
            {CHALLENGE_CONTROLS.map((c, i) => (
              <Pressable key={controlLabel(c)} onPress={() => setFriendControl(i)} style={[styles.chip, friendControl === i && { backgroundColor: C.ink }]}>
                <Text style={[styles.chipText, friendControl === i && { color: C.white }]}>{controlLabel(c)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.grid}>
            {(['random', 'white', 'black'] as const).map((k) => (
              <Pressable key={k} onPress={() => setFriendColor(k)} style={[styles.chip, { flex: 1 }, friendColor === k && { backgroundColor: C.ink }]}>
                <Text style={[styles.chipText, friendColor === k && { color: C.white }]}>{t(COLOR_LABELS[k]).toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>
          <Btn title={t('Send challenge  →')} onPress={challengeFriend} disabled={!friend.trim()} />
          {message?.where === 'friend' && <Text style={styles.error}>{message.text}</Text>}
        </Rise>
        <Text style={styles.note}>{t('ONLINE GAMES ARE PLAYED ON LICHESS.ORG · NO COACH OR ENGINE DURING PLAY')}</Text>
      </ScrollView>

      {waiting && (
        <View style={styles.overlay}>
          <Card style={styles.waitCard}>
            <ActivityIndicator color={C.ink} size="large" />
            <Text style={styles.waitTitle}>{waiting.kind === 'seek' ? t('FINDING AN OPPONENT') : t('CHALLENGE SENT')}</Text>
            <Text style={styles.small}>
              {waiting.name
                ? t('WAITING FOR {name} · {control} · {mode}', { name: waiting.name.toUpperCase(), control: waiting.control, mode: waiting.rated ? t('RATED') : t('CASUAL') })
                : `${waiting.control} · ${waiting.rated ? t('RATED') : t('CASUAL')}`}
            </Text>
            <Text style={styles.waitClock}>
              {Math.floor((now - waiting.since) / 60000)}:{String(Math.floor(((now - waiting.since) / 1000) % 60)).padStart(2, '0')}
            </Text>
            <Btn kind="secondary" title={t('Cancel')} onPress={() => stopWaiting()} style={{ alignSelf: 'stretch' }} />
          </Card>
        </View>
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { padding: 16, gap: 12, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { fontSize: 40, lineHeight: 41, fontWeight: '700', letterSpacing: -1.4, marginTop: 4 },
  lead: { fontSize: 15, lineHeight: 21, marginTop: 10 },
  ruleTitle: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1.5 },
  rule: { fontSize: 14, lineHeight: 19 },
  link: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1, textAlign: 'center', textDecorationLine: 'underline' },
  error: { fontFamily: 'mono', fontSize: 12, color: C.danger, borderWidth: B.w, borderColor: C.danger, padding: 10 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  username: { fontSize: 24, fontWeight: '700', marginVertical: 2 },
  small: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1, color: C.muted },
  smallBtn: { borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: C.white },
  smallBtnText: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, padding: 12, justifyContent: 'space-between' },
  rowTitle: { fontWeight: '700', fontSize: 15 },
  rowSub: { fontFamily: 'mono', fontSize: 11, color: C.muted, marginTop: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggle: { flexDirection: 'row', borderWidth: B.w, borderColor: C.ink },
  toggleText: { fontFamily: 'mono', fontWeight: '700', fontSize: 10, paddingHorizontal: 8, paddingVertical: 4, letterSpacing: 1 },
  toggleOn: { backgroundColor: C.ink, color: C.white },
  focusSub: { fontFamily: 'mono', fontSize: 9, letterSpacing: 0.8, color: C.muted, marginTop: 3, marginRight: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.6%', borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, alignItems: 'center', paddingVertical: 14 },
  tileMain: { fontFamily: 'mono', fontWeight: '700', fontSize: 20 },
  tileSub: { fontFamily: 'mono', fontSize: 9, letterSpacing: 1.2, marginTop: 2 },
  input: { borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 11, fontFamily: F.mono, fontSize: 14, color: C.ink },
  chip: { borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
  chipText: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
  note: { fontFamily: 'mono', color: C.muted, fontSize: 9, letterSpacing: 1, textAlign: 'center', marginTop: 8 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  waitCard: { alignItems: 'center', gap: 10, width: '100%', maxWidth: 360, paddingVertical: 24 },
  waitTitle: { fontWeight: '700', fontSize: 20, marginTop: 6 },
  waitClock: { fontFamily: 'mono', fontWeight: '700', fontSize: 28 },
}));
