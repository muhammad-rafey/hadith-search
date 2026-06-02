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
        headerStyle: { backgroundColor: hsl(theme, "background") },
        headerTitleStyle: { fontFamily: "Inter-SemiBold", color: hsl(theme, "foreground") },
        headerTintColor: hsl(theme, "primary"),
        headerShadowVisible: false,
        contentStyle: { backgroundColor: hsl(theme, "background") },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Browse" }} />
      <Stack.Screen name="[collection]" options={{ title: "Collection" }} />
    </Stack>
  );
}
