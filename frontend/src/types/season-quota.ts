/**
 * Season Quota API Types
 *
 * 符合 CLAUDE.md 🟡: snake_case naming matching backend schema
 */

export interface SeasonQuotaStatus {
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
        return '您的 14 天試用期已結束，請購買季數以繼續使用。'
      }
      return '您的可用季數已用完，請購買季數以繼續使用。'

    case 'critical':
      return `試用期即將結束！還剩 ${status.trial_days_remaining} 天。`

    case 'warning':
      return `試用期還剩 ${status.trial_days_remaining} 天，請考慮購買季數。`

    default:
      return null
  }
}
