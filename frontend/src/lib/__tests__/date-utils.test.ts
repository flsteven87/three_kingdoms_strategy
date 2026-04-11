import { describe, it, expect } from 'vitest'
import {
  formatDateTW,
  formatTimeTW,
  formatDateTimeTW,
  parseCsvFilenameDate,
  isDateInRange,
  getGameLocalDateString,
} from '../date-utils'

// =============================================================================
// formatDateTW
// =============================================================================
describe('formatDateTW', () => {
  it('formats UTC ISO string to Taiwan date', () => {
    // 2025-10-09T02:13:09Z → UTC+8 = 2025/10/9 10:13
    const result = formatDateTW('2025-10-09T02:13:09Z')
    expect(result).toContain('2025')
    expect(result).toContain('10')
    expect(result).toContain('9')
  })

  it('returns dash for null/undefined', () => {
    expect(formatDateTW(null)).toBe('-')
    expect(formatDateTW(undefined)).toBe('-')
  })

  it('pads with leading zeros when requested', () => {
    const result = formatDateTW('2025-01-05T00:00:00Z', { padded: true })
    expect(result).toMatch(/01/)
    expect(result).toMatch(/05/)
  })
})

// =============================================================================
// formatTimeTW
// =============================================================================
describe('formatTimeTW', () => {
  it('formats UTC ISO string to Taiwan time', () => {
    // 02:13 UTC → 10:13 UTC+8
    const result = formatTimeTW('2025-10-09T02:13:09Z')
    expect(result).toBe('10:13')
  })

  it('returns dash for null', () => {
    expect(formatTimeTW(null)).toBe('-')
  })
})

// =============================================================================
// formatDateTimeTW
// =============================================================================
describe('formatDateTimeTW', () => {
  it('combines date and time', () => {
    const result = formatDateTimeTW('2025-10-09T02:13:09Z')
    expect(result).toContain('10:13')
    expect(result).toContain('2025')
  })

  it('returns dash for null', () => {
    expect(formatDateTimeTW(null)).toBe('-')
  })
})

// =============================================================================
// parseCsvFilenameDate
// =============================================================================
describe('parseCsvFilenameDate', () => {
  it('parses valid CSV filename to UTC Date', () => {
    const date = parseCsvFilenameDate('同盟統計2025年10月09日10时13分09秒.csv')
    expect(date).not.toBeNull()
    // 10:13:09 UTC+8 → 02:13:09 UTC
    expect(date!.getUTCHours()).toBe(2)
    expect(date!.getUTCMinutes()).toBe(13)
    expect(date!.getUTCSeconds()).toBe(9)
    expect(date!.getUTCFullYear()).toBe(2025)
    expect(date!.getUTCMonth()).toBe(9) // October = 9
    expect(date!.getUTCDate()).toBe(9)
  })

  it('returns null for invalid filename', () => {
    expect(parseCsvFilenameDate('random_file.csv')).toBeNull()
    expect(parseCsvFilenameDate('')).toBeNull()
  })

  it('handles midnight crossing (UTC+8 early morning → previous day UTC)', () => {
    // 2025年01月01日03时00分00秒 UTC+8 → 2024-12-31T19:00:00Z
    const date = parseCsvFilenameDate('同盟統計2025年01月01日03时00分00秒.csv')
    expect(date).not.toBeNull()
    expect(date!.getUTCFullYear()).toBe(2024)
    expect(date!.getUTCMonth()).toBe(11) // December
    expect(date!.getUTCDate()).toBe(31)
    expect(date!.getUTCHours()).toBe(19)
  })
})

// =============================================================================
// isDateInRange
// =============================================================================
describe('isDateInRange', () => {
  it('returns true when date is within range', () => {
    const target = new Date('2025-06-15T00:00:00Z')
    expect(isDateInRange(target, '2025-06-01', '2025-06-30')).toBe(true)
  })

  it('returns true on boundary dates (inclusive)', () => {
    const target = new Date('2025-06-01T08:00:00Z') // UTC+8 = June 1
    expect(isDateInRange(target, '2025-06-01', '2025-06-30')).toBe(true)
  })

  it('returns false when date is outside range', () => {
    const target = new Date('2025-07-01T08:00:00Z')
    expect(isDateInRange(target, '2025-06-01', '2025-06-30')).toBe(false)
  })

  it('handles null endDate (open-ended, uses today)', () => {
    const target = new Date()
    expect(isDateInRange(target, '2020-01-01', null)).toBe(true)
  })
})

// =============================================================================
// getGameLocalDateString
// =============================================================================
describe('getGameLocalDateString', () => {
  it('returns YYYY-MM-DD in Taiwan timezone', () => {
    // 2025-10-09T02:13:09Z → 10:13 Taipei → "2025-10-09"
    const date = new Date('2025-10-09T02:13:09Z')
    expect(getGameLocalDateString(date)).toBe('2025-10-09')
  })

  it('handles UTC late-night → Taipei next day', () => {
    // 2026-02-11T23:34:50Z → 2026-02-12 07:34 Taipei → "2026-02-12"
    const date = new Date('2026-02-11T23:34:50Z')
    expect(getGameLocalDateString(date)).toBe('2026-02-12')
  })

  it('handles UTC late-afternoon → Taipei next day boundary', () => {
    // 2026-02-03T16:07:45Z → 2026-02-04 00:07 Taipei → "2026-02-04"
    const date = new Date('2026-02-03T16:07:45Z')
    expect(getGameLocalDateString(date)).toBe('2026-02-04')
  })

  it('pads single-digit month and day', () => {
    // 2025-01-05T00:00:00Z → 2025-01-05 08:00 Taipei → "2025-01-05"
    const date = new Date('2025-01-05T00:00:00Z')
    expect(getGameLocalDateString(date)).toBe('2025-01-05')
  })
})
