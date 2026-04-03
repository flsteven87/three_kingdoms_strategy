/**
 * Copper Mine Management TypeScript Types
 *
 * Type definitions for copper mine rules and ownership records.
 * All field names use snake_case to match API response.
 */

// =============================================================================
// Rule Types (Alliance Level)
// =============================================================================

/**
 * Allowed copper mine levels for a rule tier
 * - nine: Only level 9 allowed
 * - ten: Only level 10 allowed
 * - both: Either level 9 or 10 allowed
 */
export type AllowedLevel = 'nine' | 'ten' | 'both'

/**
 * Copper mine application rule for a specific tier
 */
export interface CopperMineRule {
  readonly id: string
  readonly alliance_id: string
  readonly tier: number
  readonly required_merit: number
  readonly allowed_level: AllowedLevel
  readonly created_at: string
  readonly updated_at: string
}

export interface CreateCopperMineRuleRequest {
  readonly tier: number
  readonly required_merit: number
  readonly allowed_level: AllowedLevel
}

export interface UpdateCopperMineRuleRequest {
  readonly required_merit?: number
  readonly allowed_level?: AllowedLevel
}

// =============================================================================
// Ownership Types (Season Level)
// =============================================================================

/**
 * Registration source for a copper mine
 */
export type RegisteredVia = 'liff' | 'dashboard'

/**
 * Copper mine ownership record with joined member data
 */
export interface CopperMineOwnership {
  readonly id: string
  readonly season_id: string
  readonly member_id: string
  readonly coord_x: number
  readonly coord_y: number
  readonly level: 9 | 10
  readonly applied_at: string
  readonly created_at: string
  // P1 修復: 添加註冊來源
  readonly registered_via: RegisteredVia
  // Joined fields from members table
  readonly member_name: string
  readonly member_group: string | null
  // Joined field from member_line_bindings (may be null)
  readonly line_display_name: string | null
}

export interface CreateCopperMineOwnershipRequest {
  readonly member_id: string
  readonly coord_x: number
  readonly coord_y: number
  readonly level: 9 | 10
  readonly applied_at?: string
}

export interface CopperMineOwnershipListResponse {
  readonly ownerships: CopperMineOwnership[]
  readonly total: number
}

export interface CopperCoordinateSearchResult {
  readonly coord_x: number
  readonly coord_y: number
  readonly level: number
  readonly county: string
  readonly district: string
  readonly is_taken: boolean
}

// =============================================================================
// Member Status Types (For Validation)
// =============================================================================

/**
 * Member's copper mine application status for validation
 */
export interface MemberCopperMineStatus {
  readonly member_id: string
  readonly member_name: string
  readonly current_count: number
  readonly total_merit: number
  readonly next_tier: number | null
  readonly next_required_merit: number | null
  readonly next_allowed_level: AllowedLevel | null
  readonly can_apply: boolean
}

// =============================================================================
// Display Helpers
// =============================================================================

export const ALLOWED_LEVEL_LABELS: Record<AllowedLevel, string> = {
  nine: '9 級',
  ten: '10 級',
  both: '9 或 10 級',
}

