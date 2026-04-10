/**
 * Season Quota API Types - Season-Based Trial System
 *
 * Trial system is now based on Season activation, not Alliance creation.
 * - Trial available: No activated/completed seasons exist
 * - Can activate: has_trial_available OR available_seasons > 0
 * - Can write: purchased_seasons > 0 OR (current_season.is_trial AND within 14 days)
 *
 * Display logic is centralized in getQuotaDisplayState() — all UI consumers
 * (badge, banner, settings, purchase page) derive text from this one function.
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

export type QuotaPhase =
  | 'loading'
  | 'trial_available'
  | 'trial_active'
  | 'trial_warning'
  | 'trial_critical'
  | 'trial_expired'
  | 'has_quota'
  | 'active'
  | 'quota_exhausted'

export interface QuotaDisplayState {
  readonly phase: QuotaPhase
  // Badge (Seasons page header)
  readonly badgeText: string
  readonly badgeColor: 'green' | 'yellow' | 'red' | 'gray'
  // Banner (global warning)
  readonly bannerMessage: string | null
  readonly bannerLevel: QuotaWarningLevel
  // Settings page
  readonly settingsLabel: string
  // Capabilities
  readonly canActivate: boolean
  readonly canWrite: boolean
  readonly showPurchaseLink: boolean
  // Raw data pass-through
  readonly trialDaysRemaining: number | null
  readonly availableSeasons: number
  readonly hasTrialAvailable: boolean
}

const LOADING_STATE: QuotaDisplayState = {
  phase: 'loading',
  badgeText: '載入中...',
  badgeColor: 'gray',
  bannerMessage: null,
  bannerLevel: 'none',
  settingsLabel: '載入中...',
  canActivate: false,
  canWrite: false,
  showPurchaseLink: false,
  trialDaysRemaining: null,
  availableSeasons: 0,
  hasTrialAvailable: false,
}

/**
 * Single source of truth for quota display logic.
 *
 * Maps raw SeasonQuotaStatus to a rich display object used by all UI
 * consumers: badge, banner, settings page, and purchase page.
 */
export function getQuotaDisplayState(
  status: SeasonQuotaStatus | null | undefined
): QuotaDisplayState {
  if (!status) return LOADING_STATE

  const {
    can_write, can_activate_season, has_trial_available,
    current_season_is_trial, trial_days_remaining,
    purchased_seasons, available_seasons,
  } = status

  // Trial not yet started
  if (has_trial_available) {
    return {
      phase: 'trial_available',
      badgeText: '可免費試用',
      badgeColor: 'green',
      bannerMessage: null,
      bannerLevel: 'none',
      settingsLabel: '免費試用（啟用賽季後開始 14 天倒數）',
      canActivate: can_activate_season,
      canWrite: can_write,
      showPurchaseLink: false,
      trialDaysRemaining: null,
      availableSeasons: available_seasons,
      hasTrialAvailable: true,
    }
  }

  // Trial in progress — ordered: critical (≤3d) → warning (≤7d) → active (>7d)
  if (current_season_is_trial && trial_days_remaining !== null && trial_days_remaining > 0) {
    let phase: QuotaPhase
    let badgeColor: 'green' | 'yellow' | 'red'
    let bannerMessage: string | null = null
    let bannerLevel: QuotaWarningLevel = 'none'

    if (trial_days_remaining <= 3) {
      phase = 'trial_critical'
      badgeColor = 'red'
      bannerMessage = `試用期剩餘 ${trial_days_remaining} 天，購買後自動升級為正式版`
      bannerLevel = 'critical'
    } else if (trial_days_remaining <= 7) {
      phase = 'trial_warning'
      badgeColor = 'yellow'
      bannerMessage = `試用期剩餘 ${trial_days_remaining} 天，購買後自動升級為正式版`
      bannerLevel = 'warning'
    } else {
      phase = 'trial_active'
      badgeColor = 'green'
    }

    return {
      phase,
      badgeText: `試用 ${trial_days_remaining} 天`,
      badgeColor,
      bannerMessage,
      bannerLevel,
      settingsLabel: `試用中，剩餘 ${trial_days_remaining} 天`,
      canActivate: can_activate_season,
      canWrite: can_write,
      showPurchaseLink: false,
      trialDaysRemaining: trial_days_remaining,
      availableSeasons: available_seasons,
      hasTrialAvailable: false,
    }
  }

  // Trial expired
  if (!can_write && !can_activate_season && current_season_is_trial) {
    return {
      phase: 'trial_expired',
      badgeText: '試用已過期',
      badgeColor: 'red',
      bannerMessage: '試用期已結束，購買後自動升級為正式版',
      bannerLevel: 'expired',
      settingsLabel: '試用期已結束',
      canActivate: false,
      canWrite: false,
      showPurchaseLink: true,
      trialDaysRemaining: 0,
      availableSeasons: 0,
      hasTrialAvailable: false,
    }
  }

  // Has purchased quota available
  if (available_seasons > 0) {
    return {
      phase: 'has_quota',
      badgeText: `剩餘 ${available_seasons} 季`,
      badgeColor: 'green',
      bannerMessage: null,
      bannerLevel: 'none',
      settingsLabel: `已購買 ${purchased_seasons} 季，剩餘 ${available_seasons} 季可用`,
      canActivate: can_activate_season,
      canWrite: can_write,
      showPurchaseLink: false,
      trialDaysRemaining: null,
      availableSeasons: available_seasons,
      hasTrialAvailable: false,
    }
  }

  // Active season, no remaining quota (e.g. post-conversion: bought 1, used 1)
  if (can_write) {
    return {
      phase: 'active',
      badgeText: '使用中',
      badgeColor: 'green',
      bannerMessage: null,
      bannerLevel: 'none',
      settingsLabel: purchased_seasons > 0
        ? `已購買 ${purchased_seasons} 季，使用中`
        : '使用中',
      canActivate: can_activate_season,
      canWrite: true,
      showPurchaseLink: false,
      trialDaysRemaining: null,
      availableSeasons: 0,
      hasTrialAvailable: false,
    }
  }

  // Can activate but can't write current season (e.g. completed season, trial available via edge case)
  if (can_activate_season) {
    return {
      phase: 'active',
      badgeText: '可啟用',
      badgeColor: 'green',
      bannerMessage: null,
      bannerLevel: 'none',
      settingsLabel: purchased_seasons > 0
        ? `已購買 ${purchased_seasons} 季，使用中`
        : '可啟用新賽季',
      canActivate: true,
      canWrite: false,
      showPurchaseLink: false,
      trialDaysRemaining: null,
      availableSeasons: 0,
      hasTrialAvailable: false,
    }
  }

  // No access, no trial — fully exhausted
  return {
    phase: 'quota_exhausted',
    badgeText: '需購買',
    badgeColor: 'red',
    bannerMessage: '賽季額度已用完，購買後可繼續使用',
    bannerLevel: 'expired',
    settingsLabel: '額度已用完',
    canActivate: false,
    canWrite: false,
    showPurchaseLink: true,
    trialDaysRemaining: null,
    availableSeasons: 0,
    hasTrialAvailable: false,
  }
}
