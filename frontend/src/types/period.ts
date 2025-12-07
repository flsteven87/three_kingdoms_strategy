/**
 * Period Types
 *
 * Types for period-based analytics data
 */

/**
 * Result of recalculating periods for a specific season
 */
export interface RecalculateSeasonPeriodsResponse {
  success: boolean
  season_id: string
  season_name: string
  periods_created: number
}
