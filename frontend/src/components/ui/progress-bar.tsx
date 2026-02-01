/**
 * Progress Bar Component
 *
 * Simple, LIFF-optimized progress bar with semantic color variants.
 * Designed for mobile screens with compact height.
 */

import { cn } from "@/lib/utils";

type ProgressVariant = "default" | "success" | "warning" | "danger";

interface ProgressBarProps {
  /** Progress value (0-100) */
  readonly value: number;
  /** Visual variant */
  readonly variant?: ProgressVariant;
  /** Size variant */
  readonly size?: "sm" | "md";
  /** Additional class names */
  readonly className?: string;
  /** Show percentage text */
  readonly showValue?: boolean;
}

const variantClasses: Record<ProgressVariant, string> = {
  default: "bg-primary",
  success: "bg-green-500 dark:bg-green-400",
  warning: "bg-amber-500 dark:bg-amber-400",
  danger: "bg-red-500 dark:bg-red-400",
};

const sizeClasses = {
  sm: "h-1.5",
  md: "h-2",
};

/**
 * Progress bar with optional percentage display.
 * Clamps value between 0 and 100.
 */
export function ProgressBar({
  value,
  variant = "default",
  size = "sm",
  className,
  showValue = false,
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "flex-1 overflow-hidden rounded-full bg-muted",
          sizeClasses[size],
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            variantClasses[variant],
          )}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showValue && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {Math.round(clampedValue)}%
        </span>
      )}
    </div>
  );
}

interface GroupProgressProps {
  /** Group name */
  readonly name: string;
  /** Participated count */
  readonly participated: number;
  /** Total member count */
  readonly total: number;
  /** Optional violation count (for forbidden events) */
  readonly violations?: number;
  /** Show as violation stats */
  readonly isViolation?: boolean;
}

/**
 * Group progress row for battle event reports.
 * Shows group name, fraction, percentage, and progress bar.
 */
export function GroupProgress({
  name,
  participated,
  total,
  violations,
  isViolation = false,
}: GroupProgressProps) {
  const rate = total > 0 ? (participated / total) * 100 : 0;

  if (isViolation && violations !== undefined) {
    // Violation mode: show violation count and inverse progress
    const complianceRate = total > 0 ? ((total - violations) / total) * 100 : 0;

    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="truncate font-medium">{name}</span>
          <span className="text-red-500 dark:text-red-400 shrink-0 ml-2">
            {violations} 人違規
          </span>
        </div>
        <ProgressBar
          value={complianceRate}
          variant={violations > 0 ? "danger" : "success"}
          size="sm"
        />
      </div>
    );
  }

  // Participation mode
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="truncate font-medium">{name}</span>
        <span className="shrink-0 ml-2">
          <span className="text-muted-foreground">
            {participated}/{total}
          </span>
          <span className="text-green-600 dark:text-green-400 ml-1.5">
            {rate.toFixed(0)}%
          </span>
        </span>
      </div>
      <ProgressBar
        value={rate}
        variant={rate >= 80 ? "success" : rate >= 50 ? "warning" : "danger"}
        size="sm"
      />
    </div>
  );
}
