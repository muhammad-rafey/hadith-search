import { Search, X } from "lucide-react-native";
import { ActivityIndicator, View } from "react-native";
import { Icon } from "@/components/icon";
import { useTheme } from "@/components/theme-provider";
import { Input } from "@/components/ui/input";
import { Pressable } from "@/components/ui/pressable";
import { hsl } from "@/lib/tokens";
import { cn } from "@/lib/utils";

/**
 * Controlled search field. Parent owns debounce + mutation (same split as
 * apps/web/components/search-box.tsx). Adds a clear (X) affordance and an
 * inline loading spinner — both mobile niceties.
 */
export interface SearchBoxProps {
  value: string;
  onChangeText: (v: string) => void;
  onSubmit?: () => void;
  onClear?: () => void;
  loading?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Override the placeholder. Defaults to the bukhari-scoped semantic copy. */
  placeholder?: string;
}

export function SearchBox({
  value,
  onChangeText,
  onSubmit,
  onClear,
  loading,
  autoFocus,
  className,
  placeholder = "Search Sahih al-Bukhari...",
}: SearchBoxProps) {
  const { theme } = useTheme();
  return (
    <View className={cn("relative justify-center", className)}>
      <View className="absolute left-3 z-10">
        <Icon as={Search} size={18} token="muted-foreground" />
      </View>
      <Input
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        returnKeyType="search"
        accessibilityLabel="Search hadiths"
        accessibilityState={{ busy: !!loading }}
        placeholder={placeholder}
        className="h-12 pl-10 pr-10 text-base"
      />
      <View className="absolute right-3 z-10">
        {loading ? (
          <ActivityIndicator size="small" color={hsl(theme, "muted-foreground")} />
        ) : value.length > 0 && onClear ? (
          <Pressable
            haptic={false}
            onPress={onClear}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}
          >
            <Icon as={X} size={18} token="muted-foreground" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
