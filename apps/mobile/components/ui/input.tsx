import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { fontSizeMultiplier } from "@/lib/themes";
import { useUiStore } from "@/lib/store/ui-store";
import { hsl } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";

/**
 * Themed text input. RN sets placeholder color via a prop (not CSS), so we
 * resolve the muted-foreground token from the active theme explicitly.
 */
export interface InputProps extends TextInputProps {
  className?: string;
}

export const Input = React.forwardRef<TextInput, InputProps>(
  ({ className, style, ...props }, ref) => {
    const { theme } = useTheme();
    const step = useUiStore((s) => s.fontSize);
    const fontSize = Math.round(16 * fontSizeMultiplier(step));

    return (
      <TextInput
        ref={ref}
        placeholderTextColor={hsl(theme, "muted-foreground")}
        className={cn(
          "h-10 w-full rounded-md border border-input bg-transparent px-3 text-foreground",
          className,
        )}
        style={[{ fontSize, fontFamily: "Inter-Regular" }, style]}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
