/**
 * Season Quota API Types
 *
 * 符合 CLAUDE.md 🟡: snake_case naming matching backend schema
 */

export interface SeasonQuotaStatus {
  // Overall status
  readonly status: 'trial' | 'active' | 'expired'
  readonly is_active: boolean
  readonly is_trial: boolean

  // Trial information
  readonly is_trial_active: boolean
  readonly trial_days_remaining: number | null
  readonly trial_ends_at: string | null

  // Season quota information
  readonly purchased_seasons: number
  readonly used_seasons: number
  readonly available_seasons: number

  // Activation capability
  readonly can_activate_season: boolean
}

/**
 * Helper type for quota warning levels
 */
export type QuotaWarningLevel = 'none' | 'warning' | 'critical' | 'expired'

/**
 * Helper function to determine quota warning level
 */
export function getQuotaWarningLevel(
  status: SeasonQuotaStatus | null | undefined
): QuotaWarningLevel {
  if (!status) return 'none'

  // Expired: trial ended and no available seasons
  if (!status.can_activate_season) return 'expired'

  // Check trial warnings
  if (status.is_trial_active && status.trial_days_remaining !== null) {
    if (status.trial_days_remaining <= 0) return 'expired'
    if (status.trial_days_remaining <= 3) return 'critical'
    if (status.trial_days_remaining <= 7) return 'warning'
  }

  return 'none'
}

/**
 * Get warning message based on quota status
 */
export function getQuotaWarningMessage(
  status: SeasonQuotaStatus | null | undefined
): string | null {
  if (!status) return null

  const level = getQuotaWarningLevel(status)

  switch (level) {
    case 'expired':
      if (status.trial_days_remaining === 0) {
        return '試用期已結束，歡迎購買賽季繼續使用'
      }
      return '目前沒有可用賽季，歡迎購買以繼續使用'

    case 'critical':
      return `試用期剩餘 ${status.trial_days_remaining} 天`

    case 'warning':
      return `試用期剩餘 ${status.trial_days_remaining} 天`

    default:
      return null
  }
}
