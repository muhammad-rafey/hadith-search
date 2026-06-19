import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Height of the bottom tab bar, used to pad scrollable content so the last
 * item clears the floating tab bar.
 *
 * SDK 56's expo-router decoupled from react-navigation and bans direct
 * `@react-navigation/*` imports in app code, so the old
 * `useBottomTabBarHeight()` hook is no longer importable. Our `(tabs)/_layout`
 * doesn't customize the tab bar height, so it uses React Navigation's default
 * (49) plus the bottom safe-area inset — which is exactly what the old hook
 * returned. This reproduces it without the banned import.
 */
const DEFAULT_TAB_BAR_HEIGHT = 49;

export function useTabBarHeight(): number {
  const insets = useSafeAreaInsets();
  return DEFAULT_TAB_BAR_HEIGHT + insets.bottom;
}
