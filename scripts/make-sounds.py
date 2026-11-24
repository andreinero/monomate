"""Builds MonoMate's game sounds from real recordings of wood impacts (CC0, see scripts/sound-sources/).

Every sound is wood on wood, like a real board: pieces are set down, knocked over and swapped.
No synthesized beeps or bells.

Run (Python with numpy, soundfile, scipy):  python scripts/make-sounds.py
"""
import os

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'scripts', 'sound-sources')
OUT = os.path.join(ROOT, 'assets', 'sounds')
RATE = 44100


def load(name: str, pitch: float = 1.0) -> np.ndarray:
    """A recording, trimmed to its onset; pitch < 1 lowers it (and lengthens it slightly)."""
    a, r = sf.read(os.path.join(SRC, name + '.ogg'), dtype='float32')
    if a.ndim > 1:
        a = a.mean(axis=1)
    if r != RATE:
        a = resample_poly(a, RATE, r).astype(np.float32)
    m = np.abs(a).max()
    start = max(0, int(np.argmax(np.abs(a) > m * 0.03)) - int(RATE * 0.0015))
    a = a[start:] / m
    if pitch != 1.0:
        # Resampling = slower playback = lower pitch, like a heavier piece.
        up, down = 1000, int(round(1000 * pitch))
        a = resample_poly(a, up, down).astype(np.float32)
    return a


def mix(parts: list[tuple[str, float, float, float]], length: float) -> np.ndarray:
    """parts: (recording, start seconds, gain, pitch)."""
    out = np.zeros(int(RATE * length), dtype=np.float32)
    for name, at, gain, pitch in parts:
        a = load(name, pitch) * gain
        i = int(RATE * at)
        n = min(len(a), len(out) - i)
        out[i : i + n] += a[:n]
    return out


def peaking(a: np.ndarray, f: float, gain_db: float, q: float) -> np.ndarray:
    """RBJ peaking EQ."""
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f / RATE
    alpha = np.sin(w) / (2 * q)
    b = np.array([1 + alpha * A, -2 * np.cos(w), 1 - alpha * A])
    aa = np.array([1 + alpha / A, -2 * np.cos(w), 1 - alpha / A])
    sos = np.concatenate([b / aa[0], aa / aa[0]])[None, :]
    return sosfilt(sos, a)


def polish(a: np.ndarray, lowpass: float = 6000, rms_db: float = -17.0) -> np.ndarray:
    """
    Voiced for phone speakers as well as headphones: drop the inaudible sub-bass, bring forward the
    wooden "knock" (~700 Hz) and the contact click (~2 kHz) so the thock stays full but audible.
    Then matched loudness, a soft limiter and a smooth tail.
    """
    a = sosfilt(butter(2, 130, 'high', fs=RATE, output='sos'), a)
    a = peaking(a, 750, 10.0, 0.8)
    a = peaking(a, 2200, 6.0, 1.1)
    a = sosfilt(butter(2, lowpass, 'low', fs=RATE, output='sos'), a).astype(np.float32)
    m = np.abs(a).max() or 1
    idx = np.where(np.abs(a) > m * 0.02)[0]
    aud = a[idx[0] : idx[-1] + 1] if len(idx) else a
    rms = float(np.sqrt(np.mean(aud**2))) or 1
    a = a * (10 ** (rms_db / 20) / rms)
    a = np.tanh(a * 1.1) / np.tanh(1.1)  # soft limiter
    peak = np.abs(a).max()
    if peak > 0.9:
        a *= 0.9 / peak
    fade = int(RATE * 0.02)
    a[-fade:] *= np.linspace(1, 0, fade)
    # Trim trailing silence (keep 30 ms).
    idx = np.where(np.abs(a) > 0.002)[0]
    end = min(len(a), (idx[-1] if len(idx) else len(a)) + int(RATE * 0.03))
    return a[:end]


DEEP = 0.92  # pieces ~8% lower than the raw recordings: heavier, "thockier"

SOUNDS = {
    # Your move: a weighted piece set down on a wooden board.
    'move': ([('impact_wood_medium_001', 0, 1.0, DEEP), ('impact_wood_light_001', 0, 0.3, 0.9)], 0.25, 5500, -15.0),
    # Opponent's move: another take, a touch deeper, so you can hear whose move it was.
    'move-opp': ([('impact_wood_medium_000', 0, 1.0, DEEP * 0.95), ('impact_wood_light_003', 0, 0.28, 0.85)], 0.25, 5000, -15.5),
    # Capture: the taken piece is knocked (light click), then the capturing piece lands, heavier.
    'capture': ([('impact_wood_light_003', 0, 0.55, 0.95), ('impact_wood_heavy_003', 0.018, 1.0, DEEP)], 0.3, 6000, -15.5),
    # Castle: king, then rook.
    'castle': ([('impact_wood_medium_003', 0, 1.0, DEEP), ('impact_wood_light_001', 0, 0.25, 0.9), ('impact_wood_medium_004', 0.11, 0.85, DEEP * 0.97), ('impact_wood_light_003', 0.11, 0.22, 0.85)], 0.4, 5500, -15.0),
    # Check: a firm, deliberate placement with a little extra tap — "your king!".
    'check': ([('impact_wood_heavy_000', 0, 1.0, DEEP), ('impact_wood_light_001', 0.075, 0.6, 1.0)], 0.35, 6500, -15.0),
    # Promotion: the pawn is lifted off and the new piece set down.
    'promote': ([('impact_wood_light_000', 0, 0.6, 1.0), ('impact_wood_medium_002', 0.12, 1.0, DEEP), ('impact_wood_light_002', 0.19, 0.4, 1.05)], 0.45, 6000, -16.0),
    # Illegal / wrong puzzle move: a dull, soft thud — the piece goes back.
    'illegal': ([('impact_wood_heavy_002', 0, 1.0, 0.8), ('impact_soft_medium_002', 0, 0.8, 0.9), ('impact_wood_light_002', 0, 0.2, 0.7)], 0.25, 2600, -15.5),
    # Game start: pieces being set up on the board.
    'start': ([('impact_plank_medium_000', 0, 0.8, DEEP), ('impact_wood_light_003', 0.1, 0.55, 1.0), ('impact_plank_medium_002', 0.19, 0.9, DEEP)], 0.5, 5500, -17.5),
    # Game end: one deep, final knock (and a softer echo of it).
    'end': ([('impact_wood_heavy_002', 0, 1.0, 0.88), ('impact_plank_medium_001', 0.16, 0.45, 0.85)], 0.6, 5000, -16.5),
}


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, (parts, length, lp, level) in SOUNDS.items():
        a = polish(mix(parts, length), lp, level)
        sf.write(os.path.join(OUT, name + '.wav'), a, RATE, subtype='PCM_16')
        print(f'wrote {name}.wav {len(a) / RATE * 1000:.0f} ms')


if __name__ == '__main__':
    main()
