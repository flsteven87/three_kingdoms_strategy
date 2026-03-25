import { describe, it, expect } from 'vitest'
import {
  getEventTypeLabel,
  formatEventTime,
  getEventCategoryBadgeVariant,
  hasParticipationTracking,
  hasMvp,
  getPrimaryMetricLabel,
  formatDuration,
  formatTimeRange,
} from '../event-utils'

// =============================================================================
// getEventTypeLabel
// =============================================================================
describe('getEventTypeLabel', () => {
  it('returns Chinese label for each category', () => {
    expect(getEventTypeLabel('siege')).toBe('攻城事件')
    expect(getEventTypeLabel('forbidden')).toBe('禁地事件')
    expect(getEventTypeLabel('battle')).toBe('戰役事件')
  })
})

// =============================================================================
// formatEventTime
// =============================================================================
describe('formatEventTime', () => {
  it('returns "未設定時間" when start is null', () => {
    expect(formatEventTime(null, null)).toBe('未設定時間')
  })

  it('formats start only when end is null', () => {
    const result = formatEventTime('2025-10-09T02:00:00Z', null)
    expect(result).toContain('10:00') // UTC+8
  })

  it('formats range without duration by default', () => {
    const result = formatEventTime(
      '2025-10-09T02:00:00Z',
      '2025-10-09T04:30:00Z'
    )
    expect(result).toContain('10:00')
    expect(result).toContain('12:30')
    expect(result).not.toContain('小時')
  })

  it('includes duration when requested', () => {
    const result = formatEventTime(
      '2025-10-09T02:00:00Z',
      '2025-10-09T04:30:00Z',
      { includeDuration: true }
    )
    expect(result).toContain('2小時30分鐘')
  })
})

// =============================================================================
// getEventCategoryBadgeVariant
// =============================================================================
describe('getEventCategoryBadgeVariant', () => {
  it('maps categories to badge variants', () => {
    expect(getEventCategoryBadgeVariant('siege')).toBe('default')
    expect(getEventCategoryBadgeVariant('forbidden')).toBe('destructive')
    expect(getEventCategoryBadgeVariant('battle')).toBe('secondary')
  })
})

// =============================================================================
// hasParticipationTracking / hasMvp
// =============================================================================
describe('hasParticipationTracking', () => {
  it('returns false for forbidden', () => {
    expect(hasParticipationTracking('forbidden')).toBe(false)
  })

  it('returns true for siege and battle', () => {
    expect(hasParticipationTracking('siege')).toBe(true)
    expect(hasParticipationTracking('battle')).toBe(true)
  })
})

describe('hasMvp', () => {
  it('returns false for forbidden', () => {
    expect(hasMvp('forbidden')).toBe(false)
  })

  it('returns true for siege and battle', () => {
    expect(hasMvp('siege')).toBe(true)
    expect(hasMvp('battle')).toBe(true)
  })
})

// =============================================================================
// getPrimaryMetricLabel
// =============================================================================
describe('getPrimaryMetricLabel', () => {
  it('returns correct label per category', () => {
    expect(getPrimaryMetricLabel('siege')).toBe('貢獻+助攻')
    expect(getPrimaryMetricLabel('forbidden')).toBe('違規人數')
    expect(getPrimaryMetricLabel('battle')).toBe('戰功')
  })
})

// =============================================================================
// formatDuration (timestamp-based)
// =============================================================================
describe('formatDuration', () => {
  it('calculates hours and minutes', () => {
    const result = formatDuration(
      '2025-10-09T02:00:00Z',
      '2025-10-09T04:15:00Z'
    )
    expect(result).toBe('2 小時 15 分鐘')
  })

  it('returns minutes only when under 1 hour', () => {
    const result = formatDuration(
      '2025-10-09T02:00:00Z',
      '2025-10-09T02:45:00Z'
    )
    expect(result).toBe('45 分鐘')
  })

  it('returns null for null inputs', () => {
    expect(formatDuration(null, null)).toBeNull()
    expect(formatDuration('2025-10-09T02:00:00Z', null)).toBeNull()
  })

  it('returns null for zero or negative duration', () => {
    expect(formatDuration(
      '2025-10-09T04:00:00Z',
      '2025-10-09T02:00:00Z'
    )).toBeNull()
  })
})

// =============================================================================
// formatTimeRange
// =============================================================================
describe('formatTimeRange', () => {
  it('formats time range', () => {
    const result = formatTimeRange(
      '2025-10-09T02:00:00Z',
      '2025-10-09T04:30:00Z'
    )
    expect(result).toBe('10:00-12:30')
  })

  it('returns start time only when end is null', () => {
    const result = formatTimeRange('2025-10-09T02:00:00Z', null)
    expect(result).toBe('10:00')
  })

  it('returns null when start is null', () => {
    expect(formatTimeRange(null, null)).toBeNull()
  })
})
