import * as React from "react";
import { AccessibilityInfo, Animated } from "react-native";
import { cn } from "@/lib/utils";

/**
 * Pulsing placeholder. Mirrors apps/web/components/ui/skeleton.tsx
 * (animate-pulse on bg-muted). Static when Reduce Motion is on.
 */
export function Skeleton({ className }: { className?: string }) {
  const opacity = React.useRef(new Animated.Value(0.5)).current;

  React.useEffect(() => {
    // Start pulsing immediately (no static frame while the async reduce-motion
    // check resolves); stop and settle if the user prefers reduced motion.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) {
          loop.stop();
          opacity.setValue(0.7);
        }
      })
      .catch(() => {
        // Platform can't report the setting — keep the pulsing fallback.
      });
    return () => {
      cancelled = true;
      loop.stop();
    };
  }, [opacity]);

  return <Animated.View style={{ opacity }} className={cn("rounded-md bg-muted", className)} />;
}
