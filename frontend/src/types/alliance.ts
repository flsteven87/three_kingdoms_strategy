/**
 * Alliance API Types
 *
 * 符合 CLAUDE.md 🟡: snake_case naming matching backend schema
 */

/**
 * Subscription status for season purchase system
 * - trial: Within 14-day trial period
 * - active: Trial active OR has available seasons
 * - expired: Trial expired AND no available seasons
 */
export type SubscriptionStatus = 'trial' | 'active' | 'expired'

export interface Alliance {
  readonly id: string
  readonly user_id: string
  readonly name: string
  readonly server_name: string | null
  readonly created_at: string
  readonly updated_at: string
  // Subscription fields
  readonly subscription_status: SubscriptionStatus
  readonly trial_started_at: string | null
  readonly trial_ends_at: string | null
  readonly subscription_plan: string | null
  readonly subscription_started_at: string | null
  readonly subscription_ends_at: string | null
}

export interface AllianceCreate {
  readonly name: string
  readonly server_name?: string | null
}

export interface AllianceUpdate {
  readonly name?: string
  readonly server_name?: string | null
}
