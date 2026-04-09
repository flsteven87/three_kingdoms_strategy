/**
 * Season Quota Query Hooks
 *
 * Provides hooks for managing season quota status (trial + purchased seasons).
 * Trial system is Season-based: trial starts when user activates their first season.
 *
 * 符合 CLAUDE.md 🟡:
 * - TanStack Query for server state
 * - Type-safe hooks with explicit return types
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { QuotaWarningLevel } from '@/types/season-quota'
import { getQuotaWarningLevel, getQuotaWarningMessage } from '@/types/season-quota'

// Query Keys Factory
export const seasonQuotaKeys = {
  all: ['season-quota'] as const,
  status: () => [...seasonQuotaKeys.all, 'status'] as const,
}

interface UseSeasonQuotaOptions {
  /**
   * Poll the quota endpoint at this interval (ms). Used by the purchase
   * flow to watch for webhook-driven grant updates. Default: no polling.
   */
  readonly refetchInterval?: number | false
}

/**
 * Hook to fetch current user's season quota status
 */
export function useSeasonQuota(options?: UseSeasonQuotaOptions) {
  return useQuery({
    queryKey: seasonQuotaKeys.status(),
    queryFn: () => apiClient.getSeasonQuotaStatus(),
    staleTime: 60 * 1000, // 1 minute - quota status doesn't change often
    retry: 1, // Only retry once for quota checks
    refetchInterval: options?.refetchInterval,
  })
}

/**
 * Hook to check if user can activate a new season
 */
export function useCanActivateSeason(): boolean {
  const { data } = useSeasonQuota()
  return data?.can_activate_season ?? false
}

/**
 * Hook to get available seasons count
 */
export function useAvailableSeasons(): number {
  const { data } = useSeasonQuota()
  return data?.available_seasons ?? 0
}

/**
 * Hook to get quota warning information
 *
 * Returns warning level and message for UI display
 */
export function useQuotaWarning(): {
  level: QuotaWarningLevel
  message: string | null
  isExpired: boolean
  trialDaysRemaining: number | null
  availableSeasons: number
} {
  const { data } = useSeasonQuota()

  if (!data) {
    return {
      level: 'none',
      message: null,
      isExpired: false,
      trialDaysRemaining: null,
      availableSeasons: 0,
    }
  }

  const level = getQuotaWarningLevel(data)
  const message = getQuotaWarningMessage(data)
  const isExpired = !data.can_write && !data.can_activate_season

  return {
    level,
    message,
    isExpired,
    trialDaysRemaining: data.trial_days_remaining,
    availableSeasons: data.available_seasons,
  }
}

/**
 * Hook to get season quota status for display
 *
 * Returns formatted quota information for UI
 */
export function useSeasonQuotaDisplay(): {
  status: string
  statusColor: 'green' | 'yellow' | 'red' | 'gray'
  trialDaysRemaining: number | null
  availableSeasons: number
  canActivate: boolean
  canWrite: boolean
  hasTrialAvailable: boolean
} {
  const { data } = useSeasonQuota()

  if (!data) {
    return {
      status: '載入中...',
      statusColor: 'gray',
      trialDaysRemaining: null,
      availableSeasons: 0,
      canActivate: false,
      canWrite: false,
      hasTrialAvailable: false,
    }
  }

  let status: string
  let statusColor: 'green' | 'yellow' | 'red' | 'gray'

  if (data.can_activate_season || data.can_write) {
    if (data.has_trial_available) {
      status = '可免費試用'
      statusColor = 'green'
    } else if (data.current_season_is_trial && data.trial_days_remaining !== null) {
      status = `試用中 (${data.trial_days_remaining} 天)`
      statusColor = data.trial_days_remaining <= 3 ? 'yellow' : 'green'
    } else if (data.available_seasons > 0) {
      status = `剩餘 ${data.available_seasons} 季`
      statusColor = 'green'
    } else {
      status = '可使用'
      statusColor = 'green'
    }
  } else {
    status = data.current_season_is_trial ? '試用已過期' : '需購買賽季'
    statusColor = 'red'
  }

  return {
    status,
    statusColor,
    trialDaysRemaining: data.trial_days_remaining,
    availableSeasons: data.available_seasons,
    canActivate: data.can_activate_season,
    canWrite: data.can_write,
    hasTrialAvailable: data.has_trial_available,
  }
}
