import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from './Press';
import { Btn, Label, Slab, Text } from './ui';
import { B, C, F, P, themed } from '../lib/theme';
import { LichessError, follow, following, statuses, unfollow, userExists, type Friend } from '../lib/lichess/api';
import { CHALLENGE_CONTROLS, controlLabel } from '../lib/lichess/game';
import { loginWithLichess } from '../lib/lichess/session';
import { t } from '../lib/i18n';

export type Invite = { username: string; control: { time: number; inc: number }; color: 'random' | 'white' | 'black'; rated: boolean };

/** Colour choices for an invite (translated where shown). */
const COLOR_LABELS = { random: 'Random', white: 'White', black: 'Black' } as const;

const rank = (f: Friend) => (f.playing ? 1 : f.online ? 0 : 2);
const sortFriends = (list: Friend[]) => [...list].sort((a, b) => rank(a) - rank(b) || a.username.localeCompare(b.username));

/**
 * Your Lichess friends (the players you follow there, so it's the same list as on lichess.org),
 * who is online, and a friendly-game invite for each.
 */
export function LichessFriends({ onInvite }: { onInvite: (invite: Invite) => void }) {
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState<Friend | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const list = await following();
      if (!alive.current) return;
      setNeedsReconnect(false);
      setError(null);
      setFriends(sortFriends(list));
    } catch (e) {
      if (!alive.current) return;
      // Logged in before MonoMate asked for the friends permission: one more Lichess login fixes it.
      if (e instanceof LichessError && (e.status === 403 || /scope/i.test(e.message))) setNeedsReconnect(true);
      else setError(e instanceof Error ? e.message : String(e));
      setFriends([]);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(load);
  }, [load]);

  // Who's online: refresh every 20 seconds while the lobby is open.
  const ids = (friends ?? []).map((f) => f.id).join(',');
  useEffect(() => {
    if (!ids) return;
    const update = () =>
      statuses(ids.split(','))
        .then((list) => {
          if (!alive.current) return;
          const by = new Map(list.map((s) => [s.id, s]));
          setFriends((cur) => (cur ? sortFriends(cur.map((f) => ({ ...f, online: !!by.get(f.id)?.online, playing: !!by.get(f.id)?.playing }))) : cur));
        })
        .catch(() => {});
    update();
    const t = setInterval(update, 20000);
    return () => clearInterval(t);
  }, [ids]);

  const reconnect = async () => {
    if (await loginWithLichess()) load();
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      if (!(await userExists(name))) {
        setError(t('No Lichess player called “{name}”.', { name }));
        return;
      }
      await follow(name);
      setNewName('');
      setAdding(false);
      await load();
    } catch (e) {
      if (e instanceof LichessError && e.status === 403) setNeedsReconnect(true);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const remove = async (f: Friend) => {
    setInviting(null);
    setFriends((cur) => cur?.filter((x) => x.id !== f.id) ?? cur);
    try {
      await unfollow(f.username);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      load();
    }
  };

  // Unfriend = unfollow on Lichess (it's the same list), after a confirmation.
  const confirmUnfriend = (f: Friend) =>
    Alert.alert(t('Unfriend {name}?', { name: f.username }), t('They’re removed from your friends here and on lichess.org.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Unfriend'), style: 'destructive', onPress: () => remove(f) },
    ]);

  const online = (friends ?? []).filter((f) => f.online).length;

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.labelRow}>
        <Label>{friends && friends.length ? t('Friends · {n} online', { n: online }) : t('Friends')}</Label>
        {!needsReconnect && (
          <Pressable onPress={() => setAdding((a) => !a)} style={styles.smallBtn} hitSlop={6}>
            <Text style={styles.smallBtnText}>{adding ? t('CLOSE') : t('+ ADD')}</Text>
          </Pressable>
        )}
      </View>

      {adding && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={add}
            placeholder={t('Lichess username')}
            placeholderTextColor={C.muted}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={[styles.input, { flex: 1, minWidth: 0 }]}
          />
          <Btn small title={busy ? '…' : t('Add')} onPress={add} disabled={busy || !newName.trim()} />
        </View>
      )}

      {needsReconnect ? (
        <View style={styles.box}>
          <Text style={styles.boxText}>{t('Your friends list lives on Lichess. Log in to Lichess once more to let MonoMate see it and send invites.')}</Text>
          <Btn small title={t('Connect friends list  →')} onPress={reconnect} />
        </View>
      ) : friends === null ? (
        <View style={[styles.box, { alignItems: 'center' }]}>
          <ActivityIndicator color={C.ink} />
        </View>
      ) : friends.length === 0 ? (
        <View style={styles.box}>
          <Text style={styles.boxText}>{t('No friends yet. Tap + ADD and type a Lichess username. It’s the same list as your friends on lichess.org.')}</Text>
        </View>
      ) : (
        friends.map((f) => (
          <Pressable key={f.id} onPress={() => setInviting(f)} style={styles.row}>
            <View style={[styles.dot, f.playing ? styles.dotPlaying : f.online ? styles.dotOnline : null]} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {f.title ? <Text style={styles.titleTag}>{f.title} </Text> : null}
                  {f.username}
                </Text>
                {f.flair ? <Image source={{ uri: `https://lichess1.org/assets/flair/img/${f.flair}.webp` }} style={{ width: 18, height: 18 }} /> : null}
                {f.flag ? <Image source={{ uri: `https://lichess1.org/assets/flags/${encodeURIComponent(f.flag)}.webp` }} style={{ width: 18, height: 18 }} /> : null}
              </View>
              <Text style={styles.sub}>
                {f.playing ? t('PLAYING') : f.online ? t('ONLINE') : t('OFFLINE')}
                {f.rating ? ` · ${f.rating}` : ''}
              </Text>
            </View>
            <View style={[styles.smallBtn, f.online && !f.playing && { backgroundColor: C.ink }]}>
              <Text style={[styles.smallBtnText, f.online && !f.playing && { color: C.white }]}>{t('INVITE')}</Text>
            </View>
            <Pressable onPress={() => confirmUnfriend(f)} style={styles.removeBtn} hitSlop={6} accessibilityLabel={t('Unfriend {name}', { name: f.username })}>
              <Text style={styles.smallBtnText}>✕</Text>
            </Pressable>
          </Pressable>
        ))
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <InviteSheet
        key={inviting?.id ?? 'none'}
        friend={inviting}
        onClose={() => setInviting(null)}
        onSend={(inv) => {
          setInviting(null);
          onInvite(inv);
        }}
        onRemove={remove}
      />
    </View>
  );
}

/** Pick the time control, colour and casual/rated for a friendly game, then send it. */
function InviteSheet({ friend, onClose, onSend, onRemove }: { friend: Friend | null; onClose: () => void; onSend: (i: Invite) => void; onRemove: (f: Friend) => void }) {
  const [control, setControl] = useState(3);
  const [color, setColor] = useState<Invite['color']>('random');
  const [rated, setRated] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <Modal visible={!!friend} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 400 }}>
          <Slab style={{ padding: 18, gap: 12 }}>
            <Text style={styles.kicker}>{t('FRIENDLY GAME')}</Text>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {friend?.username}
            </Text>
            <Text style={styles.sub}>{friend?.playing ? t('PLAYING A GAME RIGHT NOW') : friend?.online ? t('ONLINE NOW') : t('OFFLINE · THEY’LL SEE IT WHEN THEY’RE BACK')}</Text>
            <View style={styles.grid}>
              {CHALLENGE_CONTROLS.map((c, i) => (
                <Pressable key={controlLabel(c)} onPress={() => setControl(i)} style={[styles.chip, control === i && { backgroundColor: C.ink }]}>
                  <Text style={[styles.chipText, control === i && { color: C.white }]}>{controlLabel(c)}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.grid}>
              {(['random', 'white', 'black'] as const).map((k) => (
                <Pressable key={k} onPress={() => setColor(k)} style={[styles.chip, { flex: 1 }, color === k && { backgroundColor: C.ink }]}>
                  <Text style={[styles.chipText, color === k && { color: C.white }]}>{t(COLOR_LABELS[k]).toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.grid}>
              {[false, true].map((r) => (
                <Pressable key={String(r)} onPress={() => setRated(r)} style={[styles.chip, { flex: 1 }, rated === r && { backgroundColor: C.ink }]}>
                  <Text style={[styles.chipText, rated === r && { color: C.white }]}>{r ? t('RATED') : t('CASUAL')}</Text>
                </Pressable>
              ))}
            </View>
            <Btn
              title={t('Send invite · {control}  →', { control: controlLabel(CHALLENGE_CONTROLS[control]) })}
              onPress={() => friend && onSend({ username: friend.username, control: CHALLENGE_CONTROLS[control], color, rated })}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Pressable
                onPress={() => (confirmRemove && friend ? onRemove(friend) : setConfirmRemove(true))}
                hitSlop={8}
                style={confirmRemove ? { backgroundColor: C.danger, paddingHorizontal: 8, paddingVertical: 4 } : { paddingVertical: 4 }}
              >
                <Text style={[styles.link, confirmRemove && { color: P.white, textDecorationLine: 'none' }]}>{confirmRemove ? t('TAP AGAIN TO UNFRIEND') : t('UNFRIEND')}</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.link}>{t('CANCEL')}</Text>
              </Pressable>
            </View>
          </Slab>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    smallBtn: { borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: C.white },
    removeBtn: { borderWidth: B.w, borderColor: C.ink, width: 34, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
    smallBtnText: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
    input: { borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 9, fontFamily: F.mono, fontSize: 14, color: C.ink },
    box: { borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, padding: 12, gap: 10 },
    boxText: { fontSize: 14, lineHeight: 19 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingVertical: 10, paddingHorizontal: 12 },
    dot: { width: 10, height: 10, borderRadius: 5, borderWidth: B.w, borderColor: C.faint },
    dotOnline: { backgroundColor: C.good, borderColor: C.good },
    dotPlaying: { backgroundColor: C.ink, borderColor: C.ink },
    name: { fontWeight: '700', fontSize: 15, flexShrink: 1 },
    titleTag: { color: C.danger, fontWeight: '700' },
    sub: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1, color: C.muted, marginTop: 2 },
    error: { fontFamily: 'mono', fontSize: 12, color: C.danger, borderWidth: B.w, borderColor: C.danger, padding: 10 },
    backdrop: { flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: 20 },
    kicker: { fontFamily: 'mono', fontSize: 10, letterSpacing: 3, color: C.muted },
    sheetTitle: { fontSize: 26, fontWeight: '700', marginTop: -6 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center' },
    chipText: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 0.5 },
    link: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1, textDecorationLine: 'underline' },
  }),
);
