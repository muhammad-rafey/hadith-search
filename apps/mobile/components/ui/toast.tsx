import * as React from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/utils";
import { Text } from "./text";

/**
 * Minimal toast — no native deps. Mirrors the web's useToast()/notify() API
 * (apps/web/components/ui/toaster.tsx). Auto-dismisses; honors Reduce Motion
 * (plan edge case #25) by swapping the slide-in for a plain fade.
 */
interface ToastItem {
  id: number;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
}

interface ToastContextValue {
  notify: (t: Omit<ToastItem, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return { notify: () => undefined };
  return ctx;
}

const DURATION_MS = 2600;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);
  const idRef = React.useRef(0);

  const notify = React.useCallback((t: Omit<ToastItem, "id">) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((prev) => [...prev, { id, ...t }]);
    if (t.title) AccessibilityInfo.announceForAccessibility(t.title);
  }, []);

  const remove = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = React.useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDone={remove} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDone,
}: {
  toasts: ToastItem[];
  onDone: (id: number) => void;
}) {
  const insets = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center px-4"
      style={{ bottom: insets.bottom + 16 }}
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} item={t} onDone={() => onDone(t.id)} />
      ))}
    </View>
  );
}

function ToastRow({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const progress = React.useRef(new Animated.Value(0)).current;
  const reduceMotion = React.useRef(false);

  React.useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (!cancelled) reduceMotion.current = v;
    });
    Animated.timing(progress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => {
      Animated.timing(progress, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }).start(() => onDone());
    }, DURATION_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [progress, onDone]);

  const translateY = reduceMotion.current
    ? 0
    : progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  return (
    <Animated.View
      style={{ opacity: progress, transform: [{ translateY }] }}
      className={cn(
        "mt-2 w-full max-w-md rounded-md border p-4 shadow-lg",
        item.variant === "destructive"
          ? "border-destructive bg-destructive"
          : "border-border bg-card",
      )}
    >
      {item.title ? (
        <Text
          size="sm"
          weight="semibold"
          className={item.variant === "destructive" ? "text-destructive-foreground" : ""}
        >
          {item.title}
        </Text>
      ) : null}
      {item.description ? (
        <Text
          size="sm"
          className={cn(
            "mt-0.5",
            item.variant === "destructive"
              ? "text-destructive-foreground"
              : "text-muted-foreground",
          )}
        >
          {item.description}
        </Text>
      ) : null}
    </Animated.View>
  );
}
