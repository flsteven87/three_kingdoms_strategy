/**
 * Purchase Flow Hook — Baseline-aware polling for season-quota grant.
 *
 * Polls `/api/v1/season-quota` until `purchased_seasons` strictly increases
 * above the pre-checkout baseline, confirming the backend webhook granted
 * the purchase. Uses `purchased_seasons` (not `available_seasons`) because
 * trial auto-conversion may consume the newly granted season immediately,
 * leaving `available_seasons` unchanged.
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
  readonly trialConverted: boolean
  /**
   * Start polling for a grant.
   *
   * @param baseline - pre-purchase `purchased_seasons` snapshot (modal path).
   *                   Pass `null` when baseline is unknown (redirect path).
   */
  readonly startPolling: (baseline: number | null) => void
  readonly reset: () => void
}

export function usePurchaseFlow(): UsePurchaseFlowResult {
  const [state, setState] = useState<PaymentFlowState>('idle')
  const [trialConverted, setTrialConverted] = useState(false)
  const baselineRef = useRef<number | null>(null)
  const wasTrialRef = useRef(false)
  const queryClient = useQueryClient()

  const isPolling = state === 'pending'
  const { data: quota } = useSeasonQuota(
    isPolling ? { refetchInterval: POLL_INTERVAL_MS } : undefined,
  )

  const currentPurchased = quota?.purchased_seasons ?? null
  const currentIsTrial = quota?.current_season_is_trial ?? null
  const currentUsed = quota?.used_seasons ?? null
  const currentAvailable = quota?.available_seasons ?? null

  // Detect grant: purchased_seasons crossed the baseline.
  // For the redirect path (baseline=null), any positive count suffices.
  useEffect(() => {
    if (state !== 'pending' || currentPurchased == null) return

    const baseline = baselineRef.current
    const granted =
      baseline == null ? currentPurchased > 0 : currentPurchased > baseline

    if (granted) {
      // Detect trial auto-conversion:
      // - Modal path: wasTrialRef captured pre-purchase state accurately.
      // - Redirect path (baseline=null): wasTrialRef is unreliable because
      //   quota may not have loaded when startPolling ran. Fall back to
      //   heuristic: purchased>0 + is_trial=false + used>0 + available=0
      //   only occurs after trial conversion (bought 1, used 1 for convert).
      const modalPathConverted =
        wasTrialRef.current && currentIsTrial === false
      const redirectPathConverted =
        baseline == null &&
        currentIsTrial === false &&
        currentUsed !== null && currentUsed > 0 &&
        currentAvailable === 0
      setTrialConverted(modalPathConverted || redirectPathConverted)
      setState('granted')
    }
  }, [state, currentPurchased, currentIsTrial, currentUsed, currentAvailable])

  useEffect(() => {
    if (state !== 'pending') return
    const timerId = setTimeout(() => {
      setState((prev) => (prev === 'pending' ? 'timeout' : prev))
    }, POLL_TIMEOUT_MS)
    return () => clearTimeout(timerId)
  }, [state])

  const startPolling = (baseline: number | null) => {
    baselineRef.current = baseline
    wasTrialRef.current = quota?.current_season_is_trial ?? false
    setTrialConverted(false)
    setState('pending')
    void queryClient.invalidateQueries({ queryKey: seasonQuotaKeys.all })
  }

  const reset = () => {
    baselineRef.current = null
    wasTrialRef.current = false
    setTrialConverted(false)
    setState('idle')
  }

  return {
    state,
    availableSeasons: currentAvailable,
    trialConverted,
    startPolling,
    reset,
  }
}
