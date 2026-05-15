import { Tabs } from "expo-router";
import { Bookmark, BookOpen, Search, Settings } from "lucide-react-native";
import * as React from "react";
import { useTheme } from "@/components/theme-provider";
import { hsl } from "@/lib/tokens";

/**
 * Bottom tab bar (confirmed decision): Search / Browse / Bookmarks /
 * Settings. Browse is a nested stack so book detail pushes within the tab;
 * hadith detail lives on the root stack so it covers the tab bar.
 */
export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: hsl(theme, "primary"),
        tabBarInactiveTintColor: hsl(theme, "muted-foreground"),
        tabBarStyle: {
          backgroundColor: hsl(theme, "background"),
          borderTopColor: hsl(theme, "border"),
        },
        tabBarLabelStyle: { fontFamily: "Inter-Medium", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, size }) => <Search color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: "Browse",
          tabBarIcon: ({ color, size }) => <BookOpen color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookmarks"
        options={{
          title: "Bookmarks",
          tabBarIcon: ({ color, size }) => <Bookmark color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
