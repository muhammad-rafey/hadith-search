import { Check, ChevronDown } from "lucide-react-native";
import * as React from "react";
import { FlatList, Modal, View } from "react-native";
import { COLLECTION_ORDER, collectionName, collectionSortIndex } from "@hadith/shared-types";
import { Icon } from "@/components/icon";
import { Pressable } from "@/components/ui/pressable";
import { Text } from "@/components/ui/text";
import type { CollectionSummary } from "@/lib/hadiths";
import { useCollectionList } from "@/lib/queries/use-collections";
import { cn } from "@/lib/utils";

/**
 * Collection picker — RN has no native <select>, so this is a labelled
 * trigger button that opens a bottom-sheet-style modal list of the 15
 * collections. Mirrors apps/web/components/collection-picker.tsx semantics:
 * falls back to the curated COLLECTION_ORDER until the collection list
 * (useCollectionList → GET /api/collections) resolves, so it is never empty,
 * and (optionally) shows live hadith counts.
 */
const FALLBACK_OPTIONS: CollectionSummary[] = [...COLLECTION_ORDER].map((collection) => ({
  collection,
  name: collectionName(collection),
  arabic_name: null,
  hadith_count: 0,
}));

export interface CollectionPickerProps {
  value: string;
  onChange: (collection: string) => void;
  /** Show live hadith counts next to each option. Off by default. */
  showCounts?: boolean;
  className?: string;
  accessibilityLabel?: string;
}

export function CollectionPicker({
  value,
  onChange,
  showCounts = false,
  className,
  accessibilityLabel,
}: CollectionPickerProps) {
  const [open, setOpen] = React.useState(false);
  const { data } = useCollectionList();

  const options = React.useMemo(() => {
    const source = data && data.length > 0 ? data : FALLBACK_OPTIONS;
    return [...source].sort(
      (a, b) => collectionSortIndex(a.collection) - collectionSortIndex(b.collection),
    );
  }, [data]);

  const selectedLabel = collectionName(value);

  return (
    <>
      <Pressable
        haptic={false}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? "Choose a collection"}
        accessibilityState={{ expanded: open }}
        className={cn(
          "h-10 flex-row items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3",
          className,
        )}
      >
        <Text size="sm" weight="medium" numberOfLines={1} className="flex-1">
          {selectedLabel}
        </Text>
        <Icon as={ChevronDown} size={16} token="muted-foreground" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          haptic={false}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close collection picker"
          className="flex-1 justify-end bg-black/50"
        >
          {/* Inner Pressable swallows taps so they don't dismiss the sheet. */}
          <Pressable
            haptic={false}
            onPress={() => {}}
            className="max-h-[70%] rounded-t-2xl border-t border-border bg-card pb-6 pt-2"
          >
            <View className="items-center pb-2 pt-1">
              <View className="h-1 w-10 rounded-full bg-muted-foreground/40" />
            </View>
            <Text size="xs" weight="medium" className="px-4 pb-1 uppercase text-muted-foreground">
              Collection
            </Text>
            <FlatList
              data={options}
              keyExtractor={(c) => c.collection}
              renderItem={({ item }) => {
                const selected = item.collection === value;
                return (
                  <Pressable
                    haptic={false}
                    onPress={() => {
                      onChange(item.collection);
                      setOpen(false);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className="flex-row items-center justify-between gap-3 px-4 py-3"
                  >
                    <View className="flex-1">
                      <Text size="base" weight={selected ? "semibold" : "regular"}>
                        {item.name}
                        {showCounts && item.hadith_count > 0
                          ? ` (${item.hadith_count.toLocaleString()})`
                          : ""}
                      </Text>
                      {item.arabic_name ? (
                        <Text
                          size="sm"
                          className="mt-0.5 text-muted-foreground"
                          style={{ writingDirection: "rtl" }}
                        >
                          {item.arabic_name}
                        </Text>
                      ) : null}
                    </View>
                    {selected ? <Icon as={Check} size={18} token="primary" /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
