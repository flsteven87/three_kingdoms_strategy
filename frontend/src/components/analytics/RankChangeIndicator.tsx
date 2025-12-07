/**
 * RankChangeIndicator - Shared component for displaying rank changes.
 *
 * Shows trending up/down/neutral indicators with appropriate colors.
 * Used in both MemberPerformance and GroupAnalytics pages.
 */

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface RankChangeIndicatorProps {
  readonly change: number | null
  readonly size?: 'sm' | 'md' | 'lg'
  readonly showNewLabel?: boolean
}

export function RankChangeIndicator({
  change,
  size = 'md',
  showNewLabel = true,
}: RankChangeIndicatorProps) {
  const sizeStyles = {
    sm: { text: 'text-xs', icon: 'h-3 w-3', gap: 'gap-0.5' },
    md: { text: 'text-sm', icon: 'h-4 w-4', gap: 'gap-1' },
    lg: { text: 'text-base', icon: 'h-5 w-5', gap: 'gap-1' },
  }

  const { text, icon, gap } = sizeStyles[size]

  if (change === null) {
    const label = showNewLabel ? '新成員' : '新'
    return <span className={`${text} text-muted-foreground`}>{label}</span>
  }

  if (change > 0) {
    return (
      <div className={`flex items-center ${gap} ${text} text-primary`}>
        <TrendingUp className={icon} />
        <span>+{change}</span>
      </div>
    )
  }

  if (change < 0) {
    return (
      <div className={`flex items-center ${gap} ${text} text-destructive`}>
        <TrendingDown className={icon} />
        <span>{change}</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center ${gap} ${text} text-muted-foreground`}>
      <Minus className={icon} />
      <span>持平</span>
    </div>
  )
}
