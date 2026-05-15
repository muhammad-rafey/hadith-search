import type * as React from "react";
import { View, type ViewProps } from "react-native";
import { cn } from "@/lib/utils";
import { Text } from "./text";

// Mirrors apps/web/components/ui/card.tsx structure (Card / Header / Title /
// Description / Content / Footer), adapted to RN Views.

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("rounded-lg border border-border bg-card", className)} {...props} />;
}

export function CardHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("gap-1.5 p-4", className)} {...props} />;
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text size="lg" weight="semibold" className={cn("text-card-foreground", className)}>
      {children}
    </Text>
  );
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text size="sm" className={cn("text-muted-foreground", className)}>
      {children}
    </Text>
  );
}

export function CardContent({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("p-4 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ViewProps & { className?: string }) {
  return <View className={cn("flex-row items-center p-4 pt-0", className)} {...props} />;
}
