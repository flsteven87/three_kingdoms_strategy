/**
 * Analytics API Types
 *
 * Type definitions matching backend Pydantic models.
 * All field names use snake_case to match API response.
 */

/**
 * Member item for analytics selector dropdown
 */
export interface MemberListItem {
  readonly id: string
  readonly name: string
  readonly is_active: boolean
  readonly contribution_rank: number | null
  readonly group: string | null
}

/**
 * Single period data point for member trend chart
 */
export interface MemberTrendItem {
  // Period identification
  readonly period_id: string
  readonly period_number: number
  readonly period_label: string
  readonly start_date: string // ISO date string
  readonly end_date: string // ISO date string
  readonly days: number

  // Daily averages
  readonly daily_contribution: number
  readonly daily_merit: number
  readonly daily_assist: number
  readonly daily_donation: number

  // Period totals (diff values)
  readonly contribution_diff: number
  readonly merit_diff: number
  readonly assist_diff: number
  readonly donation_diff: number
  readonly power_diff: number

  // Rank info
  readonly start_rank: number | null
  readonly end_rank: number
  readonly rank_change: number | null

  // State info
  readonly end_power: number
  readonly end_state: string | null
  readonly end_group: string | null
  readonly is_new_member: boolean

  // Alliance averages for comparison
  readonly alliance_avg_contribution: number
  readonly alliance_avg_merit: number
  readonly alliance_avg_assist: number
  readonly alliance_avg_donation: number
  readonly alliance_avg_power: number
  readonly alliance_member_count: number
}

/**
 * Season-to-date summary for a member
 */
export interface SeasonSummaryResponse {
  // Period counts
  readonly period_count: number
  readonly total_days: number

  // Season totals
  readonly total_contribution: number
  readonly total_merit: number
  readonly total_assist: number
  readonly total_donation: number
  readonly total_power_change: number

  // Season daily averages
  readonly avg_daily_contribution: number
  readonly avg_daily_merit: number
  readonly avg_daily_assist: number
  readonly avg_daily_donation: number

  // Current status
  readonly current_rank: number
  readonly rank_change_season: number | null
  readonly current_power: number
  readonly current_group: string | null
  readonly current_state: string | null
}

/**
 * Alliance-wide average metrics for a period
 */
export interface AllianceAveragesResponse {
  readonly member_count: number
  readonly avg_daily_contribution: number
  readonly avg_daily_merit: number
  readonly avg_daily_assist: number
  readonly avg_daily_donation: number
}

/**
 * Alliance averages for a single period in trend
 */
export interface AllianceTrendItem {
  readonly period_id: string
  readonly period_number: number
  readonly period_label: string
  readonly member_count: number
  readonly avg_daily_contribution: number
  readonly avg_daily_merit: number
  readonly avg_daily_assist: number
  readonly avg_daily_donation: number
}
