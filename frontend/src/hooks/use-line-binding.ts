/**
 * LINE Binding Hooks
 *
 * Hooks for LINE Bot integration feature.
 * Currently uses mock data - will be replaced with real API calls.
 *
 * 符合 CLAUDE.md 🔴:
 * - TanStack Query for server state
 * - Type-safe hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useCallback } from 'react'
import type {
  LineBindingStatusResponse,
  LineBindingCode,
  LineGroupBinding
} from '@/types/line-binding'

// =============================================================================
// Query Keys
// =============================================================================

export const lineBindingKeys = {
  all: ['line-binding'] as const,
  status: (allianceId: string) => [...lineBindingKeys.all, 'status', allianceId] as const,
  members: (allianceId: string) => [...lineBindingKeys.all, 'members', allianceId] as const
}

// =============================================================================
// Mock Data & State (temporary until backend is ready)
// =============================================================================

// Simulate backend state
const mockBindingState: {
  isbound: boolean
  binding: LineGroupBinding | null
  pendingCode: LineBindingCode | null
} = {
  isbound: false,
  binding: null,
  pendingCode: null
}

// Mock API delay
const mockDelay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// =============================================================================
// API Functions (will be replaced with real API calls)
// =============================================================================

async function fetchBindingStatus(_allianceId?: string): Promise<LineBindingStatusResponse> {
  void _allianceId // Suppress unused warning - will be used when connecting to real API
  await mockDelay(300)

  // Check if pending code has expired
  if (mockBindingState.pendingCode) {
    const expiresAt = new Date(mockBindingState.pendingCode.expires_at)
    if (expiresAt < new Date()) {
      mockBindingState.pendingCode = null
    }
  }

  return {
    is_bound: mockBindingState.isbound,
    binding: mockBindingState.binding,
    pending_code: mockBindingState.pendingCode
  }
}

async function generateBindingCode(_allianceId?: string): Promise<LineBindingCode> {
  void _allianceId // Suppress unused warning - will be used when connecting to real API
  await mockDelay(500)

  // Generate random 6-character code
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const code = Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('')

  const now = new Date()
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000) // 5 minutes

  const bindingCode: LineBindingCode = {
    code,
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString()
  }

  mockBindingState.pendingCode = bindingCode

  return bindingCode
}

async function unbindGroup(_allianceId?: string): Promise<void> {
  void _allianceId // Suppress unused warning - will be used when connecting to real API
  await mockDelay(500)

  mockBindingState.isbound = false
  mockBindingState.binding = null
}

// =============================================================================
// Demo: Simulate successful binding (for testing UI)
// =============================================================================

export function simulateSuccessfulBinding() {
  mockBindingState.isbound = true
  mockBindingState.pendingCode = null
  mockBindingState.binding = {
    id: 'mock-binding-id',
    alliance_id: 'mock-alliance-id',
    line_group_id: 'C1234567890abcdef',
    group_name: '我的同盟群組',
    bound_at: new Date().toISOString(),
    is_active: true,
    member_count: 42
  }
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to fetch LINE binding status
 */
export function useLineBindingStatus(allianceId: string | undefined) {
  return useQuery({
    queryKey: lineBindingKeys.status(allianceId ?? ''),
    queryFn: () => fetchBindingStatus(allianceId!),
    enabled: Boolean(allianceId),
    refetchInterval: (query) => {
      // Poll every 5 seconds if there's a pending code
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
    mutationFn: (allianceId: string) => generateBindingCode(allianceId),
    onSuccess: (_data, allianceId) => {
      queryClient.invalidateQueries({
        queryKey: lineBindingKeys.status(allianceId)
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
    mutationFn: (allianceId: string) => unbindGroup(allianceId),
    onSuccess: (_data, allianceId) => {
      queryClient.invalidateQueries({
        queryKey: lineBindingKeys.status(allianceId)
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
