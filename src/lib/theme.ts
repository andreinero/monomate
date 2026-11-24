/**
 * MonoMate design tokens — minimal brutalism: white paper, black ink, hard edges, hard shadows.
 * Colour is reserved for meaning (red = danger/low time; review classifications).
 */
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

export type AppTheme = 'light' | 'black';

const LIGHT = {
  bg: '#FFFFFF',
  paper: '#F3F3F0',
  card: '#FFFFFF',
  cardAlt: '#F3F3F0',
  ink: '#000000',
  border: '#000000',
  text: '#000000',
  muted: '#6E6E6E',
  faint: '#BDBDBD',
  accent: '#000000',
  accentDark: '#000000',
  danger: '#E10600',
  good: '#1E9E57',
  /** The page colour (white in the light theme, black in the black theme). */
  white: '#FFFFFF',
  /** Translucent page colour laid over the screen behind dialogs. */
  scrim: 'rgba(255,255,255,0.82)',
};

/** Black theme: the same brutalist look, inverted — black paper, white ink. */
const BLACK: typeof LIGHT = {
  bg: '#000000',
  paper: '#161616',
  card: '#000000',
  cardAlt: '#161616',
  ink: '#FFFFFF',
  border: '#FFFFFF',
  text: '#FFFFFF',
  muted: '#9A9A9A',
  faint: '#4A4A4A',
  accent: '#FFFFFF',
  accentDark: '#FFFFFF',
  danger: '#FF3B30',
  good: '#22B365',
  white: '#000000',
  scrim: 'rgba(0,0,0,0.82)',
};

/**
 * Real white and black, for things that mean the two sides (eval bar, accuracy boxes) or text
 * on a coloured background — these never invert with the theme.
 */
export const P = { white: '#FFFFFF', black: '#000000' };

// The chosen theme is read synchronously at startup, before any styles are built.
const THEME_FILE = 'app-theme.txt';
function readTheme(): AppTheme {
  try {
    const v = Platform.OS === 'web' ? globalThis.localStorage?.getItem(THEME_FILE) : new File(Paths.document, THEME_FILE).textSync();
    return v?.trim() === 'black' ? 'black' : 'light';
  } catch {
    return 'light';
  }
}

let current: AppTheme = readTheme();

/**
 * MonoMate colours for the current theme. Read them at render time (or inside `themed`) so a
 * theme switch takes effect.
 */
export const C = { ...(current === 'black' ? BLACK : LIGHT) };

export const appTheme = () => current;

let version = 0;
const listeners = new Set<() => void>();
export const themeVersion = () => version;
export function subscribeTheme(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Switch theme: recolours `C`, saves the choice, and tells the root layout to redraw. */
export function setAppTheme(t: AppTheme) {
  if (t === current) return;
  current = t;
  Object.assign(C, t === 'black' ? BLACK : LIGHT);
  version++;
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(THEME_FILE, t);
    else Promise.resolve(new File(Paths.document, THEME_FILE).write(t)).catch(() => {});
  } catch {}
  listeners.forEach((l) => l());
}

/**
 * Module-level styles that follow the theme: `const styles = themed(() => StyleSheet.create({...}))`.
 * The sheet is rebuilt (once) after each theme switch; use it exactly like a normal sheet.
 */
export function themed<T extends object>(make: () => T): T {
  let built = make();
  let builtFor = version;
  const sheet = () => {
    if (builtFor !== version) {
      built = make();
      builtFor = version;
    }
    return built as Record<string | symbol, unknown>;
  };
  return new Proxy({} as T, {
    get: (_t, key) => sheet()[key],
    has: (_t, key) => key in sheet(),
    ownKeys: () => Reflect.ownKeys(sheet()),
    getOwnPropertyDescriptor: (_t, key) => (key in sheet() ? { configurable: true, enumerable: true, writable: false, value: sheet()[key] } : undefined),
  });
}

/** Font families (loaded in app/_layout.tsx). Space Grotesk + Space Mono, both SIL OFL. */
export const F = {
  regular: 'SpaceGrotesk_500Medium',
  bold: 'SpaceGrotesk_700Bold',
  mono: 'SpaceMono_400Regular',
  monoBold: 'SpaceMono_700Bold',
};

/** Border width and hard-shadow offset. */
export const B = { w: 2, shadow: 4 };

export const BOARD_THEMES = {
  mono: { light: '#FFFFFF', dark: '#C7C7C7', name: 'Mono' },
  concrete: { light: '#ECECE8', dark: '#8F8F8C', name: 'Concrete' },
  walnut: { light: '#f0d9b5', dark: '#b58863', name: 'Walnut' },
  ocean: { light: '#dee3e6', dark: '#8ca2ad', name: 'Ocean' },
} as const;

export const HIGHLIGHT = {
  lastMove: 'rgba(0,0,0,0.14)',
  selected: 'rgba(0,0,0,0.34)',
  check: 'rgba(225,6,0,0.85)',
  hint: 'rgba(0,0,0,0.25)',
};
