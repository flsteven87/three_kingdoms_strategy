/**
 * Battle Event Analytics Types
 *
 * Type definitions for tracking special battle events and campaigns.
 * Unlike daily periods, events track short-duration activities (hours)
 * with focus on participation rate and total contribution.
 */

import type { DistributionBin } from './analytics'

/**
 * Event type classification
 */
export type EventType =
  | 'siege' // 攻城戰
  | 'defense' // 守城戰
  | 'raid' // 突襲
  | 'territory' // 領土爭奪
  | 'boss' // 世界BOSS
  | 'custom' // 自訂

/**
 * Event processing status
 */
export type EventStatus = 'draft' | 'analyzing' | 'completed'

/**
 * Event type configuration for UI display
 */
export interface EventTypeConfig {
  readonly label: string
  readonly color: 'primary' | 'blue' | 'yellow' | 'green' | 'purple' | 'gray'
}

/**
 * Event type display configuration map
 */
export const EVENT_TYPE_CONFIG: Record<EventType, EventTypeConfig> = {
  siege: { label: '攻城戰', color: 'primary' },
  defense: { label: '守城戰', color: 'blue' },
  raid: { label: '突襲', color: 'yellow' },
  territory: { label: '領土爭奪', color: 'green' },
  boss: { label: '世界BOSS', color: 'purple' },
  custom: { label: '自訂', color: 'gray' },
}

/**
 * Battle event entity
 */
export interface BattleEvent {
  readonly id: string
  readonly alliance_id: string
  readonly season_id: string
  readonly name: string
  readonly event_type: EventType
  readonly description: string | null
  readonly expected_participants: number | null
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
  readonly expected_participants: number | null

  // Aggregate metrics
  readonly total_merit: number
  readonly total_assist: number
  readonly total_contribution: number
  readonly avg_merit: number
  readonly avg_assist: number

  // MVP info
  readonly mvp_member_id: string
  readonly mvp_member_name: string
  readonly mvp_merit: number
}

/**
 * Individual member metrics for an event
 */
export interface EventMemberMetric {
  readonly id: string
  readonly member_id: string
  readonly member_name: string
  readonly group: string | null

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
  readonly event_type: EventType
  readonly status: EventStatus
  readonly event_start: string | null
  readonly event_end: string | null
  readonly participation_rate: number | null
  readonly total_merit: number | null
  readonly mvp_name: string | null
  readonly created_at: string
}

/**
 * Create event request payload
 */
export interface CreateEventRequest {
  readonly name: string
  readonly event_type: EventType
  readonly description?: string
  readonly expected_participants?: number
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
