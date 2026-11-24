import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, View } from 'react-native';
import { Pressable } from './Press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './ui';
import { B, C, themed } from '../lib/theme';
import { t } from '../lib/i18n';

export type SheetOption = { label: string; sub?: string; icon?: string; onPress: () => void; destructive?: boolean };

/**
 * MonoMate's own action sheet (instead of the system pop-up): slides up from the bottom,
 * a hard-edged slab with big option rows, and a Cancel bar.
 */
export function Sheet({ visible, title, message, options, onClose, cancelLabel = t('Cancel') }: { visible: boolean; title: string; message?: string; options: SheetOption[]; onClose: () => void; cancelLabel?: string }) {
  const insets = useSafeAreaInsets();
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!visible) return;
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, v]);

  const choose = (o: SheetOption) => {
    onClose();
    // Let the sheet close first (opening the photo picker over a closing modal can fail on iOS).
    setTimeout(o.onPress, 280);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View style={[styles.backdropTint, { opacity: v }]} />
      </Pressable>
      <Animated.View
        style={[styles.wrap, { paddingBottom: insets.bottom + 12, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] }]}
        pointerEvents="box-none"
      >
        <View>
          <View style={styles.shadow} />
          <View style={styles.sheet}>
          <Text style={styles.title}>{title.toUpperCase()}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.rule} />
          {options.map((o) => (
            <Pressable key={o.label} onPress={() => choose(o)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: o.destructive ? C.danger : C.ink }]}>
              {({ pressed }) => {
                const fg = pressed ? C.white : o.destructive ? C.danger : C.ink;
                return (
                  <>
                    {o.icon ? <Text style={[styles.icon, { color: fg, borderColor: pressed ? C.white : fg }]}>{o.icon}</Text> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.label, { color: fg }]}>{o.label.toUpperCase()}</Text>
                      {o.sub ? <Text style={[styles.sub, { color: pressed ? C.white : C.muted }]}>{o.sub}</Text> : null}
                    </View>
                    <Text style={[styles.arrow, { color: fg }]}>→</Text>
                  </>
                );
              }}
            </Pressable>
          ))}
          <Pressable onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && { backgroundColor: C.paper }]}>
            <Text style={styles.cancelText}>{cancelLabel.toUpperCase()}</Text>
          </Pressable>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = themed(() => StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdropTint: { flex: 1, backgroundColor: C.scrim },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12 },
  // Hard offset shadow, like every slab in the app.
  shadow: { position: 'absolute', left: B.shadow, right: -B.shadow, top: B.shadow, bottom: -B.shadow, backgroundColor: C.ink },
  sheet: { backgroundColor: C.white, borderWidth: B.w, borderColor: C.ink, padding: 16, gap: 8 },
  title: { fontWeight: '700', fontSize: 22, letterSpacing: -0.3 },
  message: { fontSize: 14, lineHeight: 19, color: C.muted },
  rule: { height: B.w * 2, backgroundColor: C.ink, marginVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: B.w, borderColor: C.ink, paddingVertical: 12, paddingHorizontal: 12, backgroundColor: C.white },
  icon: { width: 30, height: 30, borderWidth: B.w, textAlign: 'center', lineHeight: 26, fontSize: 16, fontWeight: '700' },
  label: { fontWeight: '700', fontSize: 16, letterSpacing: 0.3 },
  sub: { fontFamily: 'mono', fontSize: 10, letterSpacing: 0.5, marginTop: 2 },
  arrow: { fontSize: 18, fontWeight: '700' },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { fontFamily: 'mono', fontWeight: '700', fontSize: 12, letterSpacing: 1.5 },
}));
