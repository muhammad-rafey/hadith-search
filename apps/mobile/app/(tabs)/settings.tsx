import { useTabBarHeight } from "@/lib/use-tab-bar-height";
import Constants from "expo-constants";
import { ScrollView, View } from "react-native";
import { StatusBarStrip } from "@/components/status-bar-strip";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { fontSizeChanged, privateModeToggled, themeChanged } from "@/lib/analytics";
import { useUiStore } from "@/lib/store/ui-store";
import { FONT_SIZE_STEPS, THEMES } from "@/lib/themes";

/**
 * Settings — mirrors apps/web/app/(app)/settings/page.tsx (theme, font size,
 * Arabic-by-default, private mode) plus an About card. Every choice persists
 * on-device via the Zustand stores and fires the same analytics events.
 */
export default function SettingsScreen() {
  const tabBarHeight = useTabBarHeight();
  const { theme, setTheme } = useTheme();

  const fontSize = useUiStore((s) => s.fontSize);
  const setFontSize = useUiStore((s) => s.setFontSize);
  const showArabic = useUiStore((s) => s.showArabic);
  const setShowArabic = useUiStore((s) => s.setShowArabic);
  const showUrdu = useUiStore((s) => s.showUrdu);
  const setShowUrdu = useUiStore((s) => s.setShowUrdu);
  const privateMode = useUiStore((s) => s.privateMode);
  const setPrivateMode = useUiStore((s) => s.setPrivateMode);

  return (
    <View className="flex-1 bg-background">
      <StatusBarStrip />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: tabBarHeight + 16 }}
      >
        <View>
          <Text size="2xl" weight="semibold">
            Settings
          </Text>
          <Text size="sm" className="mt-1 text-muted-foreground">
            All settings are stored on this device.
          </Text>
        </View>

        <Card>
          <CardHeader>
            <CardTitle>Theme</CardTitle>
            <CardDescription>Choose how the app looks.</CardDescription>
          </CardHeader>
          <CardContent>
            <View className="flex-row flex-wrap gap-2">
              {THEMES.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={theme === t ? "default" : "outline"}
                  accessibilityState={{ selected: theme === t }}
                  onPress={() => {
                    setTheme(t);
                    themeChanged(t);
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Button>
              ))}
            </View>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Font size</CardTitle>
            <CardDescription>Adjust body text size.</CardDescription>
          </CardHeader>
          <CardContent>
            <View className="flex-row gap-2">
              {FONT_SIZE_STEPS.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={fontSize === s ? "default" : "outline"}
                  accessibilityState={{ selected: fontSize === s }}
                  onPress={() => {
                    setFontSize(s);
                    fontSizeChanged(s);
                  }}
                >
                  {s}
                </Button>
              ))}
            </View>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Display Arabic by default</CardTitle>
            <CardDescription>
              Show the Arabic body on hadith pages without an extra tap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant={showArabic ? "default" : "outline"}
              accessibilityState={{ selected: showArabic }}
              onPress={() => setShowArabic(!showArabic)}
            >
              {showArabic ? "On" : "Off"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Display Urdu by default</CardTitle>
            <CardDescription>
              Show the Urdu translation on hadith pages without an extra tap.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant={showUrdu ? "default" : "outline"}
              accessibilityState={{ selected: showUrdu }}
              onPress={() => setShowUrdu(!showUrdu)}
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
              variant={privateMode ? "default" : "outline"}
              accessibilityState={{ selected: privateMode }}
              onPress={() => {
                const next = !privateMode;
                setPrivateMode(next);
                privateModeToggled(next);
              }}
            >
              {privateMode ? "On" : "Off"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
            <CardDescription>
              Semantic search over Sahih al-Bukhari, plus browse and number lookup across 15
              collections. English translation by Dr. Muhsin Khan (Darussalam). This is a companion
              to the web app and shares the same backend.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Text size="xs" className="text-muted-foreground">
              Version {Constants.expoConfig?.version ?? "0.0.1"}
            </Text>
          </CardContent>
        </Card>
      </ScrollView>
    </View>
  );
}
