import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface KpiCardProps {
    readonly title: string
    readonly value: string | number
    readonly subtitle?: string
    readonly trend?: { value: number; label: string; isPositiveGood?: boolean }
    readonly highlight?: boolean
}

export function KpiCard({ title, value, subtitle, trend, highlight }: KpiCardProps) {
    const isPositive = trend && trend.value >= 0
    const trendColor = trend
        ? trend.isPositiveGood !== false
            ? isPositive
                ? 'text-primary'
                : 'text-destructive'
            : isPositive
                ? 'text-destructive'
                : 'text-primary'
        : ''

    return (
        <Card className={highlight ? 'border-primary/50' : ''}>
            <CardHeader className="pb-2">
                <CardDescription>{title}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold tabular-nums">{value}</div>
                {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
                {trend && (
                    <div className="flex items-center gap-1 mt-1">
                        {isPositive ? (
                            <TrendingUp className={`h-3 w-3 ${trendColor}`} />
                        ) : (
                            <TrendingDown className={`h-3 w-3 ${trendColor}`} />
                        )}
                        <span className={`text-xs ${trendColor}`}>
                            {isPositive ? '+' : ''}
                            {trend.value.toFixed(1)}
                            {trend.label}
                        </span>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
