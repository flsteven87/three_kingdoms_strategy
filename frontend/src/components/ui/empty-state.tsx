/**
 * EmptyState - Unified empty state component
 *
 * Provides consistent empty state UI across the application.
 * Follows hyper-minimalist UI principle: typography-based hierarchy, minimal decoration.
 *
 * Variants:
 * - full: icon + title + description + action (page-level)
 * - compact: title + description + action (card-level)
 * - minimal: title only (inline)
 */

import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateAction {
  readonly label: string
  readonly onClick: () => void
  readonly icon?: LucideIcon
}

interface EmptyStateProps {
  /** Icon to display (only shown in 'full' variant) */
  readonly icon?: LucideIcon
  /** Main message - required */
  readonly title: string
  /** Optional description text */
  readonly description?: string
  /** Optional action button */
  readonly action?: EmptyStateAction
  /** Variant: 'full' (default), 'compact', or 'minimal' */
  readonly variant?: 'full' | 'compact' | 'minimal'
  /** Additional className */
  readonly className?: string
}

/**
 * Unified EmptyState component
 *
 * @example
 * // Full variant with icon and action
 * <EmptyState
 *   icon={Calendar}
 *   title="尚無賽季"
 *   description="建立第一個賽季以開始追蹤數據"
 *   action={{ label: "建立賽季", onClick: handleCreate, icon: Plus }}
 * />
 *
 * @example
 * // Compact variant without icon
 * <EmptyState
 *   variant="compact"
 *   title="尚無數據"
 *   description="請先上傳 CSV 數據"
 * />
 *
 * @example
 * // Minimal variant - just text
 * <EmptyState variant="minimal" title="暫無記錄" />
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant = 'full',
  className,
}: EmptyStateProps) {
  const ActionIcon = action?.icon

  if (variant === 'minimal') {
    return (
      <div className={cn('py-8 text-center', className)}>
        <p className="text-sm text-muted-foreground">{title}</p>
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className={cn('py-8 text-center', className)}>
        <p className="text-muted-foreground mb-2">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
            {description}
          </p>
        )}
        {action && (
          <Button onClick={action.onClick} size="sm">
            {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
            {action.label}
          </Button>
        )}
      </div>
    )
  }

  // Full variant (default)
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 text-center border-2 border-dashed rounded-lg',
        className
      )}
    >
      {Icon && (
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <p className="text-muted-foreground mb-4">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick}>
          {ActionIcon && <ActionIcon className="h-4 w-4 mr-2" />}
          {action.label}
        </Button>
      )}
    </div>
  )
}

export { EmptyState }
export type { EmptyStateProps, EmptyStateAction }
