import { useState } from 'react'
import { ChevronDown, Gift, Calendar } from 'lucide-react'
import { StatusBadge, type StatusType } from './StatusBadge'
import { ProgressBar } from './ProgressBar'
import { cn } from '@/lib/utils'

interface Tag {
    id: string
    label: string
}

interface ContributionCardProps {
    title: string
    tags: Tag[]
    deadline: string
    currentAmount: number
    targetAmount: number
    status: StatusType
    perPersonTarget?: number
    description?: string
}

export function ContributionCard({
    title,
    tags,
    deadline,
    currentAmount,
    targetAmount,
    status,
    perPersonTarget,
    description,
}: ContributionCardProps) {
    const [isOpen, setIsOpen] = useState(false)

    const formatNumber = (num: number) => num.toLocaleString('zh-TW')

    return (
        <div className={cn('overflow-hidden rounded-lg border border-border bg-card shadow-sm transition-shadow hover:shadow-md', isOpen && 'shadow-md')}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex w-full items-start gap-4 p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                {/* Icon */}
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Gift className="h-5 w-5" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1 space-y-2">
                    {/* Title row with status */}
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-card-foreground">{title}</h3>
                        <StatusBadge status={status} />
                    </div>

                    {/* Tags */}
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                                <span
                                    key={tag.id}
                                    className={
                                        tag.id === 'punish'
                                            ? 'inline-flex items-center rounded-md bg-destructive px-2 py-0.5 text-xs font-medium text-white'
                                            : 'inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground'
                                    }
                                >
                                    {tag.label}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Deadline and target info */}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>截止日: {deadline}</span>
                        {perPersonTarget && <span className="ml-2">每人目標: {formatNumber(perPersonTarget)}</span>}
                    </div>

                    {/* Progress */}
                    <ProgressBar current={currentAmount} total={targetAmount} />
                </div>

                {/* Chevron */}
                <div
                    className={`flex-shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                >
                    <ChevronDown className="h-5 w-5" />
                </div>
            </button>

            {/* Expandable content */}
            {isOpen && (
                <div className="animate-in slide-in-from-top-2 duration-200 ease-out overflow-hidden">
                    <div className="border-t border-border bg-secondary/30 px-4 py-4 pl-[4.5rem]">
                        {description ? (
                            <p className="text-sm text-muted-foreground">{description}</p>
                        ) : (
                            <p className="text-sm italic text-muted-foreground">暫無詳細說明</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
