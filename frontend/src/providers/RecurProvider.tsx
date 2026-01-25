/**
 * Recur Payment Provider
 *
 * Wraps the app with Recur SDK provider for payment integration.
 * Uses modal checkout mode for seamless payment experience.
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

  if (!publishableKey) {
    console.warn('VITE_RECUR_PUBLISHABLE_KEY not configured, Recur payments will be disabled')
  }

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
