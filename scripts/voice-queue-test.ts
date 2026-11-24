// Checks the voice queue (src/lib/voice.ts) with a fake audio player: every line is said in full,
// in order, `onStart` fires when a line really starts, and only a tap interrupts.
// Run: npx tsx scripts/voice-queue-test.ts
import Module from 'node:module';

const CLIP_MS = 40;
const log: string[] = [];

class FakePlayer {
  duration = CLIP_MS / 1000;
  currentTime = 0;
  playing = false;
  private listeners: ((s: { didJustFinish: boolean }) => void)[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(public key: string) {}
  addListener(_e: string, cb: (s: { didJustFinish: boolean }) => void) {
    this.listeners.push(cb);
    return { remove: () => (this.listeners = this.listeners.filter((l) => l !== cb)) };
  }
  play() {
    // Like the real player: a clip left at its end "finishes" instantly, silently, unless rewound.
    const atEnd = this.currentTime >= this.duration;
    log.push(atEnd ? `SILENT ${this.key}` : `play ${this.key}`);
    this.playing = true;
    this.timer = setTimeout(() => {
      this.playing = false;
      this.currentTime = this.duration;
      if (!atEnd) log.push(`end ${this.key}`);
      this.listeners.forEach((l) => l({ didJustFinish: true }));
    }, atEnd ? 2 : CLIP_MS);
  }
  pause() {
    if (this.timer) clearTimeout(this.timer);
    if (this.playing) log.push(`cut ${this.key}`);
    this.playing = false;
  }
  seekTo(t: number) {
    // Seeking takes a moment, like on a device.
    return new Promise<void>((r) => setTimeout(() => ((this.currentTime = t), r()), 3));
  }
  remove() {}
}

const KEYS = ['sage-praise.best-0', 'sage-detail.better-0', 'sage-idle-0', 'sage-opening-0', 'sage-threat-0', 'sage-hint-0', 'sage-blunder-0', 'sage-retry-0'];
// Route the app's native imports to fakes.
const load = (Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (request: string, ...rest: unknown[]) {
  if (request === 'expo-audio') return { createAudioPlayer: (src: string) => new FakePlayer(src) };
  if (request.endsWith('assets/voiceClips')) return { VOICE_CLIPS: Object.fromEntries(KEYS.map((k) => [k, k])) };
  return load.call(this, request, ...rest);
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const voice = require('../src/lib/voice') as typeof import('../src/lib/voice');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (name: string, ok: boolean, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  — ${info}` : ''}`);
  if (!ok) failures++;
};

(async () => {
  // 1. A two-sentence line, then a comment while it's still playing: both are said in full, in order.
  log.length = 0;
  const shown: string[] = [];
  voice.playVoice(['sage-praise.best-0', 'sage-detail.better-0'], { onStart: () => shown.push('feedback') });
  await wait(10);
  voice.playVoice('sage-idle-0', { onStart: () => shown.push('idle') });
  check('second line waits (not shown yet)', shown.join() === 'feedback');
  await voice.waitForVoice(5000);
  check('nothing is cut off', !log.some((l) => l.startsWith('cut')), log.join(' | '));
  check('every clip plays, in order', log.filter((l) => l.startsWith('play')).join() === 'play sage-praise.best-0,play sage-detail.better-0,play sage-idle-0', log.join(' | '));
  check('bubble shows each line when it starts', shown.join() === 'feedback,idle');
  check('a low-priority remark is no longer dropped', log.includes('end sage-idle-0'));

  // 1b. The same line again (a cached clip that already played to the end) is heard in full.
  log.length = 0;
  voice.playVoice('sage-idle-0');
  await voice.waitForVoice(5000);
  voice.playVoice(['sage-idle-0', 'sage-idle-0']);
  await voice.waitForVoice(5000);
  check('replayed lines are never silent', !log.some((l) => l.startsWith('SILENT')) && log.filter((l) => l === 'end sage-idle-0').length === 3, log.join(' | '));

  // 2. A tap (interrupt) stops the current line and clears the queue.
  log.length = 0;
  voice.playVoice('sage-opening-0');
  voice.playVoice('sage-threat-0');
  await wait(10);
  voice.playVoice('sage-hint-0', { interrupt: true });
  await voice.waitForVoice(5000);
  check('interrupt cuts the current line', log.includes('cut sage-opening-0'), log.join(' | '));
  check('interrupt drops queued lines', !log.includes('play sage-threat-0'));
  check('interrupting line plays fully', log.includes('end sage-hint-0'));

  // 3. waitForVoice holds until the queue is empty (the bot waits for the coach).
  voice.playVoice('sage-blunder-0');
  voice.playVoice('sage-detail.better-0');
  const t0 = Date.now();
  await voice.waitForVoice(5000);
  const took = Date.now() - t0;
  check('waitForVoice waits for queued lines too', took >= CLIP_MS * 2, `${took} ms`);

  // 4. Overflow: the least important waiting line is dropped, never shown.
  const seen: string[] = [];
  voice.playVoice('sage-praise.best-0', { onStart: () => seen.push('a') });
  voice.playVoice('sage-idle-0', { onStart: () => seen.push('idle') });
  voice.playVoice('sage-threat-0', { onStart: () => seen.push('threat') });
  voice.playVoice('sage-blunder-0', { onStart: () => seen.push('blunder') });
  voice.playVoice('sage-retry-0', { onStart: () => seen.push('retry') });
  await voice.waitForVoice(5000);
  check('overflow drops the chatter first', seen.join() === 'a,threat,blunder,retry', seen.join());

  // 5. Voices off: the bubble still updates immediately.
  voice.setVoiceEnabled(false);
  let now = false;
  voice.playVoice('sage-hint-0', { onStart: () => (now = true) });
  check('voices off: text shows at once', now);
  voice.setVoiceEnabled(true);

  // 6. hush() clears everything and releases waiters.
  voice.playVoice('sage-blunder-0');
  voice.playVoice('sage-retry-0');
  const w = voice.waitForVoice(5000);
  voice.hush();
  const t1 = Date.now();
  await w;
  check('hush stops at once and releases the bot', Date.now() - t1 < 20 && !voice.isSpeaking());

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
