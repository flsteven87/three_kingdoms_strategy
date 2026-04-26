/**
 * LIFF Copper Mine Hooks
 *
 * TanStack Query hooks for copper mine management in LIFF.
 * P1 修復: 添加樂觀更新以改善 UX
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCopperMines,
  getCopperRules,
  registerCopperMine,
  deleteCopperMine,
  lookupCopperCoordinate,
  searchCopperCoordinates,
  type CopperMine,
  type CopperCoordinateLookupResult,
  type CopperMineListResponse,
  type CopperMineRule,
  type CopperCoordinateSearchResult,
  type RegisterCopperResponse,
} from '../lib/liff-api-client'

interface LiffContext {
  lineUserId: string
  lineGroupId: string
  lineIdToken: string
}

// Query key factory
export const liffCopperKeys = {
  all: ['liff-copper'] as const,
  list: (userId: string, groupId: string) =>
    [...liffCopperKeys.all, 'list', userId, groupId] as const,
  rules: (groupId: string) => [...liffCopperKeys.all, 'rules', groupId] as const,
  lookup: (groupId: string, coordX: number, coordY: number) =>
    [...liffCopperKeys.all, 'lookup', groupId, coordX, coordY] as const,
  search: (groupId: string, query: string) =>
    [...liffCopperKeys.all, 'search', groupId, query] as const,
}

export function useLiffCopperMines(context: LiffContext | null) {
  return useQuery<CopperMineListResponse>({
    queryKey: liffCopperKeys.list(context?.lineUserId ?? '', context?.lineGroupId ?? ''),
    queryFn: () =>
      getCopperMines({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
        lineIdToken: context!.lineIdToken,
      }),
    enabled: !!context?.lineUserId && !!context?.lineGroupId,
    staleTime: 15_000,
  })
}

export function useLiffCopperRules(groupId: string | null) {
  return useQuery<CopperMineRule[]>({
    queryKey: liffCopperKeys.rules(groupId ?? ''),
    queryFn: () => getCopperRules({ lineGroupId: groupId! }),
    enabled: !!groupId,
    staleTime: 5 * 60 * 1000, // Rules rarely change, cache for 5 minutes
  })
}

interface RegisterCopperParams {
  gameId: string
  coordX: number
  coordY: number
  level: number
  notes?: string
  claimedTier?: number
}

interface RegisterMutationContext {
  previousData: CopperMineListResponse | undefined
}

export function useLiffRegisterCopper(context: LiffContext | null) {
  const queryClient = useQueryClient()

  return useMutation<RegisterCopperResponse, Error, RegisterCopperParams, RegisterMutationContext>({
    mutationFn: (params) =>
      registerCopperMine({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
        lineIdToken: context!.lineIdToken,
        ...params,
      }),

    // P1 修復: 樂觀更新
    onMutate: async (params) => {
      if (!context) return { previousData: undefined }

      const queryKey = liffCopperKeys.list(context.lineUserId, context.lineGroupId)

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot current data
      const previousData = queryClient.getQueryData<CopperMineListResponse>(queryKey)

      // Optimistically add the new mine
      const optimisticMine: CopperMine = {
        id: `temp-${Date.now()}`,
        game_id: params.gameId,
        coord_x: params.coordX,
        coord_y: params.coordY,
        level: params.level,
        status: 'active',
        notes: params.notes || null,
        registered_at: new Date().toISOString(),
        claimed_tier: params.claimedTier ?? null,
      }

      queryClient.setQueryData<CopperMineListResponse>(queryKey, (old) => {
        const newCounts = { ...(old?.mine_counts_by_game_id || {}) }
        newCounts[params.gameId] = (newCounts[params.gameId] || 0) + 1
        return {
          mines: [optimisticMine, ...(old?.mines || [])],
          total: (old?.total || 0) + 1,
          mine_counts_by_game_id: newCounts,
          merit_by_game_id: old?.merit_by_game_id || {},
          max_allowed: old?.max_allowed || 0,
          has_source_data: old?.has_source_data || false,
          current_game_season_tag: old?.current_game_season_tag ?? null,
          available_counties: old?.available_counties || [],
        }
      })

      return { previousData }
    },

    onError: (_err, _params, ctx) => {
      // Rollback on error
      if (ctx?.previousData && context) {
        queryClient.setQueryData(
          liffCopperKeys.list(context.lineUserId, context.lineGroupId),
          ctx.previousData
        )
      }
    },

    onSettled: () => {
      // Always refetch to ensure consistency
      if (context) {
        queryClient.invalidateQueries({
          queryKey: liffCopperKeys.list(context.lineUserId, context.lineGroupId),
        })
      }
    },
  })
}

interface DeleteMutationContext {
  previousData: CopperMineListResponse | undefined
}

export function useLiffDeleteCopper(context: LiffContext | null) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { mineId: string }, DeleteMutationContext>({
    mutationFn: ({ mineId }) =>
      deleteCopperMine({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
        lineIdToken: context!.lineIdToken,
        mineId,
      }),

    // P1 修復: 樂觀更新
    onMutate: async ({ mineId }) => {
      if (!context) return { previousData: undefined }

      const queryKey = liffCopperKeys.list(context.lineUserId, context.lineGroupId)

      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey })

      // Snapshot current data
      const previousData = queryClient.getQueryData<CopperMineListResponse>(queryKey)

      // Optimistically remove the mine
      queryClient.setQueryData<CopperMineListResponse>(queryKey, (old) => {
        const deletedMine = old?.mines.find((m) => m.id === mineId)
        const newCounts = { ...(old?.mine_counts_by_game_id || {}) }
        if (deletedMine?.game_id && newCounts[deletedMine.game_id]) {
          newCounts[deletedMine.game_id] = Math.max(newCounts[deletedMine.game_id] - 1, 0)
        }
        return {
          mines: old?.mines.filter((m) => m.id !== mineId) || [],
          total: Math.max((old?.total || 0) - 1, 0),
          mine_counts_by_game_id: newCounts,
          max_allowed: old?.max_allowed || 0,
          has_source_data: old?.has_source_data || false,
          current_game_season_tag: old?.current_game_season_tag ?? null,
          available_counties: old?.available_counties || [],
        }
      })

      return { previousData }
    },

    onError: (_err, _params, ctx) => {
      // Rollback on error
      if (ctx?.previousData && context) {
        queryClient.setQueryData(
          liffCopperKeys.list(context.lineUserId, context.lineGroupId),
          ctx.previousData
        )
      }
    },

    onSettled: () => {
      // Always refetch to ensure consistency
      if (context) {
        queryClient.invalidateQueries({
          queryKey: liffCopperKeys.list(context.lineUserId, context.lineGroupId),
        })
      }
    },
  })
}

export function useLiffCopperSearch(groupId: string | null, query: string) {
  return useQuery<CopperCoordinateSearchResult[]>({
    queryKey: liffCopperKeys.search(groupId ?? '', query),
    queryFn: () => searchCopperCoordinates({ lineGroupId: groupId!, query }),
    enabled: !!groupId && query.length >= 1,
    staleTime: 30 * 1000,
  })
}

export function useLiffCopperCoordinateLookup(
  groupId: string | null,
  coordX: number | null,
  coordY: number | null,
) {
  return useQuery<CopperCoordinateLookupResult>({
    queryKey: liffCopperKeys.lookup(groupId ?? '', coordX ?? -1, coordY ?? -1),
    queryFn: () =>
      lookupCopperCoordinate({
        lineGroupId: groupId!,
        coordX: coordX!,
        coordY: coordY!,
      }),
    enabled:
      !!groupId && coordX !== null && coordY !== null && coordX >= 0 && coordY >= 0,
    staleTime: 30_000,
  })
}
