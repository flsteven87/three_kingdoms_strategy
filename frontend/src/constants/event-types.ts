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
    icon: "\u2694\uFE0F", // ⚔️
    label: "\u6230\u5F79", // 戰役
    tailwind: {
      bg: "bg-blue-500/15",
      text: "text-blue-600 dark:text-blue-400",
      border: "border-blue-500/30",
    },
    metric: "merit",
    metricLabel: "\u6230\u529F", // 戰功
  },
  siege: {
    icon: "\uD83C\uDFF0", // 🏰
    label: "\u653B\u57CE", // 攻城
    tailwind: {
      bg: "bg-orange-500/15",
      text: "text-orange-600 dark:text-orange-400",
      border: "border-orange-500/30",
    },
    metric: "contribution",
    metricLabel: "\u8CA2\u7372", // 貢獻
  },
  forbidden: {
    icon: "\uD83D\uDEAB", // 🚫
    label: "\u7981\u5730", // 禁地
    tailwind: {
      bg: "bg-red-500/15",
      text: "text-red-600 dark:text-red-400",
      border: "border-red-500/30",
    },
    metric: "violation",
    metricLabel: "\u9055\u898F", // 違規
  },
} as const;

/**
 * Get event type config with fallback to battle.
 */
export function getEventTypeConfig(type: string): EventTypeConfig {
  const normalized = type.toLowerCase() as EventType;
  return EVENT_TYPE_CONFIG[normalized] ?? EVENT_TYPE_CONFIG.battle;
}
