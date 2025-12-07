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
import { RankChangeIndicator } from '@/components/analytics/RankChangeIndicator'
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
  ChartConfig,
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
} from '@/lib/chart-utils'
import { useActiveSeason } from '@/hooks/use-seasons'
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
// Chart Configurations
// ============================================================================

const capabilityRadarConfig = {
  group: {
    label: '組別',
    color: 'var(--primary)',
  },
  alliance: {
    label: '同盟平均',
    color: 'var(--muted-foreground)',
  },
  median: {
    label: '同盟中位數',
    color: 'hsl(215 20% 55%)',
  },
} satisfies ChartConfig

const meritBarConfig = {
  merit: {
    label: '人日均戰功',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

const meritTrendConfig = {
  merit: {
    label: '人日均戰功',
    color: 'var(--primary)',
  },
  assist: {
    label: '人日均助攻',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

const rankTrendConfig = {
  rank: {
    label: '平均排名',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

const rankDistributionConfig = {
  count: {
    label: '人數',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

// ============================================================================
// Types
// ============================================================================

/** View mode for data display: latest period or season-to-date */
type ViewMode = 'latest' | 'season'

// Subtle blue-gray for median lines (distinct from muted-foreground but still muted)
const MEDIAN_LINE_COLOR = 'hsl(215 20% 55%)'

// ============================================================================
// Tab 1: Overview
// ============================================================================

interface OverviewTabProps {
  readonly groupStats: GroupStats
  readonly allianceAverages: AllianceAveragesResponse
  readonly allGroupsData: readonly GroupComparisonItem[]
  readonly periodTrends: readonly GroupTrendItem[]
  readonly members: readonly GroupMember[]
  readonly viewMode: ViewMode
}

function OverviewTab({ groupStats, allianceAverages, allGroupsData, periodTrends, members, viewMode }: OverviewTabProps) {

  // Calculate season averages from period trends (for 'season' view mode)
  const seasonGroupAverages = useMemo(() => {
    if (periodTrends.length === 0) {
      return {
        avg_daily_merit: 0,
        avg_daily_assist: 0,
        avg_daily_donation: 0,
        avg_power: 0,
        avg_rank: 0,
      }
    }

    // Calculate weighted average based on member count per period
    let totalMerit = 0
    let totalAssist = 0
    let totalRank = 0
    let totalMemberPeriods = 0

    for (const period of periodTrends) {
      totalMerit += period.avg_merit * period.member_count
      totalAssist += period.avg_assist * period.member_count
      totalRank += period.avg_rank * period.member_count
      totalMemberPeriods += period.member_count
    }

    // Donation is not in trends, calculate from current members
    const totalDonation = members.reduce((sum, m) => sum + m.daily_donation, 0)
    const totalPower = members.reduce((sum, m) => sum + m.power, 0)
    const memberCount = members.length || 1

    return {
      avg_daily_merit: totalMemberPeriods > 0 ? totalMerit / totalMemberPeriods : 0,
      avg_daily_assist: totalMemberPeriods > 0 ? totalAssist / totalMemberPeriods : 0,
      avg_daily_donation: totalDonation / memberCount,
      avg_power: totalPower / memberCount,
      avg_rank: totalMemberPeriods > 0 ? totalRank / totalMemberPeriods : 0,
    }
  }, [periodTrends, members])

  // Capability radar data: normalized to alliance average (100 = alliance average)
  // Uses viewMode for toggle between latest period and season average
  const radarData = useMemo(() => {
    const normalize = (value: number, avg: number) => (avg > 0 ? Math.round((value / avg) * 100) : 0)

    // Select group values based on view mode
    const groupMerit = viewMode === 'latest' ? groupStats.avg_daily_merit : seasonGroupAverages.avg_daily_merit
    const groupAssist = viewMode === 'latest' ? groupStats.avg_daily_assist : seasonGroupAverages.avg_daily_assist
    const groupDonation = viewMode === 'latest' ? groupStats.avg_daily_donation : seasonGroupAverages.avg_daily_donation
    const groupPower = viewMode === 'latest' ? groupStats.avg_power : seasonGroupAverages.avg_power

    return [
      {
        metric: '戰功',
        group: normalize(groupMerit, allianceAverages.avg_daily_merit),
        groupRaw: groupMerit,
        alliance: 100,
        allianceRaw: allianceAverages.avg_daily_merit,
        median: normalize(allianceAverages.median_daily_merit, allianceAverages.avg_daily_merit),
        medianRaw: allianceAverages.median_daily_merit,
      },
      {
        metric: '勢力值',
        group: normalize(groupPower, allianceAverages.avg_power),
        groupRaw: groupPower,
        alliance: 100,
        allianceRaw: allianceAverages.avg_power,
        median: normalize(allianceAverages.median_power, allianceAverages.avg_power),
        medianRaw: allianceAverages.median_power,
      },
      {
        metric: '助攻',
        group: normalize(groupAssist, allianceAverages.avg_daily_assist),
        groupRaw: groupAssist,
        alliance: 100,
        allianceRaw: allianceAverages.avg_daily_assist,
        median: normalize(allianceAverages.median_daily_assist, allianceAverages.avg_daily_assist),
        medianRaw: allianceAverages.median_daily_assist,
      },
      {
        metric: '捐獻',
        group: normalize(groupDonation, allianceAverages.avg_daily_donation),
        groupRaw: groupDonation,
        alliance: 100,
        allianceRaw: allianceAverages.avg_daily_donation,
        median: normalize(allianceAverages.median_daily_donation, allianceAverages.avg_daily_donation),
        medianRaw: allianceAverages.median_daily_donation,
      },
    ]
  }, [viewMode, groupStats, seasonGroupAverages, allianceAverages])

  // Displayed values based on view mode
  const displayMerit = viewMode === 'latest' ? groupStats.avg_daily_merit : seasonGroupAverages.avg_daily_merit
  const displayAssist = viewMode === 'latest' ? groupStats.avg_daily_assist : seasonGroupAverages.avg_daily_assist
  const displayRank = viewMode === 'latest' ? groupStats.avg_rank : seasonGroupAverages.avg_rank

  const meritDiff = calculatePercentDiff(displayMerit, allianceAverages.avg_daily_merit)
  const assistDiff = calculatePercentDiff(displayAssist, allianceAverages.avg_daily_assist)

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
            <p className="text-xs text-muted-foreground mt-1">活躍成員</p>
          </CardContent>
        </Card>

        {/* Average Rank */}
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>組別平均排名</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              #{Math.round(displayRank)}
              <span className="text-base font-normal text-muted-foreground ml-1">/ {allianceAverages.member_count}</span>
            </div>
            {viewMode === 'latest' && (
              <p className="text-xs text-muted-foreground mt-1">
                最佳 #{groupStats.best_rank} · 最差 #{groupStats.worst_rank}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Daily Merit */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>人日均戰功</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatNumber(displayMerit)}</div>
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
            <div className="text-2xl font-bold tabular-nums">{formatNumber(displayAssist)}</div>
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
        {/* Capability Radar (4 dimensions) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">四維能力圖</CardTitle>
            <CardDescription>組別人日均表現 vs 同盟平均/中位數（100% = 同盟平均）</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={capabilityRadarConfig} className="mx-auto aspect-square max-h-[280px]">
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
            <ChartContainer config={meritBarConfig} className="h-[280px] w-full">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20 }}>
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
                  width={75}
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

interface MeritBin {
  readonly range: string
  readonly label: string
  readonly min: number
  readonly max: number
  readonly count: number
  readonly percentage: number
}

const meritDistributionConfig = {
  count: {
    label: '人數',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

interface MeritDistributionTabProps {
  readonly groupStats: GroupStats
  readonly members: readonly GroupMember[]
  readonly periodTrends: readonly GroupTrendItem[]
}

function MeritDistributionTab({ groupStats, members, periodTrends }: MeritDistributionTabProps) {
  const [hoveredMember, setHoveredMember] = useState<GroupMember | null>(null)

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

  // Calculate dynamic merit distribution bins
  // Uses "nice" step sizes based on max value for clean integer boundaries
  const meritBins = useMemo((): MeritBin[] => {
    if (members.length === 0) return []

    const merits = members.map((m) => m.daily_merit)
    const maxMerit = Math.max(...merits, 0)

    // All members are inactive (0 merit)
    if (maxMerit === 0) {
      return [{ range: '0', label: '0', min: 0, max: Infinity, count: members.length, percentage: 100 }]
    }

    // Select a "nice" step size that produces 5-8 bins
    // Prefer round numbers in 萬 (10000) units for readability
    const selectStep = (max: number): number => {
      const niceSteps = [5000, 10000, 20000, 50000, 100000, 200000]
      const targetBins = 6

      // Find step that produces closest to target bin count
      for (const step of niceSteps) {
        const binCount = Math.ceil(max / step)
        if (binCount >= 4 && binCount <= 8) return step
      }

      // Fallback: calculate based on magnitude
      const rawStep = max / targetBins
      const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
      const normalized = rawStep / magnitude
      const niceNormalized = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
      return niceNormalized * magnitude
    }

    const step = selectStep(maxMerit)
    const numRanges = Math.ceil(maxMerit / step)

    // Format number as 萬 for readability
    const formatWan = (v: number): string => {
      if (v === 0) return '0'
      if (v >= 10000) {
        const wan = v / 10000
        return Number.isInteger(wan) ? `${wan}萬` : `${wan.toFixed(1)}萬`
      }
      return v.toLocaleString()
    }

    // Build bin definitions: first bin is always "0" (inactive members)
    type BinDef = { min: number; max: number; label: string }
    const binDefs: BinDef[] = [{ min: 0, max: 0.01, label: '0' }]

    for (let i = 0; i < numRanges; i++) {
      const rangeMin = i * step + (i === 0 ? 0.01 : 0)
      const rangeMax = (i + 1) * step
      const isLast = i === numRanges - 1

      let label: string
      if (i === 0) {
        label = `0-${formatWan(step)}`
      } else if (isLast) {
        label = `${formatWan(i * step)}+`
      } else {
        label = `${formatWan(i * step)}-${formatWan(rangeMax)}`
      }

      binDefs.push({
        min: rangeMin,
        max: isLast ? Infinity : rangeMax,
        label,
      })
    }

    // Count members in each bin (single pass for O(n) performance)
    const total = members.length
    const counts = new Array<number>(binDefs.length).fill(0)

    for (const member of members) {
      const merit = member.daily_merit
      for (let i = 0; i < binDefs.length; i++) {
        if (merit >= binDefs[i].min && merit < binDefs[i].max) {
          counts[i]++
          break
        }
      }
    }

    return binDefs.map((def, i) => ({
      range: def.label,
      label: def.label,
      min: def.min,
      max: def.max,
      count: counts[i],
      percentage: total > 0 ? Math.round((counts[i] / total) * 100) : 0,
    }))
  }, [members])

  // Calculate position for strip plot (handle edge case when min === max)
  const getStripPosition = (merit: number): number => {
    const range = groupStats.merit_max - groupStats.merit_min
    if (range === 0) return 50
    return ((merit - groupStats.merit_min) / range) * 100
  }

  return (
    <div className="space-y-6">
      {/* Box Plot with Strip Plot */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">戰功分佈概覽</CardTitle>
          <CardDescription>
            箱型圖統計 · 每個圓點代表一位成員
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {/* Top labels */}
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{formatNumber(groupStats.merit_min)}</span>
              <span>{formatNumber(groupStats.merit_median)}</span>
              <span>{formatNumber(groupStats.merit_max)}</span>
            </div>

            {/* Box Plot */}
            <div className="relative h-8">
              {/* Full range bar */}
              <div className="absolute inset-y-2 left-0 right-0 bg-muted rounded" />
              {/* IQR box */}
              <div
                className="absolute inset-y-1 bg-primary/30 border-2 border-primary rounded"
                style={{
                  left: `${getStripPosition(groupStats.merit_q1)}%`,
                  right: `${100 - getStripPosition(groupStats.merit_q3)}%`,
                }}
              />
              {/* Median line */}
              <div
                className="absolute inset-y-0 w-0.5 bg-primary"
                style={{ left: `${getStripPosition(groupStats.merit_median)}%` }}
              />
            </div>

            {/* Strip Plot - Individual member data points */}
            <div className="relative h-6">
              {members.map((member) => {
                const position = getStripPosition(member.daily_merit)
                const isHovered = hoveredMember?.id === member.id
                return (
                  <div
                    key={member.id}
                    className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-primary/70 hover:bg-primary hover:scale-150 cursor-pointer transition-transform z-10"
                    style={{ left: `calc(${position}% - 5px)` }}
                    onMouseEnter={() => setHoveredMember(member)}
                    onMouseLeave={() => setHoveredMember(null)}
                  >
                    {isHovered && (
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-popover border shadow-md text-xs whitespace-nowrap z-20">
                        <div className="font-medium">{member.name}</div>
                        <div className="text-muted-foreground">
                          日均戰功: {formatNumber(member.daily_merit)}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Bottom labels */}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Min</span>
              <span>Q1: {formatNumber(groupStats.merit_q1)}</span>
              <span>Q3: {formatNumber(groupStats.merit_q3)}</span>
              <span>Max</span>
            </div>
          </div>
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
            <ChartContainer config={meritDistributionConfig} className="h-[220px] w-full">
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
                    const data = payload[0].payload as MeritBin
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
            <ChartContainer config={meritTrendConfig} className="h-[220px] w-full">
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
// Tab 3: Contribution Rank
// ============================================================================

interface ContributionRankTabProps {
  readonly groupStats: GroupStats
  readonly periodTrends: readonly GroupTrendItem[]
  readonly members: readonly GroupMember[]
}

function ContributionRankTab({ groupStats, periodTrends, members }: ContributionRankTabProps) {
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

  // Calculate rank improvement
  const rankImprovement =
    periodTrends.length >= 2 ? periodTrends[0].avg_rank - periodTrends[periodTrends.length - 1].avg_rank : 0

  // Rank distribution histogram
  const rankDistribution = useMemo(() => {
    const bins = [
      { range: '1-50', min: 1, max: 50, count: 0 },
      { range: '51-100', min: 51, max: 100, count: 0 },
      { range: '101-150', min: 101, max: 150, count: 0 },
      { range: '151-200', min: 151, max: 200, count: 0 },
    ]

    for (const member of members) {
      for (const bin of bins) {
        if (member.contribution_rank >= bin.min && member.contribution_rank <= bin.max) {
          bin.count++
          break
        }
      }
    }

    return bins
  }, [members])

  return (
    <div className="space-y-6">
      {/* Rank Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="lg:col-span-2 border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>組別平均貢獻排名</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-bold tabular-nums">#{Math.round(groupStats.avg_rank)}</span>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1">
                {rankImprovement >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-primary" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-destructive" />
                )}
                <span className={`text-sm ${rankImprovement >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {rankImprovement >= 0 ? '+' : ''}
                  {Math.round(rankImprovement)} 名 本賽季
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>最佳排名</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-primary">#{groupStats.best_rank}</div>
            <p className="text-xs text-muted-foreground mt-1">組內最高成員</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>最差排名</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-destructive">#{groupStats.worst_rank}</div>
            <p className="text-xs text-muted-foreground mt-1">組內最低成員</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Rank Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">排名趨勢</CardTitle>
            <CardDescription>組別平均貢獻排名變化（數字越小排名越好）</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={rankTrendConfig} className="h-[250px] w-full">
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
                  reversed
                  domain={['dataMin - 5', 'dataMax + 5']}
                  tickFormatter={(value) => `#${value}`}
                />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const data = payload[0].payload as (typeof dailyData)[0]
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.dateLabel}</div>
                        <div className="text-sm">平均排名: #{Math.round(data.avgRank)}</div>
                      </div>
                    )
                  }}
                />
                <Line
                  type="stepAfter"
                  dataKey="avgRank"
                  name="平均排名"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Rank Distribution Histogram */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">排名分佈</CardTitle>
            <CardDescription>組內成員在全盟排名的分佈</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={rankDistributionConfig} className="h-[250px] w-full">
              <BarChart data={rankDistribution} margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="range" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} className="text-xs" />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const data = payload[0].payload as (typeof rankDistribution)[0]
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">排名 {data.range}</div>
                        <div className="text-sm">{data.count} 人</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Period Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">期間明細</CardTitle>
          <CardDescription>貢獻排名是官方綜合指標，反映成員整體表現</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">期間</th>
                  <th className="text-right py-2 px-2 font-medium">平均排名</th>
                  <th className="text-right py-2 px-2 font-medium">變化</th>
                  <th className="text-right py-2 px-2 font-medium">人日均戰功</th>
                  <th className="text-right py-2 px-2 font-medium">人日均助攻</th>
                  <th className="text-right py-2 px-2 font-medium">成員數</th>
                </tr>
              </thead>
              <tbody>
                {periodTrends.map((d, index) => {
                  const prevRank = index > 0 ? periodTrends[index - 1].avg_rank : null
                  const rankChange = prevRank ? prevRank - d.avg_rank : null

                  return (
                    <tr key={d.period_number} className="border-b last:border-0">
                      <td className="py-2 px-2 text-muted-foreground">{d.period_label}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium">#{Math.round(d.avg_rank)}</td>
                      <td className="py-2 px-2 text-right">
                        {rankChange !== null ? (
                          <span className={rankChange >= 0 ? 'text-primary' : 'text-destructive'}>
                            {rankChange >= 0 ? '+' : ''}
                            {Math.round(rankChange)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatNumber(d.avg_merit)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{Math.round(d.avg_assist)}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{d.member_count}</td>
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

// ============================================================================
// Tab 4: Member Rankings
// ============================================================================

interface MembersTabProps {
  readonly members: readonly GroupMember[]
}

function MembersTab({ members }: MembersTabProps) {
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
                  <th className="text-right py-2 px-2 font-medium text-muted-foreground">變化</th>
                  <th
                    className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort('merit')}
                  >
                    日均戰功 {sortBy === 'merit' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  <th className="text-right py-2 px-2 font-medium text-muted-foreground">變化</th>
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
                    <td className="py-2 px-2">
                      <div className="flex justify-end">
                        <RankChangeIndicator change={member.rank_change} showNewLabel={false} size="sm" />
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(member.daily_merit)}</td>
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

  // Get active season
  const { data: activeSeason, isLoading: isSeasonLoading } = useActiveSeason()
  const seasonId = activeSeason?.id

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
  if (!isSeasonLoading && !activeSeason) {
    return (
      <AllianceGuard>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">尚未設定活躍賽季</h3>
          <p className="text-sm text-muted-foreground mt-1">請先在設定頁面選擇或建立一個賽季</p>
        </div>
      </AllianceGuard>
    )
  }

  // No groups state
  if (!isGroupsLoading && groups && groups.length === 0) {
    return (
      <AllianceGuard>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">尚無組別資料</h3>
          <p className="text-sm text-muted-foreground mt-1">
            請先上傳 CSV 資料並確保成員有設定組別 (end_group)
          </p>
        </div>
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
          {/* View Mode Toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="latest" className="text-xs px-3">最新一期</TabsTrigger>
              <TabsTrigger value="season" className="text-xs px-3">賽季以來</TabsTrigger>
            </TabsList>
          </Tabs>
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
              <TabsTrigger value="distribution" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">戰功分佈</span>
              </TabsTrigger>
              <TabsTrigger value="rank" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">貢獻排名</span>
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
                periodTrends={periodTrends}
                members={groupMembers}
                viewMode={viewMode}
              />
            </TabsContent>

            <TabsContent value="distribution">
              <MeritDistributionTab
                groupStats={groupStats}
                members={groupMembers}
                periodTrends={periodTrends}
              />
            </TabsContent>

            <TabsContent value="rank">
              <ContributionRankTab
                groupStats={groupStats}
                periodTrends={periodTrends}
                members={groupMembers}
              />
            </TabsContent>

            <TabsContent value="members">
              <MembersTab members={groupMembers} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </AllianceGuard>
  )
}

export default GroupAnalytics
