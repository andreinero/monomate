import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, View } from 'react-native';
import { Pressable } from '../components/Press';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chess } from 'chess.js';
import { Board } from '../components/Board';
import { material } from '../lib/material';
import { ArrowKeys, BoardFrame, Btn, IconBtn, MoveList, MoveTable, PlayerTag, SIDE_PANEL, Slab, TAG_HEIGHT, Text, Toolbar, WideBoard, useWide } from '../components/ui';
import { playSound } from '../lib/sound';
import { store, useSettings, useStored, type SavedGame } from '../lib/storage';
import { B, C, P, themed } from '../lib/theme';
import * as lichess from '../lib/lichess/api';
import { displayName, isOngoing, liveClock, replay, resultOf, type GameFull, type GameState } from '../lib/lichess/game';
import { refreshSession, useLichess } from '../lib/lichess/session';
import { useMoveBrowser } from '../lib/moveBrowser';
import { t } from '../lib/i18n';

/**
 * A live game on Lichess (Board API). Deliberately no coach, hints or engine evaluation:
 * engine assistance during online games is against Lichess's rules.
 */
export default function OnlineGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id ? <OnlineGame key={id} id={id} /> : null;
}

function OnlineGame({ id }: { id: string }) {
  const insets = useSafeAreaInsets();
  const { account } = useLichess();
  const [full, setFull] = useState<GameFull | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<{ until: number } | null>(null);
  const [orientationFlip, setFlip] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [ratingDiff, setRatingDiff] = useState<number | null>(null);
  const [profile] = useStored(store.profile, { name: 'You', botWins: {} });
  const settings = useSettings();
  const [people, setPeople] = useState<Record<string, { flair?: string; flag?: string }>>({});
  const saved = useRef(false);
  const finishedOnce = useRef(false);

  const myColor: 'w' | 'b' = full && account && full.black.id === account.id ? 'b' : 'w';

  // Game stream (reconnects if the connection drops while the game is on).
  useEffect(() => {
    const ctl = new AbortController();
    let over = false;
    (async () => {
      while (!ctl.signal.aborted && !over) {
        try {
          await lichess.streamGame(
            id,
            (e) => {
              if (e.type === 'gameFull') {
                setFull(e);
                setState(e.state);
                setReceivedAt(Date.now());
                over = !isOngoing(e.state.status);
              } else if (e.type === 'gameState') {
                setState(e);
                setReceivedAt(Date.now());
                setPending(null);
                if (!e.status || !isOngoing(e.status)) over = true;
              } else if (e.type === 'opponentGone') {
                setGone(e.gone ? { until: Date.now() + (e.claimWinInSeconds ?? 0) * 1000 } : null);
              }
            },
            ctl.signal,
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          if (err instanceof lichess.LichessError && (err.status === 401 || err.status === 404)) return;
        }
        if (!ctl.signal.aborted && !over) await new Promise((r) => setTimeout(r, 2000));
      }
    })();
    playSound('start');
    return () => ctl.abort();
  }, [id]);

  const ongoing = !!state && isOngoing(state.status);

  // Lichess flairs and country flags for both players (Lichess has no profile pictures).
  const whiteId = full?.white.id;
  const blackId = full?.black.id;
  useEffect(() => {
    const ids = [whiteId, blackId].filter((x): x is string => !!x);
    if (!ids.length) return;
    Promise.all(ids.map((u) => lichess.api<{ id: string; flair?: string; profile?: { flag?: string } }>(`/api/user/${u}`).catch(() => null))).then((users) => {
      const map: Record<string, { flair?: string; flag?: string }> = {};
      for (const u of users) if (u) map[u.id] = { flair: u.flair, flag: u.profile?.flag };
      setPeople(map);
    });
  }, [whiteId, blackId]);

  // Clock tick.
  useEffect(() => {
    // Only for the "opponent left" countdown — the clocks tick by themselves.
    if (!ongoing || !gone) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [ongoing, gone]);

  const moves = state ? (pending ? `${state.moves} ${pending}`.trim() : state.moves) : '';
  const { chess, history } = useMemo(() => replay(moves, full?.initialFen), [moves, full?.initialFen]);
  const last = history[history.length - 1];
  const sans = useMemo(() => history.map((m) => m.san), [history]);
  const browse = useMoveBrowser(sans, !full?.initialFen || full.initialFen === 'startpos' ? undefined : full.initialFen);
  const wide = useWide();
  // Times as received; the clock faces count down from `receivedAt` themselves.
  const clock = state ? liveClock(state, receivedAt, receivedAt) : null;
  const myTurn = ongoing && chess.turn() === myColor && !pending;
  const result = state && !ongoing ? resultOf(state.status, state.winner) : null;

  // Game over: sound, result card, rating change, and save it for Game Review.
  useEffect(() => {
    if (!result || !full || finishedOnce.current) return;
    finishedOnce.current = true;
    playSound('end');
    setShowResult(true);
    // Lichess publishes the rating change right after the game; keep it with the saved game too.
    lichess
      .exportGame(id)
      .then(async (g) => {
        const mine = myColor === 'w' ? g.players.white : g.players.black;
        setRatingDiff(mine.ratingDiff ?? null);
        refreshSession(); // your Lichess rating (shown across the app) just changed
        const savedGame = await store.game(`lichess-${id}`);
        if (savedGame) await store.saveGame({ ...savedGame, lichessRating: { before: mine.rating, diff: mine.ratingDiff } });
      })
      .catch(() => {});
    if (result.result !== '*' && history.length > 0 && !saved.current) {
      saved.current = true;
      const opp = myColor === 'w' ? full.black : full.white;
      const g: SavedGame = {
        id: `lichess-${id}`,
        date: Date.now(),
        mode: 'online',
        playerColor: myColor,
        startFen: new Chess().fen(),
        moves: history.map((m) => m.san),
        result: result.result,
        reason: result.reason,
        opponent: { name: displayName(opp), rating: opp.rating },
        lichessRating: { before: (myColor === 'w' ? full.white : full.black).rating },
      };
      store.saveGame(g);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.result, full]);

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!myTurn) return;
    const c = new Chess(chess.fen());
    let m;
    try {
      m = c.move({ from, to, promotion });
    } catch {
      return;
    }
    const uci = m.from + m.to + (m.promotion ?? '');
    setPending(uci);
    setError(null);
    lichess.move(id, uci).catch((e) => {
      setPending(null);
      setError(e instanceof Error ? e.message : String(e));
    });
  };

  const act = (fn: () => Promise<unknown>) => fn().catch((e) => setError(e instanceof Error ? e.message : String(e)));
  const resign = () =>
    Alert.alert(t('Resign?'), t('You will lose this game.'), [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Resign'), style: 'destructive', onPress: () => act(() => lichess.resign(id)) },
    ]);

  const plies = state ? state.moves.split(' ').filter(Boolean).length : 0;
  const canAbort = ongoing && plies < 2;
  const theyOfferDraw = !!state && (myColor === 'w' ? state.bdraw : state.wdraw);
  const iOfferDraw = !!state && (myColor === 'w' ? state.wdraw : state.bdraw);
  const orientation: 'w' | 'b' = orientationFlip ? (myColor === 'w' ? 'b' : 'w') : myColor;
  const goneLeft = gone ? Math.max(0, Math.ceil((gone.until - now) / 1000)) : 0;

  const mat = material(browse.position?.fen ?? chess.fen());
  const tagFor = (color: 'w' | 'b') => {
    if (!full) return <View style={{ height: TAG_HEIGHT }} />;
    const p = color === 'w' ? full.white : full.black;
    const self = color === myColor;
    // Focus mode: the opponent is just "Opponent" until the game is over.
    const hidden = !self && !!settings.focusMode && (!state || ongoing);
    return (
      <PlayerTag
        name={self ? (account?.username ?? t('You')) : hidden ? t('Opponent') : displayName(p)}
        self={self}
        me={self ? profile : undefined}
        flair={!hidden && p.id ? people[p.id]?.flair : undefined}
        flag={!hidden && p.id ? people[p.id]?.flag : undefined}
        sub={!hidden && p.rating ? String(p.rating) : undefined}
        active={ongoing && chess.turn() === color}
        clock={clock && full.clock ? { ms: color === 'w' ? clock.w : clock.b, running: clock.running === color, since: receivedAt } : undefined}
        captured={{ pieces: mat.taken[color], color, lead: mat.lead[color] }}
      />
    );
  };

  const banner = !state
    ? { text: t('CONNECTING TO LICHESS…'), bg: C.white, fg: C.ink }
    : !ongoing
      ? { text: t('GAME OVER · {reason}', { reason: result ? t(result.reason).toUpperCase() : '' }), bg: C.ink, fg: C.white }
      : theyOfferDraw
        ? { text: t('YOUR OPPONENT OFFERS A DRAW'), bg: C.ink, fg: C.white }
        : gone
          ? { text: goneLeft > 0 ? t('OPPONENT LEFT · CLAIM THE WIN IN {n}s', { n: goneLeft }) : t('OPPONENT LEFT · YOU CAN CLAIM THE WIN'), bg: C.danger, fg: P.white }
          : plies < 2
            ? { text: myTurn ? t('YOUR MOVE · THE GAME STARTS WHEN YOU MOVE') : t('WAITING FOR YOUR OPPONENT’S FIRST MOVE'), bg: C.white, fg: C.ink }
            : myTurn
              ? { text: t('YOUR MOVE'), bg: C.ink, fg: C.white }
              : { text: t('OPPONENT TO MOVE'), bg: C.white, fg: C.ink };

  const iWon = result && ((result.result === '1-0' && myColor === 'w') || (result.result === '0-1' && myColor === 'b'));
  const resultTitle = !result ? '' : result.result === '*' ? t('ABORTED') : result.result === '1/2-1/2' ? t('DRAW') : iWon ? t('YOU WIN') : t('YOU LOSE');

  const moveItems = history.map((m) => ({ san: m.san }));
  const bannerBar = (
    <View style={[styles.banner, { backgroundColor: banner.bg }]}>
      <Text style={[styles.bannerText, { color: banner.fg }]} numberOfLines={1}>
        {banner.text}
      </Text>
    </View>
  );
  const boardArea = (
    <BoardFrame reserved={TAG_HEIGHT * 2}>
      {(size) => (
        <View style={{ width: size, alignSelf: 'center' }}>
          {tagFor(orientation === 'w' ? 'b' : 'w')}
          <View style={{ alignSelf: 'center' }}>
            <Board
              fen={browse.position?.fen ?? chess.fen()}
              hideLastMoveArrow
              size={size}
              orientation={orientation}
              movable={myTurn && !browse.viewing ? myColor : null}
              onMove={onMove}
              lastMove={browse.position ? browse.position.lastMove : last ? { from: last.from, to: last.to } : null}
            />
          </View>
          {tagFor(orientation)}
        </View>
      )}
    </BoardFrame>
  );
  const controls = (
    <>
        {error && <Text style={styles.error}>{error}</Text>}
        {browse.viewing && (
          <Pressable onPress={browse.live} style={styles.viewing}>
            <Text style={styles.viewingText}>{t('VIEWING MOVE {n} · TAP TO RETURN TO THE GAME', { n: Math.ceil((browse.ply ?? 0) / 2) })}</Text>
          </Pressable>
        )}
        {ongoing && theyOfferDraw ? (
          <View style={styles.decision}>
            <Btn small title={t('Accept draw')} style={{ flex: 1 }} onPress={() => act(() => lichess.draw(id, true))} />
            <Btn small kind="secondary" title={t('Decline')} style={{ flex: 1 }} onPress={() => act(() => lichess.draw(id, false))} />
          </View>
        ) : ongoing && gone && goneLeft === 0 ? (
          <View style={styles.decision}>
            <Btn small title={t('Claim the win')} style={{ flex: 1 }} onPress={() => act(() => lichess.claimVictory(id))} />
          </View>
        ) : (
          <Toolbar>
            {canAbort ? (
              <IconBtn icon="×" label={t('Abort')} onPress={() => act(() => lichess.abort(id))} />
            ) : (
              <IconBtn icon="×" label={t('Resign')} hold={900} onPress={resign} disabled={!ongoing} />
            )}
            <IconBtn icon="½" label={iOfferDraw ? t('Offered') : t('Draw')} onPress={() => act(() => lichess.draw(id, true))} disabled={!ongoing || iOfferDraw || plies < 2} />
            <IconBtn icon="‹" label={t('Back')} onPress={browse.back} disabled={!browse.canBack} />
            <IconBtn icon="›" label={t('Next')} onPress={browse.forward} disabled={!browse.canForward} />
            <IconBtn icon="⇅" label={t('Flip')} onPress={() => setFlip((f) => !f)} />
            {!ongoing && <IconBtn icon="≡" label={t('Result')} onPress={() => setShowResult(true)} />}
          </Toolbar>
        )}
    </>
  );

  return (
    <View style={wide ? [styles.wide, { paddingBottom: insets.bottom + 16 }] : { flex: 1, paddingBottom: insets.bottom }}>
      <Stack.Screen options={{ title: full ? `ONLINE · ${full.clock ? `${full.clock.initial / 60000}+${full.clock.increment / 1000}` : full.speed.toUpperCase()}${full.rated ? ` · ${t('RATED')}` : ''}` : 'ONLINE' }} />
      <ArrowKeys onLeft={browse.back} onRight={browse.forward} />
      {wide ? (
        <>
          <WideBoard reserved={TAG_HEIGHT * 2}>{boardArea}</WideBoard>
          <View style={styles.widePanel}>
            <View style={styles.wideBox}>{bannerBar}</View>
            <MoveTable moves={moveItems} current={browse.ply ?? history.length} onSelect={browse.select} />
            <View style={styles.wideBox}>{controls}</View>
          </View>
        </>
      ) : (
        <>
          <MoveList moves={moveItems} current={browse.ply ?? history.length} onSelect={browse.select} />
          {bannerBar}
          {boardArea}
          {controls}
        </>
      )}

      <Modal visible={showResult} transparent animationType="fade" onRequestClose={() => setShowResult(false)}>
        <View style={styles.backdrop}>
          <Slab outerStyle={styles.cardOuter} style={styles.card}>
            <Text style={styles.kicker}>{t('GAME OVER · LICHESS')}</Text>
            <Text style={styles.title}>{resultTitle}</Text>
            <View style={styles.rule} />
            <Text style={styles.sub}>
              {result ? t(result.reason).toUpperCase() : ''} · {result?.result}
            </Text>
            {ratingDiff !== null && full?.rated && (
              <Text style={[styles.diff, { backgroundColor: ratingDiff >= 0 ? C.good : C.danger }]}>{t('LICHESS RATING {diff}', { diff: `${ratingDiff >= 0 ? '+' : '−'}${Math.abs(ratingDiff)}` })}</Text>
            )}
            {result?.result !== '*' && (
              <Btn
                title={t('Game Review')}
                icon="≡"
                style={{ alignSelf: 'stretch', marginTop: 18 }}
                onPress={() => {
                  setShowResult(false);
                  router.push({ pathname: '/review', params: { id: `lichess-${id}` } });
                }}
              />
            )}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, alignSelf: 'stretch' }}>
              <Btn kind="secondary" title={t('Lobby')} style={{ flex: 1 }} onPress={() => router.back()} />
              <Btn kind="secondary" title={t('Close')} style={{ flex: 1 }} onPress={() => setShowResult(false)} />
            </View>
            <Pressable onPress={() => setShowResult(false)} hitSlop={8} />
          </Slab>
        </View>
      </Modal>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wide: { flex: 1, flexDirection: 'row', gap: 20, paddingHorizontal: 20, paddingTop: 12, justifyContent: 'center' },
  widePanel: { width: SIDE_PANEL, gap: 12 },
  wideBox: { borderWidth: B.w, borderColor: C.ink, backgroundColor: C.white, overflow: 'hidden' },
  banner: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: B.w, borderColor: C.ink },
  bannerText: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 1, textAlign: 'center' },
  viewing: { backgroundColor: C.ink, paddingVertical: 8, alignItems: 'center' },
  viewingText: { color: C.white, fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  error: { fontFamily: 'mono', fontSize: 11, color: C.danger, textAlign: 'center', paddingHorizontal: 14, paddingVertical: 4 },
  decision: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6, backgroundColor: C.white, borderTopWidth: B.w, borderColor: C.ink },
  backdrop: { flex: 1, backgroundColor: C.scrim, alignItems: 'center', justifyContent: 'center', padding: 22 },
  cardOuter: { width: '100%', maxWidth: 380 },
  card: { padding: 22, alignItems: 'center' },
  kicker: { fontFamily: 'mono', fontSize: 11, letterSpacing: 3, color: C.muted },
  title: { fontSize: 38, lineHeight: 42, fontWeight: '700', letterSpacing: -1, marginTop: 6, textAlign: 'center' },
  rule: { height: B.w * 2, backgroundColor: C.ink, alignSelf: 'stretch', marginVertical: 12 },
  sub: { fontFamily: 'mono', fontSize: 12, letterSpacing: 1 },
  diff: { fontFamily: 'mono', fontWeight: '700', fontSize: 13, color: P.white, paddingHorizontal: 10, paddingVertical: 4, marginTop: 12, overflow: 'hidden' },
}));
