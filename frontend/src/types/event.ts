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
