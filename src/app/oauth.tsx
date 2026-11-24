import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { C } from '../lib/theme';

/**
 * Lichess sends the browser back to com.andrej.monomate://oauth after login. On Android that link also opens
 * this route; the login itself is completed by expo-auth-session, so just return to where we were.
 */
// Desktop: this page opens in the Lichess login popup; hand the result back to the main window.
WebBrowser.maybeCompleteAuthSession();

export default function OAuthReturn() {
  useEffect(() => {
    const t = setTimeout(() => (router.canGoBack() ? router.back() : router.replace('/online')), 50);
    return () => clearTimeout(t);
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
      <ActivityIndicator color={C.ink} />
    </View>
  );
}
