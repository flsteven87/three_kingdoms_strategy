/**
 * Season Quota Guard Component
 *
 * Checks if user's season quota is active (trial or purchased)
 * If expired, shows upgrade prompt instead of children
 * If active, renders children normally
 *
 * 符合 CLAUDE.md 🔴: ES imports only, explicit TypeScript interfaces, function declarations
 */

import type { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { useSeasonQuota } from '@/hooks/use-season-quota'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface SeasonQuotaGuardProps {
  readonly children: ReactNode
  /**
   * Custom message to show when quota is expired
   */
  readonly expiredMessage?: string
  /**
   * If true, shows a softer inline message instead of blocking content
   * Useful for partial restrictions
   */
  readonly inline?: boolean
}

/**
 * Expired quota overlay
 */
function ExpiredOverlay({ message }: { readonly message: string }) {
  return (
    <div className="flex min-h-[200px] items-center justify-center py-8">
      <div className="max-w-md text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold">需要購買賽季</h3>
        <p className="text-muted-foreground">{message}</p>
        <Button variant="default" disabled>
          購買賽季（即將推出）
        </Button>
      </div>
    </div>
  )
}

/**
 * Inline expired message for partial restrictions
 */
function ExpiredInline({ message }: { readonly message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>需要購買賽季</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function SeasonQuotaGuard({
  children,
  expiredMessage = '試用期已結束，請購買賽季以繼續使用。',
  inline = false,
}: SeasonQuotaGuardProps) {
  const { data, isLoading } = useSeasonQuota()

  // While loading, render children to avoid flash of expired state
  if (isLoading || !data) {
    return <>{children}</>
  }

  // If quota is active, render children
  if (data.can_activate_season) {
    return <>{children}</>
  }

  // Quota expired, show appropriate message
  if (inline) {
    return <ExpiredInline message={expiredMessage} />
  }

  return <ExpiredOverlay message={expiredMessage} />
}
