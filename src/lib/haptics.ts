import * as Haptics from 'expo-haptics';

/** Follows the "Vibration" setting (set from the root layout). */
let enabled = true;
export const setHapticsEnabled = (on: boolean) => {
  enabled = on;
};

/** A light tick for a button press, tab or piece pick-up. */
export function tap() {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** A notification buzz (something arrived, e.g. a challenge). */
export function buzz() {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
