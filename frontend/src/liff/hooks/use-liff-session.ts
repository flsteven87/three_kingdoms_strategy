/**
 * LIFF Session Hook
 *
 * Initializes LIFF SDK and provides session data for LIFF pages.
 * Handles login flow and extracts group ID from URL params.
 *
 * IMPORTANT: URL params (g, e) are saved to sessionStorage BEFORE liff.init()
 * because the OAuth login flow will replace the URL with callback params,
 * losing the original liff.state parameters.
 */

import { useEffect, useState } from 'react'
import liff from '@line/liff'

export interface LiffSession {
  lineUserId: string
  lineDisplayName: string
  lineGroupId: string | null
  eventId: string | null
}

type LiffState =
  | { status: 'loading' }
  | { status: 'ready'; session: LiffSession }
  | { status: 'error'; error: string }

const LIFF_PARAMS_KEY = 'liff_params'

function getParamsFromLiffUrl(): Record<string, string> {
  const qs = new URLSearchParams(window.location.search)
  const state = qs.get('liff.state')

  // Debug logging
  console.log('[LIFF] window.location.href:', window.location.href)
  console.log('[LIFF] window.location.search:', window.location.search)
  console.log('[LIFF] liff.state:', state)

  const raw = state ? decodeURIComponent(state) : window.location.href
  console.log('[LIFF] raw after decode:', raw)

  const query = raw.includes('?') ? raw.split('?')[1] : ''
  console.log('[LIFF] query string:', query)

  const params = Object.fromEntries(new URLSearchParams(query).entries())
  console.log('[LIFF] parsed params:', params)

  return params
}

/**
 * Check if current URL is an OAuth callback (contains 'code' param).
 * We should NOT overwrite saved params when returning from OAuth.
 */
function isOAuthCallback(): boolean {
  const qs = new URLSearchParams(window.location.search)
  return qs.has('code') && qs.has('liffClientId')
}

/**
 * Save LIFF params to sessionStorage before login redirect.
 * This preserves g (groupId) and e (eventId) across OAuth flow.
 * IMPORTANT: Skip saving if this is an OAuth callback (would overwrite good params).
 */
function saveParamsBeforeLogin(): void {
  // Don't overwrite saved params when returning from OAuth
  if (isOAuthCallback()) {
    console.log('[LIFF] Skipping save - this is OAuth callback')
    return
  }

  const params = getParamsFromLiffUrl()
  if (params.g || params.e) {
    console.log('[LIFF] Saving params to sessionStorage:', params)
    sessionStorage.setItem(LIFF_PARAMS_KEY, JSON.stringify(params))
  }
}

/**
 * Retrieve saved LIFF params from sessionStorage after login.
 * Clears the storage after retrieval.
 */
function getSavedParams(): Record<string, string> | null {
  const saved = sessionStorage.getItem(LIFF_PARAMS_KEY)
  if (saved) {
    console.log('[LIFF] Retrieved saved params from sessionStorage')
    sessionStorage.removeItem(LIFF_PARAMS_KEY)
    return JSON.parse(saved) as Record<string, string>
  }
  return null
}

export function useLiffSession(liffId: string): LiffState {
  const [state, setState] = useState<LiffState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    // CRITICAL: Save params BEFORE liff.init() because OAuth redirect loses them
    saveParamsBeforeLogin()

    async function initLiff() {
      try {
        await liff.init({ liffId })

        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }

        const profile = await liff.getProfile()

        // Try to get params from URL first, then fall back to saved params
        let params = getParamsFromLiffUrl()
        if (!params.g && !params.e) {
          const savedParams = getSavedParams()
          if (savedParams) {
            console.log('[LIFF] Using saved params:', savedParams)
            params = savedParams
          }
        }

        const groupId = params.g || params.groupId || null
        const eventId = params.e || params.eventId || null

        console.log('[LIFF] Final session params - groupId:', groupId, 'eventId:', eventId)

        if (!cancelled) {
          setState({
            status: 'ready',
            session: {
              lineUserId: profile.userId,
              lineDisplayName: profile.displayName,
              lineGroupId: groupId,
              eventId: eventId,
            },
          })
        }
      } catch (e) {
        if (!cancelled) {
          setState({
            status: 'error',
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
    }

    initLiff()

    return () => {
      cancelled = true
    }
  }, [liffId])

  return state
}
