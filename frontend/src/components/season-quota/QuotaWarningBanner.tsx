/**
 * Quota Warning Banner Component
 *
 * Displays warning banner based on season quota status:
 * - None: No banner shown
 * - Warning (7 days or less): Yellow banner
 * - Critical (3 days or less): Orange banner
 * - Expired: Red banner with purchase button
 */

import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const { level, message } = useQuotaWarning()

  if (level === 'none' || !message) {
    return null
  }

  const config = bannerConfigs[level]
  const Icon = config.icon

  const buttonStyles: Record<Exclude<QuotaWarningLevel, 'none'>, string> = {
    warning: 'bg-yellow-600 hover:bg-yellow-700 dark:bg-yellow-600 dark:hover:bg-yellow-500 focus:ring-yellow-500',
    critical: 'bg-orange-600 hover:bg-orange-700 dark:bg-orange-600 dark:hover:bg-orange-500 focus:ring-orange-500',
    expired: 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 focus:ring-red-500',
  }

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
      <button
        type="button"
        className={cn(
          'shrink-0 rounded-md px-3 py-1 text-xs font-medium text-white',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'transition-colors',
          buttonStyles[level]
        )}
        onClick={() => navigate('/purchase')}
      >
        購買賽季
      </button>
    </div>
  )
}
