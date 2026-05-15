import * as React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

/**
 * Reusable empty/info panel — dashed border box matching the web's empty
 * states in result-list.tsx / bookmarks page. Optional CTA.
 */
export function EmptyState({
  title,
  description,
  ctaLabel,
  onCta,
  className,
  tone = "default",
}: {
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
  tone?: "default" | "error";
}) {
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : "summary"}
      className={cn(
        "rounded-md border p-6",
        tone === "error" ? "border-destructive bg-destructive/10" : "border-dashed border-border",
        className,
      )}
    >
      <Text weight="semibold" className="text-center">
        {title}
      </Text>
      {description ? (
        <Text size="sm" className="mt-1 text-center text-muted-foreground">
          {description}
        </Text>
      ) : null}
      {ctaLabel && onCta ? (
        <View className="mt-4 items-center">
          <Button onPress={onCta}>{ctaLabel}</Button>
        </View>
      ) : null}
    </View>
  );
}
