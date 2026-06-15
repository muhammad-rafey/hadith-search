"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FontSizeControl } from "@/components/ui/font-size-control";
import { THEMES, isTheme, type Theme } from "@/lib/themes";
import { privateModeToggled, themeChanged } from "@/lib/analytics";
import { useUiStore } from "@/lib/store";

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const showArabic = useUiStore((s) => s.showArabic);
  const setShowArabic = useUiStore((s) => s.setShowArabic);

  const showUrdu = useUiStore((s) => s.showUrdu);
  const setShowUrdu = useUiStore((s) => s.setShowUrdu);

  const privateMode = useUiStore((s) => s.privateMode);
  const setPrivateMode = useUiStore((s) => s.setPrivateMode);

  const current: Theme = isTheme(theme) ? theme : "light";

  const onThemeClick = (t: Theme) => {
    setTheme(t);
    themeChanged(t);
  };

  const onArabicToggle = () => {
    setShowArabic(!showArabic);
  };

  const onUrduToggle = () => {
    setShowUrdu(!showUrdu);
  };

  const onPrivateToggle = () => {
    const next = !privateMode;
    setPrivateMode(next);
    privateModeToggled(next);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          All settings are stored on this device.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose how the app looks.</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset aria-label="Theme" className="flex flex-wrap gap-2 border-0 p-0">
            {THEMES.map((t) => (
              <Button
                key={t}
                type="button"
                aria-pressed={mounted ? current === t : false}
                variant={mounted && current === t ? "default" : "outline"}
                onClick={() => onThemeClick(t)}
                className="capitalize"
              >
                {t}
              </Button>
            ))}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Font size</CardTitle>
          <CardDescription>Adjust body text size.</CardDescription>
        </CardHeader>
        <CardContent>
          <FontSizeControl />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display Arabic by default</CardTitle>
          <CardDescription>
            Show the Arabic body on hadith detail pages without an extra click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant={showArabic ? "default" : "outline"}
            aria-pressed={showArabic}
            onClick={onArabicToggle}
          >
            {showArabic ? "On" : "Off"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Display Urdu by default</CardTitle>
          <CardDescription>
            Show the Urdu translation on hadith detail pages without an extra click.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant={showUrdu ? "default" : "outline"}
            aria-pressed={showUrdu}
            onClick={onUrduToggle}
          >
            {showUrdu ? "On" : "Off"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Private mode</CardTitle>
          <CardDescription>
            Disables server-side query caching for this session. Other retrieval layers (embed +
            rerank) still run, but your queries are not stored in the cache.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant={privateMode ? "default" : "outline"}
            aria-pressed={privateMode}
            onClick={onPrivateToggle}
          >
            {privateMode ? "On" : "Off"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
