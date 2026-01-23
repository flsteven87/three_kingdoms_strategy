/**
 * Quota Warning Banner Component
 *
 * Displays warning banner based on season quota status:
 * - None: No banner shown
 * - Warning (7 days or less): Yellow banner
 * - Critical (3 days or less): Orange banner
 * - Expired: Red banner
 *
 * 符合 CLAUDE.md 🔴: ES imports only, explicit TypeScript interfaces, function declarations
 */

import { AlertTriangle, Clock, XCircle } from 'lucide-react'
import { useQuotaWarning } from '@/hooks/use-season-quota'
import { cn } from '@/lib/utils'
import type { QuotaWarningLevel } from '@/types/season-quota'

interface BannerConfig {
  readonly icon: typeof Clock
  readonly bgClass: string
  readonly textClass: string
  readonly borderClass: string
}

const bannerConfigs: Record<Exclude<QuotaWarningLevel, 'none'>, BannerConfig> = {
  warning: {
    icon: Clock,
    bgClass: 'bg-yellow-50 dark:bg-yellow-950/20',
    textClass: 'text-yellow-800 dark:text-yellow-200',
    borderClass: 'border-yellow-200 dark:border-yellow-800',
  },
  critical: {
    icon: AlertTriangle,
    bgClass: 'bg-orange-50 dark:bg-orange-950/20',
    textClass: 'text-orange-800 dark:text-orange-200',
    borderClass: 'border-orange-200 dark:border-orange-800',
  },
  expired: {
    icon: XCircle,
    bgClass: 'bg-red-50 dark:bg-red-950/20',
    textClass: 'text-red-800 dark:text-red-200',
    borderClass: 'border-red-200 dark:border-red-800',
  },
}

export function QuotaWarningBanner() {
  const { level, message } = useQuotaWarning()

  // Don't show banner if no warning
  if (level === 'none' || !message) {
    return null
  }

  const config = bannerConfigs[level]
  const Icon = config.icon

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-2.5 border-b text-sm',
        config.bgClass,
        config.textClass,
        config.borderClass
      )}
      role="alert"
    >
      <Icon className="h-4 w-4 shrink-0" />
      <p className="flex-1">{message}</p>
      {level === 'expired' && (
        <button
          type="button"
          className={cn(
            'shrink-0 rounded-md px-3 py-1 text-xs font-medium',
            'bg-red-600 text-white hover:bg-red-700',
            'dark:bg-red-600 dark:hover:bg-red-500',
            'focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          disabled
        >
          購買季數（即將推出）
        </button>
      )}
    </div>
  )
}
