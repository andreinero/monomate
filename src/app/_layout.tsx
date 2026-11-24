import '../lib/i18nStore'; // first: the saved language must be known before anything renders
import { useEffect, useSyncExternalStore } from 'react';
import '../lib/alertPolyfill';
import { Stack, ThemeProvider, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { SpaceMono_400Regular, SpaceMono_700Bold } from '@expo-google-fonts/space-mono';
import { EngineProvider } from '../engine/EngineProvider';
import { ChallengePopup } from '../components/ChallengePopup';
import { preloadSounds } from '../lib/sound';
import { C, appTheme, subscribeTheme, themeVersion } from '../lib/theme';
import { langVersion, subscribeLang, t } from '../lib/i18n';
import { headerTitleStyle, HeaderRule } from '../components/chrome';
import { useSettings } from '../lib/storage';
import { setRoastMode } from '../engine/coaches';
import { setHapticsEnabled } from '../lib/haptics';

SplashScreen.preventAutoHideAsync().catch(() => {});

const navTheme = () => ({
  ...DefaultTheme,
  dark: appTheme() === 'black',
  colors: { ...DefaultTheme.colors, background: C.bg, card: C.white, text: C.ink, border: C.ink, primary: C.ink },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ SpaceGrotesk_500Medium, SpaceGrotesk_700Bold, SpaceMono_400Regular, SpaceMono_700Bold });
  const ready = fontsLoaded || !!fontError;
  // A theme switch redraws every screen (styles are rebuilt for the new colours).
  const themeV = useSyncExternalStore(subscribeTheme, themeVersion);
  // Switching language redraws every screen, like switching theme.
  const langV = useSyncExternalStore(subscribeLang, langVersion);

  // Roast mode is read by the coach-line pickers everywhere (games, review).
  const settings = useSettings();
  useEffect(() => setRoastMode(!!settings.roastMode), [settings.roastMode]);
  useEffect(() => setHapticsEnabled(settings.haptics !== false), [settings.haptics]);

  useEffect(() => {
    if (ready) {
      preloadSounds();
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme()}>
        <EngineProvider>
          <StatusBar style={appTheme() === 'black' ? 'light' : 'dark'} />
          <Stack
            key={`${themeV}-${langV}`}
            screenOptions={{
              headerBackground: HeaderRule,
              headerShadowVisible: false,
              headerTintColor: C.ink,
              headerTitleStyle: headerTitleStyle(),
              contentStyle: { backgroundColor: C.bg },
              headerBackButtonDisplayMode: 'minimal',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="bots" options={{ title: t('CHOOSE OPPONENT') }} />
            <Stack.Screen name="game" options={{ title: t('GAME') }} />
            <Stack.Screen name="review" options={{ title: t('GAME REVIEW') }} />
            <Stack.Screen name="puzzle" options={{ title: t('PUZZLES') }} />
            <Stack.Screen name="puzzle-themes" options={{ title: t('PUZZLE THEMES') }} />
            <Stack.Screen name="opening" options={{ title: t('OPENING') }} />
            <Stack.Screen name="opening-family" options={{ title: t('OPENINGS') }} />
            <Stack.Screen name="online" options={{ title: t('PLAY ONLINE') }} />
            <Stack.Screen name="avatar" options={{ title: t('YOUR AVATAR') }} />
            <Stack.Screen name="chesscom-games" options={{ title: t('CHESS.COM GAMES') }} />
            <Stack.Screen name="online-game" options={{ title: t('ONLINE'), gestureEnabled: false }} />
            <Stack.Screen name="oauth" options={{ headerShown: false }} />
            <Stack.Screen name="chess-clock" options={{ headerShown: false, gestureEnabled: false }} />
            <Stack.Screen name="rating-setup" options={{ title: t('YOUR RATING'), presentation: 'fullScreenModal' }} />
          </Stack>
          <ChallengePopup />
        </EngineProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
