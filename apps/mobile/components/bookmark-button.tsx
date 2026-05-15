import { Bookmark, BookmarkCheck } from "lucide-react-native";
import * as React from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useBookmarks } from "@/lib/queries/use-bookmarks";

/**
 * Bookmark toggle — same Zustand store as the web (single source of truth),
 * so toggling here updates the Bookmarks tab and any open card instantly
 * (plan edge case #30).
 */
export function BookmarkButton({ hadithId }: { hadithId: string }) {
  const ids = useBookmarks((s) => s.ids);
  const toggle = useBookmarks((s) => s.toggle);
  const saved = ids.includes(hadithId);

  return (
    <Button
      variant={saved ? "default" : "outline"}
      onPress={() => toggle(hadithId)}
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? "Remove bookmark" : "Add bookmark"}
    >
      <Icon
        as={saved ? BookmarkCheck : Bookmark}
        size={16}
        token={saved ? "primary-foreground" : "foreground"}
      />
      <Text
        size="base"
        weight="medium"
        className={saved ? "text-primary-foreground" : "text-foreground"}
      >
        {saved ? "Bookmarked" : "Bookmark"}
      </Text>
    </Button>
  );
}
