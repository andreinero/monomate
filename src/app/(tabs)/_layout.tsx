import { useEffect } from 'react';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/tabs';
import { store } from '../../lib/storage';
import { tap } from '../../lib/haptics';
import { View } from 'react-native';
import { Text } from '../../components/ui';
import { B, C, F } from '../../lib/theme';
import { headerTitleStyle, HeaderRule } from '../../components/chrome';
import { t } from '../../lib/i18n';

// Chess glyphs as tab icons. ︎ forces the plain text form (never an emoji).
const icon = (glyph: string) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return (
      <View style={{ width: 34, height: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? C.ink : 'transparent' }}>
        <Text style={{ fontSize: 20, lineHeight: 24, color: focused ? C.white : C.muted }}>{glyph + '︎'}</Text>
      </View>
    );
  };

export default function TabsLayout() {
  // First launch: ask for the player's current rating.
  useEffect(() => {
    store.profile().then((p) => {
      if (p.rating === undefined) router.push('/rating-setup');
    });
  }, []);

  return (
    <Tabs
      screenListeners={{ tabPress: () => tap() }}
      screenOptions={{
        headerBackground: HeaderRule,
        headerShadowVisible: false,
        headerTintColor: C.ink,
        headerTitleStyle: headerTitleStyle(),
        tabBarStyle: { backgroundColor: C.white, borderTopWidth: B.w, borderTopColor: C.ink },
        tabBarActiveTintColor: C.ink,
        tabBarInactiveTintColor: C.muted,
        tabBarLabelStyle: { fontFamily: F.mono, fontSize: 10, letterSpacing: 1 },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('PLAY'), headerTitle: 'MONOMATE', tabBarIcon: icon('♞') }} />
      <Tabs.Screen name="puzzles" options={{ title: t('PUZZLES'), tabBarIcon: icon('♝') }} />
      <Tabs.Screen name="learn" options={{ title: t('LEARN'), headerTitle: t('OPENINGS'), tabBarIcon: icon('♛') }} />
      <Tabs.Screen name="analysis" options={{ title: t('ANALYSIS'), tabBarIcon: icon('♜') }} />
      <Tabs.Screen name="profile" options={{ title: t('ME'), tabBarIcon: icon('♚') }} />
    </Tabs>
  );
}
