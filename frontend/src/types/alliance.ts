/**
 * Alliance API Types
 *
 * Note: Trial system has moved to Season level (Season.is_trial, Season.activated_at)
 * 符合 CLAUDE.md 🟡: snake_case naming matching backend schema
 */

export interface Alliance {
  readonly id: string
  readonly name: string
  readonly server_name: string | null
  readonly created_at: string
  readonly updated_at: string
  // Season purchase fields
  readonly purchased_seasons: number
  readonly used_seasons: number
  readonly recur_customer_id: string | null
}

export interface AllianceCreate {
  readonly name: string
  readonly server_name?: string | null
}

export interface AllianceUpdate {
  readonly name?: string
  readonly server_name?: string | null
}
