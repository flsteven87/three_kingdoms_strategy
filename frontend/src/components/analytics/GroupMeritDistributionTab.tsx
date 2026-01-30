import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { DetailedStripPlot } from './BoxPlot'
import { Bar, BarChart, Line, LineChart, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import {
    formatNumber,
    formatNumberCompact,
    expandPeriodsToDaily,
    getPeriodBoundaryTicks,
    formatDateLabel,
    calculateDistributionBins,
    type DistributionBin,
} from '@/lib/chart-utils'
import { groupChartConfigs } from '@/lib/chart-configs'
import type { GroupStats, GroupMember, GroupTrendItem } from '@/types/analytics'

interface GroupMeritDistributionTabProps {
    readonly groupStats: GroupStats
    readonly members: readonly GroupMember[]
    readonly periodTrends: readonly GroupTrendItem[]
}

export function GroupMeritDistributionTab({ groupStats, members, periodTrends }: GroupMeritDistributionTabProps) {
    // Expand periods to daily data for date-based X-axis
    const dailyData = useMemo(
        () =>
            expandPeriodsToDaily(periodTrends, (p) => ({
                avgRank: p.avg_rank,
                avgMerit: p.avg_merit,
                avgAssist: p.avg_assist,
            })),
        [periodTrends]
    )
    const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(periodTrends), [periodTrends])

    // Calculate dynamic merit distribution bins using shared utility
    const meritBins = useMemo(
        () => calculateDistributionBins(members, (m) => m.daily_merit),
        [members]
    )

    // Prepare box plot stats and strip plot points
    const boxPlotStats = useMemo(() => ({
        min: groupStats.merit_min,
        q1: groupStats.merit_q1,
        median: groupStats.merit_median,
        q3: groupStats.merit_q3,
        max: groupStats.merit_max,
    }), [groupStats])

    const stripPlotPoints = useMemo(() =>
        members.map(m => ({
            id: m.id,
            name: m.name,
            value: m.daily_merit,
        })),
        [members]
    )

    return (
        <div className="space-y-6">
            {/* Detailed Strip Plot - member list with visual positions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">戰功分佈概覽</CardTitle>
                    <CardDescription>
                        箱型圖統計 · 每位成員獨立一行顯示
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <DetailedStripPlot
                        stats={boxPlotStats}
                        points={stripPlotPoints}
                        color="primary"
                        sortOrder="desc"
                    />
                </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Merit Distribution by Range */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">戰功區間分佈</CardTitle>
                        <CardDescription>成員日均戰功區間人數分佈</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={groupChartConfigs.meritDistribution} className="h-[220px] w-full">
                            <BarChart data={meritBins} margin={{ left: 10, right: 10, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                                <XAxis
                                    dataKey="label"
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                    angle={-30}
                                    textAnchor="end"
                                    height={50}
                                    interval={0}
                                />
                                <YAxis tickLine={false} axisLine={false} className="text-xs" />
                                <ChartTooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const data = payload[0].payload as DistributionBin
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium">日均戰功: {data.label}</div>
                                                <div className="text-sm">人數: {data.count} ({data.percentage}%)</div>
                                            </div>
                                        )
                                    }}
                                />
                                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* Merit Trend */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">戰功與助攻趨勢</CardTitle>
                        <CardDescription>組別人日均戰功/助攻變化</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={groupChartConfigs.meritTrend} className="h-[220px] w-full">
                            <LineChart data={dailyData} margin={{ left: 12, right: 12 }}>
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
                                    yAxisId="left"
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                    tickFormatter={(value) => formatNumberCompact(value)}
                                />
                                <YAxis yAxisId="right" orientation="right" tickLine={false} axisLine={false} className="text-xs" />
                                <ChartTooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const data = payload[0].payload as (typeof dailyData)[0]
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium">{data.dateLabel}</div>
                                                <div className="text-sm">人日均戰功: {formatNumber(data.avgMerit)}</div>
                                                <div className="text-sm">人日均助攻: {data.avgAssist}</div>
                                            </div>
                                        )
                                    }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                <Line
                                    yAxisId="left"
                                    type="stepAfter"
                                    dataKey="avgMerit"
                                    name="人日均戰功"
                                    stroke="var(--primary)"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 5 }}
                                />
                                <Line
                                    yAxisId="right"
                                    type="stepAfter"
                                    dataKey="avgAssist"
                                    name="人日均助攻"
                                    stroke="var(--chart-2)"
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{ r: 5 }}
                                />
                            </LineChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
