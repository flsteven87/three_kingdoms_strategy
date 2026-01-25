/**
 * Season Quota API Types - Season-Based Trial System
 *
 * Trial system is now based on Season activation, not Alliance creation.
 * - Trial available: No activated/completed seasons exist
 * - Can activate: has_trial_available OR available_seasons > 0
 * - Can write: purchased_seasons > 0 OR (current_season.is_trial AND within 14 days)
 */

export interface SeasonQuotaStatus {
  // Purchase information
  readonly purchased_seasons: number
  readonly used_seasons: number
  readonly available_seasons: number

  // Trial information (from current season)
  readonly has_trial_available: boolean
  readonly current_season_is_trial: boolean
  readonly trial_days_remaining: number | null
  readonly trial_ends_at: string | null

  // Capabilities
  readonly can_activate_season: boolean
  readonly can_write: boolean
}

export type QuotaWarningLevel = 'none' | 'warning' | 'critical' | 'expired'

export function getQuotaWarningLevel(
  status: SeasonQuotaStatus | null | undefined
): QuotaWarningLevel {
  if (!status) return 'none'

  // Can't write = expired
  if (!status.can_write && !status.can_activate_season) return 'expired'

  // Check trial warnings for current season
  if (status.current_season_is_trial && status.trial_days_remaining !== null) {
    if (status.trial_days_remaining <= 0) return 'expired'
    if (status.trial_days_remaining <= 3) return 'critical'
    if (status.trial_days_remaining <= 7) return 'warning'
  }

  return 'none'
}

export function getQuotaWarningMessage(
  status: SeasonQuotaStatus | null | undefined
): string | null {
  if (!status) return null

  const level = getQuotaWarningLevel(status)

  switch (level) {
    case 'expired':
      if (status.current_season_is_trial) {
        return '試用期已結束，歡迎購買賽季繼續使用'
      }
      return '目前沒有可用賽季，歡迎購買以繼續使用'

    case 'critical':
    case 'warning':
      return `試用期剩餘 ${status.trial_days_remaining} 天`

    default:
      return null
  }
}
