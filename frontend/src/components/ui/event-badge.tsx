/**
 * Event Badge Component
 *
 * Displays event type with icon and color coding.
 * Uses Tailwind classes for automatic dark mode support.
 */

import { cn } from "@/lib/utils";
import { getEventTypeConfig, type EventType } from "@/constants/event-types";

interface EventBadgeProps {
  readonly type: EventType | string;
  readonly size?: "sm" | "md";
  readonly showLabel?: boolean;
  readonly className?: string;
}

/**
 * Event type badge with icon and optional label.
 * Color-coded by event type (battle=blue, siege=orange, forbidden=red).
 */
export function EventBadge({
  type,
  size = "md",
  showLabel = true,
  className,
}: EventBadgeProps) {
  const config = getEventTypeConfig(type);
  const { icon, label, tailwind } = config;

  const sizeClasses =
    size === "sm" ? "px-1.5 py-0.5 text-xs gap-0.5" : "px-2 py-1 text-sm gap-1";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium",
        tailwind.bg,
        tailwind.text,
        sizeClasses,
        className,
      )}
    >
      <span aria-hidden="true">{icon}</span>
      {showLabel && <span>{label}</span>}
    </span>
  );
}
