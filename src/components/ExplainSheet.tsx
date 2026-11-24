import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from './Press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui';
import { B, C, themed } from '../lib/theme';
import { t } from '../lib/i18n';
import type { Explanation } from '../engine/explainError';

/** "Accurate info from coach": slides up with what went wrong, why, what was better and a tip. */
export function ExplainSheet({ explanation, coachName, onClose }: { explanation: Explanation | null; coachName: string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [v] = useState(() => new Animated.Value(0));
  const open = !!explanation;
  useEffect(() => {
    if (!open) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [open, v]);
  if (!explanation) return null;
  const rows: [string, string][] = [
    [t('WHAT HAPPENED'), explanation.what],
    [t('WHY'), explanation.why],
    [t('BETTER'), explanation.better],
    [t('TIP'), explanation.tip],
  ];
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.wrap, { paddingBottom: insets.bottom + 12, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [500, 0] }) }] }]}>
        <View>
          <View style={styles.shadow} />
          <View style={styles.sheet}>
            <Text style={styles.kicker}>{t('{name} EXPLAINS · {swing}', { name: coachName.toUpperCase(), swing: explanation.swing })}</Text>
            <Text style={styles.title}>{explanation.title}</Text>
            <View style={styles.rule} />
            <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: 12 }}>
              {rows.map(([label, text]) => (
                <View key={label} style={styles.row}>
                  <Text style={styles.label}>{label}</Text>
                  <Text style={styles.text}>{text}</Text>
                </View>
              ))}
            </ScrollView>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.ok, pressed && { backgroundColor: C.paper }]}>
              <Text style={styles.okText}>{t('GOT IT')}</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

/** Small "WHY?" button shown next to an inaccuracy / mistake / blunder tag. */
export function WhyButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [styles.why, pressed && { backgroundColor: C.ink }]}>
      {({ pressed }) => <Text style={[styles.whyText, pressed && { color: C.white }]}>{t('WHY?')}</Text>}
    </Pressable>
  );
}

const styles = themed(() => StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  shadow: { position: 'absolute', left: B.shadow, right: -B.shadow, top: B.shadow, bottom: -B.shadow, backgroundColor: C.ink },
  sheet: { backgroundColor: C.white, borderWidth: B.w, borderColor: C.ink, padding: 16, gap: 8 },
  kicker: { fontFamily: 'mono', fontSize: 10, letterSpacing: 1.2, color: C.muted },
  title: { fontWeight: '700', fontSize: 22, letterSpacing: -0.3 },
  rule: { height: B.w * 2, backgroundColor: C.ink, marginVertical: 4 },
  row: { gap: 3 },
  label: { fontFamily: 'mono', fontWeight: '700', fontSize: 11, letterSpacing: 1.4 },
  text: { fontSize: 15, lineHeight: 21 },
  ok: { alignItems: 'center', paddingVertical: 12, marginTop: 6, borderWidth: B.w, borderColor: C.ink },
  okText: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 1.5 },
  why: { borderWidth: B.w, borderColor: C.ink, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: C.white },
  whyText: { fontFamily: 'mono', fontWeight: '700', fontSize: 10, letterSpacing: 0.8 },
}));
