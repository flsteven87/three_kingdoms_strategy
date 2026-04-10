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
import { getQuotaDisplayState, type QuotaWarningLevel } from '@/types/season-quota'

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
  const display = getQuotaDisplayState(data)

  return {
    level: display.bannerLevel,
    message: display.bannerMessage,
    isExpired: !display.canWrite && !display.canActivate,
    trialDaysRemaining: display.trialDaysRemaining,
    availableSeasons: display.availableSeasons,
  }
}

