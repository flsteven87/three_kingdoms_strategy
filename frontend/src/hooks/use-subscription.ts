/**
 * Subscription Query Hooks - Season Purchase System
 *
 * 符合 CLAUDE.md 🟡:
 * - TanStack Query for server state
 * - Type-safe hooks
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { SubscriptionWarningLevel } from '@/types/subscription'
import {
  getSubscriptionWarningLevel,
  getSubscriptionWarningMessage,
} from '@/types/subscription'

// Query Keys Factory
export const subscriptionKeys = {
  all: ['subscription'] as const,
  status: () => [...subscriptionKeys.all, 'status'] as const,
}

/**
 * Hook to fetch current user's subscription status
 */
export function useSubscription() {
  return useQuery({
    queryKey: subscriptionKeys.status(),
    queryFn: () => apiClient.getSubscriptionStatus(),
    staleTime: 60 * 1000, // 1 minute - subscription status doesn't change often
    retry: 1, // Only retry once for subscription checks
  })
}

/**
 * Hook to check if user can perform write operations
 *
 * Returns true if trial/subscription is active
 */
export function useCanWrite(): boolean {
  const { data } = useSubscription()
  return data?.is_active ?? false
}

/**
 * Hook to check if user can activate a new season
 */
export function useCanActivateSeason(): boolean {
  const { data } = useSubscription()
  return data?.can_activate_season ?? false
}

/**
 * Hook to get available seasons count
 */
export function useAvailableSeasons(): number {
  const { data } = useSubscription()
  return data?.available_seasons ?? 0
}

/**
 * Hook to get subscription warning information
 *
 * Returns warning level and message for UI display
 */
export function useSubscriptionWarning(): {
  level: SubscriptionWarningLevel
  message: string | null
  isExpired: boolean
  trialDaysRemaining: number | null
  availableSeasons: number
} {
  const { data } = useSubscription()

  if (!data) {
    return {
      level: 'none',
      message: null,
      isExpired: false,
      trialDaysRemaining: null,
      availableSeasons: 0,
    }
  }

  const level = getSubscriptionWarningLevel(data)
  const message = getSubscriptionWarningMessage(data)
  const isExpired = !data.is_active

  return {
    level,
    message,
    isExpired,
    trialDaysRemaining: data.trial_days_remaining,
    availableSeasons: data.available_seasons,
  }
}

/**
 * Hook to get subscription status for display
 *
 * Returns formatted subscription information for UI
 */
export function useSubscriptionDisplay(): {
  status: string
  statusColor: 'green' | 'yellow' | 'red' | 'gray'
  trialDaysRemaining: number | null
  availableSeasons: number
  canActivate: boolean
} {
  const { data } = useSubscription()

  if (!data) {
    return {
      status: '載入中...',
      statusColor: 'gray',
      trialDaysRemaining: null,
      availableSeasons: 0,
      canActivate: false,
    }
  }

  let status: string
  let statusColor: 'green' | 'yellow' | 'red' | 'gray'

  if (data.is_active) {
    if (data.is_trial_active) {
      status = `試用中 (${data.trial_days_remaining} 天)`
      statusColor =
        data.trial_days_remaining !== null && data.trial_days_remaining <= 3
          ? 'yellow'
          : 'green'
    } else if (data.available_seasons > 0) {
      status = `可用 ${data.available_seasons} 季`
      statusColor = 'green'
    } else {
      status = '已訂閱'
      statusColor = 'green'
    }
  } else {
    status = data.is_trial ? '試用已過期' : '已過期'
    statusColor = 'red'
  }

  return {
    status,
    statusColor,
    trialDaysRemaining: data.trial_days_remaining,
    availableSeasons: data.available_seasons,
    canActivate: data.can_activate_season,
  }
}

// Legacy alias for backward compatibility
export function useTrialWarning() {
  const warning = useSubscriptionWarning()
  return {
    level: warning.level,
    daysRemaining: warning.trialDaysRemaining,
    isExpired: warning.isExpired,
    message: warning.message,
  }
}
