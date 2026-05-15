import { Stack, useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { EmptyState } from "@/components/empty-state";

// Catch-all for unknown routes / bad deep links.
export default function NotFound() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background p-4">
      <Stack.Screen options={{ title: "Not found" }} />
      <EmptyState
        title="Page not found"
        description="That screen doesn't exist."
        ctaLabel="Go to Search"
        onCta={() => router.replace("/(tabs)/search")}
      />
    </View>
  );
}
