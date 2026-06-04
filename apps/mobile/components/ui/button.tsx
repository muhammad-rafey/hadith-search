import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { type StyleProp, type ViewStyle, View } from "react-native";
import { cn } from "@/lib/utils";
import { Pressable, type PressableProps } from "./pressable";
import { Text } from "./text";

// Subtle elevation so filled actions (primary/destructive) read as raised and
// tappable. Android uses `elevation`; iOS needs the explicit shadow props.
const FILLED_SHADOW: ViewStyle = {
  elevation: 2,
  shadowColor: "#000",
  shadowOpacity: 0.12,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
};

/**
 * Button — same variant/size taxonomy as apps/web/components/ui/button.tsx,
 * rendered with Pressable + themed Text. Pass a string child for the common
 * case; pass nodes (icon + label) for composite content.
 */
const buttonVariants = cva("flex-row items-center justify-center gap-2 rounded-md", {
  variants: {
    variant: {
      default: "bg-primary",
      outline: "border border-input bg-card",
      ghost: "bg-transparent",
      destructive: "bg-destructive",
      link: "bg-transparent",
    },
    size: {
      default: "h-10 px-4",
      sm: "h-9 px-3",
      lg: "h-11 px-8",
      icon: "h-10 w-10",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

const TEXT_COLOR: Record<NonNullable<VariantProps<typeof buttonVariants>["variant"]>, string> = {
  default: "text-primary-foreground",
  outline: "text-foreground",
  ghost: "text-foreground",
  destructive: "text-destructive-foreground",
  link: "text-primary",
};

export interface ButtonProps
  extends Omit<PressableProps, "children" | "style">,
    VariantProps<typeof buttonVariants> {
  children?: React.ReactNode;
  className?: string;
  textClassName?: string;
  /** Plain style override (no function form — composed with the filled shadow). */
  style?: StyleProp<ViewStyle>;
}

export function Button({
  children,
  variant = "default",
  size = "default",
  className,
  textClassName,
  haptic = true,
  style,
  ...rest
}: ButtonProps) {
  const textColor = TEXT_COLOR[variant ?? "default"];
  const isCompact = size === "sm";
  const isFilled = variant === "default" || variant === "destructive";

  return (
    <Pressable
      haptic={haptic}
      accessibilityRole="button"
      className={cn(buttonVariants({ variant, size }), className)}
      style={isFilled ? [FILLED_SHADOW, style] : style}
      {...rest}
    >
      {typeof children === "string" ? (
        <Text
          size={isCompact ? "sm" : "base"}
          weight="medium"
          className={cn(textColor, variant === "link" && "underline", textClassName)}
        >
          {children}
        </Text>
      ) : (
        <View className="flex-row items-center gap-2">{children}</View>
      )}
    </Pressable>
  );
}

export { buttonVariants, TEXT_COLOR };
