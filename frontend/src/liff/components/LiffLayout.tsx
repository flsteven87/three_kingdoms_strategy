/**
 * LIFF Layout
 *
 * Minimal layout for LIFF pages - no sidebar, no auth required.
 * Initializes LIFF SDK and provides session context.
 */

import { Outlet } from 'react-router-dom'
import { useLiffSession, type LiffSession } from '../hooks/use-liff-session'

const LIFF_ID = import.meta.env.VITE_LIFF_ID || ''

type LiffContextType = {
  session: LiffSession
}

export function LiffLayout() {
  const state = useLiffSession(LIFF_ID)

  if (!LIFF_ID) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
          <p className="text-destructive">LIFF ID not configured</p>
          <p className="text-sm text-muted-foreground mt-2">
            Please set VITE_LIFF_ID in your environment
          </p>
        </div>
      </div>
    )
  }

  if (state.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
          <p className="text-muted-foreground">載入中...</p>
        </div>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
          <p className="text-destructive">發生錯誤</p>
          <p className="text-sm text-muted-foreground mt-2">{state.error}</p>
        </div>
      </div>
    )
  }

  if (!state.session.lineGroupId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
          <p className="text-destructive">無法取得群組資訊</p>
          <p className="text-sm text-muted-foreground mt-2">
            請從 LINE 群組中開啟此頁面
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Outlet context={{ session: state.session } satisfies LiffContextType} />
    </div>
  )
}
