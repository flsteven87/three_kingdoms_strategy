/**
 * Battle Event Analytics Types
 *
 * Type definitions for tracking special battle events and campaigns.
 * Unlike daily periods, events track short-duration activities (hours)
 * with focus on participation rate and total contribution.
 */

import type { DistributionBin } from './analytics'

/**
 * Event processing status
 */
export type EventStatus = 'draft' | 'analyzing' | 'completed'

/**
 * Event category determines participation logic
 */
export type EventCategory = 'siege' | 'forbidden' | 'battle'

/**
 * Battle event entity
 */
export interface BattleEvent {
  readonly id: string
  readonly alliance_id: string
  readonly season_id: string
  readonly name: string
  readonly event_type: EventCategory
  readonly description: string | null
  readonly before_upload_id: string | null
  readonly after_upload_id: string | null
  readonly event_start: string | null // ISO timestamp
  readonly event_end: string | null // ISO timestamp
  readonly status: EventStatus
  readonly created_at: string
}

/**
 * Event summary statistics
 */
export interface EventSummary {
  // Participation stats
  readonly total_members: number
  readonly participated_count: number
  readonly absent_count: number
  readonly new_member_count: number
  readonly participation_rate: number

  // Aggregate metrics
  readonly total_merit: number
  readonly total_assist: number
  readonly total_contribution: number
  readonly avg_merit: number
  readonly avg_assist: number

  // MVP info (category-specific)
  readonly mvp_member_id: string | null
  readonly mvp_member_name: string | null
  readonly mvp_merit: number | null // For BATTLE
  readonly mvp_contribution: number | null // For SIEGE
  readonly mvp_assist: number | null // For SIEGE
  readonly mvp_combined_score: number | null // For SIEGE (contribution + assist)

  // Forbidden zone specific
  readonly violator_count: number // For FORBIDDEN
}

/**
 * Individual member metrics for an event
 */
export interface EventMemberMetric {
  readonly id: string
  readonly member_id: string
  readonly member_name: string
  readonly group_name: string | null

  // Diff values (after - before)
  readonly contribution_diff: number
  readonly merit_diff: number
  readonly assist_diff: number
  readonly donation_diff: number
  readonly power_diff: number

  // Status flags
  readonly participated: boolean // merit_diff > 0 or assist_diff > 0
  readonly is_new_member: boolean // only in after snapshot
  readonly is_absent: boolean // in before but merit_diff = 0
}

/**
 * Complete event analytics response
 */
export interface EventAnalyticsResponse {
  readonly event: BattleEvent
  readonly summary: EventSummary
  readonly metrics: readonly EventMemberMetric[]
  readonly merit_distribution: readonly DistributionBin[]
}

/**
 * Event list item (for event cards)
 */
export interface EventListItem {
  readonly id: string
  readonly name: string
  readonly event_type: EventCategory
  readonly status: EventStatus
  readonly event_start: string | null
  readonly event_end: string | null
  readonly participation_rate: number | null
  readonly total_merit: number | null
  readonly mvp_name: string | null
  readonly absent_count: number | null
  readonly created_at: string
}

/**
 * Create event request payload
 */
export interface CreateEventRequest {
  readonly name: string
  readonly event_type: EventCategory
  readonly description?: string
}

/**
 * Event snapshot upload info
 */
export interface EventSnapshotInfo {
  readonly upload_id: string
  readonly snapshot_date: string
  readonly member_count: number
  readonly file_name: string
}

/**
 * Response from event CSV upload endpoint
 */
export interface EventUploadResponse {
  readonly upload_id: string
  readonly season_id: string
  readonly snapshot_date: string
  readonly file_name: string
  readonly total_members: number
}

// ============================================================================
// Group Analytics Types (for LINE Bot report preview)
// ============================================================================

/**
 * Statistics for a single group in a battle event (category-aware)
 */
export interface GroupEventStats {
  readonly group_name: string
  readonly member_count: number
  readonly participated_count: number
  readonly absent_count: number
  readonly participation_rate: number

  // BATTLE event stats
  readonly total_merit: number
  readonly avg_merit: number
  readonly merit_min: number
  readonly merit_max: number

  // SIEGE event stats
  readonly total_contribution: number
  readonly avg_contribution: number
  readonly total_assist: number
  readonly avg_assist: number
  readonly combined_min: number
  readonly combined_max: number

  // FORBIDDEN event stats
  readonly violator_count: number
}

/**
 * Top performer item for ranking display (category-aware)
 */
export interface TopMemberItem {
  readonly rank: number
  readonly member_name: string
  readonly group_name: string | null

  // Primary score for ranking
  readonly score: number

  // Category-specific fields
  readonly merit_diff: number | null // BATTLE
  readonly contribution_diff: number | null // SIEGE
  readonly assist_diff: number | null // SIEGE

  readonly line_display_name?: string | null
}

/**
 * Violator item for FORBIDDEN events
 */
export interface ViolatorItem {
  readonly rank: number
  readonly member_name: string
  readonly group_name: string | null
  readonly power_diff: number
  readonly line_display_name?: string | null
}

/**
 * Complete group analytics for a battle event (used in LINE Bot report)
 */
export interface EventGroupAnalytics {
  readonly event_id: string
  readonly event_name: string
  readonly event_type: EventCategory | null
  readonly event_start: string | null
  readonly event_end: string | null
  readonly summary: EventSummary
  readonly group_stats: readonly GroupEventStats[]

  // Top performers (for BATTLE and SIEGE events)
  readonly top_members: readonly TopMemberItem[]

  // Violators (for FORBIDDEN events only)
  readonly violators: readonly ViolatorItem[]
}
