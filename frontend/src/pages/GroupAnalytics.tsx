/**
 * GroupAnalytics - Group Performance Analytics Page
 *
 * Group-level performance analysis based on calculable metrics:
 * - Group selector dropdown
 * - Tab-based navigation:
 *   1. Overview: Group summary stats + Capability Radar (4 dimensions)
 *   2. Merit Distribution: Box plot + Strip plot + Dynamic range histogram + Trends
 *   3. Contribution Rank: Rank distribution + Trends
 *   4. Member Rankings: Sortable member table within group
 *
 * Key concept: "Person-day average" (人日均) = daily_* metrics averaged across group members
 * This normalizes for both time and group size, enabling fair comparison.
 */

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { EmptyState } from '@/components/ui/empty-state'
import { RankChangeIndicator } from '@/components/analytics/RankChangeIndicator'
import { DetailedStripPlot } from '@/components/analytics/BoxPlot'
import { ViewModeToggle, type ViewMode } from '@/components/analytics/ViewModeToggle'
import {
  TrendingUp,
  TrendingDown,
  LayoutDashboard,
  BarChart3,
  Trophy,
  Users,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Cell,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart'
import {
  formatNumber,
  formatNumberCompact,
  calculatePercentDiff,
  expandPeriodsToDaily,
  getPeriodBoundaryTicks,
  formatDateLabel,
  calculateDistributionBins,
  type DistributionBin,
} from '@/lib/chart-utils'
import { groupChartConfigs, MEDIAN_LINE_COLOR } from '@/lib/chart-configs'
import { useCurrentSeason } from '@/hooks/use-seasons'
import {
  useGroups,
  useGroupAnalytics,
  useGroupsComparison,
} from '@/hooks/use-analytics'
import type {
  GroupStats,
  GroupMember,
  GroupTrendItem,
  GroupComparisonItem,
  AllianceAveragesResponse,
} from '@/types/analytics'

// ============================================================================
// Tab 1: Overview
// ============================================================================

interface OverviewTabProps {
  readonly groupStats: GroupStats
  readonly allianceAverages: AllianceAveragesResponse
  readonly allGroupsData: readonly GroupComparisonItem[]
}

function OverviewTab({ groupStats, allianceAverages, allGroupsData }: OverviewTabProps) {
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

      {/* Charts Row */}
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
                <Legend />
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
    </div>
  )
}

// ============================================================================
// Tab 2: Merit Distribution
// ============================================================================

interface MeritDistributionTabProps {
  readonly groupStats: GroupStats
  readonly members: readonly GroupMember[]
  readonly periodTrends: readonly GroupTrendItem[]
}

function MeritDistributionTab({ groupStats, members, periodTrends }: MeritDistributionTabProps) {
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

// ============================================================================
// Tab 3: Contribution Distribution
// ============================================================================

interface ContributionDistributionTabProps {
  readonly groupStats: GroupStats
  readonly members: readonly GroupMember[]
  readonly periodTrends: readonly GroupTrendItem[]
}

function ContributionDistributionTab({ groupStats, members, periodTrends }: ContributionDistributionTabProps) {
  // Expand periods to daily data for date-based X-axis
  const dailyData = useMemo(
    () =>
      expandPeriodsToDaily(periodTrends, (p) => ({
        avgRank: p.avg_rank,
        avgContribution: p.avg_contribution,
        avgMerit: p.avg_merit,
      })),
    [periodTrends]
  )
  const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(periodTrends), [periodTrends])

  // Calculate dynamic contribution distribution bins using shared utility
  const contributionBins = useMemo(
    () => calculateDistributionBins(members, (m) => m.daily_contribution),
    [members]
  )

  // Prepare box plot stats and strip plot points
  const boxPlotStats = useMemo(() => ({
    min: groupStats.contribution_min,
    q1: groupStats.contribution_q1,
    median: groupStats.contribution_median,
    q3: groupStats.contribution_q3,
    max: groupStats.contribution_max,
  }), [groupStats])

  const stripPlotPoints = useMemo(() =>
    members.map(m => ({
      id: m.id,
      name: m.name,
      value: m.daily_contribution,
    })),
    [members]
  )

  return (
    <div className="space-y-6">
      {/* Detailed Strip Plot - member list with visual positions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">貢獻分佈概覽</CardTitle>
          <CardDescription>
            箱型圖統計 · 每位成員獨立一行顯示
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DetailedStripPlot
            stats={boxPlotStats}
            points={stripPlotPoints}
            color="chart-3"
            sortOrder="desc"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contribution Distribution by Range */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">貢獻區間分佈</CardTitle>
            <CardDescription>成員日均貢獻區間人數分佈</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={groupChartConfigs.contributionDistribution} className="h-[220px] w-full">
              <BarChart data={contributionBins} margin={{ left: 10, right: 10, bottom: 20 }}>
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
                        <div className="font-medium">日均貢獻: {data.label}</div>
                        <div className="text-sm">人數: {data.count} ({data.percentage}%)</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="count" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Contribution Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">貢獻趨勢</CardTitle>
            <CardDescription>組別人日均貢獻變化</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={groupChartConfigs.contributionTrend} className="h-[220px] w-full">
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
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  tickFormatter={(value) => formatNumberCompact(value)}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const data = payload[0].payload as (typeof dailyData)[0]
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.dateLabel}</div>
                        <div className="text-sm">人日均貢獻: {formatNumber(data.avgContribution)}</div>
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  type="stepAfter"
                  dataKey="avgContribution"
                  name="人日均貢獻"
                  stroke="var(--chart-3)"
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

// ============================================================================
// Tab 4: Member Rankings
// ============================================================================

interface MembersTabProps {
  readonly members: readonly GroupMember[]
  readonly viewMode: ViewMode
}

function MembersTab({ members, viewMode }: MembersTabProps) {
  const [sortBy, setSortBy] = useState<'rank' | 'merit' | 'assist'>('rank')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortedMembers = useMemo(() => {
    const sorted = [...members].sort((a, b) => {
      let aVal: number
      let bVal: number

      switch (sortBy) {
        case 'rank':
          aVal = a.contribution_rank
          bVal = b.contribution_rank
          break
        case 'merit':
          aVal = a.daily_merit
          bVal = b.daily_merit
          break
        case 'assist':
          aVal = a.daily_assist
          bVal = b.daily_assist
          break
        default:
          return 0
      }

      return sortDir === 'desc' ? bVal - aVal : aVal - bVal
    })
    return sorted
  }, [members, sortBy, sortDir])

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(column)
      setSortDir(column === 'rank' ? 'asc' : 'desc')
    }
  }

  return (
    <div className="space-y-6">
      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">組內成員列表</CardTitle>
          <CardDescription>點擊欄位標題排序</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">成員</th>
                  <th className="text-right py-2 px-2 font-medium text-muted-foreground">勢力值</th>
                  <th
                    className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort('rank')}
                  >
                    貢獻排名 {sortBy === 'rank' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  {viewMode === 'latest' && (
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">變化</th>
                  )}
                  <th
                    className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort('merit')}
                  >
                    日均戰功 {sortBy === 'merit' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  {viewMode === 'latest' && (
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">變化</th>
                  )}
                  <th
                    className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort('assist')}
                  >
                    日均助攻 {sortBy === 'assist' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((member) => (
                  <tr key={member.id} className="border-b last:border-0">
                    <td className="py-2 px-2 font-medium">{member.name}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                      {formatNumberCompact(member.power)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">#{member.contribution_rank}</td>
                    {viewMode === 'latest' && (
                      <td className="py-2 px-2">
                        <div className="flex justify-end">
                          <RankChangeIndicator change={member.rank_change} showNewLabel={false} size="sm" />
                        </div>
                      </td>
                    )}
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(member.daily_merit)}</td>
                    {viewMode === 'latest' && (
                      <td className="py-2 px-2 text-right text-xs tabular-nums">
                        {member.merit_change === null ? (
                          <span className="text-muted-foreground">新</span>
                        ) : member.merit_change > 0 ? (
                          <span className="text-primary">+{formatNumberCompact(member.merit_change)}</span>
                        ) : member.merit_change < 0 ? (
                          <span className="text-destructive">{formatNumberCompact(member.merit_change)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="py-2 px-2 text-right tabular-nums">{Math.round(member.daily_assist)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

function GroupAnalytics() {
  const [selectedGroupName, setSelectedGroupName] = useState<string>('')
  const [activeTab, setActiveTab] = useState('overview')
  const [viewMode, setViewMode] = useState<ViewMode>('latest')

  // Get current (selected) season
  const { data: currentSeason, isLoading: isSeasonLoading } = useCurrentSeason()
  const seasonId = currentSeason?.id

  // Fetch groups list
  const { data: groups, isLoading: isGroupsLoading } = useGroups(seasonId)

  // Auto-select first group when groups load
  const firstGroupName = groups?.[0]?.name
  const effectiveGroupName = selectedGroupName || firstGroupName || ''

  // Fetch group analytics (responds to viewMode)
  const {
    data: groupData,
    isLoading: isGroupLoading,
    error: groupError,
  } = useGroupAnalytics(effectiveGroupName || undefined, seasonId, viewMode)

  // Fetch groups comparison (responds to viewMode)
  const { data: groupsComparison } = useGroupsComparison(seasonId, viewMode)

  // Derived data
  const groupStats = groupData?.stats
  const groupMembers = groupData?.members ?? []
  const periodTrends = groupData?.trends ?? []
  const allianceAverages = groupData?.alliance_averages

  // Loading state
  const isLoading = isSeasonLoading || isGroupsLoading || isGroupLoading

  // No season state
  if (!isSeasonLoading && !currentSeason) {
    return (
      <AllianceGuard>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">尚未設定當前賽季</h3>
          <p className="text-sm text-muted-foreground mt-1">請先在設定頁面選擇或建立一個賽季</p>
        </div>
      </AllianceGuard>
    )
  }

  // No groups state
  if (!isGroupsLoading && groups && groups.length === 0) {
    return (
      <AllianceGuard>
        <EmptyState
          icon={Users}
          title="尚無組別資料"
          description="請先上傳 CSV 資料並確保成員有設定組別。"
        />
      </AllianceGuard>
    )
  }

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">組別分析</h2>
            <p className="text-muted-foreground mt-1">查看各組別的人日均表現與統計數據</p>
          </div>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>

        {/* Group Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">選擇組別:</span>
          {isGroupsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">載入中...</span>
            </div>
          ) : (
            <Select value={effectiveGroupName} onValueChange={setSelectedGroupName}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="選擇組別" />
              </SelectTrigger>
              <SelectContent>
                {groups?.map((group) => (
                  <SelectItem key={group.name} value={group.name}>
                    {group.name} ({group.member_count}人)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {groupStats && (
            <span className="text-sm text-muted-foreground">{groupStats.member_count} 位成員</span>
          )}
        </div>

        {/* Loading / Error / Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : groupError ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-medium">載入失敗</h3>
            <p className="text-sm text-muted-foreground mt-1">無法載入組別資料，請稍後再試</p>
          </div>
        ) : groupStats && allianceAverages ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">總覽</span>
              </TabsTrigger>
              <TabsTrigger value="contribution" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">貢獻分佈</span>
              </TabsTrigger>
              <TabsTrigger value="distribution" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">戰功分佈</span>
              </TabsTrigger>
              <TabsTrigger value="members" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">組內成員</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab
                groupStats={groupStats}
                allianceAverages={allianceAverages}
                allGroupsData={groupsComparison ?? []}
              />
            </TabsContent>

            <TabsContent value="contribution">
              <ContributionDistributionTab
                groupStats={groupStats}
                members={groupMembers}
                periodTrends={periodTrends}
              />
            </TabsContent>

            <TabsContent value="distribution">
              <MeritDistributionTab
                groupStats={groupStats}
                members={groupMembers}
                periodTrends={periodTrends}
              />
            </TabsContent>

            <TabsContent value="members">
              <MembersTab members={groupMembers} viewMode={viewMode} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </AllianceGuard>
  )
}

export { GroupAnalytics }
