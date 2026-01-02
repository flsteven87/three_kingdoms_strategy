/**
 * LINE Binding Hooks
 *
 * Hooks for LINE Bot integration feature.
 *
 * 符合 CLAUDE.md 🔴:
 * - TanStack Query for server state
 * - Type-safe hooks
 * - Query Key Factory pattern
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '@/lib/api-client'
import type { LineBindingStatusResponse, LineBindingCode } from '@/types/line-binding'

// =============================================================================
// Query Keys
// =============================================================================

export const lineBindingKeys = {
  all: ['line-binding'] as const,
  status: () => [...lineBindingKeys.all, 'status'] as const
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch LINE binding status
 */
export function useLineBindingStatus(allianceId: string | undefined) {
  return useQuery({
    queryKey: lineBindingKeys.status(),
    queryFn: (): Promise<LineBindingStatusResponse> => apiClient.getLineBindingStatus(),
    enabled: Boolean(allianceId),
    refetchInterval: (query) => {
      // Poll every 5 seconds if there's a pending code (waiting for LINE group binding)
      const data = query.state.data
      if (data?.pending_code && !data?.is_bound) {
        return 5000
      }
      return false
    }
  })
}

/**
 * Hook to generate a new binding code
 */
export function useGenerateBindingCode() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (): Promise<LineBindingCode> => apiClient.generateLineBindingCode(),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: lineBindingKeys.status()
      })
    }
  })
}

/**
 * Hook to unbind LINE group
 */
export function useUnbindLineGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (): Promise<void> => apiClient.unbindLineGroup(),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: lineBindingKeys.status()
      })
    }
  })
}

/**
 * Hook for countdown timer
 */
export function useCountdown(expiresAt: string | undefined) {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)

  const calculateRemaining = useCallback(() => {
    if (!expiresAt) return null
    const diff = new Date(expiresAt).getTime() - Date.now()
    return Math.max(0, Math.floor(diff / 1000))
  }, [expiresAt])

  useEffect(() => {
    if (!expiresAt) {
      setRemainingSeconds(null)
      return
    }

    // Initial calculation
    setRemainingSeconds(calculateRemaining())

    // Update every second
    const interval = setInterval(() => {
      const remaining = calculateRemaining()
      setRemainingSeconds(remaining)

      if (remaining === 0) {
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [expiresAt, calculateRemaining])

  // Format as MM:SS
  const formatted = remainingSeconds !== null
    ? `${Math.floor(remainingSeconds / 60).toString().padStart(2, '0')}:${(remainingSeconds % 60).toString().padStart(2, '0')}`
    : null

  const isExpired = remainingSeconds === 0
  const isUrgent = remainingSeconds !== null && remainingSeconds < 60

  return { remainingSeconds, formatted, isExpired, isUrgent }
}

/**
 * Hook for clipboard copy with feedback
 */
export function useCopyToClipboard() {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      return true
    } catch {
      return false
    }
  }, [])

  return { copied, copy }
}
