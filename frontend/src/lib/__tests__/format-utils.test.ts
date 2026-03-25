import { describe, it, expect } from 'vitest'
import {
  formatScore,
  formatDuration,
  formatPercent,
  formatEventTime,
} from '../format-utils'

// Note: formatNumber is now in chart-utils.ts (single canonical implementation)
// See chart-utils.test.ts for its tests

// =============================================================================
// formatScore
// =============================================================================
describe('formatScore', () => {
  it('formats with 萬 suffix for values >= 10000', () => {
    expect(formatScore(85000)).toBe('8.5萬')
    expect(formatScore(50000)).toBe('5.0萬')
  })

  it('compact mode omits decimal for exact multiples', () => {
    expect(formatScore(80000, true)).toBe('8萬')
    expect(formatScore(85000, true)).toBe('8.5萬')
  })

  it('returns locale string under 10000', () => {
    expect(formatScore(8500)).toBe('8,500')
  })
})

// =============================================================================
// formatDuration
// =============================================================================
describe('formatDuration', () => {
  it('formats minutes only', () => {
    expect(formatDuration(45)).toBe('45分鐘')
  })

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1小時30分')
  })

  it('formats exact hours', () => {
    expect(formatDuration(120)).toBe('2小時')
  })
})

// =============================================================================
// formatPercent
// =============================================================================
describe('formatPercent', () => {
  it('formats with default 0 decimals', () => {
    expect(formatPercent(85.7)).toBe('86%')
  })

  it('formats with specified decimals', () => {
    expect(formatPercent(85.7, 1)).toBe('85.7%')
  })
})

// =============================================================================
// formatEventTime
// =============================================================================
describe('formatEventTime', () => {
  it('formats ISO string to MM/DD HH:MM', () => {
    const result = formatEventTime('2025-10-09T10:13:09Z')
    expect(result).toMatch(/\d{2}\/\d{2} \d{2}:\d{2}/)
  })

  it('returns empty string for null', () => {
    expect(formatEventTime(null)).toBe('')
  })

  it('handles string without Z suffix', () => {
    const result = formatEventTime('2025-10-09T10:13:09')
    expect(result).toMatch(/\d{2}\/\d{2} \d{2}:\d{2}/)
  })
})
