/**
 * Event Type Configuration
 *
 * Shared configuration for event types across LIFF and main app.
 * Aligns visual language with LINE Bot Flex Messages.
 */

export type EventType = "battle" | "siege" | "forbidden";

interface EventTypeConfig {
  readonly icon: string;
  readonly label: string;
  readonly tailwind: {
    readonly bg: string;
    readonly text: string;
    readonly border: string;
  };
  readonly metric: string;
  readonly metricLabel: string;
}

/**
 * Event type configuration matching LINE Bot visual language.
 * Uses Tailwind classes for automatic dark mode support.
 */
export const EVENT_TYPE_CONFIG: Record<EventType, EventTypeConfig> = {
  battle: {
    icon: "⚔️",
    label: "戰役",
    tailwind: {
      bg: "bg-blue-500/15",
      text: "text-blue-600 dark:text-blue-400",
      border: "border-blue-500/30",
    },
    metric: "merit",
    metricLabel: "戰功",
  },
  siege: {
    icon: "🏰",
    label: "攻城",
    tailwind: {
      bg: "bg-orange-500/15",
      text: "text-orange-600 dark:text-orange-400",
      border: "border-orange-500/30",
    },
    metric: "contribution",
    metricLabel: "貢獻",
  },
  forbidden: {
    icon: "🚫",
    label: "禁地",
    tailwind: {
      bg: "bg-red-500/15",
      text: "text-red-600 dark:text-red-400",
      border: "border-red-500/30",
    },
    metric: "violation",
    metricLabel: "違規",
  },
} as const;

/**
 * Get event type config with fallback to battle.
 */
export function getEventTypeConfig(type: string): EventTypeConfig {
  const normalized = type.toLowerCase() as EventType;
  return EVENT_TYPE_CONFIG[normalized] ?? EVENT_TYPE_CONFIG.battle;
}

/**
 * Participation/compliance status types for event cards.
 */
export type StatusType =
  | "participated"
  | "not_participated"
  | "compliant"
  | "violated";

/**
 * Derive status type from event data.
 */
export function getStatusType(
  eventType: string,
  participated: boolean,
  violated?: boolean | null,
): StatusType {
  if (eventType === "forbidden") {
    return violated ? "violated" : "compliant";
  }
  return participated ? "participated" : "not_participated";
}
