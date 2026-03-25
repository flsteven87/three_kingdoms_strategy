import { describe, it, expect } from 'vitest'
import {
  formatNumber,
  formatNumberCompact,
  calculatePercentDiff,
  getDiffClassName,
  formatDateLabel,
  expandPeriodsToDaily,
  getPeriodBoundaryTicks,
  calculateBoxPlotStats,
  formatWan,
  selectNiceStep,
  calculateDistributionBins,
} from '../chart-utils'

// =============================================================================
// formatNumber
// =============================================================================
describe('formatNumber', () => {
  it('formats millions with 2 decimal places', () => {
    expect(formatNumber(1500000)).toBe('1.50M')
    expect(formatNumber(1000000)).toBe('1.00M')
  })

  it('formats thousands with 1 decimal place', () => {
    expect(formatNumber(1500)).toBe('1.5K')
    expect(formatNumber(1000)).toBe('1.0K')
  })

  it('returns locale string for values under 1000', () => {
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(0)).toBe('0')
  })
})

// =============================================================================
// formatNumberCompact
// =============================================================================
describe('formatNumberCompact', () => {
  it('formats millions with 1 decimal place', () => {
    expect(formatNumberCompact(1500000)).toBe('1.5M')
  })

  it('formats thousands with 0 decimal places', () => {
    expect(formatNumberCompact(1500)).toBe('2K')
    expect(formatNumberCompact(45000)).toBe('45K')
  })

  it('handles negative values', () => {
    expect(formatNumberCompact(-1500000)).toBe('-1.5M')
    expect(formatNumberCompact(-45000)).toBe('-45K')
  })

  it('returns locale string for small values', () => {
    expect(formatNumberCompact(500)).toBe('500')
  })
})

// =============================================================================
// calculatePercentDiff
// =============================================================================
describe('calculatePercentDiff', () => {
  it('calculates positive diff', () => {
    expect(calculatePercentDiff(150, 100)).toBe(50)
  })

  it('calculates negative diff', () => {
    expect(calculatePercentDiff(50, 100)).toBe(-50)
  })

  it('returns 0 when average is 0', () => {
    expect(calculatePercentDiff(100, 0)).toBe(0)
  })
})

// =============================================================================
// getDiffClassName
// =============================================================================
describe('getDiffClassName', () => {
  it('returns primary for positive', () => {
    expect(getDiffClassName(5)).toBe('text-primary')
  })

  it('returns destructive for negative', () => {
    expect(getDiffClassName(-5)).toBe('text-destructive')
  })

  it('returns muted for zero', () => {
    expect(getDiffClassName(0)).toBe('text-muted-foreground')
  })
})

// =============================================================================
// formatDateLabel
// =============================================================================
describe('formatDateLabel', () => {
  it('formats to MM/DD', () => {
    expect(formatDateLabel('2025-01-15')).toMatch(/1\/15/)
  })
})

// =============================================================================
// expandPeriodsToDaily
// =============================================================================
describe('expandPeriodsToDaily', () => {
  it('expands period 1 including start_date', () => {
    const periods = [{
      start_date: '2025-01-01',
      end_date: '2025-01-03',
      period_number: 1,
      value: 100,
    }]
    const result = expandPeriodsToDaily(periods, (p) => ({ value: p.value }))
    expect(result).toHaveLength(3) // Jan 1, 2, 3
    expect(result[0].date).toBe('2025-01-01')
    expect(result[2].date).toBe('2025-01-03')
    expect(result[0].value).toBe(100)
  })

  it('skips start_date for period 2+', () => {
    const periods = [{
      start_date: '2025-01-03',
      end_date: '2025-01-05',
      period_number: 2,
      value: 200,
    }]
    const result = expandPeriodsToDaily(periods, (p) => ({ value: p.value }))
    expect(result).toHaveLength(2) // Jan 4, 5 (skips Jan 3)
    expect(result[0].date).toBe('2025-01-04')
  })

  it('returns empty for empty input', () => {
    const result = expandPeriodsToDaily([], () => ({}))
    expect(result).toHaveLength(0)
  })
})

// =============================================================================
// getPeriodBoundaryTicks
// =============================================================================
describe('getPeriodBoundaryTicks', () => {
  it('returns start + all end dates', () => {
    const periods = [
      { start_date: '2025-01-01', end_date: '2025-01-07', period_number: 1 },
      { start_date: '2025-01-07', end_date: '2025-01-14', period_number: 2 },
    ]
    const ticks = getPeriodBoundaryTicks(periods)
    expect(ticks).toEqual(['2025-01-01', '2025-01-07', '2025-01-14'])
  })

  it('returns empty for no periods', () => {
    expect(getPeriodBoundaryTicks([])).toEqual([])
  })
})

// =============================================================================
// calculateBoxPlotStats
// =============================================================================
describe('calculateBoxPlotStats', () => {
  it('calculates stats correctly', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const stats = calculateBoxPlotStats(values)
    expect(stats).not.toBeNull()
    expect(stats!.min).toBe(1)
    expect(stats!.max).toBe(10)
    expect(stats!.median).toBe(5.5)
    expect(stats!.q1).toBe(3.25)
    expect(stats!.q3).toBe(7.75)
  })

  it('handles single value', () => {
    const stats = calculateBoxPlotStats([42])
    expect(stats).toEqual({ min: 42, q1: 42, median: 42, q3: 42, max: 42 })
  })

  it('returns null for empty array', () => {
    expect(calculateBoxPlotStats([])).toBeNull()
  })

  it('handles unsorted input', () => {
    const stats = calculateBoxPlotStats([5, 1, 3, 2, 4])
    expect(stats!.min).toBe(1)
    expect(stats!.max).toBe(5)
  })
})

// =============================================================================
// formatWan
// =============================================================================
describe('formatWan', () => {
  it('formats values >= 10000 with 萬 suffix', () => {
    expect(formatWan(50000)).toBe('5萬')
    expect(formatWan(15000)).toBe('1.5萬')
  })

  it('returns 0 for zero', () => {
    expect(formatWan(0)).toBe('0')
  })

  it('returns locale string for values < 10000', () => {
    expect(formatWan(5000)).toBe('5,000')
  })
})

// =============================================================================
// selectNiceStep
// =============================================================================
describe('selectNiceStep', () => {
  it('selects step producing 4-8 bins', () => {
    const step = selectNiceStep(100000)
    const bins = Math.ceil(100000 / step)
    expect(bins).toBeGreaterThanOrEqual(4)
    expect(bins).toBeLessThanOrEqual(8)
  })

  it('falls back to magnitude-based step', () => {
    const step = selectNiceStep(3)
    expect(step).toBeGreaterThan(0)
  })
})

// =============================================================================
// calculateDistributionBins
// =============================================================================
describe('calculateDistributionBins', () => {
  it('returns empty for empty input', () => {
    expect(calculateDistributionBins([], (x) => x)).toEqual([])
  })

  it('returns single zero bin when all values are 0', () => {
    const items = [{ v: 0 }, { v: 0 }]
    const bins = calculateDistributionBins(items, (i) => i.v)
    expect(bins).toHaveLength(1)
    expect(bins[0].label).toBe('0')
    expect(bins[0].count).toBe(2)
    expect(bins[0].percentage).toBe(100)
  })

  it('distributes items into bins', () => {
    const items = [
      { v: 0 }, { v: 100 }, { v: 5000 }, { v: 15000 }, { v: 25000 },
    ]
    const bins = calculateDistributionBins(items, (i) => i.v)
    expect(bins.length).toBeGreaterThan(1)
    expect(bins[0].count).toBe(1) // Zero bin
    const totalCount = bins.reduce((sum, b) => sum + b.count, 0)
    expect(totalCount).toBe(5)
  })
})
