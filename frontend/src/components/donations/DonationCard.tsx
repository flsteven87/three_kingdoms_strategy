import { Calendar, ChevronDown, Gift, Trash2 } from 'lucide-react'
import { StatusBadge, type StatusType } from './StatusBadge'
import { cn } from '@/lib/utils'

interface Tag {
    readonly id: string
    readonly label: string
}

interface DonationCardProps {
    readonly title: string
    readonly tags: Tag[]
    readonly deadline: string
    readonly status: StatusType
    readonly perPersonTarget?: number
    readonly children?: React.ReactNode
    readonly isOpen?: boolean
    readonly onToggle?: () => void
    readonly onDelete?: () => void
}

export function DonationCard({
    title,
    tags,
    deadline,
    status,
    perPersonTarget,
    children,
    isOpen = false,
    onToggle,
    onDelete,
}: DonationCardProps) {
    const formatNumber = (num: number) => num.toLocaleString('zh-TW')

    return (
        <div className={cn('overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md', isOpen && 'shadow-md')}>
            <button
                onClick={onToggle}
                className="flex w-full items-start gap-4 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                {/* Icon */}
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Gift className="h-5 w-5" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-2">
                    {/* Title row with tags */}
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
                        {tags.length > 0 && (
                            <>
                                {tags.map((tag) => (
                                    <span
                                        key={tag.id}
                                        className={
                                            tag.id === 'penalty'
                                                ? 'inline-flex items-center rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-white'
                                                : 'inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground'
                                        }
                                    >
                                        {tag.label}
                                    </span>
                                ))}
                            </>
                        )}
                    </div>

                    {/* Deadline and target info */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>截止日: {deadline}</span>
                        {perPersonTarget && <span className="ml-2">每人目標: {formatNumber(perPersonTarget)}</span>}
                    </div>
                </div>

                {/* Status and Chevron */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <StatusBadge status={status} />
                        {onDelete && (
                            <div
                                role="button"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    onDelete()
                                }}
                                className="text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                                aria-label="刪除活動"
                            >
                                <Trash2 className="h-4 w-4" />
                            </div>
                        )}
                    </div>
                    <div
                        className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        aria-hidden
                    >
                        <ChevronDown className="h-5 w-5" />
                    </div>
                </div>
            </button>

            {/* Expandable content */}
            {isOpen && (
                <div className="animate-in slide-in-from-top-2 duration-200 ease-out overflow-hidden" onClick={(e) => e.stopPropagation()}>
                    <div className="border-t border-border bg-card px-4 py-4 space-y-4">
                        {children ? (
                            <div className="space-y-3 pl-6 pr-6">{children}</div>
                        ) : (
                            <p className="text-sm italic text-muted-foreground pl-6">暫無詳細說明</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
