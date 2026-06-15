import { Stack, useRouter } from "expo-router";
import { View } from "react-native";
import { EmptyState } from "@/components/empty-state";
import { StatusBarStrip } from "@/components/status-bar-strip";

// Catch-all for unknown routes / bad deep links.
export default function NotFound() {
  const router = useRouter();
  return (
    // bg-background is light in light/sepia themes; without the colored strip
    // the root <StatusBar style="light" /> would render white OS icons invisibly.
    <View className="flex-1 bg-background">
      <StatusBarStrip />
      <Stack.Screen options={{ title: "Not found" }} />
      <View className="flex-1 p-4">
        <EmptyState
          title="Page not found"
          description="That screen doesn't exist."
          ctaLabel="Go to Search"
          onCta={() => router.replace("/(tabs)/search")}
        />
      </View>
    </View>
  );
}
