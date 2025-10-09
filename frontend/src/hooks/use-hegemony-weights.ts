/**
 * Hegemony Weights TanStack Query Hooks
 *
 * 符合 CLAUDE.md 🟡:
 * - Use TanStack Query for server state
 * - Hierarchical query keys
 * - Type-safe hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type {
  HegemonyWeightCreate,
  HegemonyWeightUpdate,
  HegemonyWeightWithSnapshot
} from '@/types/hegemony-weight'

// ==================== Query Keys ====================

export const hegemonyWeightKeys = {
  all: ['hegemony-weights'] as const,
  lists: () => [...hegemonyWeightKeys.all, 'list'] as const,
  list: (seasonId: string) => [...hegemonyWeightKeys.lists(), seasonId] as const,
  summaries: () => [...hegemonyWeightKeys.all, 'summary'] as const,
  summary: (seasonId: string) => [...hegemonyWeightKeys.summaries(), seasonId] as const,
  previews: () => [...hegemonyWeightKeys.all, 'preview'] as const,
  preview: (seasonId: string, limit: number) =>
    [...hegemonyWeightKeys.previews(), seasonId, limit] as const
}

// ==================== Query Hooks ====================

/**
 * Get all hegemony weight configurations for a season
 */
export function useHegemonyWeights(seasonId: string | null) {
  return useQuery({
    queryKey: hegemonyWeightKeys.list(seasonId || ''),
    queryFn: () => apiClient.getHegemonyWeights(seasonId!),
    enabled: !!seasonId
  })
}

/**
 * Get summary of all snapshot weights for a season
 */
export function useHegemonyWeightsSummary(seasonId: string | null) {
  return useQuery({
    queryKey: hegemonyWeightKeys.summary(seasonId || ''),
    queryFn: () => apiClient.getHegemonyWeightsSummary(seasonId!),
    enabled: !!seasonId
  })
}

/**
 * Preview hegemony scores for top members
 */
export function useHegemonyScoresPreview(seasonId: string | null, limit: number = 10) {
  return useQuery({
    queryKey: hegemonyWeightKeys.preview(seasonId || '', limit),
    queryFn: () => apiClient.previewHegemonyScores(seasonId!, limit),
    enabled: !!seasonId
  })
}

// ==================== Mutation Hooks ====================

/**
 * Initialize default hegemony weights for a season
 */
export function useInitializeHegemonyWeights() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (seasonId: string) => apiClient.initializeHegemonyWeights(seasonId),
    onSuccess: (_data, seasonId) => {
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.list(seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.summary(seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.previews() })
    }
  })
}

/**
 * Create a new hegemony weight configuration
 */
export function useCreateHegemonyWeight() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ seasonId, data }: { seasonId: string; data: HegemonyWeightCreate }) =>
      apiClient.createHegemonyWeight(seasonId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.list(variables.seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.summary(variables.seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.previews() })
    }
  })
}

/**
 * Update hegemony weight configuration
 */
export function useUpdateHegemonyWeight() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      weightId,
      data
    }: {
      weightId: string
      seasonId: string
      data: HegemonyWeightUpdate
    }) => apiClient.updateHegemonyWeight(weightId, data),
    onMutate: async ({ weightId, data, seasonId }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: hegemonyWeightKeys.list(seasonId) })

      // Snapshot previous value
      const previousWeights = queryClient.getQueryData<HegemonyWeightWithSnapshot[]>(
        hegemonyWeightKeys.list(seasonId)
      )

      // Optimistically update
      if (previousWeights) {
        queryClient.setQueryData<HegemonyWeightWithSnapshot[]>(
          hegemonyWeightKeys.list(seasonId),
          previousWeights.map((weight) =>
            weight.id === weightId ? { ...weight, ...data } : weight
          )
        )
      }

      return { previousWeights, seasonId }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousWeights) {
        queryClient.setQueryData(
          hegemonyWeightKeys.list(context.seasonId),
          context.previousWeights
        )
      }
    },
    onSettled: (_data, _error, variables) => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.list(variables.seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.summary(variables.seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.previews() })
    }
  })
}

/**
 * Delete hegemony weight configuration
 */
export function useDeleteHegemonyWeight() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ weightId }: { weightId: string; seasonId: string }) =>
      apiClient.deleteHegemonyWeight(weightId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.list(variables.seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.summary(variables.seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.previews() })
    }
  })
}

/**
 * Batch update multiple hegemony weights
 * Useful for updating all snapshots at once
 */
export function useBatchUpdateHegemonyWeights() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      updates
    }: {
      seasonId: string
      updates: Array<{ weightId: string; data: HegemonyWeightUpdate }>
    }) => {
      // Execute all updates in parallel
      const promises = updates.map(({ weightId, data }) =>
        apiClient.updateHegemonyWeight(weightId, data)
      )
      return Promise.all(promises)
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.list(variables.seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.summary(variables.seasonId) })
      queryClient.invalidateQueries({ queryKey: hegemonyWeightKeys.previews() })
    }
  })
}
