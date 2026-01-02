/**
 * Event Utilities - Shared helper functions for battle events
 *
 * Centralized utilities to avoid DRY violations across:
 * - EventCard.tsx
 * - EventDetail.tsx
 * - EventAnalytics.tsx
 */

import { Swords, type LucideIcon } from 'lucide-react'

/**
 * Legacy event type labels for backward compatibility
 */
const LEGACY_EVENT_TYPE_LABELS: Record<string, string> = {
  siege: '攻城戰',
  defense: '守城戰',
  raid: '突襲',
  territory: '領土爭奪',
  boss: '世界BOSS',
  custom: '自訂',
}

/**
 * Get display label for event type
 * Returns the label for legacy enum values, or the custom string as-is
 */
export function getEventTypeLabel(eventType: string | null): string | null {
  if (!eventType) return null
  return LEGACY_EVENT_TYPE_LABELS[eventType] ?? eventType
}

/**
 * Get the icon component for an event
 * Uses Swords as the default icon for all events
 */
export function getEventIcon(): LucideIcon {
  return Swords
}

/**
 * Format event time range
 *
 * @param start - ISO timestamp for event start
 * @param end - ISO timestamp for event end
 * @param options.includeDuration - Whether to include duration calculation (default: false)
 * @param options.includeYear - Whether to include year in date (default: false)
 */
export function formatEventTime(
  start: string | null,
  end: string | null,
  options: { includeDuration?: boolean; includeYear?: boolean } = {}
): string {
  const { includeDuration = false, includeYear = false } = options

  if (!start) return '未設定時間'

  const startDate = new Date(start)
  const dateStr = startDate.toLocaleDateString('zh-TW', {
    year: includeYear ? 'numeric' : undefined,
    month: 'numeric',
    day: 'numeric',
  })
  const startTime = startDate.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (!end) return `${dateStr} ${startTime}`

  const endDate = new Date(end)
  const endTime = endDate.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (!includeDuration) {
    return `${dateStr} ${startTime}-${endTime}`
  }

  // Calculate duration
  const durationMs = endDate.getTime() - startDate.getTime()
  const hours = Math.floor(durationMs / (1000 * 60 * 60))
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))
  const durationStr = hours > 0
    ? `${hours}小時${minutes > 0 ? minutes + '分鐘' : ''}`
    : `${minutes}分鐘`

  return `${dateStr} ${startTime} - ${endTime} (${durationStr})`
}

/**
 * Get badge variant for event type display
 * Returns 'secondary' for all event types (simplified)
 */
export function getEventTypeBadgeVariant(): 'secondary' {
  return 'secondary'
}
