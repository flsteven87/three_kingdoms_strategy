import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { TrendingUp, TrendingDown } from 'lucide-react'
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Bar,
    BarChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Cell,
} from 'recharts'
import { formatNumber, formatNumberCompact, calculatePercentDiff } from '@/lib/chart-utils'
import { groupChartConfigs, MEDIAN_LINE_COLOR } from '@/lib/chart-configs'
import type { GroupStats, GroupComparisonItem, AllianceAveragesResponse } from '@/types/analytics'

interface GroupOverviewTabProps {
    readonly groupStats: GroupStats
    readonly allianceAverages: AllianceAveragesResponse
    readonly allGroupsData: readonly GroupComparisonItem[]
    readonly groupParticipationRates: { overall: number; siege: number; battle: number }
    readonly allGroupsParticipation: Map<string, { overall: number; siege: number; battle: number }>
}

export function GroupOverviewTab({
    groupStats,
    allianceAverages,
    allGroupsData,
    groupParticipationRates,
    allGroupsParticipation,
}: GroupOverviewTabProps) {
    // Note: groupStats already contains correct values based on viewMode
    // Backend returns latest period data for 'latest' view, season-weighted data for 'season' view
    // No need to calculate season averages on frontend - backend handles this

    // Capability radar data: normalized to alliance average (100 = alliance average)
    const radarData = useMemo(() => {
        const normalize = (value: number, avg: number) => (avg > 0 ? Math.round((value / avg) * 100) : 0)

        return [
            {
                metric: '貢獻',
                group: normalize(groupStats.avg_daily_contribution, allianceAverages.avg_daily_contribution),
                groupRaw: groupStats.avg_daily_contribution,
                alliance: 100,
                allianceRaw: allianceAverages.avg_daily_contribution,
                median: normalize(allianceAverages.median_daily_contribution, allianceAverages.avg_daily_contribution),
                medianRaw: allianceAverages.median_daily_contribution,
            },
            {
                metric: '戰功',
                group: normalize(groupStats.avg_daily_merit, allianceAverages.avg_daily_merit),
                groupRaw: groupStats.avg_daily_merit,
                alliance: 100,
                allianceRaw: allianceAverages.avg_daily_merit,
                median: normalize(allianceAverages.median_daily_merit, allianceAverages.avg_daily_merit),
                medianRaw: allianceAverages.median_daily_merit,
            },
            {
                metric: '勢力值',
                group: normalize(groupStats.avg_power, allianceAverages.avg_power),
                groupRaw: groupStats.avg_power,
                alliance: 100,
                allianceRaw: allianceAverages.avg_power,
                median: normalize(allianceAverages.median_power, allianceAverages.avg_power),
                medianRaw: allianceAverages.median_power,
            },
            {
                metric: '助攻',
                group: normalize(groupStats.avg_daily_assist, allianceAverages.avg_daily_assist),
                groupRaw: groupStats.avg_daily_assist,
                alliance: 100,
                allianceRaw: allianceAverages.avg_daily_assist,
                median: normalize(allianceAverages.median_daily_assist, allianceAverages.avg_daily_assist),
                medianRaw: allianceAverages.median_daily_assist,
            },
            {
                metric: '捐獻',
                group: normalize(groupStats.avg_daily_donation, allianceAverages.avg_daily_donation),
                groupRaw: groupStats.avg_daily_donation,
                alliance: 100,
                allianceRaw: allianceAverages.avg_daily_donation,
                median: normalize(allianceAverages.median_daily_donation, allianceAverages.avg_daily_donation),
                medianRaw: allianceAverages.median_daily_donation,
            },
        ]
    }, [groupStats, allianceAverages])

    const contributionDiff = calculatePercentDiff(groupStats.avg_daily_contribution, allianceAverages.avg_daily_contribution)
    const meritDiff = calculatePercentDiff(groupStats.avg_daily_merit, allianceAverages.avg_daily_merit)
    const assistDiff = calculatePercentDiff(groupStats.avg_daily_assist, allianceAverages.avg_daily_assist)

    // Transform comparison data for chart
    const chartData = useMemo(() =>
        allGroupsData.map(g => ({
            name: g.name,
            merit: g.avg_daily_merit,
            avgRank: g.avg_rank,
            memberCount: g.member_count,
        })),
        [allGroupsData]
    )

    // Participation by event type data
    const participationByTypeData = useMemo(() => [
        { type: '整體', rate: groupParticipationRates.overall },
        { type: '攻城', rate: groupParticipationRates.siege },
        { type: '會戰', rate: groupParticipationRates.battle },
    ], [groupParticipationRates])

    // All groups participation comparison data
    const participationComparisonData = useMemo(() => {
        return allGroupsData
            .map(g => {
                const participation = allGroupsParticipation.get(g.name)
                return {
                    name: g.name,
                    overall: participation?.overall ?? 0,
                    siege: participation?.siege ?? 0,
                    battle: participation?.battle ?? 0,
                }
            })
            .sort((a, b) => b.overall - a.overall)
    }, [allGroupsData, allGroupsParticipation])

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {/* Member Count */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>成員數</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">{groupStats.member_count}</div>
                    </CardContent>
                </Card>

                {/* Daily Contribution */}
                <Card className="border-primary/50">
                    <CardHeader className="pb-2">
                        <CardDescription>人日均貢獻</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">{formatNumber(groupStats.avg_daily_contribution)}</div>
                        <div className="flex items-center gap-1 mt-1">
                            {contributionDiff >= 0 ? (
                                <TrendingUp className="h-3 w-3 text-primary" />
                            ) : (
                                <TrendingDown className="h-3 w-3 text-destructive" />
                            )}
                            <span className={`text-xs ${contributionDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                {contributionDiff >= 0 ? '+' : ''}
                                {contributionDiff.toFixed(1)}% vs 盟均
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Daily Merit */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>人日均戰功</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">{formatNumber(groupStats.avg_daily_merit)}</div>
                        <div className="flex items-center gap-1 mt-1">
                            {meritDiff >= 0 ? (
                                <TrendingUp className="h-3 w-3 text-primary" />
                            ) : (
                                <TrendingDown className="h-3 w-3 text-destructive" />
                            )}
                            <span className={`text-xs ${meritDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                {meritDiff >= 0 ? '+' : ''}
                                {meritDiff.toFixed(1)}% vs 盟均
                            </span>
                        </div>
                    </CardContent>
                </Card>

                {/* Daily Assist */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>人日均助攻</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">{formatNumber(groupStats.avg_daily_assist)}</div>
                        <div className="flex items-center gap-1 mt-1">
                            {assistDiff >= 0 ? (
                                <TrendingUp className="h-3 w-3 text-primary" />
                            ) : (
                                <TrendingDown className="h-3 w-3 text-destructive" />
                            )}
                            <span className={`text-xs ${assistDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                                {assistDiff >= 0 ? '+' : ''}
                                {assistDiff.toFixed(1)}% vs 盟均
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Row 1: Capability Radar + Merit Comparison */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Capability Radar (5 dimensions) */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">五維能力圖</CardTitle>
                        <CardDescription>組別人日均表現 vs 同盟平均/中位數（100% = 同盟平均）</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={groupChartConfigs.capabilityRadar} className="mx-auto aspect-square max-h-[280px]">
                            <RadarChart data={radarData}>
                                <PolarGrid gridType="polygon" />
                                <PolarAngleAxis dataKey="metric" className="text-xs" tick={{ fill: 'var(--foreground)', fontSize: 12 }} />
                                <PolarRadiusAxis
                                    angle={90}
                                    domain={[0, Math.max(150, ...radarData.map((d) => Math.max(d.group, d.median)))]}
                                    tick={{ fontSize: 10 }}
                                    tickFormatter={(value) => `${value}%`}
                                />
                                <Radar
                                    name="同盟平均"
                                    dataKey="alliance"
                                    stroke="var(--muted-foreground)"
                                    fill="var(--muted-foreground)"
                                    fillOpacity={0.1}
                                    strokeWidth={1}
                                    strokeDasharray="4 4"
                                />
                                <Radar
                                    name="同盟中位數"
                                    dataKey="median"
                                    stroke={MEDIAN_LINE_COLOR}
                                    fill={MEDIAN_LINE_COLOR}
                                    fillOpacity={0.08}
                                    strokeWidth={1}
                                    strokeDasharray="2 2"
                                />
                                <Radar
                                    name={groupStats.group_name}
                                    dataKey="group"
                                    stroke="var(--primary)"
                                    fill="var(--primary)"
                                    fillOpacity={0.4}
                                    strokeWidth={2}
                                />
                                <ChartTooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const data = payload[0].payload as (typeof radarData)[0]
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium mb-1">{data.metric}</div>
                                                <div className="text-sm">
                                                    {groupStats.group_name}：{formatNumberCompact(data.groupRaw)} ({data.group}%)
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    同盟平均：{formatNumberCompact(data.allianceRaw)} ({data.alliance}%)
                                                </div>
                                                <div className="text-sm" style={{ color: MEDIAN_LINE_COLOR }}>
                                                    同盟中位數：{formatNumberCompact(data.medianRaw)} ({data.median}%)
                                                </div>
                                            </div>
                                        )
                                    }}
                                />
                            </RadarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* All Groups Comparison by Merit */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">全組別戰功比較</CardTitle>
                        <CardDescription>人日均戰功排名</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={groupChartConfigs.meritBar} className="h-[320px] w-full">
                            <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 16 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={true} vertical={false} />
                                <XAxis
                                    type="number"
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => formatNumberCompact(value)}
                                    className="text-xs"
                                />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                    width={70}
                                />
                                <ChartTooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const data = payload[0].payload as (typeof chartData)[0]
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium">{data.name}</div>
                                                <div className="text-sm">人日均戰功: {formatNumber(data.merit)}</div>
                                                <div className="text-sm text-muted-foreground">平均排名: #{Math.round(data.avgRank)}</div>
                                                <div className="text-sm text-muted-foreground">成員數: {data.memberCount}</div>
                                            </div>
                                        )
                                    }}
                                />
                                <Bar dataKey="merit" radius={[0, 4, 4, 0]}>
                                    {chartData.map((entry) => (
                                        <Cell
                                            key={entry.name}
                                            fill={entry.name === groupStats.group_name ? 'var(--primary)' : 'var(--muted)'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Row 2: Participation Charts */}
            <div className="grid gap-6 md:grid-cols-2">
                {/* Participation by Event Type */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">活動參與率</CardTitle>
                        <CardDescription>依活動類型統計</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={groupChartConfigs.meritBar} className="h-[280px] w-full">
                            <BarChart data={participationByTypeData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                <XAxis
                                    dataKey="type"
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                />
                                <YAxis
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}%`}
                                    domain={[0, 100]}
                                    className="text-xs"
                                />
                                <ChartTooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const data = payload[0].payload as (typeof participationByTypeData)[0]
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium">{data.type}活動</div>
                                                <div className="text-sm">參與率: {data.rate.toFixed(1)}%</div>
                                            </div>
                                        )
                                    }}
                                />
                                <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
                                    {participationByTypeData.map((entry) => {
                                        let color = 'hsl(142, 45%, 70%)' // Pastel green
                                        if (entry.type === '攻城') color = 'hsl(25, 60%, 70%)' // Pastel orange
                                        if (entry.type === '會戰') color = 'hsl(210, 50%, 70%)' // Pastel blue
                                        return (
                                            <Cell key={entry.type} fill={color} />
                                        )
                                    })}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>

                {/* All Groups Participation Comparison */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">全組別參與率比較</CardTitle>
                        <CardDescription>整體活動參與率排名</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ChartContainer config={groupChartConfigs.meritBar} className="h-[280px] w-full">
                            <BarChart data={participationComparisonData} layout="vertical" margin={{ left: 0, right: 16 }}>
                                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={true} vertical={false} />
                                <XAxis
                                    type="number"
                                    tickLine={false}
                                    axisLine={false}
                                    tickFormatter={(value) => `${value}%`}
                                    domain={[0, 100]}
                                    className="text-xs"
                                />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    tickLine={false}
                                    axisLine={false}
                                    className="text-xs"
                                    width={70}
                                    interval={0}
                                />
                                <ChartTooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload?.length) return null
                                        const data = payload[0].payload as (typeof participationComparisonData)[0]
                                        return (
                                            <div className="rounded-lg border bg-background p-2 shadow-sm">
                                                <div className="font-medium">{data.name}</div>
                                                <div className="text-sm">整體參與率: {data.overall.toFixed(1)}%</div>
                                                <div className="text-sm text-muted-foreground">攻城: {data.siege.toFixed(1)}%</div>
                                                <div className="text-sm text-muted-foreground">會戰: {data.battle.toFixed(1)}%</div>
                                            </div>
                                        )
                                    }}
                                />
                                <Bar dataKey="overall" radius={[0, 4, 4, 0]}>
                                    {participationComparisonData.map((entry) => (
                                        <Cell
                                            key={entry.name}
                                            fill={entry.name === groupStats.group_name ? 'var(--primary)' : 'var(--muted)'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
