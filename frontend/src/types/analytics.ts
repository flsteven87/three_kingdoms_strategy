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

  // Alliance medians for comparison
  readonly alliance_median_contribution: number
  readonly alliance_median_merit: number
  readonly alliance_median_assist: number
  readonly alliance_median_donation: number
  readonly alliance_median_power: number
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
  readonly avg_power: number

  // Current status
  readonly current_rank: number
  readonly rank_change_season: number | null
  readonly current_power: number
  readonly current_group: string | null
  readonly current_state: string | null
}

/**
 * Alliance-wide average and median metrics for a period
 */
export interface AllianceAveragesResponse {
  readonly member_count: number
  // Averages
  readonly avg_daily_contribution: number
  readonly avg_daily_merit: number
  readonly avg_daily_assist: number
  readonly avg_daily_donation: number
  readonly avg_power: number
  // Medians
  readonly median_daily_contribution: number
  readonly median_daily_merit: number
  readonly median_daily_assist: number
  readonly median_daily_donation: number
  readonly median_power: number
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

// =============================================================================
// Group Analytics Types
// =============================================================================

/**
 * Group item for group selector dropdown
 */
export interface GroupListItem {
  readonly name: string
  readonly member_count: number
}

/**
 * Group statistics based on latest period data
 */
export interface GroupStats {
  readonly group_name: string
  readonly member_count: number

  // Person-day averages (人日均)
  readonly avg_daily_contribution: number
  readonly avg_daily_merit: number
  readonly avg_daily_assist: number
  readonly avg_daily_donation: number
  readonly avg_power: number

  // Rank statistics
  readonly avg_rank: number
  readonly best_rank: number
  readonly worst_rank: number

  // Contribution distribution (box plot data)
  readonly contribution_min: number
  readonly contribution_q1: number
  readonly contribution_median: number
  readonly contribution_q3: number
  readonly contribution_max: number
  readonly contribution_cv: number

  // Merit distribution (box plot data)
  readonly merit_min: number
  readonly merit_q1: number
  readonly merit_median: number
  readonly merit_q3: number
  readonly merit_max: number
  readonly merit_cv: number
}

/**
 * Member within a group with performance metrics
 */
export interface GroupMember {
  readonly id: string
  readonly name: string
  readonly contribution_rank: number
  readonly daily_contribution: number
  readonly daily_merit: number
  readonly daily_assist: number
  readonly daily_donation: number
  readonly power: number
  readonly rank_change: number | null
  readonly contribution_change: number | null
  readonly merit_change: number | null
}

/**
 * Group performance for a single period
 */
export interface GroupTrendItem {
  readonly period_label: string
  readonly period_number: number
  readonly start_date: string // ISO date string
  readonly end_date: string // ISO date string
  readonly days: number
  readonly avg_rank: number
  readonly avg_contribution: number
  readonly avg_merit: number
  readonly avg_assist: number
  readonly avg_donation: number
  readonly avg_power: number
  readonly member_count: number
}

/**
 * Complete group analytics data (aggregated response)
 */
export interface GroupAnalyticsResponse {
  readonly stats: GroupStats
  readonly members: readonly GroupMember[]
  readonly trends: readonly GroupTrendItem[]
  readonly alliance_averages: AllianceAveragesResponse
}

/**
 * Group summary for comparison across all groups
 */
export interface GroupComparisonItem {
  readonly name: string
  readonly avg_daily_merit: number
  readonly avg_rank: number
  readonly member_count: number
  readonly member_names: readonly string[]
}

// =============================================================================
// Alliance Analytics Types
// =============================================================================

/**
 * Alliance-wide metrics summary for KPI cards
 */
export interface AllianceSummary {
  readonly member_count: number
  readonly avg_daily_contribution: number
  readonly avg_daily_merit: number
  readonly avg_daily_assist: number
  readonly avg_daily_donation: number
  readonly avg_power: number
  readonly median_daily_contribution: number
  readonly median_daily_merit: number
  readonly contribution_change_pct: number | null
  readonly merit_change_pct: number | null
  readonly power_change_pct: number | null
}

/**
 * Enhanced trend item with median values for charts
 */
export interface AllianceTrendWithMedian {
  readonly period_id: string
  readonly period_number: number
  readonly period_label: string
  readonly start_date: string
  readonly end_date: string
  readonly days: number
  readonly member_count: number
  // Averages
  readonly avg_daily_contribution: number
  readonly avg_daily_merit: number
  readonly avg_daily_assist: number
  readonly avg_daily_donation: number
  readonly avg_power: number
  // Medians
  readonly median_daily_contribution: number
  readonly median_daily_merit: number
  readonly median_daily_assist: number
  readonly median_daily_donation: number
}

/**
 * Histogram bin for distribution charts
 */
export interface DistributionBin {
  readonly range: string
  readonly min_value: number
  readonly max_value: number
  readonly count: number
}

/**
 * Distribution histograms for contribution and merit
 */
export interface DistributionData {
  readonly contribution: readonly DistributionBin[]
  readonly merit: readonly DistributionBin[]
}

/**
 * Group stats with box plot data for alliance analytics
 */
export interface GroupStatsWithBoxPlot {
  readonly name: string
  readonly member_count: number
  readonly avg_daily_contribution: number
  readonly avg_daily_merit: number
  readonly avg_rank: number
  readonly avg_power: number
  readonly contribution_cv: number
  // Contribution box plot
  readonly contribution_min: number
  readonly contribution_q1: number
  readonly contribution_median: number
  readonly contribution_q3: number
  readonly contribution_max: number
  // Merit box plot
  readonly merit_min: number
  readonly merit_q1: number
  readonly merit_median: number
  readonly merit_q3: number
  readonly merit_max: number
}

/**
 * Top/Bottom performer member item
 */
export interface PerformerItem {
  readonly member_id: string
  readonly name: string
  readonly group: string | null
  readonly daily_contribution: number
  readonly daily_merit: number
  readonly daily_assist: number
  readonly rank: number
  readonly rank_change: number | null
  readonly merit_change: number | null
  readonly assist_change: number | null
}

/**
 * Member needing attention
 */
export interface AttentionItem {
  readonly member_id: string
  readonly name: string
  readonly group: string | null
  readonly daily_contribution: number
  readonly rank: number
  readonly rank_change: number | null
  readonly reason: string
}

/**
 * Current period metadata
 */
export interface PeriodInfo {
  readonly period_id: string
  readonly period_number: number
  readonly period_label: string
  readonly start_date: string
  readonly end_date: string
  readonly days: number
}

/**
 * Complete alliance analytics data for AllianceAnalytics page
 */
export interface AllianceAnalyticsResponse {
  readonly summary: AllianceSummary
  readonly trends: readonly AllianceTrendWithMedian[]
  readonly distributions: DistributionData
  readonly groups: readonly GroupStatsWithBoxPlot[]
  readonly top_performers: readonly PerformerItem[]
  readonly bottom_performers: readonly PerformerItem[]
  readonly needs_attention: readonly AttentionItem[]
  readonly current_period: PeriodInfo
}
