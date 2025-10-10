/**
 * Hegemony Weight Helper Functions
 *
 * 符合 CLAUDE.md 🟢: Utility functions extracted from components for reusability
 * These helpers handle date formatting, chart configuration, and score display
 * for hegemony weight calculations across the application.
 */

import type { ChartConfig } from '@/components/ui/chart'

/**
 * Format date to YYYY-MM-DD using UTC to avoid timezone issues
 *
 * This ensures consistent date formatting across frontend and backend,
 * preventing timezone-related discrepancies in hegemony score calculations.
 *
 * @param date - Date string or Date object to format
 * @returns Formatted date string in YYYY-MM-DD format
 *
 * @example
 * formatDateUTC('2025-10-09T10:13:09Z') // '2025-10-09'
 * formatDateUTC(new Date('2025-10-09')) // '2025-10-09'
 */
export function formatDateUTC(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/**
 * Generate color with opacity based on snapshot index
 *
 * Uses primary color with varying opacity for different snapshots.
 * Creates a gradient effect where older snapshots are lighter (30% opacity)
 * and newer snapshots are darker (100% opacity).
 *
 * @param index - Current snapshot index (0-based)
 * @param total - Total number of snapshots
 * @returns OKLCH color string with alpha channel
 *
 * @example
 * generateSnapshotColor(0, 3) // 'oklch(0.6487 0.1538 150.3071 / 0.30)' (oldest, lightest)
 * generateSnapshotColor(2, 3) // 'oklch(0.6487 0.1538 150.3071 / 1.00)' (newest, darkest)
 */
export function generateSnapshotColor(index: number, total: number): string {
  // Base primary color in oklch format
  const baseColor = 'oklch(0.6487 0.1538 150.3071)'

  // Calculate opacity: from 0.3 (oldest) to 1.0 (newest)
  const opacity = 0.3 + (0.7 * index / (total - 1 || 1))

  // Extract oklch values and add alpha channel
  const match = baseColor.match(/oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/)
  if (!match) return baseColor

  const [, l, c, h] = match
  return `oklch(${l} ${c} ${h} / ${opacity.toFixed(2)})`
}

/**
 * Build dynamic chart configuration for Recharts based on snapshot dates
 *
 * Creates a ChartConfig object where each snapshot gets a unique key (snapshot_0, snapshot_1, etc.)
 * with its corresponding label (formatted date) and color (opacity gradient).
 *
 * @param snapshotDates - Array of snapshot date strings
 * @returns ChartConfig object for Recharts components
 *
 * @example
 * buildChartConfig(['2025-10-01', '2025-10-09'])
 * // {
 * //   snapshot_0: { label: '2025-10-01', color: 'oklch(0.6487 0.1538 150.3071 / 0.30)' },
 * //   snapshot_1: { label: '2025-10-09', color: 'oklch(0.6487 0.1538 150.3071 / 1.00)' }
 * // }
 */
export function buildChartConfig(snapshotDates: string[]): ChartConfig {
  const config: ChartConfig = {}

  snapshotDates.forEach((date, index) => {
    const snapshotKey = `snapshot_${index}`
    config[snapshotKey] = {
      label: formatDateUTC(date),
      color: generateSnapshotColor(index, snapshotDates.length)
    }
  })

  return config
}

/**
 * Format hegemony score for compact display
 *
 * Converts large numbers to compact format with K/M suffixes for better readability.
 *
 * @param score - Numeric score to format
 * @returns Formatted score string
 *
 * @example
 * formatScore(1234567) // '1.2M'
 * formatScore(45678)   // '46K'
 * formatScore(789)     // '789'
 */
export function formatScore(score: number): string {
  if (score >= 1000000) {
    return `${(score / 1000000).toFixed(1)}M`
  }
  if (score >= 1000) {
    return `${(score / 1000).toFixed(0)}K`
  }
  return score.toFixed(0)
}
