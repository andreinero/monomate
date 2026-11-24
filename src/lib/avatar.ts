import { createAvatar } from '@dicebear/core';
import * as notionists from '@dicebear/notionists';

/**
 * The player's own avatar, drawn in the same style as the coaches and bots
 * (Notionists by Zoish, CC0, via DiceBear). Stored on the device only.
 */
export type AvatarConfig = {
  hair: string;
  eyes: string;
  brows: string;
  lips: string;
  nose: string;
  body: string;
  glasses: string | null;
  beard: string | null;
};

const variants = (n: number) => Array.from({ length: n }, (_, i) => `variant${String(i + 1).padStart(2, '0')}`);

/** `label` is English (a dictionary key): translate it with t() where it's shown. */
export const AVATAR_PARTS: { key: keyof AvatarConfig; label: string; options: string[]; optional?: boolean }[] = [
  { key: 'hair', label: 'Hair', options: variants(63) },
  { key: 'eyes', label: 'Eyes', options: variants(5) },
  { key: 'brows', label: 'Brows', options: variants(13) },
  { key: 'lips', label: 'Mouth', options: variants(30) },
  { key: 'nose', label: 'Nose', options: variants(20) },
  { key: 'glasses', label: 'Glasses', options: variants(11), optional: true },
  { key: 'beard', label: 'Beard', options: variants(12), optional: true },
  { key: 'body', label: 'Outfit', options: variants(25) },
];

const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

export function randomAvatar(): AvatarConfig {
  const part = (k: keyof AvatarConfig) => AVATAR_PARTS.find((p) => p.key === k)!.options;
  return {
    hair: pick(part('hair')),
    eyes: pick(part('eyes')),
    brows: pick(part('brows')),
    lips: pick(part('lips')),
    nose: pick(part('nose')),
    body: pick(part('body')),
    glasses: Math.random() < 0.25 ? pick(part('glasses')) : null,
    beard: Math.random() < 0.2 ? pick(part('beard')) : null,
  };
}

const cache = new Map<string, string>();

/** SVG markup for an avatar, framed exactly like the coach portraits. */
export function avatarSvg(cfg: AvatarConfig): string {
  const key = JSON.stringify(cfg);
  let svg = cache.get(key);
  if (!svg) {
    svg = createAvatar(notionists, {
      seed: 'monomate-player',
      scale: 128,
      translateY: 9,
      backgroundColor: ['f3f3f0'],
      hair: [cfg.hair],
      eyes: [cfg.eyes],
      brows: [cfg.brows],
      lips: [cfg.lips],
      nose: [cfg.nose],
      body: [cfg.body],
      glasses: cfg.glasses ? [cfg.glasses] : undefined,
      glassesProbability: cfg.glasses ? 100 : 0,
      beard: cfg.beard ? [cfg.beard] : undefined,
      beardProbability: cfg.beard ? 100 : 0,
      bodyIconProbability: 0,
      gestureProbability: 0,
    } as Parameters<typeof createAvatar<typeof notionists>>[1])
      .toString()
      // react-native-svg doesn't need (or understand) the RDF licence metadata block.
      .replace(/<metadata[\s\S]*?<\/metadata>/, '');
    if (cache.size > 300) cache.clear();
    cache.set(key, svg);
  }
  return svg;
}
