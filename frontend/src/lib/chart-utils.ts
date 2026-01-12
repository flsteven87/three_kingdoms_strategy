/**
 * Shared chart utility functions for analytics pages.
 *
 * These utilities support date-based X-axis charts with period data.
 */

/**
 * Format a number with K/M suffix for display.
 * Uses 2 decimal places for M, 1 decimal place for K.
 */
export function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toLocaleString()
}

/**
 * Format a number with K/M suffix in compact form.
 * Uses 1 decimal place for M, 0 decimal places for K.
 */
export function formatNumberCompact(value: number): string {
  const absValue = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (absValue >= 1000000) {
    return `${sign}${(absValue / 1000000).toFixed(1)}M`
  }
  else if (absValue >= 1000) {
    return `${sign}${(absValue / 1000).toFixed(0)}K`
  }
  return value.toLocaleString()
}

/**
 * Calculate percentage difference from an average.
 */
export function calculatePercentDiff(value: number, average: number): number {
  if (average === 0) return 0
  return ((value - average) / average) * 100
}

/**
 * Format a date string to MM/DD format for chart labels.
 */
export function formatDateLabel(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

/**
 * Period data interface that can be expanded to daily data points.
 * Any period data structure must have these fields for expansion.
 */
export interface PeriodData {
  readonly start_date: string
  readonly end_date: string
  readonly period_number: number
}

/**
 * Generic function to expand period data into daily data points.
 * Each day within a period will have the same values.
 *
 * Period date logic:
 * - Period 1: start_date (season start) to end_date (first snapshot) inclusive
 * - Period 2+: (start_date + 1 day) to end_date inclusive
 *   The start_date is the previous snapshot which belongs to the prior period
 *
 * @param periods - Array of period data
 * @param mapPeriod - Function to map period data to additional fields
 * @returns Array of daily data points with date, dateLabel, periodNumber, and mapped fields
 */
export function expandPeriodsToDaily<T extends PeriodData, R>(
  periods: readonly T[],
  mapPeriod: (period: T) => R
): Array<{ date: string; dateLabel: string; periodNumber: number } & R> {
  const dailyData: Array<{ date: string; dateLabel: string; periodNumber: number } & R> = []

  for (const period of periods) {
    const startDate = new Date(period.start_date)
    const endDate = new Date(period.end_date)
    const mappedData = mapPeriod(period)

    // For periods after the first, start from day after start_date
    // because start_date is the previous snapshot which belongs to prior period
    const currentDate = new Date(startDate)
    if (period.period_number > 1) {
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Include end_date (the snapshot date belongs to this period)
    while (currentDate <= endDate) {
      const dateStr = currentDate.toISOString().split('T')[0]

      dailyData.push({
        date: dateStr,
        dateLabel: formatDateLabel(dateStr),
        periodNumber: period.period_number,
        ...mappedData,
      })

      currentDate.setDate(currentDate.getDate() + 1)
    }
  }

  return dailyData
}

/**
 * Get tick values for X axis showing period boundaries.
 * Returns array of date strings at period boundaries for Recharts ticks prop.
 *
 * Tick logic:
 * - First tick: Period 1's start_date (season start)
 * - Subsequent ticks: Each period's end_date (snapshot dates)
 *
 * This shows boundaries where data "steps" to new period values.
 */
export function getPeriodBoundaryTicks<T extends PeriodData>(periods: readonly T[]): string[] {
  if (periods.length === 0) return []

  const ticks: string[] = []

  // First period's start date (season start)
  ticks.push(periods[0].start_date)

  // All periods' end dates (snapshot dates where data changes)
  for (const period of periods) {
    ticks.push(period.end_date)
  }

  return ticks
}

// =============================================================================
// Box Plot Statistics
// =============================================================================

/**
 * Box plot statistics interface
 */
export interface BoxPlotStats {
  readonly min: number
  readonly q1: number
  readonly median: number
  readonly q3: number
  readonly max: number
}

/**
 * Calculate percentile using linear interpolation.
 * Matches backend Python implementation.
 */
function percentile(sortedData: readonly number[], p: number): number {
  if (sortedData.length === 0) return 0
  const k = (sortedData.length - 1) * p
  const f = Math.floor(k)
  const c = Math.min(f + 1, sortedData.length - 1)
  return sortedData[f] + (sortedData[c] - sortedData[f]) * (k - f)
}

/**
 * Calculate box plot statistics from an array of values.
 * Returns min, Q1, median, Q3, max.
 *
 * @param values - Array of numeric values
 * @returns BoxPlotStats or null if values is empty
 */
export function calculateBoxPlotStats(values: readonly number[]): BoxPlotStats | null {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)

  return {
    min: sorted[0],
    q1: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    q3: percentile(sorted, 0.75),
    max: sorted[sorted.length - 1],
  }
}

// =============================================================================
// Distribution Bin Utilities
// =============================================================================

/**
 * Format a number using 萬 (10,000) units for Chinese readability.
 * Examples: 50000 -> "5萬", 15000 -> "1.5萬", 500 -> "500"
 */
export function formatWan(value: number): string {
  if (value === 0) return '0'
  if (value >= 10000) {
    const wan = value / 10000
    return Number.isInteger(wan) ? `${wan}萬` : `${wan.toFixed(1)}萬`
  }
  return value.toLocaleString()
}

/**
 * Select a "nice" step size for histogram bins.
 * Aims for 5-8 bins with round numbers in 萬 units for readability.
 *
 * @param maxValue - Maximum value in the dataset
 * @param niceSteps - Optional array of preferred step sizes (defaults to common values)
 * @param targetBins - Target number of bins (default 6)
 */
export function selectNiceStep(
  maxValue: number,
  niceSteps: readonly number[] = [5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000],
  targetBins: number = 6
): number {
  // Find step that produces closest to target bin count
  for (const step of niceSteps) {
    const binCount = Math.ceil(maxValue / step)
    if (binCount >= 4 && binCount <= 8) return step
  }

  // Fallback: calculate based on magnitude
  const rawStep = maxValue / targetBins
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const normalized = rawStep / magnitude
  const niceNormalized = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return niceNormalized * magnitude
}

/**
 * Distribution bin for histogram display.
 */
export interface DistributionBin {
  readonly range: string
  readonly label: string
  readonly min: number
  readonly max: number
  readonly count: number
  readonly percentage: number
}

/**
 * Calculate distribution bins for a collection of items.
 * Creates a histogram with dynamic "nice" bin boundaries.
 *
 * Special handling:
 * - First bin is always "0" for inactive/zero-value items
 * - Uses formatWan for readable Chinese number labels
 * - Single pass O(n) counting for performance
 *
 * @param items - Array of items to bin
 * @param getValue - Function to extract the numeric value from each item
 * @param niceSteps - Optional preferred step sizes for bin boundaries
 */
export function calculateDistributionBins<T>(
  items: readonly T[],
  getValue: (item: T) => number,
  niceSteps?: readonly number[]
): DistributionBin[] {
  if (items.length === 0) return []

  const values = items.map(getValue)
  const maxValue = Math.max(...values, 0)

  // All items have zero value
  if (maxValue === 0) {
    return [{
      range: '0',
      label: '0',
      min: 0,
      max: Infinity,
      count: items.length,
      percentage: 100
    }]
  }

  const step = selectNiceStep(maxValue, niceSteps)
  const numRanges = Math.ceil(maxValue / step)

  // Build bin definitions: first bin is always "0" (inactive/zero items)
  interface BinDef {
    min: number
    max: number
    label: string
  }
  const binDefs: BinDef[] = [{ min: 0, max: 0.01, label: '0' }]

  for (let i = 0; i < numRanges; i++) {
    const rangeMin = i * step + (i === 0 ? 0.01 : 0)
    const rangeMax = (i + 1) * step
    const isLast = i === numRanges - 1

    let label: string
    if (i === 0) {
      label = `0-${formatWan(step)}`
    } else if (isLast) {
      label = `${formatWan(i * step)}+`
    } else {
      label = `${formatWan(i * step)}-${formatWan(rangeMax)}`
    }

    binDefs.push({
      min: rangeMin,
      max: isLast ? Infinity : rangeMax,
      label,
    })
  }

  // Count items in each bin (single pass for O(n) performance)
  const total = items.length
  const counts = new Array<number>(binDefs.length).fill(0)

  for (const item of items) {
    const value = getValue(item)
    for (let i = 0; i < binDefs.length; i++) {
      if (value >= binDefs[i].min && value < binDefs[i].max) {
        counts[i]++
        break
      }
    }
  }

  return binDefs.map((def, i) => ({
    range: def.label,
    label: def.label,
    min: def.min,
    max: def.max,
    count: counts[i],
    percentage: total > 0 ? Math.round((counts[i] / total) * 100) : 0,
  }))
}
