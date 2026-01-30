import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { KpiCard } from './KpiCard'
import type { ViewMode } from './ViewModeToggle'
import type { AllianceAnalyticsResponse, AllianceTrendWithMedian, DistributionBin } from '@/types/analytics'
import {
    Bar,
    BarChart,
    Line,
    LineChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Legend,
} from 'recharts'
import {
    formatNumber,
    formatNumberCompact,
    expandPeriodsToDaily,
    getPeriodBoundaryTicks,
    formatDateLabel,
} from '@/lib/chart-utils'
import { allianceChartConfigs } from '@/lib/chart-configs'

interface OverviewTabProps {
    readonly viewMode: ViewMode
    readonly data: AllianceAnalyticsResponse
}

export function OverviewTab({ viewMode, data }: OverviewTabProps) {
    const { summary, trends, distributions, current_period } = data

    // Expand periods to daily data for trend chart
    const dailyTrendData = useMemo(
        () =>
            expandPeriodsToDaily(trends, (p: AllianceTrendWithMedian) => ({
                contribution: p.avg_daily_contribution,
                merit: p.avg_daily_merit,
                medianContribution: p.median_daily_contribution,
                medianMerit: p.median_daily_merit,
            })),
        [trends]
    )
    const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(trends), [trends])

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <KpiCard
                    title="人日均貢獻"
                    value={formatNumber(summary.avg_daily_contribution)}
                    subtitle={viewMode === 'season' ? '賽季加權平均' : current_period.period_label}
                    trend={summary.contribution_change_pct !== null ? { value: summary.contribution_change_pct, label: '% vs 前期' } : undefined}
                    highlight
                />
                <KpiCard
                    title="人日均戰功"
                    value={formatNumber(summary.avg_daily_merit)}
                    subtitle={viewMode === 'season' ? '賽季加權平均' : current_period.period_label}
                    trend={summary.merit_change_pct !== null ? { value: summary.merit_change_pct, label: '% vs 前期' } : undefined}
                    highlight
                />
                <KpiCard
                    title="人日均協助"
                    value={formatNumber(summary.avg_daily_assist)}
                    subtitle={viewMode === 'season' ? '賽季加權平均' : current_period.period_label}
                />
                <KpiCard
                    title="平均勢力"
                    value={formatNumber(summary.avg_power)}
                    trend={summary.power_change_pct !== null ? { value: summary.power_change_pct, label: '% vs 前期' } : undefined}
                />
            </div>

            {/* Trend Charts with Distribution */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Contribution Trend + Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">貢獻趨勢與分佈</CardTitle>
                        <CardDescription>人日均貢獻趨勢與區間分佈</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Trend Line */}
                        <ChartContainer config={allianceChartConfigs.trend} className="h-[200px] w-full">
                            <LineChart data={dailyTrendData} margin={{ left: 12, right: 12 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                    ticks={xAxisTicks}
                                    tickFormatter={formatDateLabel}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                    tickFormatter={(v) => formatNumberCompact(v)}
                                />
                                <ChartTooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const d = payload[0].payload
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium">{d.dateLabel}</div>
                                                <div className="text-sm">平均: {formatNumber(d.contribution)}</div>
                                                <div className="text-sm text-muted-foreground">中位數: {formatNumber(d.medianContribution)}</div>
                                            </div>
                                        )
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Line
                                    type="stepAfter"
                                    dataKey="contribution"
                                    name="人日均貢獻"
                                    stroke="var(--primary)"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 5 }}
                                />
                                <Line
                                    type="stepAfter"
                                    dataKey="medianContribution"
                                    name="中位數"
                                    stroke="var(--muted-foreground)"
                                    strokeWidth={1}
                                    strokeDasharray="4 4"
                                    dot={false}
                                />
                            </LineChart>
                        </ChartContainer>

                        {/* Distribution Bar */}
                        <div className="border-t pt-4">
                            <div className="text-sm font-medium mb-2">區間分佈</div>
                            <ChartContainer config={allianceChartConfigs.distribution} className="h-[140px] w-full">
                                <BarChart data={[...distributions.contribution]} margin={{ left: 12, right: 12 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="range" tickLine={false} axisLine={false} className="text-xs" />
                                    <YAxis tickLine={false} axisLine={false} className="text-xs" width={30} />
                                    <ChartTooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null
                                            const d = payload[0].payload as DistributionBin
                                            return (
                                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                    <div className="font-medium">{d.range}</div>
                                                    <div className="text-sm">{d.count} 人</div>
                                                </div>
                                            )
                                        }}
                                    />
                                    <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                            <div className="text-xs text-muted-foreground mt-2">
                                平均: {formatNumber(summary.avg_daily_contribution)} / 中位數: {formatNumber(summary.median_daily_contribution)}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Merit Trend + Distribution */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">戰功趨勢與分佈</CardTitle>
                        <CardDescription>人日均戰功趨勢與區間分佈</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {/* Trend Line */}
                        <ChartContainer config={allianceChartConfigs.trend} className="h-[200px] w-full">
                            <LineChart data={dailyTrendData} margin={{ left: 12, right: 12 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                    ticks={xAxisTicks}
                                    tickFormatter={formatDateLabel}
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                    tickFormatter={(v) => formatNumberCompact(v)}
                                />
                                <ChartTooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const d = payload[0].payload
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium">{d.dateLabel}</div>
                                                <div className="text-sm">平均: {formatNumber(d.merit)}</div>
                                                <div className="text-sm text-muted-foreground">中位數: {formatNumber(d.medianMerit)}</div>
                                            </div>
                                        )
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Line
                                    type="stepAfter"
                                    dataKey="merit"
                                    name="人日均戰功"
                                    stroke="var(--chart-2)"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 5 }}
                                />
                                <Line
                                    type="stepAfter"
                                    dataKey="medianMerit"
                                    name="中位數"
                                    stroke="var(--muted-foreground)"
                                    strokeWidth={1}
                                    strokeDasharray="4 4"
                                    dot={false}
                                />
                            </LineChart>
                        </ChartContainer>

                        {/* Distribution Bar */}
                        <div className="border-t pt-4">
                            <div className="text-sm font-medium mb-2">區間分佈</div>
                            <ChartContainer config={allianceChartConfigs.distribution} className="h-[140px] w-full">
                                <BarChart data={[...distributions.merit]} margin={{ left: 12, right: 12 }}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="range" tickLine={false} axisLine={false} className="text-xs" />
                                    <YAxis tickLine={false} axisLine={false} className="text-xs" width={30} />
                                    <ChartTooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null
                                            const d = payload[0].payload as DistributionBin
                                            return (
                                                <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                    <div className="font-medium">{d.range}</div>
                                                    <div className="text-sm">{d.count} 人</div>
                                                </div>
                                            )
                                        }}
                                    />
                                    <Bar dataKey="count" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                            <div className="text-xs text-muted-foreground mt-2">
                                平均: {formatNumber(summary.avg_daily_merit)} / 中位數: {formatNumber(summary.median_daily_merit)}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
