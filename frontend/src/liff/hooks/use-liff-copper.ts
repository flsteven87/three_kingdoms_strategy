/**
 * LIFF Copper Mine Hooks
 *
 * TanStack Query hooks for copper mine management in LIFF.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getCopperMines,
  registerCopperMine,
  deleteCopperMine,
  type CopperMineListResponse,
  type RegisterCopperResponse,
} from '../lib/liff-api-client'

interface LiffContext {
  lineUserId: string
  lineGroupId: string
}

// Query key factory
export const liffCopperKeys = {
  all: ['liff-copper'] as const,
  list: (userId: string, groupId: string) =>
    [...liffCopperKeys.all, 'list', userId, groupId] as const,
}

export function useLiffCopperMines(context: LiffContext | null) {
  return useQuery<CopperMineListResponse>({
    queryKey: liffCopperKeys.list(context?.lineUserId ?? '', context?.lineGroupId ?? ''),
    queryFn: () =>
      getCopperMines({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
      }),
    enabled: !!context?.lineUserId && !!context?.lineGroupId,
  })
}

interface RegisterCopperParams {
  gameId: string
  coordX: number
  coordY: number
  level: number
  notes?: string
}

export function useLiffRegisterCopper(context: LiffContext | null) {
  const queryClient = useQueryClient()

  return useMutation<RegisterCopperResponse, Error, RegisterCopperParams>({
    mutationFn: (params) =>
      registerCopperMine({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
        ...params,
      }),
    onSuccess: () => {
      if (context) {
        queryClient.invalidateQueries({
          queryKey: liffCopperKeys.list(context.lineUserId, context.lineGroupId),
        })
      }
    },
  })
}

export function useLiffDeleteCopper(context: LiffContext | null) {
  const queryClient = useQueryClient()

  return useMutation<void, Error, { mineId: string }>({
    mutationFn: ({ mineId }) =>
      deleteCopperMine({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
        mineId,
      }),
    onSuccess: () => {
      if (context) {
        queryClient.invalidateQueries({
          queryKey: liffCopperKeys.list(context.lineUserId, context.lineGroupId),
        })
      }
    },
  })
}
