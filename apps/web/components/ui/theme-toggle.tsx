"use client";

import * as React from "react";
import { Moon, Sun, BookOpen } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "./button";
import { themeChanged } from "@/lib/analytics";
import { isTheme, type Theme } from "@/lib/themes";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const current: Theme = isTheme(theme) ? theme : "light";

  const cycle = () => {
    const next: Theme = current === "light" ? "dark" : current === "dark" ? "sepia" : "light";
    setTheme(next);
    themeChanged(next);
  };

  // Render a neutral placeholder until we know the resolved theme; avoids
  // hydration mismatch — the <Sun> icon would flash before the real theme is
  // resolved, so we use an invisible span of the same dimensions instead.
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme">
        <span className="h-4 w-4" aria-hidden="true" />
      </Button>
    );
  }

  const icon =
    current === "dark" ? (
      <Moon className="h-4 w-4" />
    ) : current === "sepia" ? (
      <BookOpen className="h-4 w-4" />
    ) : (
      <Sun className="h-4 w-4" />
    );

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Theme: ${current} (click to change)`}
    >
      {icon}
    </Button>
  );
}
