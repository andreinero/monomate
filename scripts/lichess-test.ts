// Tests for online play (Lichess Board API): pure game logic, the streaming client against a fake
// network, and a few live, unauthenticated checks against lichess.org.
// Run: npx tsx scripts/lichess-test.ts [--offline]
import Module from 'node:module';
import { Chess } from 'chess.js';
import { fromLichessUci, liveClock, ndjsonSplitter, replay, resultOf, SEEK_CONTROLS, type GameState } from '../src/lib/lichess/game';

let failures = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`);
  if (!ok) failures++;
};

// ---- Fake native modules for the API client ----
type FakeResponse = { status: number; chunks: string[]; delayMs?: number };
let nextResponse: FakeResponse = { status: 200, chunks: [] };
const requests: { url: string; init: any }[] = [];
const fakeFetch = async (url: string, init: any) => {
  requests.push({ url, init });
  const r = nextResponse;
  const enc = new TextEncoder();
  let i = 0;
  return {
    ok: r.status >= 200 && r.status < 300,
    status: r.status,
    text: async () => r.chunks.join(''),
    body: {
      getReader: () => ({
        read: async () => {
          if (init?.signal?.aborted) throw new Error('aborted');
          await new Promise((res) => setTimeout(res, r.delayMs ?? 1));
          if (init?.signal?.aborted) throw new Error('aborted');
          return i < r.chunks.length ? { done: false, value: enc.encode(r.chunks[i++]) } : { done: true, value: undefined };
        },
        cancel: async () => {},
      }),
    },
  };
};
const secure = new Map<string, string>();
const load = (Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (request: string, ...rest: unknown[]) {
  if (request === 'expo/fetch') return { fetch: fakeFetch };
  if (request === 'expo-secure-store')
    return {
      getItemAsync: async (k: string) => secure.get(k) ?? null,
      setItemAsync: async (k: string, v: string) => void secure.set(k, v),
      deleteItemAsync: async (k: string) => void secure.delete(k),
    };
  if (request === 'expo-auth-session') return { AuthRequest: class {}, CodeChallengeMethod: { S256: 'S256' }, ResponseType: { Code: 'code' }, exchangeCodeAsync: async () => ({}), makeRedirectUri: () => 'com.andrej.monomate://oauth' };
  return load.call(this, request, ...rest);
};

(async () => {
  // 1. Castling: Lichess sends king-takes-rook.
  const c = new Chess('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  check('castling e1h1 → e1g1', JSON.stringify(fromLichessUci('e1h1', c)) === JSON.stringify({ from: 'e1', to: 'g1' }));
  check('castling e1a1 → e1c1', fromLichessUci('e1a1', c).to === 'c1');
  check('normal king move untouched', fromLichessUci('e1f1', c).to === 'f1');
  check('promotion keeps the piece', fromLichessUci('a7a8q', new Chess('8/P7/8/8/8/8/8/k6K w - - 0 1')).promotion === 'q');

  // 2. Replaying a Lichess move list (with both castling styles).
  const r = replay('e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1h1 f8c5');
  check('replay plays every move incl. king-takes-rook castling', r.history.length === 8 && r.history[6].san === 'O-O', r.history.map((m) => m.san).join(' '));
  check('replay also accepts e1g1', replay('e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1').history[6].san === 'O-O');
  check('replay from startpos keyword', replay('', 'startpos').chess.fen() === new Chess().fen());

  // 3. Clocks.
  const st: GameState = { moves: 'e2e4 e7e5 g1f3', wtime: 600000, btime: 590000, winc: 0, binc: 0, status: 'started' };
  const lc = liveClock(st, 1000, 6000);
  check('clock: side to move (Black) loses elapsed time', lc.running === 'b' && lc.b === 585000 && lc.w === 600000);
  check('clock: nothing runs before both first moves', liveClock({ ...st, moves: 'e2e4' }, 0, 9999).running === null);
  check('clock: stops when the game ends', liveClock({ ...st, status: 'mate' }, 0, 9999).running === null);

  // 4. Results.
  check('result: mate, White wins', JSON.stringify(resultOf('mate', 'white')) === JSON.stringify({ result: '1-0', reason: 'Checkmate' }));
  check('result: resign, Black wins', resultOf('resign', 'black').result === '0-1');
  check('result: draw', resultOf('draw').result === '1/2-1/2');
  check('result: aborted is not a result', resultOf('aborted').result === '*');
  check('seeks are Rapid or slower only (Lichess rule)', SEEK_CONTROLS.every((s) => s.time + (s.inc * 40) / 60 >= 8));

  // 5. ND-JSON split across arbitrary chunks, with keep-alive blank lines.
  const got: unknown[] = [];
  const feed = ndjsonSplitter((o) => got.push(o));
  ['{"type":"gameF', 'ull","id":"x"}\n\n{"ty', 'pe":"gameState","moves":"e2e4"}\n', '\n'].forEach(feed);
  check('ndjson: objects reassembled across chunks', got.length === 2 && (got[1] as any).moves === 'e2e4');

  // 6. Streaming client against a fake network.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api = require('../src/lib/lichess/api') as typeof import('../src/lib/lichess/api');
  secure.set('lichess.token', 'lip_test');
  const events: any[] = [];
  nextResponse = { status: 200, chunks: ['{"type":"gameStart","game":{"gameId":"abc"}}\n{"type":"chall', 'enge","challenge":{"id":"c1"}}\n'] };
  await api.streamEvents((e) => events.push(e), new AbortController().signal);
  check('stream: events parsed in order', events.map((e) => e.type).join() === 'gameStart,challenge');
  check('stream: sends the Bearer token', requests.at(-1)?.init.headers.Authorization === 'Bearer lip_test');

  nextResponse = { status: 200, chunks: Array(1000).fill('\n'), delayMs: 5 };
  const ctl = new AbortController();
  const t0 = Date.now();
  setTimeout(() => ctl.abort(), 30);
  await api.seek({ time: 10, inc: 0, rated: true }, ctl.signal);
  check('seek: cancelling closes the stream quietly', Date.now() - t0 < 500);
  const body = requests.at(-1)?.init.body as string;
  check('seek: posts time, increment, rated, standard', body === 'time=10&increment=0&rated=true&variant=standard', body);

  nextResponse = { status: 429, chunks: ['{"error":"Too many requests"}'] };
  let err: any = null;
  await api.streamEvents(() => {}, new AbortController().signal).catch((e) => (err = e));
  check('stream: 429 becomes a friendly "busy" error', err?.status === 429 && /busy/.test(err.message));

  nextResponse = { status: 200, chunks: ['{"done":"declined"}\n'] };
  const done = await api.challenge('SomeFriend', { time: 3, inc: 2, rated: false, color: 'random' }, new AbortController().signal);
  const cb = requests.at(-1)!;
  check('challenge: reports declined', done === 'declined');
  check('challenge: posts clock in seconds + keep-alive', cb.url.endsWith('/api/challenge/SomeFriend') && /clock\.limit=180/.test(cb.init.body) && /keepAliveStream=true/.test(cb.init.body), cb.init.body);

  nextResponse = { status: 200, chunks: ['{"nowPlaying":[{"gameId":"abc12345","speed":"rapid","isMyTurn":true,"opponent":{"username":"Bob"}}],"nbMyTurn":1}'] };
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = fakeFetch; // plain (non-streaming) requests use the global fetch
  const now = await api.playing();
  globalThis.fetch = realFetch;
  check('ongoing games: parsed from /api/account/playing', now.length === 1 && now[0].gameId === 'abc12345' && requests.at(-1)!.url.endsWith('/api/account/playing?nb=20'));

  // 7. Live, unauthenticated checks against lichess.org (skipped with --offline).
  if (!process.argv.includes('--offline')) {
    const UA = { 'User-Agent': 'monomate-dev-test' };
    const ev = await fetch('https://lichess.org/api/stream/event', { headers: UA });
    check('live: event stream needs login (401)', ev.status === 401, String(ev.status));
    const authUrl =
      'https://lichess.org/oauth?response_type=code&client_id=monomate-chess-app&redirect_uri=' +
      encodeURIComponent('com.andrej.monomate://oauth') +
      '&code_challenge_method=S256&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&scope=board:play%20challenge:write&state=x';
    const auth = await fetch(authUrl, { headers: UA, redirect: 'manual' });
    const authText = auth.status === 200 ? await auth.text() : '';
    check('live: Lichess accepts our login request', auth.status === 200 || auth.status === 303, `${auth.status}${/error/i.test(authText) && !/sign in|log in|password/i.test(authText) ? ' (error page?)' : ''}`);
    const tok = await fetch('https://lichess.org/api/token', {
      method: 'POST',
      headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=authorization_code&code=liu_bogus&code_verifier=x&redirect_uri=com.andrej.monomate%3A%2F%2Foauth&client_id=monomate-chess-app',
    });
    check('live: token endpoint answers (bad code → 400)', tok.status === 400, String(tok.status));
    const ex = await fetch('https://lichess.org/game/export/787zsVup?moves=false&clocks=false&evals=false&opening=false', { headers: { ...UA, Accept: 'application/json' } });
    const exj = ex.ok ? await ex.json() : null;
    check('live: game export has players', !!exj?.players?.white, String(ex.status));
  }

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
