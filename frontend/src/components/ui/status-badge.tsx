/**
 * Status Badge Component
 *
 * Displays participation/compliance status for battle events.
 * Follows LIFF design system with semantic colors.
 */

import { cn } from "@/lib/utils";
import { liffTypography } from "@/lib/typography";
import type { StatusType } from "@/constants/event-types";

interface StatusConfig {
  readonly label: string;
  readonly className: string;
}

const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
  participated: {
    label: "參戰",
    className: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  not_participated: {
    label: "未參戰",
    className: "bg-muted text-muted-foreground",
  },
  compliant: {
    label: "守規",
    className: "bg-green-500/15 text-green-600 dark:text-green-400",
  },
  violated: {
    label: "違規",
    className: "bg-red-500/15 text-red-600 dark:text-red-400",
  },
};

interface StatusBadgeProps {
  readonly status: StatusType;
  readonly className?: string;
}

/**
 * Compact status badge for event cards.
 * Shows participation or compliance status.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        liffTypography.badge,
        "px-2 py-0.5 rounded-full",
        config.className,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
