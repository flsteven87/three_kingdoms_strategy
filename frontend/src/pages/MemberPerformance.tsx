/**
 * MemberPerformance - Member Performance Analytics Page
 *
 * Individual member performance analysis with:
 * - Member selector dropdown
 * - View mode toggle (latest period / season total)
 * - Tab-based navigation:
 *   1. Overview: Contribution rank history + summary stats
 *   2. Merit & Assist: Combat performance (merit is primary)
 *   3. Power & Donation: Simple period value records
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
import {
  TrendingUp,
  TrendingDown,
  Minus,
  LayoutDashboard,
  Swords,
  Coins,
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
  ReferenceLine,
} from 'recharts'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from '@/components/ui/chart'
import { useActiveSeason } from '@/hooks/use-seasons'
import {
  useAnalyticsMembers,
  useMemberTrend,
  useMemberSeasonSummary,
} from '@/hooks/use-analytics'
import type {
  MemberTrendItem,
  SeasonSummaryResponse,
} from '@/types/analytics'

// ============================================================================
// Types
// ============================================================================

// Expanded daily data point for charts
interface DailyDataPoint {
  readonly date: string // ISO date
  readonly dateLabel: string // MM/DD format for display
  readonly periodNumber: number
  readonly dailyMerit: number
  readonly dailyAssist: number
  readonly dailyContribution: number
  readonly dailyDonation: number
  readonly endRank: number
  readonly endPower: number
  readonly allianceAvgMerit: number
  readonly allianceAvgAssist: number
}

// Alliance average derived from trend data
interface AllianceAverage {
  readonly daily_contribution: number
  readonly daily_merit: number
  readonly daily_assist: number
  readonly daily_donation: number
}

type ViewMode = 'latest' | 'season'

// ============================================================================
// Chart Configurations
// ============================================================================

const rankChartConfig = {
  rank: {
    label: '排名',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig

const radarChartConfig = {
  member: {
    label: '成員',
    color: 'hsl(var(--primary))',
  },
  alliance: {
    label: '同盟平均',
    color: 'hsl(var(--muted-foreground))',
  },
} satisfies ChartConfig

const meritChartConfig = {
  merit: {
    label: '日均戰功',
    color: 'hsl(var(--primary))',
  },
  alliance_avg_merit: {
    label: '同盟平均',
    color: 'hsl(var(--muted-foreground))',
  },
} satisfies ChartConfig

const assistChartConfig = {
  assist: {
    label: '日均助攻',
    color: 'hsl(142.1 76.2% 36.3%)',
  },
  alliance_avg_assist: {
    label: '同盟平均',
    color: 'hsl(var(--muted-foreground))',
  },
} satisfies ChartConfig

const powerChartConfig = {
  power: {
    label: '勢力值',
    color: 'hsl(var(--primary))',
  },
} satisfies ChartConfig

const donationChartConfig = {
  donation: {
    label: '捐獻',
    color: 'hsl(45 93% 47%)',
  },
} satisfies ChartConfig

// ============================================================================
// Helper Functions
// ============================================================================

function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(2)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`
  }
  return value.toLocaleString()
}

function formatNumberCompact(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}K`
  }
  return value.toString()
}

function calculatePercentDiff(value: number, average: number): number {
  if (average === 0) return 0
  return ((value - average) / average) * 100
}

/**
 * Expand period data into daily data points.
 * Each day within a period will have the same values (daily averages).
 */
function expandPeriodsToDaily(periods: readonly MemberTrendItem[]): DailyDataPoint[] {
  const dailyData: DailyDataPoint[] = []

  for (const period of periods) {
    const startDate = new Date(period.start_date)
    const endDate = new Date(period.end_date)

    // Generate a data point for each day in the period (inclusive of start, exclusive of end)
    const currentDate = new Date(startDate)
    while (currentDate < endDate) {
      const dateStr = currentDate.toISOString().split('T')[0]
      const month = currentDate.getMonth() + 1
      const day = currentDate.getDate()

      dailyData.push({
        date: dateStr,
        dateLabel: `${month}/${day}`,
        periodNumber: period.period_number,
        dailyMerit: period.daily_merit,
        dailyAssist: period.daily_assist,
        dailyContribution: period.daily_contribution,
        dailyDonation: period.daily_donation,
        endRank: period.end_rank,
        endPower: period.end_power,
        allianceAvgMerit: period.alliance_avg_merit,
        allianceAvgAssist: period.alliance_avg_assist,
      })

      currentDate.setDate(currentDate.getDate() + 1)
    }
  }

  return dailyData
}

/**
 * Get tick values for X axis - show only period boundaries
 */
function getPeriodBoundaryTicks(periods: readonly MemberTrendItem[]): string[] {
  const ticks: string[] = []
  for (const period of periods) {
    ticks.push(period.start_date)
  }
  // Add the last end date
  if (periods.length > 0) {
    ticks.push(periods[periods.length - 1].end_date)
  }
  return ticks
}

function formatDateTick(dateStr: string): string {
  const date = new Date(dateStr)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

// ============================================================================
// Sub-Components
// ============================================================================

interface ViewToggleProps {
  readonly value: ViewMode
  readonly onChange: (value: ViewMode) => void
}

function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center gap-1 rounded-lg border p-1">
      <button
        onClick={() => onChange('latest')}
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          value === 'latest'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        最新一期
      </button>
      <button
        onClick={() => onChange('season')}
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          value === 'season'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        賽季至今
      </button>
    </div>
  )
}

interface RankChangeIndicatorProps {
  readonly change: number | null
  readonly size?: 'sm' | 'md' | 'lg'
}

function RankChangeIndicator({ change, size = 'md' }: RankChangeIndicatorProps) {
  const iconSize = size === 'sm' ? 'h-3 w-3' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'
  const textSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-base' : 'text-sm'

  if (change === null) {
    return <span className={`${textSize} text-muted-foreground`}>新成員</span>
  }

  if (change > 0) {
    return (
      <div className={`flex items-center gap-1 ${textSize} text-green-600`}>
        <TrendingUp className={iconSize} />
        <span>+{change}</span>
      </div>
    )
  }

  if (change < 0) {
    return (
      <div className={`flex items-center gap-1 ${textSize} text-red-600`}>
        <TrendingDown className={iconSize} />
        <span>{change}</span>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-1 ${textSize} text-muted-foreground`}>
      <Minus className={iconSize} />
      <span>持平</span>
    </div>
  )
}

// ============================================================================
// Tab 1: Overview (Contribution Rank Focus)
// ============================================================================

interface OverviewTabProps {
  readonly periodData: readonly MemberTrendItem[]
  readonly seasonSummary: SeasonSummaryResponse
  readonly allianceAvg: AllianceAverage
  readonly viewMode: ViewMode
  readonly totalMembers: number
}

function OverviewTab({ periodData, seasonSummary, allianceAvg, viewMode, totalMembers }: OverviewTabProps) {
  const latestPeriod = periodData[periodData.length - 1]

  // Expand period data to daily for date-based X axis
  const dailyData = useMemo(() => expandPeriodsToDaily(periodData), [periodData])
  const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(periodData), [periodData])

  // Calculate rank Y axis domain
  const ranks = periodData.map((d) => d.end_rank)
  const minRank = Math.min(...ranks)
  const maxRank = Math.max(...ranks)
  const padding = Math.max(3, Math.ceil((maxRank - minRank) * 0.3))
  const yAxisDomain = [Math.max(1, minRank - padding), maxRank + padding]

  // Radar chart data (normalized to percentages vs alliance avg)
  const radarData = [
    {
      metric: '貢獻',
      member: viewMode === 'latest' ? latestPeriod.daily_contribution : seasonSummary.avg_daily_contribution,
      alliance: allianceAvg.daily_contribution,
      fullMark: Math.max(
        viewMode === 'latest' ? latestPeriod.daily_contribution : seasonSummary.avg_daily_contribution,
        allianceAvg.daily_contribution
      ) * 1.2,
    },
    {
      metric: '戰功',
      member: viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit,
      alliance: allianceAvg.daily_merit,
      fullMark: Math.max(
        viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit,
        allianceAvg.daily_merit
      ) * 1.2,
    },
    {
      metric: '助攻',
      member: viewMode === 'latest' ? latestPeriod.daily_assist : seasonSummary.avg_daily_assist,
      alliance: allianceAvg.daily_assist,
      fullMark: Math.max(
        viewMode === 'latest' ? latestPeriod.daily_assist : seasonSummary.avg_daily_assist,
        allianceAvg.daily_assist
      ) * 1.2,
    },
    {
      metric: '捐獻',
      member: viewMode === 'latest' ? latestPeriod.daily_donation : seasonSummary.avg_daily_donation,
      alliance: allianceAvg.daily_donation,
      fullMark: Math.max(
        viewMode === 'latest' ? latestPeriod.daily_donation : seasonSummary.avg_daily_donation,
        allianceAvg.daily_donation
      ) * 1.2,
    },
  ]

  // Rank statistics
  const rankStats = useMemo(() => {
    const best = Math.min(...ranks)
    const worst = Math.max(...ranks)
    const avg = ranks.reduce((sum, r) => sum + r, 0) / ranks.length
    return { best, worst, avg }
  }, [ranks])

  return (
    <div className="space-y-6">
      {/* Current Status Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Contribution Rank - Primary Card */}
        <Card className="md:col-span-2 border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>貢獻排名（官方綜合指標）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums">
                #{viewMode === 'latest' ? latestPeriod.end_rank : seasonSummary.current_rank}
              </span>
              <span className="text-muted-foreground">/ {totalMembers}人</span>
              <div className="ml-auto">
                <RankChangeIndicator
                  change={viewMode === 'latest' ? latestPeriod.rank_change : seasonSummary.rank_change_season}
                  size="lg"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {viewMode === 'latest' ? '本期排名變化' : '賽季累計變化'}
            </p>
          </CardContent>
        </Card>

        {/* Power */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>勢力值</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(viewMode === 'latest' ? latestPeriod.end_power : seasonSummary.current_power)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {(viewMode === 'latest' ? latestPeriod.power_diff : seasonSummary.total_power_change) >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600" />
              )}
              <span className={`text-xs ${
                (viewMode === 'latest' ? latestPeriod.power_diff : seasonSummary.total_power_change) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {(viewMode === 'latest' ? latestPeriod.power_diff : seasonSummary.total_power_change) >= 0 ? '+' : ''}
                {formatNumber(viewMode === 'latest' ? latestPeriod.power_diff : seasonSummary.total_power_change)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Daily Merit */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>日均戰功</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {calculatePercentDiff(
                viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit,
                allianceAvg.daily_merit
              ) >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600" />
              )}
              <span className={`text-xs ${
                calculatePercentDiff(
                  viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit,
                  allianceAvg.daily_merit
                ) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {calculatePercentDiff(
                  viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit,
                  allianceAvg.daily_merit
                ) >= 0 ? '+' : ''}
                {calculatePercentDiff(
                  viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit,
                  allianceAvg.daily_merit
                ).toFixed(1)}% vs 盟均
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rank History Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">貢獻排名趨勢</CardTitle>
            <CardDescription>排名越低越好（越靠近頂部）</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={rankChartConfig} className="h-[280px] w-full">
              <LineChart data={dailyData} margin={{ left: 12, right: 12, top: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                  ticks={xAxisTicks}
                  tickFormatter={formatDateTick}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                  reversed
                  domain={yAxisDomain}
                  tickFormatter={(value) => `#${value}`}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const data = payload[0].payload as DailyDataPoint
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.dateLabel}</div>
                        <div className="text-xs text-muted-foreground mb-1">Period {data.periodNumber}</div>
                        <div className="text-sm">排名: #{data.endRank}</div>
                      </div>
                    )
                  }}
                />
                <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
                <Line
                  type="stepAfter"
                  dataKey="endRank"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ChartContainer>

            {/* Rank Stats */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-sm text-muted-foreground">最佳</div>
                <div className="text-lg font-bold text-green-600">#{rankStats.best}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">平均</div>
                <div className="text-lg font-bold">#{rankStats.avg.toFixed(0)}</div>
              </div>
              <div className="text-center">
                <div className="text-sm text-muted-foreground">最差</div>
                <div className="text-lg font-bold text-red-600">#{rankStats.worst}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">四維能力圖</CardTitle>
            <CardDescription>成員日均表現 vs 同盟平均</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={radarChartConfig} className="mx-auto aspect-square max-h-[280px]">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" className="text-xs" />
                <PolarRadiusAxis angle={30} domain={[0, 'dataMax']} className="text-xs" tick={false} />
                <Radar
                  name="成員"
                  dataKey="member"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.3}
                />
                <Radar
                  name="同盟平均"
                  dataKey="alliance"
                  stroke="hsl(var(--muted-foreground))"
                  fill="hsl(var(--muted-foreground))"
                  fillOpacity={0.1}
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
  const dailyData = useMemo(() => expandPeriodsToDaily(periodData), [periodData])
  const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(periodData), [periodData])

  // Calculate merit growth
  const meritGrowth = periodData.length >= 2
    ? ((periodData[periodData.length - 1].daily_merit - periodData[0].daily_merit) / periodData[0].daily_merit) * 100
    : 0

  return (
    <div className="space-y-6">
      {/* Merit Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>日均戰功</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums">
                {formatNumber(viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit)}
              </span>
              <span className="text-muted-foreground">/日</span>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1">
                {calculatePercentDiff(
                  viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit,
                  allianceAvg.daily_merit
                ) >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span className={`text-sm ${
                  calculatePercentDiff(
                    viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit,
                    allianceAvg.daily_merit
                  ) >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}>
                  {calculatePercentDiff(
                    viewMode === 'latest' ? latestPeriod.daily_merit : seasonSummary.avg_daily_merit,
                    allianceAvg.daily_merit
                  ).toFixed(1)}% vs 盟均
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                同盟平均: {formatNumber(allianceAvg.daily_merit)}/日
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>賽季成長率</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-bold tabular-nums ${meritGrowth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {meritGrowth >= 0 ? '+' : ''}{meritGrowth.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              首期 → 最新期 戰功變化
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Merit Trend Chart - Primary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">戰功趨勢</CardTitle>
          <CardDescription>日均戰功變化（每日數據為該期間平均值）</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={meritChartConfig} className="h-[300px] w-full">
            <LineChart data={dailyData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                ticks={xAxisTicks}
                tickFormatter={formatDateTick}
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
                      <div className="text-sm">日均戰功: {formatNumber(data.dailyMerit)}</div>
                      <div className="text-sm text-muted-foreground">同盟平均: {formatNumber(data.allianceAvgMerit)}</div>
                    </div>
                  )
                }}
              />
              <Legend />
              <Line
                type="stepAfter"
                dataKey="dailyMerit"
                name="日均戰功"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Line
                type="stepAfter"
                dataKey="allianceAvgMerit"
                name="同盟平均"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Assist Section */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>日均助攻</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {formatNumber(viewMode === 'latest' ? latestPeriod.daily_assist : seasonSummary.avg_daily_assist)}
              <span className="text-base font-normal text-muted-foreground ml-1">/日</span>
            </div>
            <div className="flex items-center gap-1 mt-2">
              {calculatePercentDiff(
                viewMode === 'latest' ? latestPeriod.daily_assist : seasonSummary.avg_daily_assist,
                allianceAvg.daily_assist
              ) >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-600" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-600" />
              )}
              <span className={`text-xs ${
                calculatePercentDiff(
                  viewMode === 'latest' ? latestPeriod.daily_assist : seasonSummary.avg_daily_assist,
                  allianceAvg.daily_assist
                ) >= 0
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}>
                {calculatePercentDiff(
                  viewMode === 'latest' ? latestPeriod.daily_assist : seasonSummary.avg_daily_assist,
                  allianceAvg.daily_assist
                ).toFixed(1)}% vs 盟均
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">助攻趨勢</CardTitle>
            <CardDescription>次要指標追蹤</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={assistChartConfig} className="h-[180px] w-full">
              <LineChart data={dailyData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                  ticks={xAxisTicks}
                  tickFormatter={formatDateTick}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  className="text-xs"
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const data = payload[0].payload as DailyDataPoint
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.dateLabel}</div>
                        <div className="text-xs text-muted-foreground mb-1">Period {data.periodNumber}</div>
                        <div className="text-sm">日均助攻: {data.dailyAssist}</div>
                        <div className="text-sm text-muted-foreground">同盟平均: {data.allianceAvgAssist}</div>
                      </div>
                    )
                  }}
                />
                <Line
                  type="stepAfter"
                  dataKey="dailyAssist"
                  name="日均助攻"
                  stroke="hsl(142.1 76.2% 36.3%)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  type="stepAfter"
                  dataKey="allianceAvgAssist"
                  name="同盟平均"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
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
// Tab 3: Power & Donation (Simple Records)
// ============================================================================

interface PowerDonationTabProps {
  readonly periodData: readonly MemberTrendItem[]
  readonly seasonSummary: SeasonSummaryResponse
}

function PowerDonationTab({ periodData, seasonSummary }: PowerDonationTabProps) {
  const latestPeriod = periodData[periodData.length - 1]

  // Expand period data to daily for date-based X axis
  const dailyData = useMemo(() => expandPeriodsToDaily(periodData), [periodData])
  const xAxisTicks = useMemo(() => getPeriodBoundaryTicks(periodData), [periodData])

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>當前勢力值</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{formatNumber(latestPeriod.end_power)}</div>
            <div className="flex items-center gap-2 mt-2">
              {seasonSummary.total_power_change >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span className={`text-sm ${seasonSummary.total_power_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {seasonSummary.total_power_change >= 0 ? '+' : ''}{formatNumber(seasonSummary.total_power_change)} 賽季累計
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>賽季總捐獻</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {formatNumber(periodData.reduce((sum, d) => sum + d.donation_diff, 0))}
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              日均: {formatNumber(seasonSummary.avg_daily_donation)}/日
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Power Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">勢力值變化</CardTitle>
          <CardDescription>各期間勢力值追蹤</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={powerChartConfig} className="h-[250px] w-full">
            <LineChart data={dailyData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                ticks={xAxisTicks}
                tickFormatter={formatDateTick}
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
                      <div className="text-sm">勢力值: {formatNumber(data.endPower)}</div>
                    </div>
                  )
                }}
              />
              <Line
                type="stepAfter"
                dataKey="endPower"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Donation Records - Area Chart showing daily donation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">捐獻記錄</CardTitle>
          <CardDescription>日均捐獻變化</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={donationChartConfig} className="h-[200px] w-full">
            <LineChart data={dailyData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                ticks={xAxisTicks}
                tickFormatter={formatDateTick}
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
                      <div className="text-sm">日均捐獻: {formatNumber(data.dailyDonation)}</div>
                    </div>
                  )
                }}
              />
              <Line
                type="stepAfter"
                dataKey="dailyDonation"
                stroke="hsl(45 93% 47%)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Period Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">期間明細</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">期間</th>
                  <th className="text-right py-2 px-2 font-medium">勢力值</th>
                  <th className="text-right py-2 px-2 font-medium">變化</th>
                  <th className="text-right py-2 px-2 font-medium">捐獻</th>
                  <th className="text-right py-2 px-2 font-medium">日均</th>
                </tr>
              </thead>
              <tbody>
                {periodData.map((d) => (
                  <tr key={d.period_number} className="border-b last:border-0">
                    <td className="py-2 px-2 text-muted-foreground">{d.period_label}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(d.end_power)}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${d.power_diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {d.power_diff >= 0 ? '+' : ''}{formatNumber(d.power_diff)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(d.donation_diff)}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">
                      {formatNumber(d.daily_donation)}
                    </td>
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

function MemberPerformance() {
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(undefined)
  const [viewMode, setViewMode] = useState<ViewMode>('latest')
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch active season
  const { data: activeSeason, isLoading: isLoadingSeason } = useActiveSeason()
  const seasonId = activeSeason?.id

  // Fetch members list
  const {
    data: members,
    isLoading: isLoadingMembers,
    error: membersError,
  } = useAnalyticsMembers(seasonId)

  // Auto-select first member when members are loaded
  useEffect(() => {
    if (members && members.length > 0 && !selectedMemberId) {
      setSelectedMemberId(members[0].id)
    }
  }, [members, selectedMemberId])

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

  // Find selected member info
  const selectedMember = useMemo(() => {
    return members?.find((m) => m.id === selectedMemberId)
  }, [members, selectedMemberId])

  // Calculate alliance averages from latest trend period
  const allianceAvg: AllianceAverage = useMemo(() => {
    if (!trendData || trendData.length === 0) {
      return {
        daily_contribution: 0,
        daily_merit: 0,
        daily_assist: 0,
        daily_donation: 0,
      }
    }
    const latest = trendData[trendData.length - 1]
    return {
      daily_contribution: latest.alliance_avg_contribution,
      daily_merit: latest.alliance_avg_merit,
      daily_assist: latest.alliance_avg_assist,
      daily_donation: latest.alliance_avg_donation,
    }
  }, [trendData])

  // Get total members from latest trend data
  const totalMembers = useMemo(() => {
    if (!trendData || trendData.length === 0) return 0
    return trendData[trendData.length - 1].alliance_member_count
  }, [trendData])

  // Loading state
  const isLoading = isLoadingSeason || isLoadingMembers || isLoadingTrend || isLoadingSummary

  // Error state
  const hasError = membersError || trendError || summaryError

  // Check if we have the required data
  const hasData = trendData && trendData.length > 0 && seasonSummary

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Page Header with Controls */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">成員表現分析</h2>
            <p className="text-muted-foreground mt-1">
              查看個別成員的詳細表現數據與趨勢
            </p>
          </div>
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>

        {/* Member Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">選擇成員:</span>
          <Select
            value={selectedMemberId ?? ''}
            onValueChange={setSelectedMemberId}
            disabled={isLoadingMembers || !members?.length}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={isLoadingMembers ? '載入中...' : '選擇成員'} />
            </SelectTrigger>
            <SelectContent>
              {members?.map((member) => (
                <SelectItem key={member.id} value={member.id}>
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span>總覽</span>
              </TabsTrigger>
              <TabsTrigger value="combat" className="flex items-center gap-2">
                <Swords className="h-4 w-4" />
                <span>戰功與助攻</span>
              </TabsTrigger>
              <TabsTrigger value="power" className="flex items-center gap-2">
                <Coins className="h-4 w-4" />
                <span>勢力值與捐獻</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab
                periodData={trendData}
                seasonSummary={seasonSummary}
                allianceAvg={allianceAvg}
                viewMode={viewMode}
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
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AllianceGuard>
  )
}

export default MemberPerformance
