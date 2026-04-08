/**
 * Recur Payment Provider
 *
 * Wraps the app with Recur SDK provider for payment integration.
 * Uses modal checkout — the 'redirect' mode is marked deprecated in the SDK
 * and falls through to embedded (requires containerElementId). The original
 * sandbox 500s we saw on /v1/checkouts were caused by a sticky externalId
 * mismatch on the customer, not the modal path itself.
 *
 * Note: Always wraps with RecurSDKProvider even when key is not configured,
 * to ensure useRecur hook works. The checkout function will fail gracefully
 * if the key is missing.
 */

import { RecurProvider as RecurSDKProvider } from 'recur-tw'
import type { ReactNode } from 'react'

interface RecurProviderProps {
  readonly children: ReactNode
}

export function RecurProvider({ children }: RecurProviderProps) {
  const publishableKey = import.meta.env.VITE_RECUR_PUBLISHABLE_KEY

  return (
    <RecurSDKProvider
      config={{
        publishableKey: publishableKey || '',
        checkoutMode: 'modal',
      }}
    >
      {children}
    </RecurSDKProvider>
  )
}
