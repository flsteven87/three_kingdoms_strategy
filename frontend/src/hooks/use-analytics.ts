/**
 * Analytics Query Hooks
 *
 * TanStack Query hooks for member performance analytics.
 * Follows CLAUDE.md:
 * - Query key factory pattern
 * - Type-safe hooks
 * - Proper staleTime configuration
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { analyticsKeys } from "@/lib/query-keys";

/**
 * Hook to fetch members list for analytics selector
 */
export function useAnalyticsMembers(
  seasonId: string | undefined,
  activeOnly: boolean = true,
) {
  return useQuery({
    queryKey: analyticsKeys.membersList(seasonId ?? "", activeOnly),
    queryFn: () => apiClient.getAnalyticsMembers(seasonId!, activeOnly),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to fetch member's performance trend across all periods
 */
export function useMemberTrend(
  memberId: string | undefined,
  seasonId: string | undefined,
) {
  return useQuery({
    queryKey: analyticsKeys.memberTrend(memberId ?? "", seasonId ?? ""),
    queryFn: () => apiClient.getMemberTrend(memberId!, seasonId!),
    enabled: !!memberId && !!seasonId,
    staleTime: 2 * 60 * 1000, // 2 minutes - trend data may change more frequently
  });
}

/**
 * Hook to fetch member's season summary
 */
export function useMemberSeasonSummary(
  memberId: string | undefined,
  seasonId: string | undefined,
) {
  return useQuery({
    queryKey: analyticsKeys.memberSummary(memberId ?? "", seasonId ?? ""),
    queryFn: () => apiClient.getMemberSeasonSummary(memberId!, seasonId!),
    enabled: !!memberId && !!seasonId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Hook to fetch period averages
 */
export function usePeriodAverages(periodId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.periodAverage(periodId ?? ""),
    queryFn: () => apiClient.getPeriodAverages(periodId!),
    enabled: !!periodId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch alliance trend for all periods in a season
 */
export function useAllianceTrend(seasonId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.allianceTrend(seasonId ?? ""),
    queryFn: () => apiClient.getAllianceTrend(seasonId!),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch season-to-date alliance averages and medians.
 * Used for "賽季以來" view mode comparison baseline.
 */
export function useSeasonAverages(seasonId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.seasonAverages(seasonId ?? ""),
    queryFn: () => apiClient.getSeasonAverages(seasonId!),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Group Analytics Hooks
// =============================================================================

/**
 * Hook to fetch list of all groups with member counts
 */
export function useGroups(seasonId: string | undefined) {
  return useQuery({
    queryKey: analyticsKeys.groupsList(seasonId ?? ""),
    queryFn: () => apiClient.getGroups(seasonId!),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to fetch complete analytics for a specific group
 */
export function useGroupAnalytics(
  groupName: string | undefined,
  seasonId: string | undefined,
  view: "latest" | "season" = "latest",
) {
  return useQuery({
    queryKey: analyticsKeys.groupAnalytics(
      groupName ?? "",
      seasonId ?? "",
      view,
    ),
    queryFn: () => apiClient.getGroupAnalytics(groupName!, seasonId!, view),
    enabled: !!groupName && !!seasonId,
    staleTime: 2 * 60 * 1000, // 2 minutes - group data may change frequently
  });
}

/**
 * Hook to fetch comparison data for all groups
 */
export function useGroupsComparison(
  seasonId: string | undefined,
  view: "latest" | "season" = "latest",
) {
  return useQuery({
    queryKey: analyticsKeys.groupsComparison(seasonId ?? "", view),
    queryFn: () => apiClient.getGroupsComparison(seasonId!, view),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000,
  });
}

// =============================================================================
// Alliance Analytics Hooks
// =============================================================================

const ALLIANCE_ANALYTICS_STALE_TIME = 2 * 60 * 1000; // 2 minutes

/**
 * Hook to fetch complete alliance analytics for AllianceAnalytics page.
 *
 * Performance optimization: Prefetches the alternate view mode in the background
 * so switching between 'latest' and 'season' views is instant.
 */
export function useAllianceAnalytics(
  seasonId: string | undefined,
  view: "latest" | "season" = "latest",
) {
  const queryClient = useQueryClient();

  // Prefetch the alternate view in background for instant switching
  useEffect(() => {
    if (!seasonId) return;

    const alternateView = view === "latest" ? "season" : "latest";

    // Prefetch with low priority - won't block the main query
    queryClient.prefetchQuery({
      queryKey: analyticsKeys.allianceAnalytics(seasonId, alternateView),
      queryFn: () => apiClient.getAllianceAnalytics(seasonId, alternateView),
      staleTime: ALLIANCE_ANALYTICS_STALE_TIME,
    });
  }, [seasonId, view, queryClient]);

  return useQuery({
    queryKey: analyticsKeys.allianceAnalytics(seasonId ?? "", view),
    queryFn: () => apiClient.getAllianceAnalytics(seasonId!, view),
    enabled: !!seasonId,
    staleTime: ALLIANCE_ANALYTICS_STALE_TIME,
  });
}
