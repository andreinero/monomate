import { useSyncExternalStore } from 'react';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { VOICE_CLIPS } from '../assets/voiceClips';
import { VOICE_CLIPS_DE } from '../assets/voiceClipsDe';
import { lang } from './i18n';

/**
 * Character voices: pre-recorded clips (generated with the Qwen3-TTS neural TTS model — see
 * scripts/make-voices.py), so every coach and bot has a natural, human-sounding voice.
 *
 * Every line is said in full: lines never cut each other off, they wait their turn in a queue.
 * A line's `onStart` runs when it actually starts playing, so the speech bubble can show
 * exactly what is being said. Only a direct tap (`interrupt`) stops the current line.
 */
type Clip = { keys: string[]; index: number; priority: number; onStart?: () => void };

let enabled = true;
let current: (Clip & { player: AudioPlayer; done: () => void }) | null = null;
const queue: Clip[] = [];
/** The short pause between two sentences (or two lines); counts as still speaking. */
let gap: { clip: Clip; timer: ReturnType<typeof setTimeout> } | null = null;
const SENTENCE_GAP_MS = 380;
/** Lines waiting at most; when full, the least important waiting line is dropped (and never shown). */
const MAX_QUEUE = 3;
let idleWaiters: (() => void)[] = [];
const cache = new Map<string, AudioPlayer>();
const MAX_CACHED = 24;

/** Used only to decide which waiting line to drop when the queue is full. */
export function priorityFor(key: string): number {
  const cat = key.split('-')[1] ?? '';
  if (cat === 'pitch') return 4;
  if (/^(threat|check)$/.test(cat)) return 2;
  if (/^(idle|opening|hello|tagline|greeting)$/.test(cat)) return 1;
  return 3;
}

export function setVoiceEnabled(on: boolean) {
  enabled = on;
  if (!on) hush();
}

export function hasVoice(key: string | undefined): boolean {
  return !!key && key in VOICE_CLIPS;
}

export function isSpeaking() {
  return !!current || !!gap || queue.length > 0;
}

// Speaking state for the UI (the SKIP button).
const speakListeners = new Set<() => void>();
let lastSpeaking = false;
function notify() {
  const now = isSpeaking();
  if (now === lastSpeaking) return;
  lastSpeaking = now;
  speakListeners.forEach((l) => l());
}
const subscribeSpeaking = (fn: () => void) => {
  speakListeners.add(fn);
  return () => {
    speakListeners.delete(fn);
  };
};
/** True while a line is being said (or waiting to be said). */
export function useSpeaking() {
  return useSyncExternalStore(subscribeSpeaking, isSpeaking, () => false);
}

function getPlayer(voiceKey: string): AudioPlayer | null {
  // In German, the German recording of the line when there is one (else the English one).
  const de = lang() === 'de' ? VOICE_CLIPS_DE[voiceKey] : undefined;
  const src = de ?? (VOICE_CLIPS as Record<string, number>)[voiceKey];
  if (!src) return null;
  const key = de ? `de:${voiceKey}` : voiceKey;
  let p = cache.get(key);
  if (!p) {
    p = createAudioPlayer(src);
    const fresh = p;
    fresh.addListener('playbackStatusUpdate', (st) => {
      // Pause before rewinding: on Android, seeking a finished clip plays it again (an endless loop).
      if (st.didJustFinish) {
        try {
          fresh.pause();
        } catch {}
        fresh.seekTo(0).catch(() => {});
      }
    });
    cache.set(key, p);
    if (cache.size > MAX_CACHED) {
      for (const [k, old] of cache) {
        if (old !== current?.player) {
          cache.delete(k);
          old.remove();
          break;
        }
      }
    }
  }
  return p;
}

function cancelGap() {
  if (gap) clearTimeout(gap.timer);
  gap = null;
}

/** Start `clip` after a sentence-length pause. */
function startAfterGap(clip: Clip) {
  cancelGap();
  gap = {
    clip,
    timer: setTimeout(() => {
      gap = null;
      start(clip);
    }, SENTENCE_GAP_MS),
  };
}

function finished() {
  const done = current;
  done?.done();
  current = null;
  // Continue the same line with its next sentence.
  if (done && done.index + 1 < done.keys.length) {
    startAfterGap({ ...done, index: done.index + 1 });
    return;
  }
  const next = queue.shift();
  if (next) {
    startAfterGap(next);
    return;
  }
  const waiters = idleWaiters;
  idleWaiters = [];
  waiters.forEach((w) => w());
  notify();
}

function start(clip: Clip) {
  queueMicrotask(notify);
  if (clip.index === 0) clip.onStart?.();
  const player = getPlayer(clip.keys[clip.index]);
  if (!player) {
    current = null;
    return finished();
  }
  let settled = false;
  let startedAt = 0;
  let retried = false;
  const sub = player.addListener('playbackStatusUpdate', (s) => {
    if (!s.didJustFinish) return;
    // A "finish" right after starting means playback began at the end (a replay that didn't rewind):
    // rewind and play it properly once.
    const elapsed = Date.now() - startedAt;
    if (!retried && player.duration > 0.4 && elapsed < player.duration * 1000 * 0.5) {
      retried = true;
      rewindAndPlay();
      return;
    }
    settle();
  });
  // Safety net in case a "finished" event never arrives: the clip's length plus a margin. If the
  // length isn't known yet, assume a long sentence and tighten it once playback reports it.
  let timer = setTimeout(() => settle(), (player.duration > 0 ? player.duration * 1000 : 9000) + 2000);
  let armedForLength = player.duration > 0;
  const lengthSub = player.addListener('playbackStatusUpdate', (s) => {
    // On iOS, play() on a clip that hasn't loaded yet can be ignored: start it as soon as it loads.
    if (s.isLoaded && !s.playing && s.currentTime < 0.05 && startedAt && !settled && current?.player === player && Date.now() - startedAt < 1500) {
      try {
        player.play();
      } catch {}
    }
    if (armedForLength || !(s.duration > 0)) return;
    armedForLength = true;
    clearTimeout(timer);
    timer = setTimeout(() => settle(), Math.max(0, s.duration - s.currentTime) * 1000 + 2000);
  });
  function settle() {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    sub.remove();
    lengthSub.remove();
    if (current?.player === player) finished();
  }
  current = { ...clip, player, done: settle };
  /** Clips are reused: always rewind (and wait for it) before playing, or a replay starts at the end. */
  function rewindAndPlay() {
    const pl = player!;
    let went = false;
    const go = () => {
      if (settled || went) return;
      went = true;
      startedAt = Date.now();
      try {
        pl.volume = 1;
        pl.play();
      } catch {
        settle();
      }
      // Watchdog: if playback hasn't really started after a moment, start it again (once).
      setTimeout(() => {
        if (settled || current?.player !== pl) return;
        if (pl.playing || pl.currentTime > 0.05) return;
        try {
          startedAt = Date.now();
          pl.volume = 1;
          pl.play();
        } catch {}
      }, 800);
    };
    try {
      if (pl.currentTime > 0.01 || pl.playing) {
        pl.pause();
        pl.seekTo(0).then(go, go);
        // Some platforms never settle a seek on a paused clip: don't wait for it forever.
        setTimeout(go, 300);
      } else go();
    } catch {
      settle();
    }
  }
  rewindAndPlay();
}

function stopCurrent() {
  cancelGap();
  if (current) {
    const pl = current.player;
    // Mute it at once, but pause it only a moment later: on iOS, pausing the only playing sound
    // and starting another in the same instant can leave the new one silent. Then rewind it, so
    // its next use starts cleanly from the beginning.
    try {
      pl.volume = 0;
    } catch {}
    setTimeout(() => {
      if (current?.player === pl) return; // already playing again
      try {
        pl.pause();
        pl.seekTo(0).catch(() => {});
        pl.volume = 1;
      } catch {}
    }, 700);
    const c = current;
    current = null;
    c.done();
  }
}

/**
 * Say a line (one clip key or several, played in order). It waits for whatever is being said;
 * `interrupt: true` (a direct tap, e.g. picking a coach or asking for a hint) stops it instead.
 * `onStart` runs when the line starts — immediately if voices are off or it has no recording.
 */
export function playVoice(keys: string | string[] | undefined, opts?: { interrupt?: boolean; onStart?: () => void }) {
  const list = (Array.isArray(keys) ? keys : keys ? [keys] : []).filter(hasVoice);
  if (!enabled || !list.length) {
    opts?.onStart?.();
    return;
  }
  const clip: Clip = { keys: list, index: 0, priority: priorityFor(list[0]), onStart: opts?.onStart };
  if (opts?.interrupt) {
    stopCurrent();
    queue.length = 0;
    return start(clip);
  }
  if (!current && !gap) return start(clip);
  queue.push(clip);
  notify();
  if (queue.length > MAX_QUEUE) {
    // Drop the least important (oldest first among equals) waiting line.
    let drop = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].priority < queue[drop].priority) drop = i;
    queue.splice(drop, 1);
  }
}

/** Resolves when nobody is speaking or waiting to speak (or after `maxMs`). Lets the coach finish before the bot moves. */
export function waitForVoice(maxMs = 6000): Promise<void> {
  if (!isSpeaking()) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, maxMs);
    idleWaiters.push(() => {
      clearTimeout(t);
      resolve();
    });
  });
}

/** Stop talking: the line being said and everything waiting (also what the SKIP button does). */
export function hush() {
  queue.length = 0;
  stopCurrent();
  const waiters = idleWaiters;
  idleWaiters = [];
  waiters.forEach((w) => w());
  notify();
}


/** Voice keys for a bot's fixed lines. */
export const botVoice = (botId: string, line: 'greeting' | 'onWin' | 'onLose' | 'draw') => `${botId}-${line}-0`;
