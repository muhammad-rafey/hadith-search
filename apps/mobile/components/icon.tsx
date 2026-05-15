import type { LucideIcon } from "lucide-react-native";
import * as React from "react";
import { useTheme } from "@/components/theme-provider";
import { hsl } from "@/lib/tokens";

/**
 * Themed Lucide wrapper. lucide-react-native colors are set via a prop, not
 * className, so we resolve the token from the active theme. Same icon names
 * the web uses (Search, Bookmark, BookOpen, Settings, Share2, Check, …).
 */
type TokenName =
  | "foreground"
  | "muted-foreground"
  | "primary"
  | "primary-foreground"
  | "destructive"
  | "destructive-foreground"
  | "accent-foreground";

export function Icon({
  as: Cmp,
  size = 18,
  token = "foreground",
  color,
}: {
  as: LucideIcon;
  size?: number;
  token?: TokenName;
  color?: string;
}) {
  const { theme } = useTheme();
  return <Cmp size={size} color={color ?? hsl(theme, token)} />;
}
