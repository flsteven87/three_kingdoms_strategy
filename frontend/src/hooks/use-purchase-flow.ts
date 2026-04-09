/**
 * Purchase Flow Hook — Baseline-aware polling for season-quota grant.
 *
 * Solves the "hardcoded success banner lies when grant fails" problem:
 * instead of trusting the Recur SDK's `onPaymentComplete` callback (which
 * fires when Recur collects payment, NOT when our backend webhook lands
 * the grant), this hook captures a baseline `available_seasons` snapshot
 * before checkout and polls `/api/v1/season-quota` until either:
 *
 *   - the count strictly increases above the baseline → `granted`
 *   - 30 seconds elapse without a change              → `timeout`
 *
 * The redirect path (Recur `successUrl` back to `/purchase?payment=success`)
 * has no baseline because the page just loaded fresh; it uses the weaker
 * "any positive count within timeout" heuristic, which matches the
 * pre-existing behavior but adds a timeout ceiling so a truly failed grant
 * surfaces a clear error instead of the old permanently-hopeful banner.
 */

import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSeasonQuota, seasonQuotaKeys } from './use-season-quota'

export type PaymentFlowState = 'idle' | 'pending' | 'granted' | 'timeout'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 30_000

export interface UsePurchaseFlowResult {
  readonly state: PaymentFlowState
  readonly availableSeasons: number | null
  /**
   * Start polling for a grant.
   *
   * @param baseline - pre-purchase quota snapshot (modal path).
   *                   Pass `null` when baseline is unknown (redirect path).
   */
  readonly startPolling: (baseline: number | null) => void
  readonly reset: () => void
}

export function usePurchaseFlow(): UsePurchaseFlowResult {
  const [state, setState] = useState<PaymentFlowState>('idle')
  const baselineRef = useRef<number | null>(null)
  const startedAtRef = useRef<number | null>(null)
  const queryClient = useQueryClient()

  const isPolling = state === 'pending'
  const { data: quota } = useSeasonQuota(
    isPolling ? { refetchInterval: POLL_INTERVAL_MS } : undefined,
  )

  const currentSeasons = quota?.available_seasons ?? null

  // Watch for grant: flips state to 'granted' when the quota crosses the
  // baseline. For the redirect path (baseline=null), accept any positive
  // count as evidence of a successful grant.
  useEffect(() => {
    if (state !== 'pending' || currentSeasons == null) return

    const baseline = baselineRef.current
    const granted =
      baseline == null ? currentSeasons > 0 : currentSeasons > baseline

    if (granted) {
      setState('granted')
    }
  }, [state, currentSeasons])

  // Hard timeout: flips to 'timeout' after POLL_TIMEOUT_MS if we never saw
  // the grant land. Cleanup prevents stale timers after state change or
  // unmount (CLAUDE.md 🔴: every timer-using effect must return cleanup).
  useEffect(() => {
    if (state !== 'pending') return
    const timerId = setTimeout(() => {
      setState((prev) => (prev === 'pending' ? 'timeout' : prev))
    }, POLL_TIMEOUT_MS)
    return () => clearTimeout(timerId)
  }, [state])

  const startPolling = (baseline: number | null) => {
    baselineRef.current = baseline
    startedAtRef.current = Date.now()
    setState('pending')
    // Kick off the first refetch immediately so the user doesn't have to
    // wait POLL_INTERVAL_MS for the first datapoint.
    void queryClient.invalidateQueries({ queryKey: seasonQuotaKeys.all })
  }

  const reset = () => {
    baselineRef.current = null
    startedAtRef.current = null
    setState('idle')
  }

  return {
    state,
    availableSeasons: currentSeasons,
    startPolling,
    reset,
  }
}
