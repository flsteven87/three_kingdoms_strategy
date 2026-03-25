import { describe, it, expect } from 'vitest'
import {
  formatDateUTC,
  generateSnapshotColor,
  formatScore,
} from '../hegemony-helpers'

// =============================================================================
// formatDateUTC
// =============================================================================
describe('formatDateUTC', () => {
  it('formats ISO string to YYYY-MM-DD', () => {
    expect(formatDateUTC('2025-10-09T10:13:09Z')).toBe('2025-10-09')
  })

  it('formats Date object to YYYY-MM-DD', () => {
    const date = new Date(Date.UTC(2025, 0, 5)) // Jan 5
    expect(formatDateUTC(date)).toBe('2025-01-05')
  })

  it('pads single-digit months and days', () => {
    expect(formatDateUTC('2025-01-05T00:00:00Z')).toBe('2025-01-05')
  })
})

// =============================================================================
// generateSnapshotColor
// =============================================================================
describe('generateSnapshotColor', () => {
  it('returns oklch color with alpha', () => {
    const color = generateSnapshotColor(0, 3)
    expect(color).toMatch(/oklch\([\d.]+ [\d.]+ [\d.]+ \/ [\d.]+\)/)
  })

  it('oldest snapshot has lowest opacity (0.30)', () => {
    const color = generateSnapshotColor(0, 3)
    expect(color).toContain('/ 0.30')
  })

  it('newest snapshot has highest opacity (1.00)', () => {
    const color = generateSnapshotColor(2, 3)
    expect(color).toContain('/ 1.00')
  })

  it('handles single snapshot (total=1)', () => {
    const color = generateSnapshotColor(0, 1)
    expect(color).toContain('/ 0.30')
  })
})

// =============================================================================
// formatScore
// =============================================================================
describe('formatScore', () => {
  it('formats millions with M suffix', () => {
    expect(formatScore(1234567)).toBe('1.2M')
  })

  it('formats thousands with K suffix', () => {
    expect(formatScore(45678)).toBe('46K')
  })

  it('returns raw number for small values', () => {
    expect(formatScore(789)).toBe('789')
  })
})
