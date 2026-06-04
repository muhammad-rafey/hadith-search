import "../global.css";
import { Amiri_400Regular, Amiri_700Bold } from "@expo-google-fonts/amiri";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as React from "react";
import { I18nManager } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { Providers } from "@/components/providers";
import { initSentry } from "@/lib/sentry";

// Force LTR globally; Arabic is handled per-element with writingDirection:"rtl"
// (plan/02-web-app.md — never globally mirror the layout).
I18nManager.allowRTL(false);
initSentry();
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "Inter-Regular": Inter_400Regular,
    "Inter-Medium": Inter_500Medium,
    "Inter-SemiBold": Inter_600SemiBold,
    "Amiri-Regular": Amiri_400Regular,
    "Amiri-Bold": Amiri_700Bold,
  });

  // Hide the splash once fonts are ready. On font failure we still proceed
  // (system fonts) so the app never hangs on the splash (plan edge case #19).
  React.useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <Providers>
            <StatusBar style="light" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="hadith/[id]" options={{ presentation: "card" }} />
              <Stack.Screen name="+not-found" />
            </Stack>
          </Providers>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
