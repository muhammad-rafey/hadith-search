import * as Clipboard from "expo-clipboard";
import { Check, Share2 } from "lucide-react-native";
import * as React from "react";
import { Platform, Share } from "react-native";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useToast } from "@/components/ui/toast";
import { hadithShared } from "@/lib/analytics";
import { ENV } from "@/lib/env";

/**
 * Share — native OS sheet, clipboard fallback. Mirrors the web's
 * share-button.tsx behavior and its `hadith_shared` analytics
 * (method: "native" | "link"). Cancelling the sheet is silent
 * (plan edge case #17).
 */
export function ShareButton({
  hadithId,
  title,
}: {
  hadithId: string;
  title?: string;
}) {
  const { notify } = useToast();
  const [copied, setCopied] = React.useState(false);
  const copiedTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const url = `${ENV.SHARE_BASE_URL}${encodeURIComponent(hadithId)}`;

  React.useEffect(
    () => () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  const onShare = async () => {
    try {
      // `title` in the content object is Android-only; iOS uses the
      // `subject` option instead (React Native Share API).
      const result = await Share.share(
        Platform.OS === "ios" ? { url } : { message: `${title ? `${title}\n` : ""}${url}`, title },
        { subject: title },
      );
      if (result.action === Share.sharedAction) {
        hadithShared(hadithId, "native");
      }
      return;
    } catch {
      // Sheet failed — fall through to clipboard.
    }
    try {
      await Clipboard.setStringAsync(url);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1500);
      hadithShared(hadithId, "link");
      notify({ title: "Link copied", description: "Hadith URL copied to clipboard." });
    } catch {
      notify({ title: "Could not copy link", variant: "destructive" });
    }
  };

  return (
    <Button variant="outline" onPress={onShare} accessibilityLabel="Share hadith">
      <Icon as={copied ? Check : Share2} size={16} token="foreground" />
      <Text size="base" weight="medium">
        {copied ? "Copied" : "Share"}
      </Text>
    </Button>
  );
}
