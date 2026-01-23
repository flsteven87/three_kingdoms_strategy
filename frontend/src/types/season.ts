/**
 * Season API Types - Season Purchase System
 *
 * 符合 CLAUDE.md 🟡: snake_case naming matching backend schema
 */

export type ActivationStatus = 'draft' | 'activated' | 'completed'

export interface Season {
  readonly id: string
  readonly alliance_id: string
  readonly name: string
  readonly start_date: string
  readonly end_date: string | null
  readonly is_current: boolean
  readonly activation_status: ActivationStatus
  readonly description: string | null
  readonly created_at: string
  readonly updated_at: string
}

export interface SeasonCreate {
  readonly alliance_id: string
  readonly name: string
  readonly start_date: string
  readonly end_date?: string | null
  readonly description?: string | null
}

export interface SeasonUpdate {
  readonly name?: string
  readonly start_date?: string
  readonly end_date?: string | null
  readonly description?: string | null
}

export interface SeasonActivateResponse {
  readonly success: boolean
  readonly season: Season
  readonly remaining_seasons: number
  readonly used_trial: boolean
}

/**
 * Helper to check if a season can be set as current
 */
export function canSetAsCurrent(season: Season): boolean {
  return season.activation_status === 'activated'
}

/**
 * Helper to check if a season can be activated
 */
export function canActivate(season: Season): boolean {
  return season.activation_status === 'draft'
}

/**
 * Get human-readable activation status label
 */
export function getActivationStatusLabel(status: ActivationStatus): string {
  switch (status) {
    case 'draft':
      return '草稿'
    case 'activated':
      return '已啟用'
    case 'completed':
      return '已結束'
  }
}

/**
 * Get activation status color for UI
 */
export function getActivationStatusColor(
  status: ActivationStatus
): 'gray' | 'green' | 'blue' {
  switch (status) {
    case 'draft':
      return 'gray'
    case 'activated':
      return 'green'
    case 'completed':
      return 'blue'
  }
}

// Legacy alias for backward compatibility
export const isSeasonActive = (season: Season): boolean => season.is_current
