import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/** Real wood-on-wood recordings (Kenney Impact Sounds, CC0) — built by scripts/make-sounds.py. */
const SOURCES = {
  move: require('../../assets/sounds/move.wav'),
  moveOpp: require('../../assets/sounds/move-opp.wav'),
  capture: require('../../assets/sounds/capture.wav'),
  castle: require('../../assets/sounds/castle.wav'),
  check: require('../../assets/sounds/check.wav'),
  promote: require('../../assets/sounds/promote.wav'),
  illegal: require('../../assets/sounds/illegal.wav'),
  start: require('../../assets/sounds/start.wav'),
  end: require('../../assets/sounds/end.wav'),
} as const;

export type SoundName = keyof typeof SOURCES;

/**
 * Each sound has a small pool of players, so quick moves never wait for (or cut off) the last one,
 * and every player rewinds as soon as it finishes so the next play() starts instantly.
 */
const POOL = 3;
let players: Partial<Record<SoundName, AudioPlayer[]>> | null = null;
const next: Partial<Record<SoundName, number>> = {};
let enabled = true;

function load() {
  if (players) return players;
  players = {};
  try {
    // Play even with the iPhone's silent switch on: the coaches talk, and a muted coach
    // looks broken. (Turn sounds or voices off in the Me tab instead.) Mixes with other audio.
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
    for (const name of Object.keys(SOURCES) as SoundName[]) {
      const pool: AudioPlayer[] = [];
      for (let i = 0; i < (name === 'start' || name === 'end' ? 1 : POOL); i++) {
        const p = createAudioPlayer(SOURCES[name]);
        p.volume = name === 'end' || name === 'start' ? 0.8 : 1;
        p.addListener('playbackStatusUpdate', (st) => {
          // Pause before rewinding: on Android, seeking a finished sound plays it again (an endless loop).
          if (st.didJustFinish) {
            try {
              p.pause();
            } catch {}
            p.seekTo(0).catch(() => {});
          }
        });
        pool.push(p);
      }
      players[name] = pool;
    }
  } catch (e) {
    console.warn('[sound] unavailable', e);
  }
  return players;
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

export function playSound(name: SoundName) {
  if (!enabled) return;
  const pool = load()[name];
  if (!pool?.length) return;
  // Prefer an idle player; otherwise take the next one round-robin.
  let p = pool.find((x) => !x.playing);
  if (!p) {
    const i = (next[name] ?? 0) % pool.length;
    next[name] = i + 1;
    p = pool[i];
  }
  const player = p;
  try {
    if (player.playing || player.currentTime > 0.001) {
      player.pause();
      player.seekTo(0).then(() => player.play(), () => player.play());
    } else {
      player.play();
    }
  } catch {
    // Never let a sound failure break a move.
  }
}

/** Warm the players up so the first move isn't silent while files decode. */
export function preloadSounds() {
  load();
}
