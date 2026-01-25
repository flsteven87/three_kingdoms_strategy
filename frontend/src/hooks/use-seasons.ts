/**
 * Season Query Hooks - Season Purchase System
 *
 * 符合 CLAUDE.md 🟡:
 * - TanStack Query for server state
 * - Type-safe hooks
 * - Optimistic updates for mutations
 *
 * Key concepts:
 * - activation_status: draft → activated → completed (payment state)
 * - is_current: Whether this season is selected for display
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiClient } from '@/lib/api-client'
import type { Season, SeasonCreate, SeasonUpdate } from '@/types/season'
import { seasonQuotaKeys } from './use-season-quota'

// Query Keys Factory
export const seasonKeys = {
  all: ['seasons'] as const,
  lists: () => [...seasonKeys.all, 'list'] as const,
  list: (activatedOnly: boolean) => [...seasonKeys.lists(), { activatedOnly }] as const,
  current: () => [...seasonKeys.all, 'current'] as const,
  details: () => [...seasonKeys.all, 'detail'] as const,
  detail: (id: string) => [...seasonKeys.details(), id] as const
}

/**
 * Hook to fetch all seasons
 *
 * @param activatedOnly - Filter to only activated seasons (not draft/completed)
 * Returns empty array if user has no alliance
 */
export function useSeasons(activatedOnly: boolean = false) {
  return useQuery({
    queryKey: seasonKeys.list(activatedOnly),
    queryFn: () => apiClient.getSeasons(activatedOnly),
    staleTime: 5 * 60 * 1000 // 5 minutes
  })
}

/**
 * Hook to fetch current (selected) season
 *
 * Returns null if no current season
 */
export function useCurrentSeason() {
  return useQuery({
    queryKey: seasonKeys.current(),
    queryFn: () => apiClient.getCurrentSeason(),
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
 * New seasons are created as 'draft' status.
 * Automatically updates cache on success
 */
export function useCreateSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: SeasonCreate) => apiClient.createSeason(data),
    onSuccess: (newSeason) => {
      toast.success(`「${newSeason.name}」已建立`)
      queryClient.invalidateQueries({ queryKey: seasonKeys.lists() })
      if (newSeason.is_current) {
        queryClient.invalidateQueries({ queryKey: seasonKeys.current() })
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
    onSuccess: (updatedSeason) => {
      toast.success(`「${updatedSeason.name}」已更新`)
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
      toast.success('賽季已刪除')
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
 * Hook to activate a draft season (consume season credit or use trial)
 *
 * Changes activation_status from 'draft' to 'activated'.
 * Also invalidates season quota status since season count changes.
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

      // Optimistically update season list (change activation_status to 'activated')
      if (previousSeasons) {
        queryClient.setQueryData<Season[]>(
          seasonKeys.list(false),
          previousSeasons.map(season =>
            season.id === seasonId
              ? {
                  ...season,
                  activation_status: 'activated' as const,
                  updated_at: new Date().toISOString()
                }
              : season
          )
        )
      }

      return { previousSeasons }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousSeasons) {
        queryClient.setQueryData(seasonKeys.list(false), context.previousSeasons)
      }
    },
    onSuccess: (response) => {
      toast.success(`「${response.season.name}」已啟用`)
    },
    onSettled: () => {
      // Refetch all season data to sync with server
      queryClient.invalidateQueries({ queryKey: seasonKeys.all })
      // Also invalidate season quota status (season count changed)
      queryClient.invalidateQueries({ queryKey: seasonQuotaKeys.all })
    }
  })
}

/**
 * Hook to set an activated season as current (selected for display)
 *
 * Only activated seasons can be set as current.
 * This unsets the current flag on all other seasons.
 */
export function useSetCurrentSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (seasonId: string) => apiClient.setCurrentSeason(seasonId),
    onMutate: async (seasonId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: seasonKeys.all })

      // Snapshot previous values
      const previousSeasons = queryClient.getQueryData<Season[]>(seasonKeys.list(false))
      const previousCurrent = queryClient.getQueryData<Season | null>(seasonKeys.current())

      // Optimistically update season list (set is_current on target, unset on others)
      if (previousSeasons) {
        queryClient.setQueryData<Season[]>(
          seasonKeys.list(false),
          previousSeasons.map(season => ({
            ...season,
            is_current: season.id === seasonId,
            updated_at: new Date().toISOString()
          }))
        )
      }

      // Optimistically update current season
      const newCurrentSeason = previousSeasons?.find(s => s.id === seasonId)
      if (newCurrentSeason) {
        queryClient.setQueryData(seasonKeys.current(), {
          ...newCurrentSeason,
          is_current: true,
          updated_at: new Date().toISOString()
        })
      }

      return { previousSeasons, previousCurrent }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousSeasons) {
        queryClient.setQueryData(seasonKeys.list(false), context.previousSeasons)
      }
      if (context?.previousCurrent !== undefined) {
        queryClient.setQueryData(seasonKeys.current(), context.previousCurrent)
      }
    },
    onSuccess: (updatedSeason) => {
      toast.success(`已切換至「${updatedSeason.name}」`)
    },
    onSettled: () => {
      // Refetch all season data to sync with server
      queryClient.invalidateQueries({ queryKey: seasonKeys.all })
    }
  })
}

/**
 * Hook to mark a season as completed
 *
 * Changes activation_status from 'activated' to 'completed'.
 */
export function useCompleteSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (seasonId: string) => apiClient.completeSeason(seasonId),
    onMutate: async (seasonId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: seasonKeys.all })

      // Snapshot previous values
      const previousSeasons = queryClient.getQueryData<Season[]>(seasonKeys.list(false))

      // Optimistically update season list (change activation_status to 'completed')
      // Note: Keep is_current as-is since completed seasons can still be viewed
      if (previousSeasons) {
        queryClient.setQueryData<Season[]>(
          seasonKeys.list(false),
          previousSeasons.map(season =>
            season.id === seasonId
              ? {
                  ...season,
                  activation_status: 'completed' as const,
                  updated_at: new Date().toISOString()
                }
              : season
          )
        )
      }

      return { previousSeasons }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousSeasons) {
        queryClient.setQueryData(seasonKeys.list(false), context.previousSeasons)
      }
    },
    onSuccess: (completedSeason) => {
      toast.success(`「${completedSeason.name}」已結束`)
    },
    onSettled: () => {
      // Refetch all season data to sync with server
      queryClient.invalidateQueries({ queryKey: seasonKeys.all })
    }
  })
}

/**
 * Hook to reopen a completed season back to activated
 *
 * Changes activation_status from 'completed' to 'activated'.
 */
export function useReopenSeason() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (seasonId: string) => apiClient.reopenSeason(seasonId),
    onMutate: async (seasonId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: seasonKeys.all })

      // Snapshot previous values
      const previousSeasons = queryClient.getQueryData<Season[]>(seasonKeys.list(false))

      // Optimistically update season list (change activation_status to 'activated')
      if (previousSeasons) {
        queryClient.setQueryData<Season[]>(
          seasonKeys.list(false),
          previousSeasons.map(season =>
            season.id === seasonId
              ? {
                  ...season,
                  activation_status: 'activated' as const,
                  updated_at: new Date().toISOString()
                }
              : season
          )
        )
      }

      return { previousSeasons }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousSeasons) {
        queryClient.setQueryData(seasonKeys.list(false), context.previousSeasons)
      }
    },
    onSuccess: (reopenedSeason) => {
      toast.success(`「${reopenedSeason.name}」已重新開啟`)
    },
    onSettled: () => {
      // Refetch all season data to sync with server
      queryClient.invalidateQueries({ queryKey: seasonKeys.all })
    }
  })
}

