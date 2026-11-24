import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { configureLanguage, type Lang } from './i18n';

// Loads the saved language synchronously at startup (imported first thing by the root layout).
const LANG_FILE = 'app-language.txt';

function deviceLang(): Lang {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale ?? '';
    return loc.toLowerCase().startsWith('de') ? 'de' : 'en';
  } catch {
    return 'en';
  }
}

function readLang(): Lang {
  try {
    const v = (Platform.OS === 'web' ? globalThis.localStorage?.getItem(LANG_FILE) : new File(Paths.document, LANG_FILE).textSync())?.trim();
    if (v === 'de' || v === 'en') return v;
  } catch {}
  // No saved choice yet: follow the phone's language.
  return deviceLang();
}

configureLanguage(readLang(), (l) => {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(LANG_FILE, l);
  else Promise.resolve(new File(Paths.document, LANG_FILE).write(l)).catch(() => {});
});
