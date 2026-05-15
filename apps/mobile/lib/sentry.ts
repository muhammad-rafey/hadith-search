import * as Sentry from "@sentry/react-native";
import { ENV, HAS_SENTRY } from "./env";

/**
 * Sentry init — no-op when EXPO_PUBLIC_SENTRY_DSN is unset, so dev in
 * Expo Go never crashes or warns. Full native crash reporting requires a
 * dev/EAS build (Expo Go has no Sentry native module); JS-level capture
 * still works. Mirrors the web's "respect DSN being unset" posture.
 */
let initialized = false;

export function initSentry(): void {
  if (!HAS_SENTRY || initialized) return;
  try {
    Sentry.init({
      dsn: ENV.SENTRY_DSN,
      enabled: true,
      tracesSampleRate: 0.1,
      // Keep PII off by default — matches plan/03-analytics-monitoring.md.
      sendDefaultPii: false,
    });
    initialized = true;
  } catch {
    // Native module unavailable (e.g. Expo Go) — degrade silently.
  }
}

export function captureException(error: unknown, extra?: Record<string, unknown>): void {
  if (!HAS_SENTRY || !initialized) return;
  try {
    Sentry.captureException(error, extra ? { extra } : undefined);
  } catch {
    // ignore
  }
}
