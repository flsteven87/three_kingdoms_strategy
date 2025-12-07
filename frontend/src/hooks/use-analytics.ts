/**
 * Analytics Query Hooks
 *
 * TanStack Query hooks for member performance analytics.
 * Follows CLAUDE.md:
 * - Query key factory pattern
 * - Type-safe hooks
 * - Proper staleTime configuration
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'

// Query Keys Factory
export const analyticsKeys = {
  all: ['analytics'] as const,

  // Members list
  members: () => [...analyticsKeys.all, 'members'] as const,
  membersList: (seasonId: string, activeOnly: boolean) =>
    [...analyticsKeys.members(), { seasonId, activeOnly }] as const,

  // Member trend
  trends: () => [...analyticsKeys.all, 'trend'] as const,
  memberTrend: (memberId: string, seasonId: string) =>
    [...analyticsKeys.trends(), memberId, seasonId] as const,

  // Member summary
  summaries: () => [...analyticsKeys.all, 'summary'] as const,
  memberSummary: (memberId: string, seasonId: string) =>
    [...analyticsKeys.summaries(), memberId, seasonId] as const,

  // Period averages
  periodAverages: () => [...analyticsKeys.all, 'period-averages'] as const,
  periodAverage: (periodId: string) => [...analyticsKeys.periodAverages(), periodId] as const,

  // Alliance trend
  allianceTrend: (seasonId: string) => [...analyticsKeys.all, 'alliance-trend', seasonId] as const
}

/**
 * Hook to fetch members list for analytics selector
 */
export function useAnalyticsMembers(seasonId: string | undefined, activeOnly: boolean = true) {
  return useQuery({
    queryKey: analyticsKeys.membersList(seasonId ?? '', activeOnly),
    queryFn: () => apiClient.getAnalyticsMembers(seasonId!, activeOnly),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}

/**
 * Hook to fetch member's performance trend across all periods
 */
export function useMemberTrend(memberId: string | undefined, seasonId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.memberTrend(memberId ?? '', seasonId ?? ''),
    queryFn: () => apiClient.getMemberTrend(memberId!, seasonId!),
    enabled: !!memberId && !!seasonId,
    staleTime: 2 * 60 * 1000 // 2 minutes - trend data may change more frequently
  })
}

/**
 * Hook to fetch member's season summary
 */
export function useMemberSeasonSummary(memberId: string | undefined, seasonId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.memberSummary(memberId ?? '', seasonId ?? ''),
    queryFn: () => apiClient.getMemberSeasonSummary(memberId!, seasonId!),
    enabled: !!memberId && !!seasonId,
    staleTime: 2 * 60 * 1000
  })
}

/**
 * Hook to fetch period averages
 */
export function usePeriodAverages(periodId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.periodAverage(periodId ?? ''),
    queryFn: () => apiClient.getPeriodAverages(periodId!),
    enabled: !!periodId,
    staleTime: 5 * 60 * 1000
  })
}

/**
 * Hook to fetch alliance trend for all periods in a season
 */
export function useAllianceTrend(seasonId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.allianceTrend(seasonId ?? ''),
    queryFn: () => apiClient.getAllianceTrend(seasonId!),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000
  })
}
