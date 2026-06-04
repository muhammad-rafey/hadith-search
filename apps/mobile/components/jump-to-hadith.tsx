import { useRouter } from "expo-router";
import { ArrowRight } from "lucide-react-native";
import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { CollectionPicker } from "@/components/collection-picker";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { getHadithByNumber } from "@/lib/hadiths";
import { hsl } from "@/lib/tokens";
import { cn } from "@/lib/utils";

interface JumpToHadithProps {
  /**
   * When set, the collection is fixed (no picker) — used inside a collection's
   * reading view. When omitted, a CollectionPicker is shown and the user
   * chooses the collection too — used on the search tab.
   */
  collection?: string;
  /** Initial collection for the picker variant. Defaults to "bukhari". */
  defaultCollection?: string;
  /** Where the resulting detail view records it came from. */
  from?: string;
  className?: string;
}

type JumpState = "idle" | "loading" | "not_found" | "error";

/**
 * "Jump to a hadith by number" affordance. Resolves the number against
 * GET /api/collections/{collection}/lookup (via getHadithByNumber) and routes
 * to the hadith on success. The lookup is the only collection-agnostic
 * deep-link path (semantic search itself is bukhari-only), so this works for
 * all 15 collections. Mirrors apps/web/components/jump-to-hadith.tsx.
 */
export function JumpToHadith({
  collection,
  defaultCollection = "bukhari",
  from = "browse",
  className,
}: JumpToHadithProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const [pickedCollection, setPickedCollection] = React.useState(collection ?? defaultCollection);
  const [number, setNumber] = React.useState("");
  const [state, setState] = React.useState<JumpState>("idle");

  const activeCollection = collection ?? pickedCollection;
  const trimmed = number.trim();

  const onSubmit = async () => {
    if (!trimmed) return;
    setState("loading");
    try {
      const hadith = await getHadithByNumber(activeCollection, trimmed);
      if (!hadith) {
        setState("not_found");
        return;
      }
      setState("idle");
      router.push(`/hadith/${encodeURIComponent(hadith.id)}?from=${from}`);
    } catch {
      setState("error");
    }
  };

  // Any edit clears a stale "not found" / "error" message.
  const resetState = () => {
    if (state !== "idle" && state !== "loading") setState("idle");
  };

  return (
    <View className={cn("gap-2", className)}>
      <View className="flex-row flex-wrap items-end gap-2">
        {!collection ? (
          <View className="min-w-[150px] flex-1 gap-1">
            <Text size="xs" className="text-muted-foreground">
              Collection
            </Text>
            <CollectionPicker
              value={pickedCollection}
              onChange={(c) => {
                setPickedCollection(c);
                resetState();
              }}
              accessibilityLabel="Collection to jump within"
            />
          </View>
        ) : null}
        <View className="gap-1">
          <Text size="xs" className="text-muted-foreground">
            Hadith number
          </Text>
          <Input
            value={number}
            onChangeText={(v) => {
              setNumber(v);
              resetState();
            }}
            onSubmitEditing={onSubmit}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="go"
            inputMode="text"
            placeholder="e.g. 8a"
            accessibilityLabel="Hadith number to jump to"
            className="h-11 w-24"
          />
        </View>
        <Button
          size="default"
          onPress={onSubmit}
          disabled={state === "loading" || trimmed.length === 0}
          accessibilityLabel="Go to hadith"
        >
          {state === "loading" ? (
            <ActivityIndicator size="small" color={hsl(theme, "primary-foreground")} />
          ) : (
            <Icon as={ArrowRight} size={16} token="primary-foreground" />
          )}
          <Text size="base" weight="medium" className="text-primary-foreground">
            Go
          </Text>
        </Button>
      </View>
      {state === "not_found" || state === "error" ? (
        <Text size="xs" className="text-destructive" accessibilityLiveRegion="polite">
          {state === "not_found"
            ? `No hadith ${trimmed} in that collection.`
            : "Lookup failed — try again."}
        </Text>
      ) : null}
    </View>
  );
}
