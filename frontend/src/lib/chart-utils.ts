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

    const currentDate = new Date(startDate)
    while (currentDate < endDate) {
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
 * Returns array of date labels at period start/end boundaries.
 */
export function getPeriodBoundaryTicks<T extends PeriodData>(periods: readonly T[]): string[] {
  const ticks: string[] = []

  for (const period of periods) {
    ticks.push(formatDateLabel(period.start_date))
  }

  // Add end date of last period
  if (periods.length > 0) {
    ticks.push(formatDateLabel(periods[periods.length - 1].end_date))
  }

  return ticks
}
