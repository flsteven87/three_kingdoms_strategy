/**
 * Period Query Hooks
 *
 * Hooks for managing period-based analytics data
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { csvUploadKeys } from './use-csv-uploads'

// Query Keys Factory
export const periodKeys = {
  all: ['periods'] as const,
  lists: () => [...periodKeys.all, 'list'] as const,
  list: (seasonId: string) => [...periodKeys.lists(), { seasonId }] as const,
  details: () => [...periodKeys.all, 'detail'] as const,
  detail: (id: string) => [...periodKeys.details(), id] as const,
  metrics: (periodId: string) => [...periodKeys.all, 'metrics', periodId] as const
}

/**
 * Hook to recalculate all periods for a specific season
 *
 * This will:
 * 1. Delete all existing periods and metrics for this season
 * 2. Recalculate based on current CSV uploads
 */
export function useRecalculateSeasonPeriods(seasonId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiClient.recalculateSeasonPeriods(seasonId),
    onSuccess: () => {
      // Invalidate period queries for this season
      queryClient.invalidateQueries({ queryKey: periodKeys.list(seasonId) })
      // Also invalidate csv uploads for this season
      queryClient.invalidateQueries({ queryKey: csvUploadKeys.list(seasonId) })
    }
  })
}
