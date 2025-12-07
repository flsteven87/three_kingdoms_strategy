/**
 * GroupAnalytics - Group Performance Analytics Page
 *
 * Group-level performance analysis with distribution concepts:
 * - Group selector dropdown
 * - Tab-based navigation:
 *   1. Overview: Group summary stats + Health Radar
 *   2. Merit Distribution: Box plot + Tier breakdown (merit has actual values)
 *   3. Contribution Rank: Rank trends (contribution is a ranking metric)
 *   4. Member Rankings: Sortable member table within group
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
} from '@/lib/chart-utils'

// ============================================================================
// Types
// ============================================================================

interface GroupOption {
  readonly id: string
  readonly name: string
  readonly memberCount: number
}

interface GroupStats {
  readonly group_name: string
  readonly member_count: number
  // Primary metrics
  readonly avg_daily_merit: number
  readonly avg_daily_assist: number
  readonly avg_daily_donation: number
  // Rank stats (contribution is a ranking, not a value)
  readonly avg_rank: number // Group average rank
  readonly best_rank: number
  readonly worst_rank: number
  // Merit distribution stats (merit has actual values)
  readonly merit_mean: number
  readonly merit_median: number
  readonly merit_q1: number
  readonly merit_q3: number
  readonly merit_min: number
  readonly merit_max: number
  readonly merit_cv: number // Coefficient of variation (std/mean)
  // Health scores (0-100)
  readonly health_performance: number
  readonly health_stability: number
  readonly health_uniformity: number
  readonly health_activity: number
  readonly health_growth: number
}

interface TierBreakdown {
  readonly tier: string
  readonly count: number
  readonly percentage: number
  readonly avg_merit: number
  readonly color: string
}

interface GroupMember {
  readonly id: string
  readonly name: string
  readonly contribution_rank: number // This is a rank (1-201)
  readonly daily_merit: number
  readonly daily_assist: number
  readonly rank_change: number | null
  readonly tier: 'top' | 'mid' | 'bottom'
}

interface PeriodTrend {
  readonly period_label: string
  readonly period_number: number
  readonly start_date: string // ISO date string for expandPeriodsToDaily
  readonly end_date: string // ISO date string
  readonly avg_rank: number // Group average contribution rank
  readonly avg_merit: number
  readonly avg_assist: number
}

interface DailyDataPoint {
  readonly date: string
  readonly dateLabel: string
  readonly periodNumber: number
  readonly avgRank: number
  readonly avgMerit: number
  readonly avgAssist: number
}

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_GROUPS: readonly GroupOption[] = [
  { id: '1', name: '狼王特戰', memberCount: 28 },
  { id: '2', name: '墨組', memberCount: 25 },
  { id: '3', name: '隼隼組', memberCount: 24 },
  { id: '4', name: '紅隊', memberCount: 26 },
  { id: '5', name: '飛鳳營', memberCount: 23 },
  { id: '6', name: '虎賁軍', memberCount: 27 },
  { id: '7', name: '青龍隊', memberCount: 22 },
  { id: '8', name: '玄武組', memberCount: 24 },
]

const MOCK_GROUP_STATS: Record<string, GroupStats> = {
  '1': {
    group_name: '狼王特戰',
    member_count: 28,
    avg_daily_merit: 15200,
    avg_daily_assist: 98,
    avg_daily_donation: 195000,
    avg_rank: 42,
    best_rank: 3,
    worst_rank: 156,
    merit_mean: 15200,
    merit_median: 14500,
    merit_q1: 11000,
    merit_q3: 18500,
    merit_min: 5200,
    merit_max: 28000,
    merit_cv: 0.32,
    health_performance: 92,
    health_stability: 78,
    health_uniformity: 72,
    health_activity: 88,
    health_growth: 85,
  },
  '2': {
    group_name: '墨組',
    member_count: 25,
    avg_daily_merit: 13100,
    avg_daily_assist: 82,
    avg_daily_donation: 175000,
    avg_rank: 58,
    best_rank: 8,
    worst_rank: 142,
    merit_mean: 13100,
    merit_median: 12800,
    merit_q1: 9500,
    merit_q3: 16200,
    merit_min: 4800,
    merit_max: 24000,
    merit_cv: 0.28,
    health_performance: 85,
    health_stability: 82,
    health_uniformity: 78,
    health_activity: 80,
    health_growth: 75,
  },
  '3': {
    group_name: '隼隼組',
    member_count: 24,
    avg_daily_merit: 12400,
    avg_daily_assist: 78,
    avg_daily_donation: 168000,
    avg_rank: 65,
    best_rank: 12,
    worst_rank: 168,
    merit_mean: 12400,
    merit_median: 11800,
    merit_q1: 8800,
    merit_q3: 15200,
    merit_min: 4200,
    merit_max: 22500,
    merit_cv: 0.35,
    health_performance: 80,
    health_stability: 75,
    health_uniformity: 68,
    health_activity: 82,
    health_growth: 78,
  },
}

// Alliance average for comparison
const ALLIANCE_AVG = {
  avg_rank: 100, // Middle of 201 members
  daily_merit: 12000,
  daily_assist: 85,
  daily_donation: 180000,
}

// Tier breakdown mock data (based on merit values)
const MOCK_TIER_BREAKDOWN: Record<string, TierBreakdown[]> = {
  '1': [
    { tier: 'Top 20%', count: 6, percentage: 21, avg_merit: 24500, color: 'var(--chart-2)' },
    { tier: 'Mid 60%', count: 17, percentage: 61, avg_merit: 14200, color: 'var(--primary)' },
    { tier: 'Bot 20%', count: 5, percentage: 18, avg_merit: 6800, color: 'var(--destructive)' },
  ],
  '2': [
    { tier: 'Top 20%', count: 5, percentage: 20, avg_merit: 21800, color: 'var(--chart-2)' },
    { tier: 'Mid 60%', count: 15, percentage: 60, avg_merit: 12500, color: 'var(--primary)' },
    { tier: 'Bot 20%', count: 5, percentage: 20, avg_merit: 6200, color: 'var(--destructive)' },
  ],
  '3': [
    { tier: 'Top 20%', count: 5, percentage: 21, avg_merit: 20500, color: 'var(--chart-2)' },
    { tier: 'Mid 60%', count: 14, percentage: 58, avg_merit: 11800, color: 'var(--primary)' },
    { tier: 'Bot 20%', count: 5, percentage: 21, avg_merit: 5800, color: 'var(--destructive)' },
  ],
}

// Period trend data for group comparison
const MOCK_PERIOD_TRENDS: Record<string, PeriodTrend[]> = {
  '1': [
    { period_label: '10/02-09', period_number: 1, start_date: '2024-10-02', end_date: '2024-10-09', avg_rank: 48, avg_merit: 14200, avg_assist: 92 },
    { period_label: '10/09-16', period_number: 2, start_date: '2024-10-09', end_date: '2024-10-16', avg_rank: 45, avg_merit: 14600, avg_assist: 95 },
    { period_label: '10/16-23', period_number: 3, start_date: '2024-10-16', end_date: '2024-10-23', avg_rank: 43, avg_merit: 14900, avg_assist: 96 },
    { period_label: '10/23-30', period_number: 4, start_date: '2024-10-23', end_date: '2024-10-30', avg_rank: 42, avg_merit: 15200, avg_assist: 98 },
  ],
  '2': [
    { period_label: '10/02-09', period_number: 1, start_date: '2024-10-02', end_date: '2024-10-09', avg_rank: 62, avg_merit: 12200, avg_assist: 78 },
    { period_label: '10/09-16', period_number: 2, start_date: '2024-10-09', end_date: '2024-10-16', avg_rank: 60, avg_merit: 12600, avg_assist: 80 },
    { period_label: '10/16-23', period_number: 3, start_date: '2024-10-16', end_date: '2024-10-23', avg_rank: 59, avg_merit: 12850, avg_assist: 81 },
    { period_label: '10/23-30', period_number: 4, start_date: '2024-10-23', end_date: '2024-10-30', avg_rank: 58, avg_merit: 13100, avg_assist: 82 },
  ],
  '3': [
    { period_label: '10/02-09', period_number: 1, start_date: '2024-10-02', end_date: '2024-10-09', avg_rank: 72, avg_merit: 11500, avg_assist: 72 },
    { period_label: '10/09-16', period_number: 2, start_date: '2024-10-09', end_date: '2024-10-16', avg_rank: 69, avg_merit: 11900, avg_assist: 74 },
    { period_label: '10/16-23', period_number: 3, start_date: '2024-10-16', end_date: '2024-10-23', avg_rank: 67, avg_merit: 12150, avg_assist: 76 },
    { period_label: '10/23-30', period_number: 4, start_date: '2024-10-23', end_date: '2024-10-30', avg_rank: 65, avg_merit: 12400, avg_assist: 78 },
  ],
}

// Group members mock data
const MOCK_GROUP_MEMBERS: Record<string, GroupMember[]> = {
  '1': [
    { id: '1', name: '大地英豪', contribution_rank: 3, daily_merit: 28000, daily_assist: 145, rank_change: 2, tier: 'top' },
    { id: '2', name: '委皇叔', contribution_rank: 5, daily_merit: 25500, daily_assist: 132, rank_change: 1, tier: 'top' },
    { id: '3', name: '小沐沐', contribution_rank: 8, daily_merit: 24200, daily_assist: 128, rank_change: null, tier: 'top' },
    { id: '4', name: '胖丨噴泡包', contribution_rank: 12, daily_merit: 22100, daily_assist: 118, rank_change: -1, tier: 'top' },
    { id: '5', name: '胖丨冬甩', contribution_rank: 18, daily_merit: 19800, daily_assist: 108, rank_change: 3, tier: 'top' },
    { id: '6', name: '桃丨筍', contribution_rank: 22, daily_merit: 18200, daily_assist: 102, rank_change: 0, tier: 'top' },
    { id: '7', name: '黑衫子龍', contribution_rank: 35, daily_merit: 15100, daily_assist: 95, rank_change: 2, tier: 'mid' },
    { id: '8', name: '喜馬拉雅星', contribution_rank: 48, daily_merit: 13800, daily_assist: 88, rank_change: -2, tier: 'mid' },
    { id: '9', name: '戰神阿瑞斯', contribution_rank: 62, daily_merit: 11500, daily_assist: 82, rank_change: 1, tier: 'mid' },
    { id: '10', name: '夜行者', contribution_rank: 78, daily_merit: 9200, daily_assist: 75, rank_change: -3, tier: 'mid' },
    { id: '11', name: '風行者', contribution_rank: 125, daily_merit: 6500, daily_assist: 42, rank_change: -5, tier: 'bottom' },
    { id: '12', name: '新手小將', contribution_rank: 156, daily_merit: 5200, daily_assist: 35, rank_change: null, tier: 'bottom' },
  ],
  '2': [
    { id: '13', name: '墨染天涯', contribution_rank: 8, daily_merit: 24000, daily_assist: 120, rank_change: 1, tier: 'top' },
    { id: '14', name: '墨舞', contribution_rank: 15, daily_merit: 21500, daily_assist: 112, rank_change: 2, tier: 'top' },
    { id: '15', name: '墨客', contribution_rank: 52, daily_merit: 12800, daily_assist: 85, rank_change: 0, tier: 'mid' },
    { id: '16', name: '墨魂', contribution_rank: 75, daily_merit: 10500, daily_assist: 78, rank_change: -1, tier: 'mid' },
    { id: '17', name: '墨香', contribution_rank: 142, daily_merit: 6200, daily_assist: 38, rank_change: -3, tier: 'bottom' },
  ],
  '3': [
    { id: '18', name: '隼鷹', contribution_rank: 12, daily_merit: 22500, daily_assist: 115, rank_change: 3, tier: 'top' },
    { id: '19', name: '隼風', contribution_rank: 20, daily_merit: 19800, daily_assist: 105, rank_change: 1, tier: 'top' },
    { id: '20', name: '隼翔', contribution_rank: 68, daily_merit: 10000, daily_assist: 72, rank_change: -2, tier: 'mid' },
    { id: '21', name: '隼飛', contribution_rank: 85, daily_merit: 8200, daily_assist: 65, rank_change: 0, tier: 'mid' },
    { id: '22', name: '隼羽', contribution_rank: 168, daily_merit: 4200, daily_assist: 28, rank_change: -4, tier: 'bottom' },
  ],
}

// All groups comparison data for bar chart (by merit)
const MOCK_ALL_GROUPS_COMPARISON = MOCK_GROUPS.map((group) => {
  const stats = MOCK_GROUP_STATS[group.id] || {
    avg_daily_merit: 10000 + Math.random() * 3000,
    avg_rank: 80 + Math.random() * 40,
  }
  return {
    name: group.name,
    merit: stats.avg_daily_merit,
    avgRank: stats.avg_rank,
  }
}).sort((a, b) => b.merit - a.merit)

// ============================================================================
// Chart Configurations
// ============================================================================

const healthRadarConfig = {
  score: {
    label: '分數',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

const meritBarConfig = {
  merit: {
    label: '日均戰功',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

const tierBarConfig = {
  count: {
    label: '人數',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

const meritTrendConfig = {
  merit: {
    label: '日均戰功',
    color: 'var(--primary)',
  },
  assist: {
    label: '日均助攻',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig

const rankTrendConfig = {
  rank: {
    label: '平均排名',
    color: 'var(--primary)',
  },
} satisfies ChartConfig

// ============================================================================
// Helper Functions (local-only helpers not shared with other pages)
// ============================================================================

function getHealthScoreColor(score: number): string {
  if (score >= 80) return 'text-primary'
  if (score >= 60) return 'text-muted-foreground'
  return 'text-destructive'
}

function getTierBgColor(tier: 'top' | 'mid' | 'bottom'): string {
  switch (tier) {
    case 'top':
      return 'bg-primary/10'
    case 'bottom':
      return 'bg-destructive/10'
    default:
      return ''
  }
}

// ============================================================================
// Tab 1: Overview
// ============================================================================

interface OverviewTabProps {
  readonly groupStats: GroupStats
  readonly allGroupsData: typeof MOCK_ALL_GROUPS_COMPARISON
}

function OverviewTab({ groupStats, allGroupsData }: OverviewTabProps) {
  // Health radar data
  const healthData = [
    { metric: '表現', score: groupStats.health_performance, fullMark: 100 },
    { metric: '穩定', score: groupStats.health_stability, fullMark: 100 },
    { metric: '均衡', score: groupStats.health_uniformity, fullMark: 100 },
    { metric: '活躍', score: groupStats.health_activity, fullMark: 100 },
    { metric: '成長', score: groupStats.health_growth, fullMark: 100 },
  ]

  const avgHealthScore = Math.round(
    (groupStats.health_performance +
      groupStats.health_stability +
      groupStats.health_uniformity +
      groupStats.health_activity +
      groupStats.health_growth) /
      5
  )

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Primary: Average Rank */}
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>組別平均排名</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              #{groupStats.avg_rank}
              <span className="text-base font-normal text-muted-foreground ml-1">/ 201</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              最佳 #{groupStats.best_rank} · 最差 #{groupStats.worst_rank}
            </p>
          </CardContent>
        </Card>

        {/* Daily Merit */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>日均戰功</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatNumber(groupStats.avg_daily_merit)}</div>
            <div className="flex items-center gap-1 mt-1">
              {calculatePercentDiff(groupStats.avg_daily_merit, ALLIANCE_AVG.daily_merit) >= 0 ? (
                <TrendingUp className="h-3 w-3 text-primary" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              <span
                className={`text-xs ${
                  calculatePercentDiff(groupStats.avg_daily_merit, ALLIANCE_AVG.daily_merit) >= 0
                    ? 'text-primary'
                    : 'text-destructive'
                }`}
              >
                {calculatePercentDiff(groupStats.avg_daily_merit, ALLIANCE_AVG.daily_merit) >= 0 ? '+' : ''}
                {calculatePercentDiff(groupStats.avg_daily_merit, ALLIANCE_AVG.daily_merit).toFixed(1)}% vs 盟均
              </span>
            </div>
          </CardContent>
        </Card>

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

        {/* Health Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>組別健康度</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold tabular-nums ${getHealthScoreColor(avgHealthScore)}`}>
              {avgHealthScore}
              <span className="text-base font-normal text-muted-foreground">/100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">五維平均</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Health Radar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">組別健康雷達</CardTitle>
            <CardDescription>五大維度評估（0-100分）</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={healthRadarConfig} className="mx-auto aspect-square max-h-[280px]">
              <RadarChart data={healthData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" className="text-xs" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} className="text-xs" tick={false} />
                <Radar
                  name="分數"
                  dataKey="score"
                  stroke="var(--primary)"
                  fill="var(--primary)"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ChartContainer>

            {/* Health Score Details */}
            <div className="grid grid-cols-5 gap-2 mt-4 pt-4 border-t">
              {healthData.map((item) => (
                <div key={item.metric} className="text-center">
                  <div className="text-xs text-muted-foreground">{item.metric}</div>
                  <div className={`text-sm font-bold ${getHealthScoreColor(item.score)}`}>{item.score}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* All Groups Comparison by Merit */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">全組別戰功比較</CardTitle>
            <CardDescription>日均戰功排名</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={meritBarConfig} className="h-[280px] w-full">
              <BarChart data={allGroupsData} layout="vertical" margin={{ left: 80, right: 20 }}>
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
                    const data = payload[0].payload
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.name}</div>
                        <div className="text-sm">日均戰功: {formatNumber(data.merit)}</div>
                        <div className="text-sm text-muted-foreground">平均排名: #{data.avgRank}</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="merit" radius={[0, 4, 4, 0]}>
                  {allGroupsData.map((entry) => (
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
// Tab 2: Merit Distribution (戰功分佈)
// ============================================================================

interface MeritDistributionTabProps {
  readonly groupStats: GroupStats
  readonly tierBreakdown: TierBreakdown[]
  readonly periodTrends: PeriodTrend[]
}

function MeritDistributionTab({ groupStats, tierBreakdown, periodTrends }: MeritDistributionTabProps) {
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

  // Box plot data for merit
  const boxPlotData = [
    {
      name: groupStats.group_name,
      min: groupStats.merit_min,
      q1: groupStats.merit_q1,
      median: groupStats.merit_median,
      q3: groupStats.merit_q3,
      max: groupStats.merit_max,
    },
  ]

  // Calculate growth
  const meritGrowth =
    periodTrends.length >= 2
      ? ((periodTrends[periodTrends.length - 1].avg_merit - periodTrends[0].avg_merit) / periodTrends[0].avg_merit) *
        100
      : 0

  return (
    <div className="space-y-6">
      {/* Distribution Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardDescription>日均戰功（平均）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatNumber(groupStats.merit_mean)}</div>
            <div className="flex items-center gap-1 mt-1">
              {meritGrowth >= 0 ? (
                <TrendingUp className="h-3 w-3 text-primary" />
              ) : (
                <TrendingDown className="h-3 w-3 text-destructive" />
              )}
              <span className={`text-xs ${meritGrowth >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {meritGrowth >= 0 ? '+' : ''}
                {meritGrowth.toFixed(1)}% 成長
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>中位數</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{formatNumber(groupStats.merit_median)}</div>
            <p className="text-xs text-muted-foreground mt-1">50% 成員高於此值</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>四分位距 (IQR)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {formatNumber(groupStats.merit_q3 - groupStats.merit_q1)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Q3 - Q1</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>變異係數 (CV)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold tabular-nums ${groupStats.merit_cv > 0.3 ? 'text-muted-foreground' : 'text-primary'}`}>
              {(groupStats.merit_cv * 100).toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">{groupStats.merit_cv > 0.3 ? '分散度較高' : '分散度良好'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Box Plot Visual Representation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">戰功分佈概覽</CardTitle>
          <CardDescription>箱型圖統計（Min / Q1 / Median / Q3 / Max）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {boxPlotData.map((data) => (
              <div key={data.name} className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{formatNumber(data.min)}</span>
                  <span>{formatNumber(data.median)}</span>
                  <span>{formatNumber(data.max)}</span>
                </div>
                <div className="relative h-8">
                  {/* Full range bar */}
                  <div className="absolute inset-y-2 left-0 right-0 bg-muted rounded" />
                  {/* IQR box */}
                  <div
                    className="absolute inset-y-1 bg-primary/30 border-2 border-primary rounded"
                    style={{
                      left: `${((data.q1 - data.min) / (data.max - data.min)) * 100}%`,
                      right: `${((data.max - data.q3) / (data.max - data.min)) * 100}%`,
                    }}
                  />
                  {/* Median line */}
                  <div
                    className="absolute inset-y-0 w-0.5 bg-primary"
                    style={{
                      left: `${((data.median - data.min) / (data.max - data.min)) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Min</span>
                  <span>Q1: {formatNumber(data.q1)}</span>
                  <span>Q3: {formatNumber(data.q3)}</span>
                  <span>Max</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tier Breakdown by Merit */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">戰功階層分布</CardTitle>
            <CardDescription>Top 20% / Mid 60% / Bot 20%</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={tierBarConfig} className="h-[200px] w-full">
              <BarChart data={tierBreakdown} margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="tier" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} className="text-xs" />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const data = payload[0].payload as TierBreakdown
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.tier}</div>
                        <div className="text-sm">人數: {data.count} ({data.percentage}%)</div>
                        <div className="text-sm">平均戰功: {formatNumber(data.avg_merit)}</div>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {tierBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>

            {/* Tier Details Table */}
            <div className="mt-4 pt-4 border-t">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left py-1">階層</th>
                    <th className="text-right py-1">人數</th>
                    <th className="text-right py-1">平均戰功</th>
                  </tr>
                </thead>
                <tbody>
                  {tierBreakdown.map((tier) => (
                    <tr key={tier.tier} className="border-t">
                      <td className="py-2">{tier.tier}</td>
                      <td className="text-right tabular-nums">
                        {tier.count} ({tier.percentage}%)
                      </td>
                      <td className="text-right tabular-nums">{formatNumber(tier.avg_merit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Merit Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">戰功趨勢</CardTitle>
            <CardDescription>組別日均戰功變化</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={meritTrendConfig} className="h-[200px] w-full">
              <LineChart data={dailyData} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="dateLabel"
                  tickLine={false}
                  axisLine={false}
                  className="text-xs"
                  ticks={xAxisTicks}
                  interval="preserveStartEnd"
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
                    const data = payload[0].payload as DailyDataPoint
                    return (
                      <div className="rounded-lg border bg-background p-2 shadow-sm">
                        <div className="font-medium">{data.dateLabel}</div>
                        <div className="text-sm">日均戰功: {formatNumber(data.avgMerit)}</div>
                        <div className="text-sm">日均助攻: {data.avgAssist}</div>
                      </div>
                    )
                  }}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="stepAfter"
                  dataKey="avgMerit"
                  name="日均戰功"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
                <Line
                  yAxisId="right"
                  type="stepAfter"
                  dataKey="avgAssist"
                  name="日均助攻"
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
// Tab 3: Contribution Rank (貢獻排名)
// ============================================================================

interface ContributionRankTabProps {
  readonly groupStats: GroupStats
  readonly periodTrends: PeriodTrend[]
}

function ContributionRankTab({ groupStats, periodTrends }: ContributionRankTabProps) {
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
    periodTrends.length >= 2
      ? periodTrends[0].avg_rank - periodTrends[periodTrends.length - 1].avg_rank
      : 0

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
              <span className="text-4xl font-bold tabular-nums">#{groupStats.avg_rank}</span>
              <span className="text-muted-foreground">/ 201人</span>
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
                  {rankImprovement} 名 本賽季
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

      {/* Rank Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">排名趨勢</CardTitle>
          <CardDescription>組別平均貢獻排名變化（數字越小排名越好）</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={rankTrendConfig} className="h-[300px] w-full">
            <LineChart data={dailyData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="dateLabel"
                tickLine={false}
                axisLine={false}
                className="text-xs"
                ticks={xAxisTicks}
                interval="preserveStartEnd"
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
                  const data = payload[0].payload as DailyDataPoint
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="font-medium">{data.dateLabel}</div>
                      <div className="text-sm">平均排名: #{data.avgRank}</div>
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
                  <th className="text-right py-2 px-2 font-medium">日均戰功</th>
                  <th className="text-right py-2 px-2 font-medium">日均助攻</th>
                </tr>
              </thead>
              <tbody>
                {periodTrends.map((d, index) => {
                  const prevRank = index > 0 ? periodTrends[index - 1].avg_rank : null
                  const rankChange = prevRank ? prevRank - d.avg_rank : null

                  return (
                    <tr key={d.period_number} className="border-b last:border-0">
                      <td className="py-2 px-2 text-muted-foreground">{d.period_label}</td>
                      <td className="py-2 px-2 text-right tabular-nums font-medium">#{d.avg_rank}</td>
                      <td className="py-2 px-2 text-right">
                        {rankChange !== null ? (
                          <span className={rankChange >= 0 ? 'text-primary' : 'text-destructive'}>
                            {rankChange >= 0 ? '+' : ''}
                            {rankChange}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatNumber(d.avg_merit)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{d.avg_assist}</td>
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
  readonly members: GroupMember[]
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

  const tierCounts = useMemo(() => {
    const counts = { top: 0, mid: 0, bottom: 0 }
    members.forEach((m) => counts[m.tier]++)
    return counts
  }, [members])

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Top 20%（高表現）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-primary">{tierCounts.top}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((tierCounts.top / members.length) * 100).toFixed(0)}% of group
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Mid 60%（中等）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{tierCounts.mid}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((tierCounts.mid / members.length) * 100).toFixed(0)}% of group
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bot 20%（需關注）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums text-destructive">{tierCounts.bottom}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((tierCounts.bottom / members.length) * 100).toFixed(0)}% of group
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Members Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">組內成員列表</CardTitle>
          <CardDescription>點擊欄位標題排序（貢獻排名為官方綜合指標）</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">成員</th>
                  <th
                    className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort('rank')}
                  >
                    貢獻排名 {sortBy === 'rank' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th
                    className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort('merit')}
                  >
                    日均戰功 {sortBy === 'merit' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  <th
                    className="text-right py-2 px-2 font-medium cursor-pointer hover:text-primary"
                    onClick={() => handleSort('assist')}
                  >
                    日均助攻 {sortBy === 'assist' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  <th className="text-right py-2 px-2 font-medium">排名變化</th>
                </tr>
              </thead>
              <tbody>
                {sortedMembers.map((member) => (
                  <tr key={member.id} className={`border-b last:border-0 ${getTierBgColor(member.tier)}`}>
                    <td className="py-2 px-2 font-medium">{member.name}</td>
                    <td className="py-2 px-2 text-right tabular-nums">#{member.contribution_rank}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(member.daily_merit)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{member.daily_assist}</td>
                    <td className="py-2 px-2 text-right">
                      <RankChangeIndicator change={member.rank_change} showNewLabel={false} />
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

function GroupAnalytics() {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(MOCK_GROUPS[0].id)
  const [activeTab, setActiveTab] = useState('overview')

  const selectedGroup = useMemo(() => {
    return MOCK_GROUPS.find((g) => g.id === selectedGroupId)
  }, [selectedGroupId])

  const groupStats = useMemo(() => {
    return MOCK_GROUP_STATS[selectedGroupId] || MOCK_GROUP_STATS['1']
  }, [selectedGroupId])

  const tierBreakdown = useMemo(() => {
    return MOCK_TIER_BREAKDOWN[selectedGroupId] || MOCK_TIER_BREAKDOWN['1']
  }, [selectedGroupId])

  const periodTrends = useMemo(() => {
    return MOCK_PERIOD_TRENDS[selectedGroupId] || MOCK_PERIOD_TRENDS['1']
  }, [selectedGroupId])

  const groupMembers = useMemo(() => {
    return MOCK_GROUP_MEMBERS[selectedGroupId] || MOCK_GROUP_MEMBERS['1']
  }, [selectedGroupId])

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">組別分析</h2>
            <p className="text-muted-foreground mt-1">查看各組別的表現分佈與統計數據</p>
          </div>
        </div>

        {/* Group Selector */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">選擇組別:</span>
          <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="選擇組別" />
            </SelectTrigger>
            <SelectContent>
              {MOCK_GROUPS.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name} ({group.memberCount}人)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedGroup && (
            <span className="text-sm text-muted-foreground">{selectedGroup.memberCount} 位成員</span>
          )}
        </div>

        {/* Tabs */}
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
            <OverviewTab groupStats={groupStats} allGroupsData={MOCK_ALL_GROUPS_COMPARISON} />
          </TabsContent>

          <TabsContent value="distribution">
            <MeritDistributionTab groupStats={groupStats} tierBreakdown={tierBreakdown} periodTrends={periodTrends} />
          </TabsContent>

          <TabsContent value="rank">
            <ContributionRankTab groupStats={groupStats} periodTrends={periodTrends} />
          </TabsContent>

          <TabsContent value="members">
            <MembersTab members={groupMembers} />
          </TabsContent>
        </Tabs>
      </div>
    </AllianceGuard>
  )
}

export default GroupAnalytics
