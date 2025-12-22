/**
 * Alliance Query Hooks
 *
 * 符合 CLAUDE.md 🟡:
 * - TanStack Query for server state
 * - Type-safe hooks
 * - Optimistic updates for mutations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { Alliance, AllianceCreate, AllianceUpdate } from '@/types/alliance'

// Query Keys Factory
export const allianceKeys = {
  all: ['alliance'] as const,
  detail: () => [...allianceKeys.all, 'detail'] as const
}

/**
 * Hook to fetch current user's alliance
 *
 * Returns null if user has no alliance
 */
export function useAlliance() {
  return useQuery({
    queryKey: allianceKeys.detail(),
    queryFn: () => apiClient.getAlliance(),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}

/**
 * Hook to create alliance
 *
 * Automatically updates cache on success
 */
export function useCreateAlliance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: AllianceCreate) => apiClient.createAlliance(data),
    onSuccess: (newAlliance) => {
      queryClient.setQueryData(allianceKeys.detail(), newAlliance)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: allianceKeys.all })
    }
  })
}

/**
 * Hook to update alliance
 *
 * Optimistic updates enabled
 */
export function useUpdateAlliance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: AllianceUpdate) => apiClient.updateAlliance(data),
    onMutate: async (updatedData) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: allianceKeys.detail() })

      // Snapshot previous value
      const previousAlliance = queryClient.getQueryData<Alliance>(allianceKeys.detail())

      // Optimistically update cache
      if (previousAlliance) {
        queryClient.setQueryData(allianceKeys.detail(), {
          ...previousAlliance,
          ...updatedData
        })
      }

      return { previousAlliance }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousAlliance) {
        queryClient.setQueryData(allianceKeys.detail(), context.previousAlliance)
      }
    },
    onSettled: () => {
      // Refetch after mutation
      queryClient.invalidateQueries({ queryKey: allianceKeys.detail() })
    }
  })
}

/**
 * Hook to delete alliance
 */
export function useDeleteAlliance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => apiClient.deleteAlliance(),
    onSuccess: () => {
      queryClient.setQueryData(allianceKeys.detail(), null)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: allianceKeys.all })
    }
  })
}
