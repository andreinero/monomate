"""Records every character line with Qwen3-TTS (Apache-2.0) as AAC clips.

Each character has one reference recording in scripts/voice-refs/<who>.wav. A missing reference is
designed from the character's description (Qwen3-TTS VoiceDesign); every line is then cloned from the
reference (Qwen3-TTS Base) so a character sounds the same in every line. Each clip is transcribed with
Whisper and re-recorded if it doesn't say its line.

Run (in a Python env with `mlx-audio`, `mlx-whisper`, `soundfile`, `scipy`):
    npx tsx scripts/export-voice-lines.ts
    python scripts/make-voices.py            # all characters
    python scripts/make-voices.py pip rosa   # only some
    python scripts/make-voices.py --missing  # only lines that have no clip yet
    python scripts/make-voices.py --missing --shard=0/3 --no-map  # one of 3 parallel workers
    python scripts/make-voices.py --lang=de --missing   # German: lines from src/i18n/de/voice.json,
                                                        # same voices, clips in assets/voice-de/
"""
import json
import os
import re
import subprocess
import sys
import tempfile

import mlx_whisper
import numpy as np
import soundfile as sf
from mlx_audio.tts.utils import load_model
from scipy.signal import resample_poly

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# --lang=de records the German translations (same characters, same reference voices).
LANG = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--lang=')), 'en')
GERMAN = LANG == 'de'
OUT = os.path.join(ROOT, 'assets', 'voice-de' if GERMAN else 'voice')
# German uses its own reference voices, designed as native German speakers: cloning German lines
# from the English references carried a strong English accent into every line.
REFS = os.path.join(ROOT, 'scripts', 'voice-refs-de' if GERMAN else 'voice-refs')
DESIGN_MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16'
CLONE_MODEL = 'mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16'
WHISPER = 'mlx-community/whisper-large-v3-turbo'

# Voice descriptions (used only to design a reference that doesn't exist yet) and the reference's text.
# The four coach references were picked by ear from several designed takes.
CAST = {
    'sage': ("A calm, wise older British man in his sixties. Warm, low, gentle voice. Speaks unhurriedly and kindly, like a patient grandfather teaching chess by the fire.",
             "Pick me if you want to understand chess, not just play it. I'll explain the why behind every move, calmly, patiently, and at your pace."),
    'bolt': ("A friendly, upbeat young American man in his late twenties. Warm and positive but relaxed, speaking at a calm, natural conversational pace with a gentle smile in his voice. Not loud, never shouting.",
             "Want to get better fast? Pick me! I'll keep you fired up, celebrate every great move, and push you to play your very best!"),
    'nova': ("A warm, thoughtful American woman in her early thirties with a lower-pitched, smooth, mellow voice. Calm, curious and kind, speaking at a relaxed, natural pace.",
             "Choose me if you love figuring things out! We'll treat every position like an experiment and discover the best ideas together."),
    'knox': ("A serious American man in his fifties with a deep, steady voice. Firm and confident but calm and quiet, measured and composed, like a respected coach speaking one-on-one.",
             "Pick me if you want results. No excuses, no sloppy moves. I will be tough on you, and you will improve."),
    'pip': ("A sweet, cheerful young girl around ten years old, curious and a little shy, speaking softly at a calm pace.",
            "Hi, I'm Pip. I'm brand new to chess and very excited to learn how the horsey moves. Is the castle the one that goes sideways?"),
    'rosa': ("A kind, gentle grandmother in her seventies with a soft, warm British voice. Calm, cosy and encouraging.",
             "Hello dear, I'm Rosa. I play chess in the garden between watering the sunflowers. Let's have a friendly game, shall we?"),
    'theo': ("A playful, sly young British man in his twenties with a smooth, mischievous voice. Relaxed and amused, speaking calmly with a hint of a grin.",
             "The name's Theo. I'm a crafty trickster who loves early queen attacks. I've got a trick or two up my sleeve."),
    'juno': ("A calm, thoughtful British woman in her thirties with a soft, low, steady voice. Patient, polite and quietly confident.",
             "I'm Juno. I study openings late into the night. Solid, steady and patient. May the better plan win."),
    'marcus': ("A confident American man in his forties with a rich, warm baritone. Relaxed, friendly swagger, speaking at an easy pace.",
               "I'm Marcus, club champion three years running, and I love to attack. Let's see what you've got."),
    'ingrid': ("A cool, composed Scandinavian woman in her forties with a low, clear, precise voice. Calm, reserved and exact.",
               "I am Ingrid. I come from the north, and I play precise endgames. Every pawn matters."),
    'kenji': ("An enthusiastic but laid-back Japanese-American man in his thirties with a bright, friendly voice. Calm, upbeat and quick-witted.",
              "Hey, I'm Kenji. I see tactical combinations in my sleep. Ready for some fireworks?"),
    'vex': ("A cold, quietly confident British man in his forties with a low, smooth, slightly menacing voice. Very calm and controlled.",
            "I am Vex. I hunt down every advantage, and I rarely let one slip. I hope you prepared."),
    'biscuit': ("A very deep, calm, low male voice. Slow, quiet and composed, with understated confidence and a dry hint of amusement.",
                "Hello. I'm Whiskas. I only just learned how the pieces move, so please go easy on me."),
    'titan': ("A deep, calm, synthetic-sounding artificial intelligence voice. Flat, precise and measured, like a polite supercomputer.",
              "I am Titan. I play at full engine strength. Initializing. Good luck, human."),
    # Roast mode: the same four coaches, screaming. Every roast line is cloned from these
    # (picked as the angriest of several designed takes) and then pushed further by rage().
    'sage-angry': ("An older British man in his sixties screaming in absolute fury. Very loud, red-faced, explosive rage, shouting every single word, his voice cracking with anger and disgust.",
                   "What the bloody hell was that?! Forty years I have taught this game, and you play THAT?! Look at the board, you useless sod! Think, for once in your life!"),
    'bolt-angry': ("A young American man screaming at the top of his lungs, completely enraged. Extremely loud, explosive, aggressive yelling, fast and furious, totally out of control.",
                   "What the hell was that?! That is the worst play I have ever seen in my entire life! The crowd is booing, and they are damn right to boo you!"),
    'nova-angry': ("An American woman in her thirties screaming in pure rage. Extremely loud, furious, aggressive yelling, fast, her voice sharp and shrill with anger and contempt.",
                   "Are you serious?! I have studied this game my whole life, and that is the dumbest move I have ever seen! It is a complete disaster! Look at the board!"),
    'knox-angry': ("A deep-voiced American drill sergeant screaming at the top of his lungs, enraged. Extremely loud, harsh, explosive barking, red-faced fury, every word a yell.",
                   "What the hell was that, recruit?! That is the worst move I have ever seen! Get your head out of your ass and look at the damn board, maggot!"),
}

# German references: the same characters as native speakers of standard German, with a German
# reference text (what the clone is conditioned on).
NATIVE = ' A native German speaker from Germany with clear standard German (Hochdeutsch) pronunciation and no foreign accent.'
CAST_DE = {
    'sage': ("A calm, wise older German man in his sixties. Warm, low, gentle voice. Speaks unhurriedly and kindly, like a patient grandfather teaching chess by the fire.",
             "Wähle mich, wenn du Schach verstehen willst, nicht nur spielen. Ich erkläre dir das Warum hinter jedem Zug, ruhig, geduldig und in deinem Tempo."),
    'bolt': ("A friendly, upbeat young German man in his late twenties. Warm and positive but relaxed, speaking at a calm, natural conversational pace with a gentle smile in his voice. Not loud, never shouting.",
             "Du willst schnell besser werden? Nimm mich! Ich heize dir ein, feiere jeden guten Zug und bringe dich dazu, dein bestes Schach zu spielen!"),
    'nova': ("A warm, thoughtful German woman in her early thirties with a lower-pitched, smooth, mellow voice. Calm, curious and kind, speaking at a relaxed, natural pace.",
             "Wähle mich, wenn du gerne Dinge herausfindest! Wir behandeln jede Stellung wie ein Experiment und entdecken die besten Ideen gemeinsam."),
    'knox': ("A serious German man in his fifties with a deep, steady voice. Firm and confident but calm and quiet, measured and composed, like a respected coach speaking one-on-one.",
             "Nimm mich, wenn du Ergebnisse willst. Keine Ausreden, keine schlampigen Züge. Ich werde hart zu dir sein, und du wirst besser werden."),
    'pip': ("A sweet, cheerful young German girl around ten years old, curious and a little shy, speaking softly at a calm pace.",
            "Hallo, ich bin Pip. Ich bin ganz neu beim Schach und freue mich so, zu lernen, wie das Pferdchen springt. Ist die Burg die, die seitwärts geht?"),
    'rosa': ("A kind, gentle German grandmother in her seventies with a soft, warm voice. Calm, cosy and encouraging.",
             "Hallo, mein Schatz, ich bin Rosa. Ich spiele Schach im Garten, zwischen dem Gießen der Sonnenblumen. Spielen wir eine freundliche Partie?"),
    'theo': ("A playful, sly young German man in his twenties with a smooth, mischievous voice. Relaxed and amused, speaking calmly with a hint of a grin.",
             "Ich heiße Theo. Ich bin ein gerissener Trickser und liebe frühe Damenangriffe. Ich habe noch den einen oder anderen Trick im Ärmel."),
    'juno': ("A calm, thoughtful German woman in her thirties with a soft, low, steady voice. Patient, polite and quietly confident.",
             "Ich bin Juno. Ich studiere Eröffnungen bis spät in die Nacht. Solide, beständig und geduldig. Möge der bessere Plan gewinnen."),
    'marcus': ("A confident German man in his forties with a rich, warm baritone. Relaxed, friendly swagger, speaking at an easy pace.",
               "Ich bin Marcus, drei Jahre in Folge Vereinsmeister, und ich liebe den Angriff. Mal sehen, was du draufhast."),
    'ingrid': ("A cool, composed German woman from the far north in her forties with a low, clear, precise voice. Calm, reserved and exact.",
               "Ich bin Ingrid. Ich komme aus dem Norden, und ich spiele präzise Endspiele. Jeder Bauer zählt."),
    'kenji': ("An enthusiastic but laid-back German man in his thirties with a bright, friendly voice. Calm, upbeat and quick-witted.",
              "Hey, ich bin Kenji. Ich sehe taktische Kombinationen sogar im Schlaf. Bereit für ein Feuerwerk?"),
    'vex': ("A cold, quietly confident German man in his forties with a low, smooth, slightly menacing voice. Very calm and controlled.",
            "Ich bin Vex. Ich jage jeden Vorteil, und ich lasse selten einen entkommen. Ich hoffe, du hast dich vorbereitet."),
    'biscuit': ("A very deep, calm, low German male voice. Slow, quiet and composed, with understated confidence and a dry hint of amusement.",
                "Hallo. Ich bin Whiskas. Ich habe gerade erst gelernt, wie die Figuren ziehen, also sei bitte nett zu mir."),
    'titan': ("A deep, calm, synthetic-sounding artificial intelligence voice speaking German. Flat, precise and measured, like a polite supercomputer.",
              "Ich bin Titan. Ich spiele mit voller Engine-Stärke. Initialisierung. Viel Glück, Mensch."),
    'sage-angry': ("An older German man in his sixties screaming in absolute fury. Very loud, red-faced, explosive rage, shouting every single word, his voice cracking with anger and disgust.",
                   "Was zum Teufel war das?! Vierzig Jahre unterrichte ich dieses Spiel, und du spielst so etwas?! Schau aufs Brett, du nutzloser Trottel! Denk ein einziges Mal in deinem Leben nach!"),
    'bolt-angry': ("A young German man screaming at the top of his lungs, completely enraged. Extremely loud, explosive, aggressive yelling, fast and furious, totally out of control.",
                   "Was zur Hölle war das?! Das ist das schlechteste Spiel, das ich in meinem ganzen Leben gesehen habe! Die Zuschauer buhen, und verdammt, sie haben recht!"),
    'nova-angry': ("A German woman in her thirties screaming in pure rage. Extremely loud, furious, aggressive yelling, fast, her voice sharp and shrill with anger and contempt.",
                   "Ist das dein Ernst?! Ich studiere dieses Spiel mein ganzes Leben, und das ist der dümmste Zug, den ich je gesehen habe! Eine komplette Katastrophe! Schau aufs Brett!"),
    'knox-angry': ("A deep-voiced German drill sergeant screaming at the top of his lungs, enraged. Extremely loud, harsh, explosive barking, red-faced fury, every word a yell.",
                   "Was zur Hölle war das, Rekrut?! Das ist der schlechteste Zug, den ich je gesehen habe! Zieh deinen Kopf aus deinem Arsch und schau auf das verdammte Brett, du Made!"),
}

RATE = 24000
EDGE = 0.07  # seconds of silence kept at each end


def clean(text: str) -> str:
    """Text as it should be spoken: no typographic quirks, no ALL-CAPS (which gets spelled out)."""
    text = text.replace('—', ', ').replace('…', '... ').replace('’', "'").replace('“', '').replace('”', '')
    def fix(m):
        w = m.group(0)
        return w if len(w) < 2 else w.capitalize() if m.start() == 0 else w.lower()
    text = re.sub(r"[A-ZÄÖÜ][A-ZÄÖÜ']+", fix, text)
    if not GERMAN:
        text = re.sub(r'(?<=[a-z,] )A\b', 'a', text)
    else:
        text = text.replace('„', '').replace('‚', '').replace('‘', "'")
    text = re.sub(r'([.!?]\s+)([a-z])', lambda m: m.group(1) + m.group(2).upper(), text)
    return re.sub(r'\s+', ' ', text).strip()


# Whisper spellings that are the same spoken words.
SAME_SOUND = {'night': 'knight', 'nights': 'knights', '20': 'twenty', 'gooo': 'go', 'nooo': 'no', 'force': 'forced'}


def words(s: str) -> list[str]:
    if GERMAN:
        s = s.lower().replace('ß', 'ss')
        return re.findall(r"[^\W_]+", s.replace("'", '').replace('’', ''))
    s = s.lower().replace('’', "'").replace("wanna", "want to").replace("gonna", "going to")
    return [SAME_SOUND.get(w, w) for w in re.findall(r"[a-z0-9']+", s.replace("'", ''))]


def similar(a: str, b: str) -> float:
    """Word-level similarity (0..1) between the line and what Whisper heard."""
    x, y = words(a), words(b)
    if not x or not y:
        return 0.0
    # Levenshtein distance on words.
    d = list(range(len(y) + 1))
    for i, wx in enumerate(x, 1):
        prev, d[0] = d[0], i
        for j, wy in enumerate(y, 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (wx != wy))
            prev, d[j] = d[j], cur
    return 1 - d[-1] / max(len(x), len(y))


def trim(wav):
    hop = int(RATE * 0.005)
    n = len(wav) // hop
    e = np.sqrt(np.mean(wav[: n * hop].reshape(n, hop) ** 2, axis=1))
    loud = np.where(e > 0.01 * e.max())[0]
    if not len(loud):
        return wav
    a = max(0, loud[0] * hop - int(RATE * EDGE))
    b = min(len(wav), (loud[-1] + 1) * hop + int(RATE * EDGE))
    return wav[a:b]


def finish(wav):
    wav = trim(wav.astype(np.float32))
    wav = wav / max(1e-6, float(np.max(np.abs(wav)))) * 0.89
    fade = int(RATE * 0.01)
    wav[:fade] *= np.linspace(0, 1, fade)
    wav[-fade:] *= np.linspace(1, 0, fade)
    return wav


def rage(wav):
    """Roast lines: faster and higher (agitated), then heavy overdrive, like screaming into a blown-out mic."""
    n = len(wav)
    x = np.interp(np.arange(0, n, 1.07), np.arange(n), wav).astype(np.float32)
    # Cut the low boom (one-pole high-pass, ~180 Hz) so the distortion stays crunchy, not muddy.
    a = np.exp(-2 * np.pi * 180 / RATE)
    hp = np.empty_like(x)
    prev_x = prev_y = 0.0
    for i, v in enumerate(x):
        prev_y = a * (prev_y + v - prev_x)
        prev_x = v
        hp[i] = prev_y
    x = hp / (float(np.max(np.abs(hp))) or 1.0)
    # Asymmetric overdrive (adds the gritty, ragged harmonics of a shout), then a hard ceiling.
    d, bias = 7.0, 0.2
    y = np.tanh(d * (x + bias)) - np.tanh(d * bias)
    y = np.clip(y / (float(np.max(np.abs(y))) or 1.0) * 1.15, -1, 1)
    return (0.95 * y).astype(np.float32)


def heard(wav) -> str:
    a = resample_poly(wav, 16000, RATE).astype(np.float32)
    return mlx_whisper.transcribe(a, path_or_hf_repo=WHISPER, language='de' if GERMAN else 'en')['text'].strip()


def audio_of(results) -> np.ndarray:
    return np.concatenate([np.array(r.audio, dtype=np.float32) for r in results])


def main():
    all_lines = json.load(open(os.path.join(ROOT, 'scripts', 'voice-lines.json')))
    if GERMAN:
        # Same keys and voices, German text; lines without a translation yet are skipped.
        de = json.load(open(os.path.join(ROOT, 'src', 'i18n', 'de', 'voice.json')))
        all_lines = [{**l, 'text': de[l['key']]} for l in all_lines if de.get(l['key'])]
        print(f'{len(all_lines)} German lines', flush=True)
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    only = set(args)
    lines = [l for l in all_lines if not only or l['who'] in only]
    # --no-roast: everything except Roast-mode lines (e.g. while those are still being rewritten).
    if '--no-roast' in sys.argv:
        lines = [l for l in lines if 'roast' not in l['key']]
    if '--missing' in sys.argv:
        clip = lambda l: os.path.join(OUT, re.sub(r'[^A-Za-z0-9._-]', '_', l['key']) + '.m4a')
        lines = [l for l in lines if not os.path.exists(clip(l))]
        print(f'{len(lines)} lines without a clip', flush=True)
    # Parallel workers: each takes every N-th line.
    shard = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--shard=')), None)
    if shard:
        k, n = (int(x) for x in shard.split('/'))
        # By key (not position), so a restarted worker keeps exactly the same lines.
        import zlib
        lines = [l for l in lines if zlib.crc32(l['key'].encode()) % n == k]
        print(f'worker {k + 1}/{n}: {len(lines)} lines', flush=True)
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(REFS, exist_ok=True)

    # 1. Design any missing reference voices.
    who_needed = sorted({l['who'] for l in lines})
    missing = [w for w in who_needed if not os.path.exists(os.path.join(REFS, f'{w}.wav'))]
    if missing:
        designer = load_model(DESIGN_MODEL)
        for w in missing:
            desc, text = CAST_DE[w] if GERMAN else CAST[w]
            if GERMAN:
                desc += NATIVE
            best = None
            for attempt in range(4):
                wav = audio_of(designer.generate_voice_design(text=clean(text), language='German' if GERMAN else 'English', instruct=desc))
                score = similar(text, heard(wav))
                if best is None or score > best[0]:
                    best = (score, wav)
                if score > 0.9:
                    break
            sf.write(os.path.join(REFS, f'{w}.wav'), finish(best[1]), RATE)
            print(f'designed voice for {w}', flush=True)
        del designer
    if '--refs-only' in sys.argv:
        return

    # 2. Clone every line from its character's reference, checking each with Whisper.
    model = load_model(CLONE_MODEL)
    tmp = tempfile.mkdtemp()
    report = []
    for i, item in enumerate(lines):
      try:
        who, text = item['who'], item['text']
        ref = os.path.join(REFS, f'{who}.wav')
        ref_text = clean((CAST_DE if GERMAN else CAST)[who][1])
        best, best_score = None, -1.0
        if clean(text) == ref_text and not GERMAN:
            best, best_score = sf.read(ref, dtype='float32')[0], 1.0  # the reference take itself
        else:
            for attempt in range(4):
                wav = audio_of(model.generate(text=clean(text), ref_audio=ref, ref_text=ref_text, lang_code='german' if GERMAN else 'english'))
                wav = finish(wav)
                score = similar(text, heard(wav))
                if score > best_score:
                    best, best_score = wav, score
                if score >= 0.95:
                    break
        safe = re.sub(r'[^A-Za-z0-9._-]', '_', item['key'])
        wav_path = os.path.join(tmp, safe + '.wav')
        if who.endswith('-angry'):
            best = rage(best)
        sf.write(wav_path, finish(best), RATE)
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '64000', wav_path, os.path.join(OUT, safe + '.m4a')], check=True)
        report.append((best_score, item['key'], text))
        print(f'[{i + 1}/{len(lines)}] {best_score:.2f} {item["key"]}: {text}', flush=True)
      except Exception as e:  # e.g. the GPU is busy: skip, a later --missing run picks it up
        print(f'[{i + 1}/{len(lines)}] SKIPPED {item["key"]}: {e}', flush=True)
        import time
        time.sleep(3)

    if '--no-map' in sys.argv:
        print('done', len(lines), 'recorded (map not written)')
        return
    if GERMAN:
        # Only the clips that exist: the app falls back to the English recording for the rest.
        entries = []
        for item in all_lines:
            safe = re.sub(r'[^A-Za-z0-9._-]', '_', item['key'])
            if os.path.exists(os.path.join(OUT, safe + '.m4a')):
                entries.append(f"  {json.dumps(item['key'])}: require('../../assets/voice-de/{safe}.m4a'),")
        with open(os.path.join(ROOT, 'src', 'assets', 'voiceClipsDe.ts'), 'w') as f:
            f.write('// Generated by scripts/make-voices.py --lang=de — do not edit.\n')
            f.write('// German recordings of the character lines (same keys as voiceClips.ts). Missing keys fall back to English.\n')
            f.write('export const VOICE_CLIPS_DE: Record<string, number> = {\n' + '\n'.join(entries) + '\n};\n')
        print('done', len(lines), 'recorded,', len(entries), 'German clips in map')
        return
    # TypeScript map from key → bundled clip.
    entries = []
    for item in all_lines:
        safe = re.sub(r'[^A-Za-z0-9._-]', '_', item['key'])
        entries.append(f"  {json.dumps(item['key'])}: require('../../assets/voice/{safe}.m4a'),")
    with open(os.path.join(ROOT, 'src', 'assets', 'voiceClips.ts'), 'w') as f:
        f.write('// Generated by scripts/make-voices.py — do not edit.\n')
        f.write('// Voices: Qwen3-TTS (Apache-2.0), https://github.com/QwenLM/Qwen3-TTS\n')
        f.write('export const VOICE_CLIPS: Record<string, number> = {\n' + '\n'.join(entries) + '\n};\n')
    weak = [r for r in report if r[0] < 0.95]
    print('done', len(lines), 'recorded,', len(all_lines), 'in map;', len(weak), 'below 0.95:')
    for s, k, t in sorted(weak):
        print(f'  {s:.2f} {k}: {t}')


if __name__ == '__main__':
    main()
