/**
 * MemberPerformance - Member Performance Analytics Page
 *
 * Individual member performance analysis with:
 * - Member selector dropdown with group filtering
 * - Tab-based navigation:
 *   1. Overview: Daily contribution/merit summary + 5-dimension radar chart
 *   2. Contribution: Contribution rank, daily contribution trend
 *   3. Combat: Merit & Assist performance with alliance comparison
 *   4. Power & Donation: Power value and donation records
 */

import { useState, useMemo, useEffect } from 'react'
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
import { RankChangeIndicator } from '@/components/analytics/RankChangeIndicator'
import { ViewModeToggle, type ViewMode } from '@/components/analytics/ViewModeToggle'
import {
  TrendingUp,
  TrendingDown,
  LayoutDashboard,
  Swords,
  Coins,
  Trophy,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart'
import { useActiveSeason } from '@/hooks/use-seasons'
import {
  useAnalyticsMembers,
  useMemberTrend,
  useMemberSeasonSummary,
  useSeasonAverages,
} from '@/hooks/use-analytics'
import type {
  MemberTrendItem,
  SeasonSummaryResponse,
} from '@/types/analytics'
import {
  formatNumber,
  formatNumberCompact,
  calculatePercentDiff,
  expandPeriodsToDaily,
  getPeriodBoundaryTicks,
  formatDateLabel,
} from '@/lib/chart-utils'
import { memberChartConfigs, MEDIAN_LINE_COLOR } from '@/lib/chart-configs'

// ============================================================================
// Types
// ============================================================================

// Expanded daily data point for charts
interface DailyDataPoint {
  readonly date: string // ISO date
  readonly dateLabel: string // MM/DD format for display
  readonly periodNumber: number
  readonly dailyContribution: number
  readonly dailyMerit: number
  readonly dailyAssist: number
  readonly dailyDonation: number
  readonly endRank: number
  readonly endPower: number
  // Alliance averages
  readonly allianceAvgContribution: number
  readonly allianceAvgMerit: number
  readonly allianceAvgAssist: number
  readonly allianceAvgDonation: number
  readonly allianceAvgPower: number
  // Alliance medians
  readonly allianceMedianContribution: number
  readonly allianceMedianMerit: number
  readonly allianceMedianAssist: number
  readonly allianceMedianDonation: number
  readonly allianceMedianPower: number
}

// Alliance average and median derived from trend data
interface AllianceAverage {
  readonly daily_contribution: number
  readonly daily_merit: number
  readonly daily_assist: number
  readonly daily_donation: number
  readonly power: number
}

interface AllianceMedian {
  readonly daily_contribution: number
  readonly daily_merit: number
  readonly daily_assist: number
  readonly daily_donation: number
  readonly power: number
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create daily chart data from period data.
 * Expands period data to daily data points for date-based X axis.
 * Uses expandPeriodsToDaily with a mapper for member performance charts.
 */
function createDailyChartData(periodData: readonly MemberTrendItem[]): DailyDataPoint[] {
  return expandPeriodsToDaily(periodData, (p) => ({
    dailyContribution: p.daily_contribution,
    dailyMerit: p.daily_merit,
    dailyAssist: p.daily_assist,
    dailyDonation: p.daily_donation,
    endRank: p.end_rank,
    endPower: p.end_power,
    allianceAvgContribution: p.alliance_avg_contribution,
    allianceAvgMerit: p.alliance_avg_merit,
    allianceAvgAssist: p.alliance_avg_assist,
    allianceAvgDonation: p.alliance_avg_donation,
    allianceAvgPower: p.alliance_avg_power,
    allianceMedianContribution: p.alliance_median_contribution,
    allianceMedianMerit: p.alliance_median_merit,
    allianceMedianAssist: p.alliance_median_assist,
    allianceMedianDonation: p.alliance_median_donation,
    allianceMedianPower: p.alliance_median_power,
  }))
}

// ============================================================================
// Tab 1: Overview (Contribution Rank Focus)
// ============================================================================

interface OverviewTabProps {
  readonly periodData: readonly MemberTrendItem[]
  readonly seasonSummary: SeasonSummaryResponse
  readonly allianceAvg: AllianceAverage
  readonly allianceMedian: AllianceMedian
  readonly memberName: string
  readonly viewMode: ViewMode
  readonly onViewModeChange: (mode: ViewMode) => void
}

function OverviewTab({ periodData, seasonSummary, allianceAvg, allianceMedian, memberName, viewMode, onViewModeChange }: OverviewTabProps) {
  const latestPeriod = periodData[periodData.length - 1]

  // Calculate values based on viewMode
  const contributionValue = viewMode === 'latest' ? latestPeriod.daily_contribution : seasonSummary.avg_daily_contribution
  const meritValue = viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit
  const powerValue = viewMode === 'latest' ? latestPeriod.end_power : seasonSummary.avg_power
  const donationValue = viewMode === 'latest' ? latestPeriod.daily_donation : seasonSummary.avg_daily_donation

  // Calculate totals and diffs for metrics cards
  const totalDonation = periodData.reduce((sum, d) => sum + d.donation_diff, 0)
  const powerChange = seasonSummary.total_power_change
  const contributionDiff = calculatePercentDiff(contributionValue, allianceAvg.daily_contribution)
  const meritDiff = calculatePercentDiff(meritValue, allianceAvg.daily_merit)
  const powerDiff = calculatePercentDiff(powerValue, allianceAvg.power)
  const donationDiff = calculatePercentDiff(donationValue, allianceAvg.daily_donation)

  // Expand period data to daily for date-based X axis
  const dailyData = useMemo(() => createDailyChartData(periodData), [periodData])
  const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(periodData), [periodData])

  // Radar chart data - normalized as percentage of alliance average (100 = alliance avg)
  // This ensures all dimensions are comparable regardless of absolute value differences
  // Also stores raw values for tooltip display
  // Uses viewMode (prop) for toggle between latest period and season average
  const radarData = useMemo(() => {
    const memberContribution = viewMode === 'latest' ? latestPeriod.daily_contribution : seasonSummary.avg_daily_contribution
    const memberMerit = viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit
    const memberPower = viewMode === 'latest' ? latestPeriod.end_power : seasonSummary.current_power
    const memberAssist = viewMode === 'latest' ? latestPeriod.daily_assist : seasonSummary.avg_daily_assist
    const memberDonation = viewMode === 'latest' ? latestPeriod.daily_donation : seasonSummary.avg_daily_donation

    // Calculate percentage relative to alliance average (avoid division by zero)
    const normalize = (value: number, avg: number) => avg > 0 ? Math.round((value / avg) * 100) : 0

    return [
      {
        metric: '貢獻',
        member: normalize(memberContribution, allianceAvg.daily_contribution),
        memberRaw: memberContribution,
        alliance: 100,
        allianceRaw: allianceAvg.daily_contribution,
        median: normalize(allianceMedian.daily_contribution, allianceAvg.daily_contribution),
        medianRaw: allianceMedian.daily_contribution,
      },
      {
        metric: '戰功',
        member: normalize(memberMerit, allianceAvg.daily_merit),
        memberRaw: memberMerit,
        alliance: 100,
        allianceRaw: allianceAvg.daily_merit,
        median: normalize(allianceMedian.daily_merit, allianceAvg.daily_merit),
        medianRaw: allianceMedian.daily_merit,
      },
      {
        metric: '勢力值',
        member: normalize(memberPower, allianceAvg.power),
        memberRaw: memberPower,
        alliance: 100,
        allianceRaw: allianceAvg.power,
        median: normalize(allianceMedian.power, allianceAvg.power),
        medianRaw: allianceMedian.power,
      },
      {
        metric: '助攻',
        member: normalize(memberAssist, allianceAvg.daily_assist),
        memberRaw: memberAssist,
        alliance: 100,
        allianceRaw: allianceAvg.daily_assist,
        median: normalize(allianceMedian.daily_assist, allianceAvg.daily_assist),
        medianRaw: allianceMedian.daily_assist,
      },
      {
        metric: '捐獻',
        member: normalize(memberDonation, allianceAvg.daily_donation),
        memberRaw: memberDonation,
        alliance: 100,
        allianceRaw: allianceAvg.daily_donation,
        median: normalize(allianceMedian.daily_donation, allianceAvg.daily_donation),
        medianRaw: allianceMedian.daily_donation,
      },
    ]
  }, [viewMode, latestPeriod, seasonSummary, allianceAvg, allianceMedian])


  return (
    <div className="space-y-6">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-end">
        <ViewModeToggle value={viewMode} onChange={onViewModeChange} className="w-auto" />
      </div>

      {/* Current Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Daily Contribution */}
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>{viewMode === 'latest' ? '最新日均貢獻' : '賽季日均貢獻'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(contributionValue)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {contributionDiff >= 0 ? (
                <TrendingUp className="h-3 w-3 text-primary" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              <span className={`text-xs ${contributionDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {contributionDiff >= 0 ? '+' : ''}{contributionDiff.toFixed(1)}% vs 盟均
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Daily Merit */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{viewMode === 'latest' ? '最新日均戰功' : '賽季日均戰功'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(meritValue)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {meritDiff >= 0 ? (
                <TrendingUp className="h-3 w-3 text-primary" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              <span className={`text-xs ${meritDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {meritDiff >= 0 ? '+' : ''}{meritDiff.toFixed(1)}% vs 盟均
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Power */}
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>{viewMode === 'latest' ? '當前勢力值' : '賽季平均勢力值'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {formatNumber(powerValue)}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1">
                {powerChange >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-primary" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                )}
                <span className={`text-xs ${powerChange >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {powerChange >= 0 ? '+' : ''}{formatNumber(powerChange)} 賽季
                </span>
              </div>
              <div className="flex items-center gap-1">
                {powerDiff >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-primary" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                )}
                <span className={`text-xs ${powerDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {powerDiff >= 0 ? '+' : ''}{powerDiff.toFixed(1)}% vs 盟均
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Donation */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{viewMode === 'latest' ? '最新日均捐獻' : '賽季日均捐獻'}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold tabular-nums">
                {formatNumber(donationValue)}
              </span>
              <span className="text-muted-foreground text-sm">/日</span>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-muted-foreground">
                賽季總計: {formatNumber(totalDonation)}
              </span>
              <div className="flex items-center gap-1">
                {donationDiff >= 0 ? (
                  <TrendingUp className="h-3 w-3 text-primary" />
                ) : (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                )}
                <span className={`text-xs ${donationDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {donationDiff >= 0 ? '+' : ''}{donationDiff.toFixed(1)}% vs 盟均
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contribution & Merit Dual Axis Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">貢獻與戰功趨勢</CardTitle>
            <CardDescription>日均貢獻（左軸）與日均戰功（右軸）</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={memberChartConfigs.contributionMerit} className="h-[280px] w-full">
              <LineChart data={dailyData} margin={{ left: 12, right: 12, top: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                  ticks={xAxisTicks}
                  tickFormatter={formatDateLabel}
                />
                {/* Left Y Axis: Contribution */}
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                  tickFormatter={(value) => formatNumberCompact(value)}
                />
                {/* Right Y Axis: Merit */}
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                  tickFormatter={(value) => formatNumberCompact(value)}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const data = payload[0].payload as DailyDataPoint
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.dateLabel}</div>
                        <div className="text-xs text-muted-foreground mb-1">Period {data.periodNumber}</div>
                        <div className="text-sm" style={{ color: 'var(--chart-4)' }}>
                          日均貢獻: {formatNumber(data.dailyContribution)}
                        </div>
                        <div className="text-sm text-primary">
                          日均戰功: {formatNumber(data.dailyMerit)}
                        </div>
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line
                  yAxisId="left"
                  type="stepAfter"
                  dataKey="dailyContribution"
                  name="日均貢獻"
                  stroke="var(--chart-4)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: 'var(--chart-4)' }}
                />
                <Line
                  yAxisId="right"
                  type="stepAfter"
                  dataKey="dailyMerit"
                  name="日均戰功"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: 'var(--primary)' }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">五維能力圖</CardTitle>
            <CardDescription>成員日均表現 vs 同盟平均/中位數（100% = 同盟平均）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChartContainer config={memberChartConfigs.radar} className="mx-auto aspect-square max-h-[280px]">
              <RadarChart data={radarData}>
                <PolarGrid gridType="polygon" />
                <PolarAngleAxis dataKey="metric" className="text-xs" tick={{ fill: 'var(--foreground)', fontSize: 12 }} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, Math.max(150, ...radarData.map((d) => Math.max(d.member, d.median)))]}
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
                  name={memberName}
                  dataKey="member"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.4}
                  strokeWidth={2}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const data = payload[0].payload as {
                      metric: string
                      member: number
                      memberRaw: number
                      alliance: number
                      allianceRaw: number
                      median: number
                      medianRaw: number
                    }
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium mb-1">{data.metric}</div>
                        <div className="text-sm">
                          {memberName}：{formatNumberCompact(data.memberRaw)} ({data.member}%)
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
      </div>
    </div>
  )
}

// ============================================================================
// Tab 2: Merit & Assist (Combat Performance)
// ============================================================================

interface CombatTabProps {
  readonly periodData: readonly MemberTrendItem[]
  readonly seasonSummary: SeasonSummaryResponse
  readonly allianceAvg: AllianceAverage
  readonly viewMode: ViewMode
}

function CombatTab({ periodData, seasonSummary, allianceAvg, viewMode }: CombatTabProps) {
  const latestPeriod = periodData[periodData.length - 1]

  // Expand period data to daily for date-based X axis
  const dailyData = useMemo(() => createDailyChartData(periodData), [periodData])
  const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(periodData), [periodData])

  // Get values based on view mode
  const meritValue = viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit
  const assistValue = viewMode === 'latest' ? latestPeriod.daily_assist : seasonSummary.avg_daily_assist
  const meritDiff = calculatePercentDiff(meritValue, allianceAvg.daily_merit)
  const assistDiff = calculatePercentDiff(assistValue, allianceAvg.daily_assist)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left Column: Merit */}
        <div className="space-y-4">
          <Card className="border-primary/50">
            <CardHeader className="pb-2">
              <CardDescription>日均戰功</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {formatNumber(meritValue)}
                </span>
                <span className="text-muted-foreground text-sm">/日</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  {meritDiff >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-primary" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className={`text-xs ${meritDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {meritDiff >= 0 ? '+' : ''}{meritDiff.toFixed(1)}% vs 盟均
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  盟均: {formatNumber(allianceAvg.daily_merit)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">戰功趨勢</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer config={memberChartConfigs.merit} className="h-[200px] w-full">
                <LineChart data={dailyData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="text-xs"
                    ticks={xAxisTicks}
                    tickFormatter={formatDateLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    className="text-xs"
                    width={45}
                    tickFormatter={(value) => formatNumberCompact(value)}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const data = payload[0].payload as DailyDataPoint
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{data.dateLabel}</div>
                          <div className="text-sm">日均戰功: {formatNumber(data.dailyMerit)}</div>
                          <div className="text-sm text-muted-foreground">同盟平均: {formatNumber(data.allianceAvgMerit)}</div>
                          <div className="text-sm" style={{ color: MEDIAN_LINE_COLOR }}>同盟中位數: {formatNumber(data.allianceMedianMerit)}</div>
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="stepAfter"
                    dataKey="dailyMerit"
                    name="日均戰功"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceAvgMerit"
                    name="同盟平均"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceMedianMerit"
                    name="同盟中位數"
                    stroke={MEDIAN_LINE_COLOR}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* 戰功明細表格 */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">戰功明細</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1.5 px-2 font-medium text-xs">日期</th>
                      <th className="text-right py-1.5 px-2 font-medium text-xs">日均戰功</th>
                      <th className="text-right py-1.5 px-2 font-medium text-xs">同盟平均</th>
                      <th className="text-right py-1.5 px-2 font-medium text-xs">同盟中位數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodData.map((d, index) => {
                      const prev = index > 0 ? periodData[index - 1].daily_merit : null
                      const delta = prev !== null ? d.daily_merit - prev : null
                      const diffAvg = d.daily_merit - d.alliance_avg_merit
                      const diffMedian = d.daily_merit - d.alliance_median_merit

                      return (
                        <tr key={d.period_number} className="border-b last:border-0">
                          <td className="py-1.5 px-2 text-xs text-muted-foreground">{d.period_label}</td>
                          <td className="py-1.5 px-2 text-right text-xs tabular-nums">
                            {formatNumber(d.daily_merit)} {delta === null ? '' : <span className={delta > 0 ? 'text-primary' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'}>({delta >= 0 ? '+' : ''}{formatNumberCompact(delta)})</span>}
                          </td>
                          <td className="py-1.5 px-2 text-right text-xs tabular-nums text-muted-foreground">
                            {formatNumber(d.alliance_avg_merit)} <span className={diffAvg > 0 ? 'text-primary' : diffAvg < 0 ? 'text-destructive' : 'text-muted-foreground'}>({diffAvg >= 0 ? '+' : ''}{formatNumberCompact(diffAvg)})</span>
                          </td>
                          <td className="py-1.5 px-2 text-right text-xs tabular-nums text-muted-foreground">
                            {formatNumber(d.alliance_median_merit)} <span className={diffMedian > 0 ? 'text-primary' : diffMedian < 0 ? 'text-destructive' : 'text-muted-foreground'}>({diffMedian >= 0 ? '+' : ''}{formatNumberCompact(diffMedian)})</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Assist */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>日均助攻</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {formatNumber(assistValue)}
                </span>
                <span className="text-muted-foreground text-sm">/日</span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  {assistDiff >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-primary" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className={`text-xs ${assistDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {assistDiff >= 0 ? '+' : ''}{assistDiff.toFixed(1)}% vs 盟均
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  盟均: {formatNumber(allianceAvg.daily_assist)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">助攻趨勢</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer config={memberChartConfigs.assist} className="h-[200px] w-full">
                <LineChart data={dailyData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="text-xs"
                    ticks={xAxisTicks}
                    tickFormatter={formatDateLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    className="text-xs"
                    width={45}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const data = payload[0].payload as DailyDataPoint
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{data.dateLabel}</div>
                          <div className="text-sm">日均助攻: {formatNumber(data.dailyAssist)}</div>
                          <div className="text-sm text-muted-foreground">同盟平均: {formatNumber(data.allianceAvgAssist)}</div>
                          <div className="text-sm" style={{ color: MEDIAN_LINE_COLOR }}>同盟中位數: {formatNumber(data.allianceMedianAssist)}</div>
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="stepAfter"
                    dataKey="dailyAssist"
                    name="日均助攻"
                    stroke="var(--chart-2)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceAvgAssist"
                    name="同盟平均"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceMedianAssist"
                    name="同盟中位數"
                    stroke={MEDIAN_LINE_COLOR}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* 助攻明細表格 */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">助攻明細</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1.5 px-2 font-medium text-xs">日期</th>
                      <th className="text-right py-1.5 px-2 font-medium text-xs">日均助攻</th>
                      <th className="text-right py-1.5 px-2 font-medium text-xs">同盟平均</th>
                      <th className="text-right py-1.5 px-2 font-medium text-xs">同盟中位數</th>
                    </tr>
                  </thead>
                  <tbody>
                    {periodData.map((d, index) => {
                      const prev = index > 0 ? periodData[index - 1].daily_assist : null
                      const delta = prev !== null ? d.daily_assist - prev : null
                      const diffAvg = d.daily_assist - d.alliance_avg_assist
                      const diffMedian = d.daily_assist - d.alliance_median_assist

                      return (
                        <tr key={d.period_number} className="border-b last:border-0">
                          <td className="py-1.5 px-2 text-xs text-muted-foreground">{d.period_label}</td>
                          <td className="py-1.5 px-2 text-right text-xs tabular-nums">
                            {formatNumber(d.daily_assist)} {delta === null ? '' : <span className={delta > 0 ? 'text-primary' : delta < 0 ? 'text-destructive' : 'text-muted-foreground'}>({delta >= 0 ? '+' : ''}{formatNumberCompact(delta)})</span>}
                          </td>
                          <td className="py-1.5 px-2 text-right text-xs tabular-nums text-muted-foreground">
                            {formatNumber(d.alliance_avg_assist)} <span className={diffAvg > 0 ? 'text-primary' : diffAvg < 0 ? 'text-destructive' : 'text-muted-foreground'}>({diffAvg >= 0 ? '+' : ''}{formatNumberCompact(diffAvg)})</span>
                          </td>
                          <td className="py-1.5 px-2 text-right text-xs tabular-nums text-muted-foreground">
                            {formatNumber(d.alliance_median_assist)} <span className={diffMedian > 0 ? 'text-primary' : diffMedian < 0 ? 'text-destructive' : 'text-muted-foreground'}>({diffMedian >= 0 ? '+' : ''}{formatNumberCompact(diffMedian)})</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>


    </div>
  )
}

// ============================================================================
// Tab 3: Contribution (Core Ranking Metric)
// ============================================================================

interface ContributionTabProps {
  readonly periodData: readonly MemberTrendItem[]
  readonly seasonSummary: SeasonSummaryResponse
  readonly allianceAvg: AllianceAverage
  readonly totalMembers: number
}

function ContributionTab({ periodData, seasonSummary, allianceAvg, totalMembers }: ContributionTabProps) {
  const latestPeriod = periodData[periodData.length - 1]

  // Expand period data to daily for date-based X axis
  const dailyData = useMemo(() => createDailyChartData(periodData), [periodData])
  const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(periodData), [periodData])

  // Calculate values and diffs
  const contributionValue = latestPeriod.daily_contribution
  const contributionDiff = calculatePercentDiff(contributionValue, allianceAvg.daily_contribution)
  const totalContribution = seasonSummary.total_contribution
  const avgDailyContribution = seasonSummary.avg_daily_contribution

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Contribution Rank */}
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>貢獻排名</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">
                #{latestPeriod.end_rank}
              </span>
              <span className="text-sm text-muted-foreground">/ {totalMembers}</span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <RankChangeIndicator change={latestPeriod.rank_change} size="sm" />
              <span className="text-xs text-muted-foreground">本期</span>
            </div>
          </CardContent>
        </Card>

        {/* Daily Contribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>最新日均貢獻</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(contributionValue)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {contributionDiff >= 0 ? (
                <TrendingUp className="h-3 w-3 text-primary" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              <span className={`text-xs ${contributionDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {contributionDiff >= 0 ? '+' : ''}{contributionDiff.toFixed(1)}% vs 盟均
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Season Total Contribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>賽季總貢獻</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(totalContribution)}
            </div>
            <span className="text-xs text-muted-foreground">
              日均: {formatNumber(avgDailyContribution)}/日
            </span>
          </CardContent>
        </Card>

        {/* Alliance Average */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>同盟日均</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-muted-foreground">
              {formatNumber(allianceAvg.daily_contribution)}
            </div>
            <span className="text-xs text-muted-foreground">
              全盟平均
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Contribution Trend Chart */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">貢獻趨勢</CardTitle>
          <CardDescription>日均貢獻與同盟對比</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <ChartContainer config={memberChartConfigs.contribution} className="h-[280px] w-full">
            <LineChart data={dailyData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                ticks={xAxisTicks}
                tickFormatter={formatDateLabel}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                tickFormatter={(value) => formatNumberCompact(value)}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const data = payload[0].payload as DailyDataPoint
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="font-medium">{data.dateLabel}</div>
                      <div className="text-xs text-muted-foreground mb-1">Period {data.periodNumber}</div>
                      <div className="text-sm" style={{ color: 'var(--chart-4)' }}>
                        日均貢獻: {formatNumber(data.dailyContribution)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        同盟平均: {formatNumber(data.allianceAvgContribution)}
                      </div>
                      <div className="text-sm" style={{ color: MEDIAN_LINE_COLOR }}>
                        同盟中位數: {formatNumber(data.allianceMedianContribution)}
                      </div>
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="stepAfter"
                dataKey="dailyContribution"
                name="日均貢獻"
                stroke="var(--chart-4)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5, fill: 'var(--chart-4)' }}
              />
              <Line
                type="stepAfter"
                dataKey="allianceAvgContribution"
                name="同盟平均"
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
              />
              <Line
                type="stepAfter"
                dataKey="allianceMedianContribution"
                name="同盟中位數"
                stroke={MEDIAN_LINE_COLOR}
                strokeWidth={1}
                strokeDasharray="2 2"
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>


    </div>
  )
}

// ============================================================================
// Tab 4: Power & Donation (Simple Records)
// ============================================================================

interface PowerDonationTabProps {
  readonly periodData: readonly MemberTrendItem[]
  readonly seasonSummary: SeasonSummaryResponse
  readonly allianceAvg: AllianceAverage
}

function PowerDonationTab({ periodData, seasonSummary, allianceAvg }: PowerDonationTabProps) {
  const latestPeriod = periodData[periodData.length - 1]

  // Expand period data to daily for date-based X axis
  const dailyData = useMemo(() => createDailyChartData(periodData), [periodData])
  const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(periodData), [periodData])

  // Calculate totals and diffs
  const totalDonation = periodData.reduce((sum, d) => sum + d.donation_diff, 0)
  const powerChange = seasonSummary.total_power_change
  const powerDiff = calculatePercentDiff(latestPeriod.end_power, allianceAvg.power)
  const donationDiff = calculatePercentDiff(seasonSummary.avg_daily_donation, allianceAvg.daily_donation)

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Left Column: Power */}
        <div className="space-y-4">
          <Card className="border-primary/50">
            <CardHeader className="pb-2">
              <CardDescription>當前勢力值</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {formatNumber(latestPeriod.end_power)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="flex items-center gap-1">
                  {powerChange >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-primary" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className={`text-xs ${powerChange >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {powerChange >= 0 ? '+' : ''}{formatNumber(powerChange)} 賽季
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {powerDiff >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-primary" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className={`text-xs ${powerDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {powerDiff >= 0 ? '+' : ''}{powerDiff.toFixed(1)}% vs 盟均
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">勢力值趨勢</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer config={memberChartConfigs.power} className="h-[200px] w-full">
                <LineChart data={dailyData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="text-xs"
                    ticks={xAxisTicks}
                    tickFormatter={formatDateLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    className="text-xs"
                    width={50}
                    tickFormatter={(value) => formatNumberCompact(value)}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const data = payload[0].payload as DailyDataPoint
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{data.dateLabel}</div>
                          <div className="text-sm">勢力值: {formatNumber(data.endPower)}</div>
                          <div className="text-sm text-muted-foreground">同盟平均: {formatNumber(data.allianceAvgPower)}</div>
                          <div className="text-sm" style={{ color: MEDIAN_LINE_COLOR }}>同盟中位數: {formatNumber(data.allianceMedianPower)}</div>
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="stepAfter"
                    dataKey="endPower"
                    name="勢力值"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceAvgPower"
                    name="同盟平均"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceMedianPower"
                    name="同盟中位數"
                    stroke={MEDIAN_LINE_COLOR}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Donation */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>賽季總捐獻</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">
                  {formatNumber(totalDonation)}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-xs text-muted-foreground">
                  日均: {formatNumber(seasonSummary.avg_daily_donation)}/日
                </span>
                <div className="flex items-center gap-1">
                  {donationDiff >= 0 ? (
                    <TrendingUp className="h-3 w-3 text-primary" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-destructive" />
                  )}
                  <span className={`text-xs ${donationDiff >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {donationDiff >= 0 ? '+' : ''}{donationDiff.toFixed(1)}% vs 盟均
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">捐獻趨勢</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ChartContainer config={memberChartConfigs.donation} className="h-[200px] w-full">
                <LineChart data={dailyData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    className="text-xs"
                    ticks={xAxisTicks}
                    tickFormatter={formatDateLabel}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={4}
                    className="text-xs"
                    width={50}
                    tickFormatter={(value) => formatNumberCompact(value)}
                  />
                  <ChartTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const data = payload[0].payload as DailyDataPoint
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{data.dateLabel}</div>
                          <div className="text-sm">日均捐獻: {formatNumber(data.dailyDonation)}</div>
                          <div className="text-sm text-muted-foreground">同盟平均: {formatNumber(data.allianceAvgDonation)}</div>
                          <div className="text-sm" style={{ color: MEDIAN_LINE_COLOR }}>同盟中位數: {formatNumber(data.allianceMedianDonation)}</div>
                        </div>
                      )
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="stepAfter"
                    dataKey="dailyDonation"
                    name="日均捐獻"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceAvgDonation"
                    name="同盟平均"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="allianceMedianDonation"
                    name="同盟中位數"
                    stroke={MEDIAN_LINE_COLOR}
                    strokeWidth={1}
                    strokeDasharray="2 2"
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </div>



    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

function MemberPerformance() {
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(undefined)
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [activeTab, setActiveTab] = useState('overview')
  const [viewMode, setViewMode] = useState<ViewMode>('latest')

  // Fetch active season
  const { data: activeSeason, isLoading: isLoadingSeason } = useActiveSeason()
  const seasonId = activeSeason?.id

  // Fetch members list
  const {
    data: members,
    isLoading: isLoadingMembers,
    error: membersError,
  } = useAnalyticsMembers(seasonId)

  // Extract unique groups from members
  const availableGroups = useMemo(() => {
    if (!members) return []
    const groups = new Set<string>()
    for (const member of members) {
      if (member.group) {
        groups.add(member.group)
      }
    }
    return Array.from(groups).sort()
  }, [members])

  // Filter and sort members: filter by group, sort by contribution_rank (ascending)
  const filteredAndSortedMembers = useMemo(() => {
    if (!members) return []

    let filtered = members
    if (selectedGroup !== 'all') {
      filtered = members.filter((m) => m.group === selectedGroup)
    }

    // Sort by contribution_rank (lowest first), null values go to the end
    return [...filtered].sort((a, b) => {
      if (a.contribution_rank === null && b.contribution_rank === null) return 0
      if (a.contribution_rank === null) return 1
      if (b.contribution_rank === null) return -1
      return a.contribution_rank - b.contribution_rank
    })
  }, [members, selectedGroup])

  // Auto-select first member when filtered members change
  useEffect(() => {
    if (filteredAndSortedMembers.length > 0) {
      // If current selection is not in filtered list, select first one
      const currentInList = filteredAndSortedMembers.some((m) => m.id === selectedMemberId)
      if (!currentInList) {
        setSelectedMemberId(filteredAndSortedMembers[0].id)
      }
    } else if (selectedMemberId && filteredAndSortedMembers.length === 0) {
      setSelectedMemberId(undefined)
    }
  }, [filteredAndSortedMembers, selectedMemberId])

  // Fetch member trend data
  const {
    data: trendData,
    isLoading: isLoadingTrend,
    error: trendError,
  } = useMemberTrend(selectedMemberId, seasonId)

  // Fetch member season summary
  const {
    data: seasonSummary,
    isLoading: isLoadingSummary,
    error: summaryError,
  } = useMemberSeasonSummary(selectedMemberId, seasonId)

  // Fetch season alliance averages (for "賽季以來" view comparison)
  const {
    data: seasonAllianceAverages,
    isLoading: isLoadingSeasonAvg,
  } = useSeasonAverages(seasonId)

  // Find selected member info
  const selectedMember = useMemo(() => {
    return members?.find((m) => m.id === selectedMemberId)
  }, [members, selectedMemberId])

  // Calculate alliance averages based on viewMode:
  // - 'latest': use latest period's alliance averages (from trend data)
  // - 'season': use season-to-date alliance averages (from dedicated API)
  const allianceAvg: AllianceAverage = useMemo(() => {
    // For season view, use season averages if available
    if (viewMode === 'season' && seasonAllianceAverages) {
      return {
        daily_contribution: seasonAllianceAverages.avg_daily_contribution,
        daily_merit: seasonAllianceAverages.avg_daily_merit,
        daily_assist: seasonAllianceAverages.avg_daily_assist,
        daily_donation: seasonAllianceAverages.avg_daily_donation,
        power: seasonAllianceAverages.avg_power,
      }
    }

    // For latest view or fallback, use latest period from trend data
    if (!trendData || trendData.length === 0) {
      return {
        daily_contribution: 0,
        daily_merit: 0,
        daily_assist: 0,
        daily_donation: 0,
        power: 0,
      }
    }
    const latest = trendData[trendData.length - 1]
    return {
      daily_contribution: latest.alliance_avg_contribution,
      daily_merit: latest.alliance_avg_merit,
      daily_assist: latest.alliance_avg_assist,
      daily_donation: latest.alliance_avg_donation,
      power: latest.alliance_avg_power,
    }
  }, [viewMode, seasonAllianceAverages, trendData])

  // Calculate alliance medians based on viewMode:
  // - 'latest': use latest period's alliance medians (from trend data)
  // - 'season': use season-to-date alliance medians (from dedicated API)
  const allianceMedian: AllianceMedian = useMemo(() => {
    // For season view, use season medians if available
    if (viewMode === 'season' && seasonAllianceAverages) {
      return {
        daily_contribution: seasonAllianceAverages.median_daily_contribution,
        daily_merit: seasonAllianceAverages.median_daily_merit,
        daily_assist: seasonAllianceAverages.median_daily_assist,
        daily_donation: seasonAllianceAverages.median_daily_donation,
        power: seasonAllianceAverages.median_power,
      }
    }

    // For latest view or fallback, use latest period from trend data
    if (!trendData || trendData.length === 0) {
      return {
        daily_contribution: 0,
        daily_merit: 0,
        daily_assist: 0,
        daily_donation: 0,
        power: 0,
      }
    }
    const latest = trendData[trendData.length - 1]
    return {
      daily_contribution: latest.alliance_median_contribution,
      daily_merit: latest.alliance_median_merit,
      daily_assist: latest.alliance_median_assist,
      daily_donation: latest.alliance_median_donation,
      power: latest.alliance_median_power,
    }
  }, [viewMode, seasonAllianceAverages, trendData])

  // Get total members from latest trend data
  const totalMembers = useMemo(() => {
    if (!trendData || trendData.length === 0) return 0
    return trendData[trendData.length - 1].alliance_member_count
  }, [trendData])

  // Loading state (include season averages only when in season view)
  const isLoading = isLoadingSeason || isLoadingMembers || isLoadingTrend || isLoadingSummary ||
    (viewMode === 'season' && isLoadingSeasonAvg)

  // Error state
  const hasError = membersError || trendError || summaryError

  // Check if we have the required data
  const hasData = trendData && trendData.length > 0 && seasonSummary

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">成員表現分析</h2>
          <p className="text-muted-foreground mt-1">
            查看個別成員的詳細表現數據與趨勢
          </p>
        </div>

        {/* Member Selector with Group Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Group Filter */}
          {availableGroups.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">組別:</span>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {availableGroups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {/* Member Selector */}
          <span className="text-sm text-muted-foreground">成員:</span>
          <Select
            value={selectedMemberId ?? ''}
            onValueChange={setSelectedMemberId}
            disabled={isLoadingMembers || !filteredAndSortedMembers.length}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={isLoadingMembers ? '載入中...' : '選擇成員'} />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              {filteredAndSortedMembers.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.contribution_rank ? `#${member.contribution_rank} ` : ''}
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedMember && seasonSummary && (
            <span className="text-sm text-muted-foreground">
              排名 #{seasonSummary.current_rank} / {totalMembers}人
            </span>
          )}
        </div>

        {/* Loading State */}
        {isLoading && selectedMemberId && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">載入數據中...</span>
          </div>
        )}

        {/* Error State */}
        {hasError && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-6">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium text-destructive">載入失敗</p>
                <p className="text-sm text-muted-foreground">
                  無法取得成員表現數據，請稍後再試
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No Season State */}
        {!isLoadingSeason && !activeSeason && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">請先設定活躍賽季才能查看成員表現</p>
            </CardContent>
          </Card>
        )}

        {/* No Data State */}
        {!isLoading && !hasError && activeSeason && selectedMemberId && !hasData && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">此成員尚無表現數據</p>
            </CardContent>
          </Card>
        )}

        {/* Tabs - Only show when we have data */}
        {hasData && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">總覽</span>
              </TabsTrigger>
              <TabsTrigger value="contribution" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">貢獻</span>
              </TabsTrigger>
              <TabsTrigger value="combat" className="flex items-center gap-2">
                <Swords className="h-4 w-4" />
                <span className="hidden sm:inline">戰功與助攻</span>
              </TabsTrigger>
              <TabsTrigger value="power" className="flex items-center gap-2">
                <Coins className="h-4 w-4" />
                <span className="hidden sm:inline">勢力值與捐獻</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab
                periodData={trendData}
                seasonSummary={seasonSummary}
                allianceAvg={allianceAvg}
                allianceMedian={allianceMedian}
                memberName={selectedMember?.name ?? '成員'}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            </TabsContent>

            <TabsContent value="contribution">
              <ContributionTab
                periodData={trendData}
                seasonSummary={seasonSummary}
                allianceAvg={allianceAvg}
                totalMembers={totalMembers}
              />
            </TabsContent>

            <TabsContent value="combat">
              <CombatTab
                periodData={trendData}
                seasonSummary={seasonSummary}
                allianceAvg={allianceAvg}
                viewMode={viewMode}
              />
            </TabsContent>

            <TabsContent value="power">
              <PowerDonationTab
                periodData={trendData}
                seasonSummary={seasonSummary}
                allianceAvg={allianceAvg}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AllianceGuard>
  )
}

export { MemberPerformance }
