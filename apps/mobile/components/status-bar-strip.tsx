import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Colored strip painted behind the OS status bar. The app is edge-to-edge
 * (Expo SDK 54 + new arch), so `StatusBar backgroundColor` is a no-op on
 * Android — we draw the strip ourselves, sized to the top safe-area inset.
 *
 * `bg-primary` resolves per theme (green light/dark, brown sepia) via the
 * NativeWind token system, and the root `<StatusBar style="light" />` keeps
 * the OS icons white so they stay visible over it. Render it as the first
 * child of a screen's root so content flows below.
 */
export function StatusBarStrip() {
  const insets = useSafeAreaInsets();
  return <View style={{ height: insets.top }} className="bg-primary" />;
}
