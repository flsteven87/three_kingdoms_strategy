/**
 * LIFF Performance Hooks
 *
 * TanStack Query hooks for member performance analytics in LIFF.
 */

import { useQuery } from '@tanstack/react-query'
import {
  getMemberPerformance,
  type MemberPerformanceResponse,
} from '../lib/liff-api-client'

interface LiffContext {
  lineUserId: string
  lineGroupId: string
}

// Query key factory
export const liffPerformanceKeys = {
  all: ['liff-performance'] as const,
  detail: (userId: string, groupId: string, gameId: string) =>
    [...liffPerformanceKeys.all, 'detail', userId, groupId, gameId] as const,
}

export function useLiffPerformance(
  context: LiffContext | null,
  gameId: string | null
) {
  return useQuery<MemberPerformanceResponse>({
    queryKey: liffPerformanceKeys.detail(
      context?.lineUserId ?? '',
      context?.lineGroupId ?? '',
      gameId ?? ''
    ),
    queryFn: () =>
      getMemberPerformance({
        lineUserId: context!.lineUserId,
        lineGroupId: context!.lineGroupId,
        gameId: gameId!,
      }),
    enabled: !!context?.lineUserId && !!context?.lineGroupId && !!gameId,
  })
}
