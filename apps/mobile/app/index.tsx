import { Redirect } from "expo-router";

// Launch goes straight to Search (confirmed decision — no marketing screen
// on mobile). "/" deep links resolve here too.
export default function Index() {
  return <Redirect href="/(tabs)/search" />;
}
