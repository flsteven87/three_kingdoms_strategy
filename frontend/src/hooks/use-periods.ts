/**
 * Period Query Hooks
 *
 * Hooks for managing period-based analytics data
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { invalidateSeasonDerivedData } from "@/lib/query-invalidation";

/**
 * Hook to recalculate all periods for a specific season
 *
 * This will:
 * 1. Delete all existing periods and metrics for this season
 * 2. Recalculate based on current CSV uploads
 */
export function useRecalculateSeasonPeriods(seasonId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.recalculateSeasonPeriods(seasonId),
    onSettled: () => {
      invalidateSeasonDerivedData(queryClient, seasonId);
    },
  });
}
