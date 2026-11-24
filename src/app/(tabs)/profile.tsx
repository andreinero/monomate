import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../../components/Press';
import { router, useFocusEffect } from 'expo-router';
import { BOTS, getBot } from '../../engine/bots';
import { store, useStored, useSettings, type Settings } from '../../lib/storage';
import { B, BOARD_THEMES, C, F, appTheme, setAppTheme, themed } from '../../lib/theme';
import { Label, PressSlab, Rise, Slab, Text } from '../../components/ui';
import { Portrait, isWho } from '../../components/Portrait';
import { ProfilePicture } from '../../components/UserAvatar';
import { ChesscomCard } from '../../components/ChesscomCard';
import { deletePhoto, pickPhoto } from '../../lib/photo';
import { Sheet } from '../../components/Sheet';
import { useMyRating } from '../../lib/rating';
import { useCallback, useState } from 'react';
import { COACHES } from '../../engine/coaches';
import { hush, playVoice } from '../../lib/voice';
import { signed } from '../../lib/elo';
import { loginWithLichess, logoutOfLichess, useLichess } from '../../lib/lichess/session';
import { LANGUAGES, lang, setLanguage, t, type Lang } from '../../lib/i18n';

export default function Profile() {
  const [games] = useStored(store.games, []);
  const [profile] = useStored(store.profile, { name: 'You', botWins: {} });
  const [puzzles] = useStored(store.puzzleStats, { rating: 1200, solved: 0, failed: 0, streak: 0, bestStreak: 0, seen: [] });
  const settings = useSettings();
  const lichess = useLichess();
  const [pictureSheet, setPictureSheet] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const myRating = useMyRating();

  const vsBots = games.filter((g) => g.mode === 'bot' || g.mode === 'coach');
  const won = vsBots.filter((g) => (g.result === '1-0' && g.playerColor === 'w') || (g.result === '0-1' && g.playerColor === 'b')).length;
  const drawn = vsBots.filter((g) => g.result === '1/2-1/2').length;
  const lost = Math.max(0, vsBots.filter((g) => g.result !== '*').length - won - drawn);
  const reviewed = games.filter((g) => g.accuracy);
  const avgAcc = reviewed.length ? reviewed.reduce((s, g) => s + g.accuracy![g.playerColor], 0) / reviewed.length : null;

  const set = (patch: Partial<Settings>) => store.saveSettings({ ...settings, ...patch });
  // A coach's pitch (from picking one here) stops when you leave this tab.
  useFocusEffect(useCallback(() => () => hush(), []));
  const switchTheme = (black: boolean) => {
    setAppTheme(black ? 'black' : 'light');
    // The redraw starts the app's screens afresh: come back here.
    setTimeout(() => router.navigate('/profile'), 0);
  };
  const switchLanguage = (l: Lang) => {
    if (l === lang()) return;
    setLanguage(l);
    // Like a theme switch, the redraw starts the app's screens afresh: come back here.
    setTimeout(() => router.navigate('/profile'), 0);
  };

  /** Use a photo (library or camera) as the profile picture; the old one is deleted. */
  const setPhotoFrom = async (source: 'library' | 'camera') => {
    try {
      const name = await pickPhoto(source);
      if (!name) return;
      const p = await store.profile();
      deletePhoto(p.photo);
      await store.saveProfile({ ...p, photo: name });
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : String(e));
    }
  };
  const removePicture = async () => {
    const p = await store.profile();
    deletePhoto(p.photo);
    await store.saveProfile({ ...p, photo: undefined, avatar: undefined });
  };
  const changePicture = () => setPictureSheet(true);
  const hasPicture = !!(profile.photo || profile.avatar);

  return (
    <>
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}>
      <Rise index={0}>
        {/* One profile card: your picture, and your Lichess account when you're logged in. */}
        <Slab style={{ padding: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ProfilePicture me={profile} size={64} letter={(lichess.account?.username ?? profile.chesscom?.username ?? t('YOU')).charAt(0).toUpperCase()} />
            <Pressable style={{ flex: 1, marginLeft: 12 }} disabled={!lichess.account} onPress={() => router.push('/online')}>
              <Text style={styles.lichessName} numberOfLines={1}>
                {lichess.account ? lichess.account.username : (profile.chesscom?.username ?? t('YOU'))}
              </Text>
              <Text style={styles.statLabel}>
                {lichess.account
                  ? `LICHESS · RAPID ${lichess.account.perfs?.rapid?.rating ?? '—'} · BLITZ ${lichess.account.perfs?.blitz?.rating ?? '—'}`
                  : t('MONOMATE PLAYER')}
              </Text>
            </Pressable>
            <Pressable onPress={changePicture} style={styles.change}>
              <Text style={styles.changeText}>{hasPicture ? t('CHANGE') : t('ADD PICTURE')}</Text>
            </Pressable>
          </View>
          <View style={styles.cardRule} />
          {lichess.status === 'loggedIn' && lichess.account ? (
            <View style={styles.cardRow}>
              <Pressable onPress={() => router.push('/online')} hitSlop={6} style={{ flex: 1 }}>
                <Text style={styles.cardLink}>{t('PLAY ONLINE →')}</Text>
              </Pressable>
              <Pressable onPress={() => logoutOfLichess()} hitSlop={6}>
                <Text style={[styles.cardLink, { color: C.muted }]}>{t('LOG OUT OF LICHESS')}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.cardRow}>
              <Text style={[styles.statLabel, { flex: 1 }]}>{t('PLAY REAL PEOPLE WITH A FREE LICHESS ACCOUNT')}</Text>
              <Pressable onPress={() => loginWithLichess()} style={styles.change}>
                <Text style={styles.changeText}>{t('LOG IN')}</Text>
              </Pressable>
            </View>
          )}
        </Slab>
      </Rise>

      <Rise index={0}>
        <ChesscomCard linked={profile.chesscom} />
      </Rise>

      <Rise index={0} style={{ gap: 8 }}>
        <Label>{t('Rating')}</Label>
        <Slab style={styles.ratingCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ratingBig}>{myRating.value ?? '—'}</Text>
            <Text style={styles.statLabel}>
              {myRating.lichess
                ? t('YOUR LICHESS RAPID RATING · ONLINE GAMES CHANGE IT')
                : profile.rating === undefined
                  ? t('NOT SET')
                  : profile.ratedGames === 1
                    ? t('1 RATED GAME')
                    : t('{n} RATED GAMES', { n: profile.ratedGames ?? 0 })}
            </Text>
          </View>
          {/* The starting rating is chosen once; after that only rated games move it. */}
          {profile.rating === undefined && !myRating.lichess && (
            <Pressable onPress={() => router.push('/rating-setup')} style={styles.change}>
              <Text style={styles.changeText}>{t('SET')}</Text>
            </Pressable>
          )}
        </Slab>
        {!myRating.lichess && <RatingChart points={(profile.ratingHistory ?? []).map((h) => h.rating)} />}
      </Rise>

      <Rise index={0}>
        <Label>{t('Record vs bots')}</Label>
        <Slab style={styles.statRow} outerStyle={{ marginTop: 8 }}>
          <Stat label={t('GAMES')} value={String(games.length)} first />
          <Stat label={t('WON')} value={String(won)} />
          <Stat label={t('DRAWN')} value={String(drawn)} />
          <Stat label={t('LOST')} value={String(lost)} />
        </Slab>
        <Slab style={styles.statRow} outerStyle={{ marginTop: 8 }}>
          <Stat label={t('PUZZLE ELO')} value={String(puzzles.rating)} first />
          <Stat label={t('SOLVED')} value={String(puzzles.solved)} />
          <Stat label={t('AVG ACC')} value={avgAcc ? `${avgAcc.toFixed(0)}%` : '—'} />
        </Slab>
      </Rise>

      <Rise index={1} style={{ marginTop: 8, gap: 8 }}>
        <Label>{t('Bots defeated')}</Label>
        <View style={styles.botRow}>
          {BOTS.map((b) => {
            const beaten = (profile.botWins[b.id] ?? 0) > 0;
            return (
              <View key={b.id} style={[styles.botBadge, beaten ? { backgroundColor: C.ink } : { borderStyle: 'dashed' }]}>
                {isWho(b.id) ? <Portrait who={b.id} size={44} mood={beaten ? 'sad' : 'neutral'} dim={!beaten} /> : null}
                <Text style={[styles.botName, { color: beaten ? C.white : C.muted, marginTop: 4 }]}>{b.name.toUpperCase()}</Text>
              </View>
            );
          })}
        </View>
      </Rise>

      <Rise index={2} style={{ marginTop: 8, gap: 8 }}>
        <Label>{t('Your coach')}</Label>
        <View style={styles.coachRow}>
          {COACHES.map((c) => {
            const on = settings.coachId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => {
                  set({ coachId: c.id });
                  if (settings.voice) playVoice(`${c.id}-pitch-0`, { interrupt: true });
                }}
                style={[styles.coachTile, on && { backgroundColor: C.ink }]}
              >
                <Portrait who={c.who} size={54} mood={on ? 'happy' : 'neutral'} />
                <Text style={[styles.botName, { color: on ? C.white : C.ink, marginTop: 5, fontSize: 10 }]}>{c.name.replace('Coach ', '').toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
        <Label style={{ marginTop: 8 }}>{t('Game history')}</Label>
        {games.length === 0 && <Text style={styles.muted}>{t('Finished games appear here. Tap one to review it.')}</Text>}
        {games.slice(0, 30).map((g) => {
          const b = g.mode === 'local' || g.mode === 'online' || g.mode === 'import' ? null : getBot(g.botId);
          return (
            <PressSlab key={g.id} onPress={() => router.push({ pathname: '/review', params: { id: g.id } })} style={styles.game}>
              <Text style={styles.result}>{g.result === '1/2-1/2' ? '½' : g.result === '*' ? '·' : g.result}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.gameTitle}>{g.mode === 'online' ? t('VS {name} · ONLINE', { name: `${(g.opponent?.name ?? t('OPPONENT')).toUpperCase()}${g.opponent?.rating ? ` · ${g.opponent.rating}` : ''}` }) : b ? `VS ${b.name.toUpperCase()} · ${b.rating}` : g.mode === 'import' ? t('VS {name} · IMPORTED', { name: (g.opponent?.name ?? t('OPPONENT')).toUpperCase() }) : t('PASS & PLAY')}</Text>
                <Text style={styles.muted}>
                  {new Date(g.date).toLocaleDateString()} · {Math.ceil(g.moves.length / 2) === 1 ? t('1 move') : t('{n} moves', { n: Math.ceil(g.moves.length / 2) })}
                  {g.accuracy ? ` · ${t('{pct}% acc', { pct: g.accuracy[g.playerColor].toFixed(0) })}` : ''}
                  {g.rating ? ` · ${signed(g.rating.after - g.rating.before)}` : ''}
                </Text>
              </View>
              <Text style={styles.go}>→</Text>
            </PressSlab>
          );
        })}
      </Rise>

      <Rise index={3} style={{ marginTop: 8, gap: 8 }}>
        <Label>{t('Board')}</Label>
        <View style={styles.themeRow}>
          {(Object.keys(BOARD_THEMES) as Settings['boardTheme'][]).map((k) => {
            const on = settings.boardTheme === k;
            return (
              <Pressable key={k} onPress={() => set({ boardTheme: k })} style={[styles.theme, on && { backgroundColor: C.ink }]}>
                <View style={styles.swatch}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={[styles.sw, { backgroundColor: i === 0 || i === 3 ? BOARD_THEMES[k].light : BOARD_THEMES[k].dark }]} />
                  ))}
                </View>
                <Text style={[styles.themeName, on && { color: C.white }]}>{t(BOARD_THEMES[k].name).toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </View>
        <Toggle label={t('Black theme')} value={appTheme() === 'black'} onChange={switchTheme} />
        <LanguagePicker onChange={switchLanguage} />
        <Toggle label={t('Sound')} value={settings.sound} onChange={(v) => set({ sound: v })} />
        <Toggle label={t('Character voices')} value={settings.voice} onChange={(v) => set({ voice: v })} />
        <Toggle label={t('Animate moves')} value={settings.animateMoves} onChange={(v) => set({ animateMoves: v })} />
        <Toggle label={t('Last move arrow (review)')} value={settings.lastMoveArrow !== false} onChange={(v) => set({ lastMoveArrow: v })} />
        <Toggle label={t('Accurate info from coach')} value={settings.coachDetails !== false} onChange={(v) => set({ coachDetails: v })} onInfo={() => setInfo('coachDetails')} />
        <Toggle label={t('Roast mode (swearing)')} value={!!settings.roastMode} onChange={(v) => set({ roastMode: v })} onInfo={() => setInfo('roastMode')} />
        <Toggle label={t('Focus mode (online)')} value={!!settings.focusMode} onChange={(v) => set({ focusMode: v })} onInfo={() => setInfo('focusMode')} />
        <Toggle label={t('Show legal moves')} value={settings.showLegalMoves} onChange={(v) => set({ showLegalMoves: v })} />
        <Toggle label={t('Vibration')} value={settings.haptics} onChange={(v) => set({ haptics: v })} />
      </Rise>

      <Pressable
        onPress={() =>
          Alert.alert(t('Reset all data?'), t('This deletes your games, puzzle rating and settings.'), [
            { text: t('Cancel'), style: 'cancel' },
            { text: t('Reset'), style: 'destructive', onPress: () => store.resetAll() },
          ])
        }
        style={styles.reset}
      >
        <Text style={styles.resetText}>{t('RESET ALL DATA')}</Text>
      </Pressable>

      <Text style={styles.credits}>
        {t('MONOMATE — FREE & OPEN SOURCE')}{'\n'}
        {t('Engine: Stockfish.js (GPLv3) · Pieces: cburnett by Colin M.L. Burnett (GPLv2+/BSD/GFDL)')}{'\n'}
        {t('Puzzles & opening names: Lichess open data (CC0) · Online play: lichess.org · chess.js (BSD-2)')}{'\n'}
        {t('Fonts: Space Grotesk & Space Mono (SIL OFL) · Sounds: Kenney Impact Sounds (CC0)')}{'\n'}
        {t('Portraits: Notionists by Zoish (CC0) · Voices: Qwen3-TTS (Apache-2.0)')}
      </Text>
    </ScrollView>
    <Sheet
      visible={pictureSheet}
      title={t('Profile picture')}
      message={t('Use your own photo, or build an avatar in the same style as the coaches. It stays on this phone.')}
      onClose={() => setPictureSheet(false)}
      options={[
        { label: t('Choose photo'), sub: t('FROM YOUR GALLERY · CROPPED SQUARE'), icon: '▣', onPress: () => setPhotoFrom('library') },
        { label: t('Take photo'), sub: t('USE THE CAMERA'), icon: '◉', onPress: () => setPhotoFrom('camera') },
        { label: profile.avatar && !profile.photo ? t('Edit avatar') : t('Make avatar'), sub: t('HAIR, EYES, GLASSES, OUTFIT…'), icon: '☺\uFE0E', onPress: () => router.push('/avatar') },
        ...(hasPicture ? [{ label: t('Remove picture'), sub: t('BACK TO THE LETTER'), icon: '×', destructive: true, onPress: removePicture }] : []),
      ]}
    />
    <Sheet
      visible={info === 'coachDetails'}
      title={t('Accurate info from coach')}
      message={t(
        'When you play an inaccuracy, mistake or blunder, a WHY? button appears next to the coach. Tap it to see exactly what went wrong, why it is bad (for example a piece left without a defender, a fork, or a missed checkmate), which move was better and what it does, and a tip for next time. It works in coach games and in Game Review — there it also explains your opponent’s mistakes from your side. Turn it off if you prefer to work things out yourself.',
      )}
      options={[]}
      cancelLabel={t('Got it')}
      onClose={() => setInfo(null)}
    />
    <Sheet
      visible={info === 'roastMode'}
      title={t('Roast mode')}
      message={t(
        'Explicit content. Your coach trash-talks your chess with swearing and brutal (but funny) roasts: after your mistakes and blunders, when you lose, in sarcastic praise for your good moves, and in Game Review verdicts. It roasts your moves, never who you are. Off by default — switch it on if you can take it.',
      )}
      options={[]}
      cancelLabel={t('Got it')}
      onClose={() => setInfo(null)}
    />
    <Sheet
      visible={info === 'focusMode'}
      title={t('Focus mode')}
      message={t(
        'Play the board, not the player. In online games your opponent is shown only as "Opponent": no name, no picture, no rating, flag or flair. Everything is revealed when the game ends, so you can still see who you played. You can also switch it on and off in the Play Online lobby.',
      )}
      options={[]}
      cancelLabel={t('Got it')}
      onClose={() => setInfo(null)}
    />
    <Sheet visible={!!photoError} title={t('Couldn’t use that photo')} message={photoError ?? ''} options={[]} cancelLabel="OK" onClose={() => setPhotoError(null)} />
    </>
  );
}


/** Last 30 ratings as square bars, scaled between their min and max. */
function RatingChart({ points }: { points: number[] }) {
  const pts = points.slice(-30);
  if (pts.length < 2) return null;
  const lo = Math.min(...pts) - 20;
  const hi = Math.max(...pts) + 20;
  return (
    <View style={styles.chart}>
      {pts.map((r, i) => (
        <View key={i} style={[styles.bar, { height: `${((r - lo) / (hi - lo)) * 100}%`, backgroundColor: i === pts.length - 1 ? C.ink : C.muted }]} />
      ))}
      <Text style={[styles.chartLabel, { top: 2 }]}>{Math.max(...pts)}</Text>
      <Text style={[styles.chartLabel, { bottom: 2 }]}>{Math.min(...pts)}</Text>
    </View>
  );
}

function Stat({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <View style={[styles.stat, !first && { borderLeftWidth: B.w, borderColor: C.ink }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** Square ON/OFF switch, with an optional "?" that explains the setting. */
function Toggle({ label, value, onChange, onInfo }: { label: string; value: boolean; onChange: (v: boolean) => void; onInfo?: () => void }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggleRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <Text style={styles.toggleLabel}>{label.toUpperCase()}</Text>
        {onInfo && (
          <Pressable onPress={onInfo} hitSlop={10} style={({ pressed }) => [styles.info, pressed && { backgroundColor: C.ink }]}>
            {({ pressed }) => <Text style={[styles.infoText, pressed && { color: C.white }]}>?</Text>}
          </Pressable>
        )}
      </View>
      <View style={styles.toggle}>
        <View style={[styles.toggleHalf, !value && { backgroundColor: C.ink }]}>
          <Text style={[styles.toggleText, !value && { color: C.white }]}>{t('OFF')}</Text>
        </View>
        <View style={[styles.toggleHalf, value && { backgroundColor: C.ink }]}>
          <Text style={[styles.toggleText, value && { color: C.white }]}>{t('ON')}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Language row, styled like a Toggle: each language is named in its own language. */
function LanguagePicker({ onChange }: { onChange: (l: Lang) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { flex: 1 }]}>{t('Language').toUpperCase()}</Text>
      <View style={styles.toggle}>
        {LANGUAGES.map((l) => {
          const on = lang() === l.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => onChange(l.id)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.toggleHalf, on && { backgroundColor: C.ink }]}
            >
              <Text style={[styles.toggleText, on && { color: C.white }]}>{l.name.toUpperCase()}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  ratingCard: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  ratingBig: { fontFamily: 'mono', fontWeight: '700', fontSize: 40, lineHeight: 44 },
  lichessName: { fontWeight: '700', fontSize: 20 },
  cardRule: { height: B.w, backgroundColor: C.ink },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardLink: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  change: { borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 12, paddingVertical: 8 },
  changeText: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  input: { flex: 1, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, paddingHorizontal: 10, paddingVertical: 8, fontFamily: F.mono, fontSize: 14, color: C.ink },
  error: { fontFamily: 'mono', fontSize: 11, color: C.danger },
  chart: { height: 70, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, padding: 6, paddingLeft: 40 },
  bar: { flex: 1, minHeight: 2 },
  chartLabel: { position: 'absolute', left: 6, fontFamily: 'mono', fontSize: 9, color: C.muted },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statValue: { fontFamily: 'mono', fontWeight: '700', fontSize: 22 },
  statLabel: { fontFamily: 'mono', fontSize: 9, letterSpacing: 1.2, color: C.muted, marginTop: 2 },
  botRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  botBadge: { width: '18.5%', alignItems: 'center', paddingVertical: 6, borderWidth: B.w, borderColor: C.ink },
  coachRow: { flexDirection: 'row', gap: 8 },
  coachTile: { flex: 1, alignItems: 'center', paddingVertical: 8, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  botLetter: { fontFamily: 'mono', fontWeight: '700', fontSize: 20 },
  botName: { fontFamily: 'mono', fontSize: 8, letterSpacing: 0.6 },
  game: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  result: { fontFamily: 'mono', fontWeight: '700', fontSize: 13, minWidth: 34 },
  gameTitle: { fontWeight: '700', fontSize: 15 },
  go: { fontSize: 20, fontWeight: '700' },
  muted: { fontFamily: 'mono', color: C.muted, fontSize: 11, marginTop: 2 },
  themeRow: { flexDirection: 'row', gap: 8 },
  theme: { flex: 1, alignItems: 'center', padding: 6, borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white },
  swatch: { width: 36, height: 36, flexDirection: 'row', flexWrap: 'wrap', borderWidth: B.w, borderColor: C.ink },
  sw: { width: 16, height: 16 },
  themeName: { fontFamily: 'mono', fontSize: 9, letterSpacing: 1, marginTop: 5 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: B.w, borderColor: C.ink, paddingVertical: 10 },
  info: { width: 20, height: 20, borderWidth: B.w, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  infoText: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, lineHeight: 13 },
  toggleLabel: { fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  toggle: { flexDirection: 'row', borderWidth: B.w, borderColor: C.ink },
  toggleHalf: { paddingHorizontal: 10, paddingVertical: 4 },
  toggleText: { fontFamily: 'mono', fontWeight: '700', fontSize: 11 },
  reset: { borderWidth: B.w, borderColor: C.danger, padding: 12, alignItems: 'center', marginTop: 12 },
  resetText: { color: C.danger, fontFamily: 'mono', fontWeight: '700', letterSpacing: 1.5, fontSize: 12 },
  credits: { fontFamily: 'mono', color: C.muted, fontSize: 9, textAlign: 'center', lineHeight: 14, marginTop: 8 },
}));
