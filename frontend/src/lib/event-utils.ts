/**
 * Event Utilities - Shared helper functions for battle events
 *
 * Centralized utilities to avoid DRY violations across:
 * - EventCard.tsx
 * - EventDetail.tsx
 * - EventAnalytics.tsx
 */

import type { EventCategory } from '@/types/event'
import { Castle, ShieldAlert, Swords, type LucideIcon } from 'lucide-react'

/**
 * Event category display labels (Chinese)
 */
const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  siege: '攻城事件',
  forbidden: '禁地事件',
  battle: '戰役事件',
}

/**
 * Event category icons
 */
const EVENT_CATEGORY_ICONS: Record<EventCategory, LucideIcon> = {
  siege: Castle,
  forbidden: ShieldAlert,
  battle: Swords,
}

/**
 * Get display label for event category
 */
export function getEventTypeLabel(eventType: EventCategory): string {
  return EVENT_CATEGORY_LABELS[eventType]
}

/**
 * Get the icon component for an event category
 */
export function getEventIcon(eventType: EventCategory): LucideIcon {
  return EVENT_CATEGORY_ICONS[eventType]
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
 * Get badge variant for event category
 */
export function getEventCategoryBadgeVariant(
  eventType: EventCategory
): 'default' | 'secondary' | 'destructive' {
  switch (eventType) {
    case 'siege':
      return 'default'
    case 'forbidden':
      return 'destructive'
    case 'battle':
      return 'secondary'
  }
}

/**
 * Check if event category tracks participation rate
 */
export function hasParticipationTracking(eventType: EventCategory): boolean {
  return eventType !== 'forbidden'
}

/**
 * Check if event category has MVP
 */
export function hasMvp(eventType: EventCategory): boolean {
  return eventType !== 'forbidden'
}

/**
 * Get the primary metric label for an event category
 */
export function getPrimaryMetricLabel(eventType: EventCategory): string {
  switch (eventType) {
    case 'siege':
      return '貢獻+助攻'
    case 'forbidden':
      return '違規人數'
    case 'battle':
      return '戰功'
  }
}

/**
 * Calculate duration between two timestamps
 *
 * @param start - ISO timestamp for start
 * @param end - ISO timestamp for end
 * @returns Duration string (e.g., "53 分鐘", "2 小時 15 分鐘") or null if invalid
 */
export function formatDuration(start: string | null, end: string | null): string | null {
  if (!start || !end) return null

  const startDate = new Date(start)
  const endDate = new Date(end)
  const durationMs = endDate.getTime() - startDate.getTime()

  if (durationMs <= 0) return null

  const hours = Math.floor(durationMs / (1000 * 60 * 60))
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))

  if (hours > 0) {
    return minutes > 0 ? `${hours} 小時 ${minutes} 分鐘` : `${hours} 小時`
  }
  return `${minutes} 分鐘`
}

/**
 * Format time range without date (e.g., "06:42-07:35")
 */
export function formatTimeRange(start: string | null, end: string | null): string | null {
  if (!start) return null

  const startDate = new Date(start)
  const startTime = startDate.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (!end) return startTime

  const endDate = new Date(end)
  const endTime = endDate.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  return `${startTime}-${endTime}`
}
