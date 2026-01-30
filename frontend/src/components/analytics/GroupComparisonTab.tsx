import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { BoxPlotComparison } from './BoxPlot'
import type { AllianceAnalyticsResponse, GroupStatsWithBoxPlot } from '@/types/analytics'
import {
    Bar,
    BarChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Cell,
    ReferenceLine,
} from 'recharts'
import { formatNumber, formatNumberCompact, calculatePercentDiff } from '@/lib/chart-utils'
import { allianceChartConfigs } from '@/lib/chart-configs'

interface GroupComparisonTabProps {
    readonly data: AllianceAnalyticsResponse
}

export function GroupComparisonTab({ data }: GroupComparisonTabProps) {
    const [metric, setMetric] = useState<'contribution' | 'merit' | 'rank'>('contribution')
    const [boxPlotMetric, setBoxPlotMetric] = useState<'contribution' | 'merit'>('contribution')

    const { groups, summary } = data

    // Prepare chart data based on selected metric
    const chartData = useMemo(() => {
        const sorted = [...groups].sort((a, b) => {
            if (metric === 'rank') return a.avg_rank - b.avg_rank
            if (metric === 'contribution') return b.avg_daily_contribution - a.avg_daily_contribution
            return b.avg_daily_merit - a.avg_daily_merit
        })
        return sorted.map((g: GroupStatsWithBoxPlot) => ({
            name: g.name,
            value: metric === 'contribution' ? g.avg_daily_contribution
                : metric === 'merit' ? g.avg_daily_merit
                    : g.avg_rank,
        }))
    }, [groups, metric])

    const referenceValue = metric === 'contribution' ? summary.avg_daily_contribution
        : metric === 'merit' ? summary.avg_daily_merit
            : null

    // Prepare box plot data
    const boxPlotItems = useMemo(() => {
        return groups.map((g: GroupStatsWithBoxPlot) => ({
            name: g.name,
            stats: boxPlotMetric === 'contribution'
                ? { min: g.contribution_min, q1: g.contribution_q1, median: g.contribution_median, q3: g.contribution_q3, max: g.contribution_max }
                : { min: g.merit_min, q1: g.merit_q1, median: g.merit_median, q3: g.merit_q3, max: g.merit_max },
        }))
    }, [groups, boxPlotMetric])

    return (
        <div className="space-y-6">
            {/* Box Plot Distribution */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base">組別分佈對比</CardTitle>
                            <CardDescription>各組 Min / Q1 / Median / Q3 / Max</CardDescription>
                        </div>
                        <Tabs value={boxPlotMetric} onValueChange={(v) => setBoxPlotMetric(v as 'contribution' | 'merit')}>
                            <TabsList className="h-8">
                                <TabsTrigger value="contribution" className="text-xs px-3">貢獻</TabsTrigger>
                                <TabsTrigger value="merit" className="text-xs px-3">戰功</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </CardHeader>
                <CardContent>
                    <BoxPlotComparison items={boxPlotItems} />
                </CardContent>
            </Card>

            {/* Bar Chart */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base">組別指標對比</CardTitle>
                            <CardDescription>
                                {metric === 'rank' ? '排名越小越好' : '按數值高低排序'}
                            </CardDescription>
                        </div>
                        <Tabs value={metric} onValueChange={(v) => setMetric(v as 'contribution' | 'merit' | 'rank')}>
                            <TabsList className="h-8">
                                <TabsTrigger value="contribution" className="text-xs px-3">貢獻</TabsTrigger>
                                <TabsTrigger value="merit" className="text-xs px-3">戰功</TabsTrigger>
                                <TabsTrigger value="rank" className="text-xs px-3">排名</TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>
                </CardHeader>
                <CardContent>
                    <ChartContainer config={allianceChartConfigs.groupBar} className="h-[320px] w-full">
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ left: 60, right: 40 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                            <XAxis
                                type="number"
                                tickLine={false}
                                axisLine={false}
                                className="text-xs"
                                tickFormatter={(v) => metric === 'rank' ? `#${v}` : formatNumberCompact(v)}
                            />
                            <YAxis
                                type="category"
                                dataKey="name"
                                tickLine={false}
                                axisLine={false}
                                className="text-xs"
                                width={55}
                            />
                            {referenceValue && (
                                <ReferenceLine
                                    x={referenceValue}
                                    stroke="var(--muted-foreground)"
                                    strokeDasharray="4 4"
                                    label={{ value: '盟均', position: 'top', className: 'text-xs fill-muted-foreground' }}
                                />
                            )}
                            <ChartTooltip
                                content={({ active, payload }) => {
                                    if (!active || !payload?.length) return null
                                    const d = payload[0].payload
                                    const groupData = groups.find(g => g.name === d.name)
                                    return (
                                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                                            <div className="font-medium">{d.name}</div>
                                            <div className="text-sm">
                                                {metric === 'rank' ? `平均排名: #${Math.round(d.value)}` : `${metric === 'contribution' ? '貢獻' : '戰功'}: ${formatNumber(d.value)}`}
                                            </div>
                                            {groupData && referenceValue && metric !== 'rank' && (
                                                <div className={`text-xs ${d.value >= referenceValue ? 'text-primary' : 'text-destructive'}`}>
                                                    vs 盟均: {d.value >= referenceValue ? '+' : ''}{calculatePercentDiff(d.value, referenceValue).toFixed(1)}%
                                                </div>
                                            )}
                                        </div>
                                    )
                                }}
                            />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {chartData.map((d, i) => (
                                    <Cell
                                        key={d.name}
                                        fill={i < 2 ? 'var(--primary)' : i < 4 ? 'var(--chart-2)' : 'var(--muted)'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                </CardContent>
            </Card>

            {/* Summary Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">組別摘要</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-2 px-2 font-medium">組別</th>
                                    <th className="text-right py-2 px-2 font-medium">人日均貢獻</th>
                                    <th className="text-right py-2 px-2 font-medium">vs 盟均</th>
                                    <th className="text-right py-2 px-2 font-medium">人日均戰功</th>
                                    <th className="text-right py-2 px-2 font-medium">平均排名</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((g: GroupStatsWithBoxPlot) => {
                                    const contribDiff = calculatePercentDiff(g.avg_daily_contribution, summary.avg_daily_contribution)
                                    return (
                                        <tr key={g.name} className="border-b last:border-0">
                                            <td className="py-2 px-2 font-medium">{g.name}</td>
                                            <td className="py-2 px-2 text-right tabular-nums">{formatNumber(g.avg_daily_contribution)}</td>
                                            <td className={`py-2 px-2 text-right tabular-nums ${contribDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                                {contribDiff >= 0 ? '+' : ''}{contribDiff.toFixed(1)}%
                                            </td>
                                            <td className="py-2 px-2 text-right tabular-nums">{formatNumber(g.avg_daily_merit)}</td>
                                            <td className="py-2 px-2 text-right tabular-nums">#{Math.round(g.avg_rank)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
