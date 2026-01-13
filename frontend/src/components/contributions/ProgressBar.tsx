import { useMemo } from 'react'

interface ProgressBarProps {
    current: number
    total: number
}

export function ProgressBar({ current, total }: ProgressBarProps) {
    const pct = useMemo(() => {
        if (total <= 0) return 0
        return Math.min(100, Math.round((current / total) * 100))
    }, [current, total])

    return (
        <div>
            <div className="w-full bg-muted h-3 rounded-full overflow-hidden">
                <div className="h-3 bg-primary/60 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-sm text-muted-foreground mt-3">{current.toLocaleString('zh-TW')}/{total.toLocaleString('zh-TW')}</div>
        </div>
    )
}
