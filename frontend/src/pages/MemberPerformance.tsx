/**
 * MemberPerformance - Member Performance Analytics Page
 *
 * Individual member performance analysis with:
 * - Member selector dropdown
 * - View mode toggle (latest period / season total)
 * - Tab-based navigation: Overview, Combat, Power & Contribution
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
import { TrendingUp, TrendingDown, Minus, LayoutDashboard, Swords, Crown } from 'lucide-react'
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
  Bar,
  BarChart,
} from 'recharts'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'

// ============================================================================
// Types
// ============================================================================

interface MemberOption {
  readonly id: string
  readonly name: string
}

interface CoreMetrics {
  readonly daily_contribution: number
  readonly daily_merit: number
  readonly daily_assist: number
  readonly daily_donation: number
  readonly power_value: number
  readonly power_change: number
  readonly power_change_percent: number
  readonly current_rank: number
  readonly rank_change: number
  readonly total_members: number
}

interface AllianceAverage {
  readonly daily_contribution: number
  readonly daily_merit: number
  readonly daily_assist: number
  readonly daily_donation: number
}

interface PeriodTrendData {
  readonly period: string
  readonly period_label: string
  readonly days: number
  readonly contribution: number
  readonly merit: number
  readonly assist: number
  readonly donation: number
  readonly power: number
  readonly rank: number
  readonly alliance_avg_contribution: number
  readonly alliance_avg_merit: number
  readonly alliance_avg_assist: number
  readonly alliance_avg_donation: number
}

type ViewMode = 'latest' | 'season'

// ============================================================================
// Mock Data
// ============================================================================

const MOCK_MEMBERS: readonly MemberOption[] = [
  { id: '1', name: '張飛' },
  { id: '2', name: '關羽' },
  { id: '3', name: '趙雲' },
  { id: '4', name: '馬超' },
  { id: '5', name: '黃忠' },
  { id: '6', name: '諸葛亮' },
  { id: '7', name: '龐統' },
  { id: '8', name: '魏延' },
]

const MOCK_ALLIANCE_AVERAGE: AllianceAverage = {
  daily_contribution: 1100,
  daily_merit: 480,
  daily_assist: 75,
  daily_donation: 28,
}

const MOCK_METRICS_BY_MEMBER: Record<string, { latest: CoreMetrics; season: CoreMetrics }> = {
  '1': {
    latest: {
      daily_contribution: 1234,
      daily_merit: 567,
      daily_assist: 89,
      daily_donation: 23,
      power_value: 1234567,
      power_change: 12345,
      power_change_percent: 1.01,
      current_rank: 3,
      rank_change: 2,
      total_members: 150,
    },
    season: {
      daily_contribution: 1180,
      daily_merit: 520,
      daily_assist: 82,
      daily_donation: 25,
      power_value: 1234567,
      power_change: 98765,
      power_change_percent: 8.7,
      current_rank: 3,
      rank_change: 7,
      total_members: 150,
    },
  },
  '2': {
    latest: {
      daily_contribution: 1456,
      daily_merit: 890,
      daily_assist: 45,
      daily_donation: 35,
      power_value: 1567890,
      power_change: 23456,
      power_change_percent: 1.52,
      current_rank: 1,
      rank_change: 0,
      total_members: 150,
    },
    season: {
      daily_contribution: 1380,
      daily_merit: 820,
      daily_assist: 52,
      daily_donation: 32,
      power_value: 1567890,
      power_change: 156789,
      power_change_percent: 11.1,
      current_rank: 1,
      rank_change: 2,
      total_members: 150,
    },
  },
  '3': {
    latest: {
      daily_contribution: 1345,
      daily_merit: 678,
      daily_assist: 120,
      daily_donation: 18,
      power_value: 1345678,
      power_change: -5432,
      power_change_percent: -0.4,
      current_rank: 2,
      rank_change: -1,
      total_members: 150,
    },
    season: {
      daily_contribution: 1290,
      daily_merit: 640,
      daily_assist: 105,
      daily_donation: 20,
      power_value: 1345678,
      power_change: 123456,
      power_change_percent: 10.1,
      current_rank: 2,
      rank_change: 3,
      total_members: 150,
    },
  },
}

const DEFAULT_METRICS: { latest: CoreMetrics; season: CoreMetrics } = {
  latest: {
    daily_contribution: 980,
    daily_merit: 420,
    daily_assist: 65,
    daily_donation: 22,
    power_value: 890123,
    power_change: 8901,
    power_change_percent: 1.01,
    current_rank: 45,
    rank_change: 3,
    total_members: 150,
  },
  season: {
    daily_contribution: 920,
    daily_merit: 390,
    daily_assist: 58,
    daily_donation: 20,
    power_value: 890123,
    power_change: 78901,
    power_change_percent: 9.7,
    current_rank: 45,
    rank_change: 12,
    total_members: 150,
  },
}

const MOCK_TREND_DATA: readonly PeriodTrendData[] = [
  {
    period: '1',
    period_label: '10/02-10/09',
    days: 7,
    contribution: 980,
    merit: 420,
    assist: 65,
    donation: 20,
    power: 1100000,
    rank: 10,
    alliance_avg_contribution: 1050,
    alliance_avg_merit: 450,
    alliance_avg_assist: 70,
    alliance_avg_donation: 25,
  },
  {
    period: '2',
    period_label: '10/09-10/16',
    days: 7,
    contribution: 1050,
    merit: 480,
    assist: 72,
    donation: 22,
    power: 1120000,
    rank: 8,
    alliance_avg_contribution: 1080,
    alliance_avg_merit: 460,
    alliance_avg_assist: 72,
    alliance_avg_donation: 26,
  },
  {
    period: '3',
    period_label: '10/16-10/23',
    days: 7,
    contribution: 1120,
    merit: 510,
    assist: 78,
    donation: 21,
    power: 1150000,
    rank: 6,
    alliance_avg_contribution: 1100,
    alliance_avg_merit: 470,
    alliance_avg_assist: 74,
    alliance_avg_donation: 27,
  },
  {
    period: '4',
    period_label: '10/23-10/30',
    days: 7,
    contribution: 1180,
    merit: 545,
    assist: 85,
    donation: 24,
    power: 1190000,
    rank: 5,
    alliance_avg_contribution: 1090,
    alliance_avg_merit: 475,
    alliance_avg_assist: 73,
    alliance_avg_donation: 27,
  },
  {
    period: '5',
    period_label: '10/30-11/06',
    days: 7,
    contribution: 1210,
    merit: 560,
    assist: 87,
    donation: 23,
    power: 1220000,
    rank: 4,
    alliance_avg_contribution: 1100,
    alliance_avg_merit: 480,
    alliance_avg_assist: 75,
    alliance_avg_donation: 28,
  },
  {
    period: '6',
    period_label: '11/06-11/13',
    days: 7,
    contribution: 1234,
    merit: 567,
    assist: 89,
    donation: 23,
    power: 1234567,
    rank: 3,
    alliance_avg_contribution: 1100,
    alliance_avg_merit: 480,
    alliance_avg_assist: 75,
    alliance_avg_donation: 28,
  },
]

// ============================================================================
// Chart Configurations
// ============================================================================

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

const combatChartConfig = {
  merit: {
    label: '戰功',
    color: 'hsl(var(--primary))',
  },
  assist: {
    label: '助攻',
    color: 'hsl(142.1 76.2% 36.3%)',
  },
  alliance_merit: {
    label: '同盟戰功均',
    color: 'hsl(var(--muted-foreground))',
  },
  alliance_assist: {
    label: '同盟助攻均',
    color: 'hsl(var(--muted-foreground))',
  },
} satisfies ChartConfig

const comparisonChartConfig = {
  member: {
    label: '成員',
    color: 'hsl(var(--primary))',
  },
  alliance: {
    label: '同盟平均',
    color: 'hsl(var(--muted-foreground))',
  },
} satisfies ChartConfig

const powerChartConfig = {
  power: {
    label: '勢力值',
    color: 'hsl(var(--primary))',
  },
  contribution: {
    label: '貢獻',
    color: 'hsl(142.1 76.2% 36.3%)',
  },
} satisfies ChartConfig

const rankChartConfig = {
  rank: {
    label: '排名',
    color: 'hsl(var(--primary))',
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

function calculatePercentDiff(value: number, average: number): number {
  if (average === 0) return 0
  return ((value - average) / average) * 100
}

// ============================================================================
// Sub-Components
// ============================================================================

interface StatCardProps {
  readonly title: string
  readonly value: number
  readonly unit: string
  readonly percentDiff: number
}

function StatCard({ title, value, unit, percentDiff }: StatCardProps) {
  const isPositive = percentDiff > 0
  const isNeutral = Math.abs(percentDiff) < 1

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs">{title}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">
          {formatNumber(value)}
          <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          {isNeutral ? (
            <Minus className="h-3 w-3 text-muted-foreground" />
          ) : isPositive ? (
            <TrendingUp className="h-3 w-3 text-green-600" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-600" />
          )}
          <span
            className={`text-xs ${
              isNeutral
                ? 'text-muted-foreground'
                : isPositive
                  ? 'text-green-600'
                  : 'text-red-600'
            }`}
          >
            {isNeutral ? '持平' : `${isPositive ? '+' : ''}${percentDiff.toFixed(1)}%`}
          </span>
          <span className="text-xs text-muted-foreground">vs 同盟均</span>
        </div>
      </CardContent>
    </Card>
  )
}

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

// ============================================================================
// Tab 1: Overview
// ============================================================================

interface OverviewTabProps {
  readonly metrics: CoreMetrics
  readonly allianceAvg: AllianceAverage
}

function OverviewTab({ metrics, allianceAvg }: OverviewTabProps) {
  const radarData = [
    {
      metric: '貢獻',
      member: metrics.daily_contribution,
      alliance: allianceAvg.daily_contribution,
    },
    {
      metric: '戰功',
      member: metrics.daily_merit,
      alliance: allianceAvg.daily_merit,
    },
    {
      metric: '助攻',
      member: metrics.daily_assist,
      alliance: allianceAvg.daily_assist,
    },
    {
      metric: '捐獻',
      member: metrics.daily_donation,
      alliance: allianceAvg.daily_donation,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="每日貢獻"
          value={metrics.daily_contribution}
          unit="/日"
          percentDiff={calculatePercentDiff(metrics.daily_contribution, allianceAvg.daily_contribution)}
        />
        <StatCard
          title="每日戰功"
          value={metrics.daily_merit}
          unit="/日"
          percentDiff={calculatePercentDiff(metrics.daily_merit, allianceAvg.daily_merit)}
        />
        <StatCard
          title="每日助攻"
          value={metrics.daily_assist}
          unit="/日"
          percentDiff={calculatePercentDiff(metrics.daily_assist, allianceAvg.daily_assist)}
        />
        <StatCard
          title="每日捐獻"
          value={metrics.daily_donation}
          unit="/日"
          percentDiff={calculatePercentDiff(metrics.daily_donation, allianceAvg.daily_donation)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">四維能力圖</CardTitle>
            <CardDescription>成員表現 vs 同盟平均</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={radarChartConfig} className="mx-auto aspect-square max-h-[280px]">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="metric" className="text-xs" />
                <PolarRadiusAxis angle={30} domain={[0, 'auto']} className="text-xs" />
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
                <ChartTooltip content={<ChartTooltipContent />} />
              </RadarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        {/* Power & Rank Summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">核心狀態</CardTitle>
            <CardDescription>勢力值與排名</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Power */}
            <div>
              <span className="text-sm text-muted-foreground">勢力值</span>
              <div className="text-3xl font-bold tabular-nums">{formatNumber(metrics.power_value)}</div>
              <div className="flex items-center gap-1 text-sm mt-1">
                {metrics.power_change >= 0 ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span className={metrics.power_change >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {metrics.power_change >= 0 ? '+' : ''}{formatNumber(metrics.power_change)}
                  ({metrics.power_change_percent >= 0 ? '+' : ''}{metrics.power_change_percent.toFixed(1)}%)
                </span>
              </div>
            </div>

            {/* Rank */}
            <div>
              <span className="text-sm text-muted-foreground">貢獻排名</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tabular-nums">#{metrics.current_rank}</span>
                <span className="text-muted-foreground">/ {metrics.total_members}人</span>
              </div>
              <div className="flex items-center gap-1 text-sm mt-1">
                {metrics.rank_change > 0 ? (
                  <>
                    <TrendingUp className="h-4 w-4 text-green-600" />
                    <span className="text-green-600">上升 {metrics.rank_change} 名</span>
                  </>
                ) : metrics.rank_change < 0 ? (
                  <>
                    <TrendingDown className="h-4 w-4 text-red-600" />
                    <span className="text-red-600">下降 {Math.abs(metrics.rank_change)} 名</span>
                  </>
                ) : (
                  <>
                    <Minus className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">維持不變</span>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================================
// Tab 2: Combat (Merit & Assist)
// ============================================================================

interface CombatTabProps {
  readonly metrics: CoreMetrics
  readonly allianceAvg: AllianceAverage
  readonly trendData: readonly PeriodTrendData[]
}

function CombatTab({ metrics, allianceAvg, trendData }: CombatTabProps) {
  const chartData = trendData.map((d) => ({
    period: d.period_label,
    merit: d.merit,
    assist: d.assist,
    alliance_merit: d.alliance_avg_merit,
    alliance_assist: d.alliance_avg_assist,
  }))

  const comparisonData = [
    {
      metric: '戰功',
      member: metrics.daily_merit,
      alliance: allianceAvg.daily_merit,
    },
    {
      metric: '助攻',
      member: metrics.daily_assist,
      alliance: allianceAvg.daily_assist,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">每日戰功</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {formatNumber(metrics.daily_merit)}
              <span className="text-base font-normal text-muted-foreground ml-1">/日</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {calculatePercentDiff(metrics.daily_merit, allianceAvg.daily_merit) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span
                className={`text-sm ${
                  calculatePercentDiff(metrics.daily_merit, allianceAvg.daily_merit) >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {calculatePercentDiff(metrics.daily_merit, allianceAvg.daily_merit) >= 0 ? '+' : ''}
                {calculatePercentDiff(metrics.daily_merit, allianceAvg.daily_merit).toFixed(1)}% vs 同盟均
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              同盟平均: {formatNumber(allianceAvg.daily_merit)}/日
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">每日助攻</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {formatNumber(metrics.daily_assist)}
              <span className="text-base font-normal text-muted-foreground ml-1">/日</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {calculatePercentDiff(metrics.daily_assist, allianceAvg.daily_assist) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span
                className={`text-sm ${
                  calculatePercentDiff(metrics.daily_assist, allianceAvg.daily_assist) >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {calculatePercentDiff(metrics.daily_assist, allianceAvg.daily_assist) >= 0 ? '+' : ''}
                {calculatePercentDiff(metrics.daily_assist, allianceAvg.daily_assist).toFixed(1)}% vs 同盟均
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              同盟平均: {formatNumber(allianceAvg.daily_assist)}/日
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">戰功與助攻趨勢</CardTitle>
          <CardDescription>各期間每日均值變化</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={combatChartConfig} className="h-[300px] w-full">
            <LineChart data={chartData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                tickFormatter={(value) => formatNumber(value)}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="merit"
                name="戰功"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="assist"
                name="助攻"
                stroke="hsl(142.1 76.2% 36.3%)"
                strokeWidth={2}
                dot={{ fill: 'hsl(142.1 76.2% 36.3%)', strokeWidth: 2 }}
              />
              <Line
                type="monotone"
                dataKey="alliance_merit"
                name="同盟戰功均"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="alliance_assist"
                name="同盟助攻均"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="3 3"
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Comparison Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">與同盟平均比較</CardTitle>
          <CardDescription>戰鬥指標對比</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={comparisonChartConfig} className="h-[200px] w-full">
            <BarChart data={comparisonData} layout="vertical" margin={{ left: 60, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} className="text-xs" />
              <YAxis
                type="category"
                dataKey="metric"
                tickLine={false}
                axisLine={false}
                className="text-xs"
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Bar dataKey="member" name="成員" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              <Bar dataKey="alliance" name="同盟平均" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Tab 3: Power & Contribution
// ============================================================================

interface PowerContributionTabProps {
  readonly metrics: CoreMetrics
  readonly allianceAvg: AllianceAverage
  readonly trendData: readonly PeriodTrendData[]
}

function PowerContributionTab({ metrics, allianceAvg, trendData }: PowerContributionTabProps) {
  const powerChartData = trendData.map((d) => ({
    period: d.period_label,
    power: d.power,
    contribution: d.contribution,
  }))

  const rankChartData = trendData.map((d) => ({
    period: d.period_label,
    rank: d.rank,
  }))

  const rankStats = useMemo(() => {
    const ranks = trendData.map((d) => d.rank)
    const best = Math.min(...ranks)
    const worst = Math.max(...ranks)
    const avg = ranks.reduce((sum, r) => sum + r, 0) / ranks.length
    const variance = ranks.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / ranks.length
    const stdDev = Math.sqrt(variance)
    return { best, worst, avg, stdDev }
  }, [trendData])

  const yAxisDomain = useMemo(() => {
    const ranks = trendData.map((d) => d.rank)
    const minRank = Math.min(...ranks)
    const maxRank = Math.max(...ranks)
    const padding = Math.max(2, Math.ceil((maxRank - minRank) * 0.2))
    return [Math.max(1, minRank - padding), maxRank + padding]
  }, [trendData])

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">勢力值</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">{formatNumber(metrics.power_value)}</div>
            <div className="flex items-center gap-2 mt-2">
              {metrics.power_change >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span className={`text-sm ${metrics.power_change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {metrics.power_change >= 0 ? '+' : ''}{formatNumber(metrics.power_change)}
                ({metrics.power_change_percent >= 0 ? '+' : ''}{metrics.power_change_percent.toFixed(1)}%)
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">每日貢獻</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">
              {formatNumber(metrics.daily_contribution)}
              <span className="text-base font-normal text-muted-foreground ml-1">/日</span>
            </div>
            <div className="flex items-center gap-2 mt-2">
              {calculatePercentDiff(metrics.daily_contribution, allianceAvg.daily_contribution) >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span
                className={`text-sm ${
                  calculatePercentDiff(metrics.daily_contribution, allianceAvg.daily_contribution) >= 0
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {calculatePercentDiff(metrics.daily_contribution, allianceAvg.daily_contribution) >= 0 ? '+' : ''}
                {calculatePercentDiff(metrics.daily_contribution, allianceAvg.daily_contribution).toFixed(1)}% vs 同盟均
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Power & Contribution Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">勢力值與貢獻趨勢</CardTitle>
          <CardDescription>各期間變化追蹤</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={powerChartConfig} className="h-[300px] w-full">
            <LineChart data={powerChartData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
              />
              <YAxis
                yAxisId="power"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                tickFormatter={(value) => formatNumber(value)}
                orientation="left"
              />
              <YAxis
                yAxisId="contribution"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
                tickFormatter={(value) => formatNumber(value)}
                orientation="right"
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Legend />
              <Line
                yAxisId="power"
                type="monotone"
                dataKey="power"
                name="勢力值"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
              />
              <Line
                yAxisId="contribution"
                type="monotone"
                dataKey="contribution"
                name="貢獻"
                stroke="hsl(142.1 76.2% 36.3%)"
                strokeWidth={2}
                dot={{ fill: 'hsl(142.1 76.2% 36.3%)', strokeWidth: 2 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Rank Trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">排名趨勢</CardTitle>
          <CardDescription>貢獻排名變化（愈低愈好）</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={rankChartConfig} className="h-[250px] w-full">
            <LineChart data={rankChartData} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                className="text-xs"
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
                content={<ChartTooltipContent />}
                formatter={(value) => [`#${value}`, '排名']}
              />
              <ReferenceLine y={1} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="rank"
                name="排名"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Rank Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">排名統計</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-sm text-muted-foreground">最佳排名</span>
              <div className="text-xl font-bold text-green-600">#{rankStats.best}</div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">最差排名</span>
              <div className="text-xl font-bold text-red-600">#{rankStats.worst}</div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">平均排名</span>
              <div className="text-xl font-bold">#{rankStats.avg.toFixed(1)}</div>
            </div>
            <div>
              <span className="text-sm text-muted-foreground">排名波動</span>
              <div className="text-xl font-bold">σ={rankStats.stdDev.toFixed(1)}</div>
            </div>
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
  const [selectedMemberId, setSelectedMemberId] = useState<string>(MOCK_MEMBERS[0].id)
  const [viewMode, setViewMode] = useState<ViewMode>('latest')
  const [activeTab, setActiveTab] = useState('overview')

  const selectedMember = useMemo(() => {
    return MOCK_MEMBERS.find((m) => m.id === selectedMemberId)
  }, [selectedMemberId])

  const metrics = useMemo(() => {
    const memberMetrics = MOCK_METRICS_BY_MEMBER[selectedMemberId] || DEFAULT_METRICS
    return viewMode === 'latest' ? memberMetrics.latest : memberMetrics.season
  }, [selectedMemberId, viewMode])

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
          <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="選擇成員" />
            </SelectTrigger>
            <SelectContent>
              {MOCK_MEMBERS.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedMember && (
            <span className="text-sm text-muted-foreground">
              排名 #{metrics.current_rank} / {metrics.total_members}人
            </span>
          )}
        </div>

        {/* Tabs - Full Width Grid */}
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
              <Crown className="h-4 w-4" />
              <span>勢力值與貢獻</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab metrics={metrics} allianceAvg={MOCK_ALLIANCE_AVERAGE} />
          </TabsContent>

          <TabsContent value="combat">
            <CombatTab
              metrics={metrics}
              allianceAvg={MOCK_ALLIANCE_AVERAGE}
              trendData={MOCK_TREND_DATA}
            />
          </TabsContent>

          <TabsContent value="power">
            <PowerContributionTab
              metrics={metrics}
              allianceAvg={MOCK_ALLIANCE_AVERAGE}
              trendData={MOCK_TREND_DATA}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AllianceGuard>
  )
}

export default MemberPerformance
