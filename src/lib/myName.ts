import { useLichess } from './lichess/session';
import { store, useStored } from './storage';

/**
 * The name shown for you in games and reviews: your Lichess username if you're logged in, else
 * your linked chess.com username, else "You".
 */
export function useMyName(): string {
  const { account } = useLichess();
  const [profile] = useStored(store.profile, { name: 'You', botWins: {} });
  return account?.username ?? profile.chesscom?.username ?? (profile.name && profile.name !== 'You' ? profile.name : 'You');
}
