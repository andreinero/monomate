import { useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { router, usePathname } from 'expo-router';
import { buzz } from '../lib/haptics';
import { Sheet } from './Sheet';
import { acceptChallenge, declineChallenge } from '../lib/lichess/api';
import { challengeAnswered, incomingChallenge, subscribeLichessEvents, type IncomingChallenge } from '../lib/lichess/events';
import { useLichess } from '../lib/lichess/session';
import { playSound } from '../lib/sound';
import { useSettings } from '../lib/storage';
import { t } from '../lib/i18n';

// Screens where the pop-up waits: the Online screen lists challenges itself, and a running
// online game shouldn't be interrupted (the challenge stays listed on the Online screen).
const QUIET = ['/online', '/online-game', '/oauth'];

/**
 * App-wide: when a friend challenges you on Lichess, a pop-up appears on whatever screen you're
 * on — Play, Decline, or Later (it then stays under "Challenges for you" on the Online screen).
 */
export function ChallengePopup() {
  const session = useLichess();
  const settings = useSettings();
  const pathname = usePathname();
  const [pending, setPending] = useState<IncomingChallenge[]>([]);
  const [later, setLater] = useState<string[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    if (session.status !== 'loggedIn') return;
    return subscribeLichessEvents((e) => {
      if (e.type === 'challenge') {
        const c = incomingChallenge(e.challenge);
        if (!c) return;
        if (seen.current.has(c.id)) return;
        seen.current.add(c.id);
        buzz();
        playSound('start');
        setPending((list) => [...list.filter((x) => x.id !== c.id), c]);
      } else if ((e.type === 'challengeCanceled' || e.type === 'challengeDeclined') && e.challenge) {
        setPending((list) => list.filter((x) => x.id !== e.challenge.id));
      } else if (e.type === 'gameStart' && e.game) {
        setPending((list) => list.filter((x) => x.id !== e.game.gameId));
      }
    });
  }, [session.status]);

  const shown = pending.find((c) => !later.includes(c.id));
  const quiet = QUIET.includes(pathname);

  const answer = async (c: IncomingChallenge, accept: boolean) => {
    setPending((list) => list.filter((x) => x.id !== c.id));
    challengeAnswered(c.id);
    try {
      if (accept) {
        await acceptChallenge(c.id);
        // On Lichess an accepted challenge becomes the game with the same id.
        router.push({ pathname: '/online-game', params: { id: c.id } });
      } else await declineChallenge(c.id);
    } catch (e) {
      Alert.alert('Lichess', e instanceof Error ? e.message : String(e));
    }
  };

  if (!shown) return null;
  const name = shown.from || t('Someone');
  const details = [shown.control, shown.rated ? t('Rated') : t('Casual'), !settings.focusMode && shown.rating ? String(shown.rating) : null].filter(Boolean).join(' · ');
  return (
    <Sheet
      visible={!quiet}
      title={t('{name} challenges you', { name })}
      message={details}
      options={[
        { label: t('Play'), icon: '♟', onPress: () => answer(shown, true) },
        { label: t('Decline'), icon: '✕', destructive: true, onPress: () => answer(shown, false) },
      ]}
      onClose={() => setLater((l) => [...l, shown.id])}
      cancelLabel={t('Later')}
    />
  );
}
