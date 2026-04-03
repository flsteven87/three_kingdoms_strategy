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
  readonly game_season_tag: string | null
  readonly created_at: string
  readonly updated_at: string
  // Trial fields (Season-based trial system)
  readonly is_trial: boolean
  readonly activated_at: string | null
}

export interface SeasonCreate {
  readonly alliance_id: string
  readonly name: string
  readonly start_date: string
  readonly end_date?: string | null
  readonly description?: string | null
  readonly game_season_tag?: string | null
}

export interface SeasonUpdate {
  readonly name?: string
  readonly start_date?: string
  readonly end_date?: string | null
  readonly description?: string | null
  readonly game_season_tag?: string | null
}

export interface SeasonActivateResponse {
  readonly success: boolean
  readonly season: Season
  readonly remaining_seasons: number
  readonly used_trial: boolean
  readonly trial_ends_at: string | null
}

/**
 * Helper to check if a season can be set as current
 * Both activated and completed seasons can be viewed
 */
export function canSetAsCurrent(season: Season): boolean {
  return season.activation_status !== 'draft'
}

/**
 * Helper to check if a season can be activated
 */
export function canActivate(season: Season): boolean {
  return season.activation_status === 'draft'
}

/**
 * Helper to check if a season can be reopened
 */
export function canReopen(season: Season): boolean {
  return season.activation_status === 'completed'
}

/**
 * Helper to check if CSV can be uploaded to this season
 * Requires: activated status + current date within season date range
 */
export function canUploadCsv(season: Season): boolean {
  if (season.activation_status !== 'activated') {
    return false
  }

  const today = new Date().toISOString().split('T')[0]

  // Must be on or after start_date
  if (today < season.start_date) {
    return false
  }

  // If end_date exists, must be on or before end_date
  if (season.end_date && today > season.end_date) {
    return false
  }

  return true
}

/**
 * Get the reason why CSV upload is disabled
 */
export function getUploadDisabledReason(season: Season): string | null {
  if (season.activation_status === 'draft') {
    return '請先啟用賽季'
  }

  if (season.activation_status === 'completed') {
    return '此賽季已歸檔，如需上傳請先重新開啟'
  }

  const today = new Date().toISOString().split('T')[0]

  if (today < season.start_date) {
    return '賽季尚未開始'
  }

  if (season.end_date && today > season.end_date) {
    return '賽季已超過結束日期，如需上傳請先延長結束日期'
  }

  return null
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
