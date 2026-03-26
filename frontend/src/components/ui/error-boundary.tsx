/**
 * ErrorBoundary — must be a class component because React has no
 * function-component equivalent for getDerivedStateFromError.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorBoundaryVariant = "full" | "route" | "compact";

interface ErrorFallbackProps {
  readonly error: Error;
  readonly onReset: () => void;
  readonly variant?: ErrorBoundaryVariant;
}

function ErrorFallback({
  error,
  onReset,
  variant = "route",
}: ErrorFallbackProps) {
  if (variant === "compact") {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center space-y-3">
          <AlertTriangle className="mx-auto h-5 w-5 text-destructive" />
          <p className="text-sm text-destructive">頁面發生錯誤</p>
          {error.message && (
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              {error.message}
            </p>
          )}
          <Button variant="outline" size="sm" onClick={onReset}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            重新載入
          </Button>
        </div>
      </div>
    );
  }

  const isFullPage = variant === "full";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        isFullPage ? "min-h-screen bg-background p-6" : "py-12"
      )}
    >
      <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>

      <h2 className="text-lg font-medium text-foreground mb-2">
        {isFullPage ? "應用程式發生錯誤" : "此頁面發生錯誤"}
      </h2>

      <p className="text-sm text-muted-foreground max-w-md mb-6">
        {error.message || "發生未預期的錯誤，請重新載入頁面"}
      </p>

      <div className="flex items-center gap-3">
        <Button onClick={onReset}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {isFullPage ? "重新載入" : "重新載入此頁面"}
        </Button>
        {!isFullPage && (
          <Button
            variant="outline"
            onClick={() => {
              window.location.href = "/";
            }}
          >
            <Home className="mr-2 h-4 w-4" />
            回到首頁
          </Button>
        )}
      </div>

      {import.meta.env.DEV && (
        <pre className="mt-8 max-w-lg text-left text-xs text-muted-foreground bg-muted rounded-lg p-4 overflow-auto">
          {error.stack}
        </pre>
      )}
    </div>
  );
}

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly variant?: ErrorBoundaryVariant;
  readonly onReset?: () => void;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary] Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={this.handleReset}
          variant={this.props.variant}
        />
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary, ErrorFallback };
export type { ErrorBoundaryVariant, ErrorBoundaryProps, ErrorFallbackProps };
