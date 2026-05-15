import * as React from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { captureException } from "@/lib/sentry";

interface State {
  error: Error | null;
}

/**
 * Top-level error boundary. Catches render-time exceptions, forwards them to
 * Sentry (no-op when DSN unset), and shows a recoverable fallback so a single
 * bad screen never bricks the app.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureException(error, { componentStack: errorInfo.componentStack });
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return (
        <View className="flex-1 items-center justify-center bg-background p-6">
          <Text size="lg" weight="semibold">
            Something went wrong.
          </Text>
          <Text size="sm" className="mt-2 text-center text-muted-foreground">
            {this.state.error.message || "An unexpected error occurred."}
          </Text>
          <View className="mt-6">
            <Button onPress={this.reset}>Try again</Button>
          </View>
        </View>
      );
    }
    return this.props.children;
  }
}
