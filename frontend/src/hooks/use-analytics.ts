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
  allianceTrend: (seasonId: string) => [...analyticsKeys.all, 'alliance-trend', seasonId] as const,

  // Season averages (for "賽季以來" view comparison)
  seasonAverages: (seasonId: string) => [...analyticsKeys.all, 'season-averages', seasonId] as const,

  // Group analytics
  groups: () => [...analyticsKeys.all, 'groups'] as const,
  groupsList: (seasonId: string) => [...analyticsKeys.groups(), 'list', seasonId] as const,
  groupAnalytics: (groupName: string, seasonId: string, view: 'latest' | 'season' = 'latest') =>
    [...analyticsKeys.groups(), 'detail', groupName, seasonId, view] as const,
  groupsComparison: (seasonId: string, view: 'latest' | 'season' = 'latest') =>
    [...analyticsKeys.groups(), 'comparison', seasonId, view] as const,

  // Alliance analytics
  allianceAnalytics: (seasonId: string, view: 'latest' | 'season' = 'latest') =>
    [...analyticsKeys.all, 'alliance-analytics', seasonId, view] as const
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

/**
 * Hook to fetch season-to-date alliance averages and medians.
 * Used for "賽季以來" view mode comparison baseline.
 */
export function useSeasonAverages(seasonId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.seasonAverages(seasonId ?? ''),
    queryFn: () => apiClient.getSeasonAverages(seasonId!),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000
  })
}

// =============================================================================
// Group Analytics Hooks
// =============================================================================

/**
 * Hook to fetch list of all groups with member counts
 */
export function useGroups(seasonId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.groupsList(seasonId ?? ''),
    queryFn: () => apiClient.getGroups(seasonId!),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000
  })
}

/**
 * Hook to fetch complete analytics for a specific group
 */
export function useGroupAnalytics(
  groupName: string | undefined,
  seasonId: string | undefined,
  view: 'latest' | 'season' = 'latest'
) {
  return useQuery({
    queryKey: analyticsKeys.groupAnalytics(groupName ?? '', seasonId ?? '', view),
    queryFn: () => apiClient.getGroupAnalytics(groupName!, seasonId!, view),
    enabled: !!groupName && !!seasonId,
    staleTime: 2 * 60 * 1000 // 2 minutes - group data may change frequently
  })
}

/**
 * Hook to fetch comparison data for all groups
 */
export function useGroupsComparison(seasonId: string | undefined, view: 'latest' | 'season' = 'latest') {
  return useQuery({
    queryKey: analyticsKeys.groupsComparison(seasonId ?? '', view),
    queryFn: () => apiClient.getGroupsComparison(seasonId!, view),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000
  })
}

// =============================================================================
// Alliance Analytics Hooks
// =============================================================================

/**
 * Hook to fetch complete alliance analytics for AllianceAnalytics page
 */
export function useAllianceAnalytics(
  seasonId: string | undefined,
  view: 'latest' | 'season' = 'latest'
) {
  return useQuery({
    queryKey: analyticsKeys.allianceAnalytics(seasonId ?? '', view),
    queryFn: () => apiClient.getAllianceAnalytics(seasonId!, view),
    enabled: !!seasonId,
    staleTime: 2 * 60 * 1000 // 2 minutes - alliance data may change frequently
  })
}
