/**
 * LIFF Session Hook
 *
 * Initializes LIFF SDK and provides session data for LIFF pages.
 * Handles login flow and extracts group ID from URL params.
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

export function useLiffSession(liffId: string): LiffState {
  const [state, setState] = useState<LiffState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function initLiff() {
      try {
        await liff.init({ liffId })

        if (!liff.isLoggedIn()) {
          liff.login()
          return
        }

        const profile = await liff.getProfile()
        const params = getParamsFromLiffUrl()
        const groupId = params.g || params.groupId || null
        const eventId = params.e || params.eventId || null

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
