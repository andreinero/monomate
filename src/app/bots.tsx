import { useEffect, useState } from 'react';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from '../components/Press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOTS, trueRating } from '../engine/bots';
import { COACHES, getCoach } from '../engine/coaches';
import { B, C, themed } from '../lib/theme';
import { Btn, Label, Rise, SpeechBubble, Text } from '../components/ui';
import { Portrait, isWho } from '../components/Portrait';
import { store, useSettings, useStored } from '../lib/storage';
import { DEFAULT_TIME_CONTROL, TIME_CONTROLS, type TimeControlId } from '../lib/clock';
import { botVoice, hush, playVoice, setVoiceEnabled } from '../lib/voice';
import { signed, stakes } from '../lib/elo';
import { useMyRating } from '../lib/rating';
import { t, voiceText } from '../lib/i18n';

/** Square selectable tile: selected tiles invert to black. */
function Chip({ selected, onPress, children, style }: { selected: boolean; onPress: () => void; children: (fg: string) => React.ReactNode; style?: object }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, style, (selected || pressed) && { backgroundColor: C.ink }]}>
      {({ pressed }) => children(selected || pressed ? C.white : C.ink)}
    </Pressable>
  );
}

export default function BotsScreen() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const coachMode = mode === 'coach';
  const settings = useSettings();
  const [pickedBot, setBotId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);
  const [color, setColor] = useState<'w' | 'r' | 'b'>('w');
  const [tc, setTc] = useState<TimeControlId>(DEFAULT_TIME_CONTROL);
  const [profile] = useStored(store.profile, { name: 'You', botWins: {} });
  const insets = useSafeAreaInsets();
  // Until you pick one, suggest the bot closest to your rating.
  const myRating = useMyRating();
  const mine = myRating.value;
  // (Never suggests a bot whose shown rating hides its real strength.)
  const closest = mine !== undefined ? BOTS.filter((b) => !b.hiddenRating).reduce((a, b) => (Math.abs(b.rating - mine) < Math.abs(a.rating - mine) ? b : a)) : null;
  const botId = pickedBot ?? closest?.id ?? (coachMode ? 'rosa' : 'juno');
  const bot = BOTS.find((b) => b.id === botId)!;
  // Connected to Lichess, your rating is your Lichess rating — bot games can't change it.
  const st = !coachMode && !myRating.lichess && profile.rating !== undefined ? stakes(profile.rating, trueRating(bot), profile.ratedGames ?? 0) : null;
  const coach = getCoach(coachId ?? settings.coachId);
  const [spoke, setSpoke] = useState<'bot' | 'coach'>(coachMode ? 'coach' : 'bot');

  useEffect(() => setVoiceEnabled(settings.voice), [settings.voice]);
  useEffect(() => () => hush(), []);

  const chooseBot = (id: string) => {
    setBotId(id);
    setSpoke('bot');
    const b = BOTS.find((x) => x.id === id)!;
    playVoice(botVoice(b.id, 'greeting'), { interrupt: true });
  };
  const chooseCoach = (id: string) => {
    setCoachId(id);
    setSpoke('coach');
    store.saveSettings({ ...settings, coachId: id });
    const c = getCoach(id);
    playVoice(`${c.id}-pitch-0`, { interrupt: true });
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: coachMode ? t('PLAY WITH COACH') : t('PLAY BOTS') }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        <Rise index={0}>
          {spoke === 'coach' ? (
            <SpeechBubble who={coach.who} mood="happy" name={coach.name} text={voiceText(`${coach.id}-pitch-0`, coach.lines.pitch)} skippable />
          ) : (
            <SpeechBubble who={isWho(bot.id) ? bot.id : undefined} mood="happy" name={`${bot.name} · ${bot.rating}`} text={`${bot.bio} “${voiceText(`${bot.id}-greeting-0`, bot.greeting)}”`} />
          )}
        </Rise>

        {coachMode && (
          <Rise index={1} style={{ gap: 8 }}>
            <Label>{t('Your coach')}</Label>
            <View style={styles.coachRow}>
              {COACHES.map((c) => (
                <Chip key={c.id} selected={coach.id === c.id} onPress={() => chooseCoach(c.id)} style={styles.coach}>
                  {(fg) => (
                    <>
                      <Portrait who={c.who} size={58} mood={coach.id === c.id ? 'happy' : 'neutral'} />
                      <Text style={[styles.botName, { color: fg, marginTop: 6 }]}>{c.name.replace('Coach ', '').toUpperCase()}</Text>
                    </>
                  )}
                </Chip>
              ))}
            </View>
          </Rise>
        )}

        <Rise index={2} style={{ gap: 8 }}>
          <Label>{t('Opponent')}</Label>
          <View style={styles.grid}>
            {BOTS.map((b) => {
              const beaten = (profile.botWins[b.id] ?? 0) > 0;
              return (
                <Chip key={b.id} selected={botId === b.id} onPress={() => chooseBot(b.id)} style={styles.bot}>
                  {(fg) => (
                    <>
                      {isWho(b.id) ? <Portrait who={b.id} size={56} mood={botId === b.id ? 'happy' : 'neutral'} /> : null}
                      <Text style={[styles.botName, { color: fg, marginTop: 6 }]}>{b.name.toUpperCase()}</Text>
                      <Text style={[styles.botRating, { color: fg }]}>{b.rating}</Text>
                      {beaten ? (
                        <Text style={[styles.beaten, { color: fg }]}>■ {t('BEATEN')}</Text>
                      ) : closest?.id === b.id ? (
                        <Text style={[styles.beaten, { color: fg }]}>≈ {t('YOUR LEVEL')}</Text>
                      ) : null}
                    </>
                  )}
                </Chip>
              );
            })}
          </View>
        </Rise>

        {!coachMode && (
          <Rise index={3} style={{ gap: 8 }}>
            <Label>{t('Time control')}</Label>
            <View style={styles.grid}>
              {TIME_CONTROLS.map((item) => (
                <Chip key={item.id} selected={tc === item.id} onPress={() => setTc(item.id)} style={styles.tc}>
                  {(fg) => (
                    <>
                      <Text style={[styles.tcLabel, { color: fg }]}>{item.label}</Text>
                      <Text style={[styles.tcSub, { color: fg }]}>{t(item.sub).toUpperCase()}</Text>
                    </>
                  )}
                </Chip>
              ))}
            </View>
          </Rise>
        )}

        <Rise index={4} style={{ gap: 8 }}>
          <Label>{t('Play as')}</Label>
          <View style={styles.colorRow}>
            {(
              [
                ['w', '♔', t('WHITE')],
                ['r', '?', t('RANDOM')],
                ['b', '♚', t('BLACK')],
              ] as const
            ).map(([k, glyph, label]) => (
              <Chip key={k} selected={color === k} onPress={() => setColor(k)} style={styles.colorBtn}>
                {(fg) => (
                  <>
                    <Text style={{ fontSize: 26, lineHeight: 30, color: fg }}>{glyph + '︎'}</Text>
                    <Text style={[styles.tcSub, { color: fg }]}>{label}</Text>
                  </>
                )}
              </Chip>
            ))}
          </View>
        </Rise>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {st ? (
          <Text style={styles.stakes}>
            {t('RATED · YOU {rating} · WIN {win} · DRAW {draw} · LOSS {loss}', { rating: profile.rating ?? '', win: signed(st.win), draw: signed(st.draw), loss: signed(st.loss) })}
          </Text>
        ) : myRating.lichess && !coachMode ? (
          <Text style={styles.stakes}>{t('CASUAL · YOUR RATING IS YOUR LICHESS RATING ({rating}) · BOT GAMES DON’T CHANGE IT', { rating: myRating.value ?? '' })}</Text>
        ) : coachMode ? (
          <Text style={styles.stakes}>{t('COACH GAMES ARE UNRATED · LEARN WITHOUT PRESSURE')}</Text>
        ) : null}
        <Btn
          title={coachMode ? t('Play {bot} with {coach}  →', { bot: bot.name, coach: coach.name.replace('Coach ', '') }) : t('Play {bot}  →', { bot: bot.name })}
          onPress={() => {
            hush();
            router.replace({ pathname: '/game', params: { mode: coachMode ? 'coach' : 'bot', bot: botId, color, tc: coachMode ? 'none' : tc, coach: coach.id } });
          }}
        />
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  coachRow: { flexDirection: 'row', gap: 6 },
  coach: { flex: 1, paddingVertical: 8 },
  bot: { width: '31.6%', paddingVertical: 10 },
  botName: { fontWeight: '700', fontSize: 13, letterSpacing: 0.8 },
  botRating: { fontFamily: 'mono', fontSize: 12 },
  beaten: { fontFamily: 'mono', fontSize: 9, marginTop: 3, letterSpacing: 1 },
  tc: { width: '31.6%', paddingVertical: 9 },
  tcLabel: { fontFamily: 'mono', fontWeight: '700', fontSize: 16 },
  tcSub: { fontFamily: 'mono', fontSize: 9, letterSpacing: 1.2, marginTop: 1 },
  colorRow: { flexDirection: 'row', gap: 8 },
  colorBtn: { flex: 1, paddingVertical: 10 },
  stakes: { fontFamily: 'mono', fontSize: 10, letterSpacing: 0.8, textAlign: 'center', marginBottom: 10 },
  footer: { padding: 16, paddingTop: 12, backgroundColor: C.bg, borderTopWidth: B.w, borderColor: C.ink },
}));
