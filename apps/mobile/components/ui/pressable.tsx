import * as Haptics from "expo-haptics";
import * as React from "react";
import {
  Pressable as RNPressable,
  type PressableProps as RNPressableProps,
  type View,
} from "react-native";

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
  ({ className, haptic, onPress, disabled, style, ...rest }, ref) => {
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
        // Compose our opacity with any caller-provided style instead of
        // letting the spread clobber it.
        style={(state) => [
          { opacity: disabled ? 0.5 : state.pressed ? 0.6 : 1 },
          typeof style === "function" ? style(state) : style,
        ]}
        className={className}
        {...rest}
      />
    );
  },
);
Pressable.displayName = "Pressable";
