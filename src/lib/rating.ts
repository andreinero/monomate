import type { Account } from './lichess/api';
import { isLichessConnected, useLichess } from './lichess/session';
import { store, useStored } from './storage';
import { t } from './i18n';

/**
 * Your rating as shown across the app. Connected to Lichess, it *is* your Lichess Rapid rating
 * (the speed MonoMate's online games use), so the two always match; otherwise your MonoMate rating.
 */
export type MyRating = { value?: number; lichess: boolean; label: string };

export function lichessRating(a: Account | null | undefined): number | undefined {
  const p = a?.perfs;
  return (p?.rapid ?? p?.blitz ?? p?.classical)?.rating;
}

export function useMyRating(): MyRating {
  const { status, account } = useLichess();
  const [profile] = useStored(store.profile, { name: 'You', botWins: {} });
  if (status === 'loggedIn' && account) {
    return { value: lichessRating(account) ?? 1500, lichess: true, label: account.perfs?.rapid ? t('LICHESS RAPID') : 'LICHESS' };
  }
  return { value: profile.rating, lichess: false, label: t('GAME RATING') };
}

/** Bot games only change your MonoMate rating — not while your rating is your Lichess one. */
export const botGamesRated = () => !isLichessConnected();
