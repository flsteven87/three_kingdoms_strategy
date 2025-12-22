/**
 * Season Query Hooks
 *
 * 符合 CLAUDE.md 🟡:
 * - TanStack Query for server state
 * - Type-safe hooks
 * - Optimistic updates for mutations
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import type { Season, SeasonCreate, SeasonUpdate } from '@/types/season'

// Query Keys Factory
export const seasonKeys = {
  all: ['seasons'] as const,
  lists: () => [...seasonKeys.all, 'list'] as const,
  list: (activeOnly: boolean) => [...seasonKeys.lists(), { activeOnly }] as const,
  active: () => [...seasonKeys.all, 'active'] as const,
  details: () => [...seasonKeys.all, 'detail'] as const,
  detail: (id: string) => [...seasonKeys.details(), id] as const
}

/**
 * Hook to fetch all seasons
 *
 * Returns empty array if user has no alliance
 */
export function useSeasons(activeOnly: boolean = false) {
  return useQuery({
    queryKey: seasonKeys.list(activeOnly),
    queryFn: () => apiClient.getSeasons(activeOnly),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}

/**
 * Hook to fetch active season
 *
 * Returns null if no active season
 */
export function useActiveSeason() {
  return useQuery({
    queryKey: seasonKeys.active(),
    queryFn: () => apiClient.getActiveSeason(),
    staleTime: 5 * 60 * 1000
  })
}

/**
 * Hook to fetch specific season
 */
export function useSeason(seasonId: string) {
  return useQuery({
    queryKey: seasonKeys.detail(seasonId),
    queryFn: () => apiClient.getSeason(seasonId),
    enabled: !!seasonId,
    staleTime: 5 * 60 * 1000
  })
}

/**
 * Hook to create season
 *
 * Automatically updates cache on success
 */
export function useCreateSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SeasonCreate) => apiClient.createSeason(data),
    onSuccess: (newSeason) => {
      queryClient.invalidateQueries({ queryKey: seasonKeys.lists() })
      if (newSeason.is_active) {
        queryClient.invalidateQueries({ queryKey: seasonKeys.active() })
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: seasonKeys.all })
    }
  })
}

/**
 * Hook to update season
 *
 * Optimistic updates enabled for both detail and list queries
 */
export function useUpdateSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ seasonId, data }: { seasonId: string; data: SeasonUpdate }) =>
      apiClient.updateSeason(seasonId, data),
    onMutate: async ({ seasonId, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: seasonKeys.all })

      // Snapshot previous values
      const previousSeasons = queryClient.getQueryData<Season[]>(seasonKeys.list(false))
      const previousSeason = queryClient.getQueryData<Season>(seasonKeys.detail(seasonId))

      // Optimistically update season list
      if (previousSeasons) {
        queryClient.setQueryData<Season[]>(
          seasonKeys.list(false),
          previousSeasons.map(season =>
            season.id === seasonId
              ? { ...season, ...data, updated_at: new Date().toISOString() }
              : season
          )
        )
      }

      // Optimistically update detail cache
      if (previousSeason) {
        queryClient.setQueryData(seasonKeys.detail(seasonId), {
          ...previousSeason,
          ...data,
          updated_at: new Date().toISOString()
        })
      }

      return { previousSeasons, previousSeason, seasonId }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousSeasons) {
        queryClient.setQueryData(seasonKeys.list(false), context.previousSeasons)
      }
      if (context?.previousSeason && context?.seasonId) {
        queryClient.setQueryData(seasonKeys.detail(context.seasonId), context.previousSeason)
      }
    },
    onSettled: () => {
      // Refetch all season data to sync with server
      queryClient.invalidateQueries({ queryKey: seasonKeys.all })
    }
  })
}

/**
 * Hook to delete season
 *
 * Optimistic delete with rollback on error
 */
export function useDeleteSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (seasonId: string) => apiClient.deleteSeason(seasonId),
    onMutate: async (seasonId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: seasonKeys.all })

      // Snapshot previous values
      const previousSeasons = queryClient.getQueryData<Season[]>(seasonKeys.list(false))

      // Optimistically remove season from list
      if (previousSeasons) {
        queryClient.setQueryData<Season[]>(
          seasonKeys.list(false),
          previousSeasons.filter(season => season.id !== seasonId)
        )
      }

      return { previousSeasons, seasonId }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousSeasons) {
        queryClient.setQueryData(seasonKeys.list(false), context.previousSeasons)
      }
    },
    onSuccess: (_data, seasonId) => {
      // Remove season from detail cache
      queryClient.removeQueries({ queryKey: seasonKeys.detail(seasonId) })
    },
    onSettled: () => {
      // Refetch all lists to sync with server
      queryClient.invalidateQueries({ queryKey: seasonKeys.all })
    }
  })
}

/**
 * Hook to activate season
 *
 * Optimistic activation with is_active toggle for all seasons
 */
export function useActivateSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (seasonId: string) => apiClient.activateSeason(seasonId),
    onMutate: async (seasonId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: seasonKeys.all })

      // Snapshot previous values
      const previousSeasons = queryClient.getQueryData<Season[]>(seasonKeys.list(false))
      const previousActive = queryClient.getQueryData<Season | null>(seasonKeys.active())

      // Optimistically update season list (deactivate all, activate target)
      if (previousSeasons) {
        queryClient.setQueryData<Season[]>(
          seasonKeys.list(false),
          previousSeasons.map(season => ({
            ...season,
            is_active: season.id === seasonId,
            updated_at: new Date().toISOString()
          }))
        )
      }

      // Optimistically update active season
      const newActiveSeason = previousSeasons?.find(s => s.id === seasonId)
      if (newActiveSeason) {
        queryClient.setQueryData(seasonKeys.active(), {
          ...newActiveSeason,
          is_active: true,
          updated_at: new Date().toISOString()
        })
      }

      return { previousSeasons, previousActive }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousSeasons) {
        queryClient.setQueryData(seasonKeys.list(false), context.previousSeasons)
      }
      if (context?.previousActive) {
        queryClient.setQueryData(seasonKeys.active(), context.previousActive)
      }
    },
    onSettled: () => {
      // Refetch all season data to sync with server
      queryClient.invalidateQueries({ queryKey: seasonKeys.all })
    }
  })
}
