import { Stack } from "expo-router";
import * as React from "react";
import { useTheme } from "@/components/theme-provider";
import { hsl } from "@/lib/tokens";

// Nested stack so /browse/[collection] pushes within the Browse tab (the tab
// bar stays visible; hadith detail, on the root stack, covers it).
export default function BrowseLayout() {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        // The header doubles as the colored top bar (mirrors <StatusBarStrip>
        // on the headerless screens) so the OS status-bar icons stay visible.
        headerStyle: { backgroundColor: hsl(theme, "primary") },
        headerTitleStyle: { fontFamily: "Inter-SemiBold", color: hsl(theme, "primary-foreground") },
        headerTintColor: hsl(theme, "primary-foreground"),
        headerShadowVisible: false,
        contentStyle: { backgroundColor: hsl(theme, "background") },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Browse" }} />
      <Stack.Screen name="[collection]" options={{ title: "Collection" }} />
    </Stack>
  );
}
