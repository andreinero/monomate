import type { ComponentProps } from 'react';
import { Pressable as RNPressable } from 'react-native';
import { tap } from '../lib/haptics';

/**
 * Pressable with a light haptic tick the moment it's touched (when it does something).
 * Used everywhere instead of React Native's Pressable.
 */
export function Pressable(props: ComponentProps<typeof RNPressable>) {
  const { onPressIn, onPress, onLongPress, disabled } = props;
  return (
    <RNPressable
      {...props}
      onPressIn={(e) => {
        if (!disabled && (onPress || onLongPress)) tap();
        onPressIn?.(e);
      }}
    />
  );
}
