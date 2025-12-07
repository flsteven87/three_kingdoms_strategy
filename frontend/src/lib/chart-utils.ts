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
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`
  }
  return value.toString()
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
