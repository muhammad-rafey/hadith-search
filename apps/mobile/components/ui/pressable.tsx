import * as Haptics from "expo-haptics";
import * as React from "react";
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type View,
} from "react-native";
import { cn } from "@/lib/utils";

export interface PressableProps extends RNPressableProps {
  className?: string;
  /** Light haptic bump on press (no-op on web / unsupported devices). */
  haptic?: boolean;
}

/**
 * Pressable with a consistent pressed-opacity and optional haptic. Haptics
 * are best-effort: failures (web, locked-down devices) are swallowed.
 */
export const Pressable = React.forwardRef<View, PressableProps>(
  ({ className, haptic, onPress, disabled, ...rest }, ref) => {
    return (
      <RNPressable
        ref={ref}
        disabled={disabled}
        onPress={(e) => {
          if (haptic) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          }
          onPress?.(e);
        }}
        style={({ pressed }) => [{ opacity: disabled ? 0.5 : pressed ? 0.6 : 1 }]}
        className={className}
        {...rest}
      />
    );
  },
);
Pressable.displayName = "Pressable";
