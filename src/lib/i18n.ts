import { DE } from '../i18n/de';
import DE_VOICE from '../i18n/de/voice.json';

/**
 * App language. English text is written in the code as-is and doubles as the lookup key:
 *   t('Find opponent')                      → "Gegner finden" in German
 *   t('No player called “{name}”.', { name }) → placeholders are filled in after translating
 * A string without a German translation simply stays English.
 *
 * Call `t()` at render time (not in module-level constants), so switching language takes effect.
 */
export type Lang = 'en' | 'de';
export const LANGUAGES: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
];

// The saved choice is loaded at startup by lib/i18nStore.ts (kept separate so this file has no
// native imports and works in plain Node scripts too, where the language is English).
let current: Lang = 'en';
let save: (l: Lang) => void = () => {};
export const lang = () => current;

/** Called once at startup by i18nStore with the saved (or device) language and how to save changes. */
export function configureLanguage(initial: Lang, saver: (l: Lang) => void) {
  current = initial;
  save = saver;
}

let version = 0;
const listeners = new Set<() => void>();
export const langVersion = () => version;
export function subscribeLang(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Switch language: saves the choice and tells the root layout to redraw everything. */
export function setLanguage(l: Lang) {
  if (l === current) return;
  current = l;
  version++;
  try {
    save(l);
  } catch {}
  listeners.forEach((fn) => fn());
}

const fill = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

/** Translate an English UI string (see the top of this file). */
export function t(en: string, vars?: Record<string, string | number>): string {
  return fill(current === 'de' ? (DE[en] ?? en) : en, vars);
}

/** A recorded character line, by its voice key: German text when there is one, else the English. */
export function voiceText(key: string, en: string): string {
  return current === 'de' ? ((DE_VOICE as Record<string, string>)[key] ?? en) : en;
}
