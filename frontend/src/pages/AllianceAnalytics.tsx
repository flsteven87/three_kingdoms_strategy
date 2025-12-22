/**
 * AllianceAnalytics - Alliance Performance Analytics Dashboard
 *
 * Alliance-level performance analysis with 3 tabs:
 * 1. Overview: KPIs, trends, health metrics
 * 2. Group Comparison: Cross-group performance ranking
 * 3. Member Distribution: Distribution analysis, top/bottom performers
 *
 * Features ViewMode toggle (latest period vs season average) for fair comparison.
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
import { Skeleton } from '@/components/ui/skeleton'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { RankChangeIndicator } from '@/components/analytics/RankChangeIndicator'
import { BoxPlotComparison } from '@/components/analytics/BoxPlot'
import { useSeasons } from '@/hooks/use-seasons'
import { useAllianceAnalytics } from '@/hooks/use-analytics'
import type {
  AllianceAnalyticsResponse,
  AllianceTrendWithMedian,
  GroupStatsWithBoxPlot,
  PerformerItem,
  AttentionItem,
  DistributionBin,
} from '@/types/analytics'
import {
  TrendingUp,
  TrendingDown,
  LayoutDashboard,
  GitCompare,
  Users,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Cell,
  ReferenceLine,
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
} from '@/lib/chart-utils'
import { allianceChartConfigs } from '@/lib/chart-configs'

// ============================================================================
// Types
// ============================================================================

type ViewMode = 'latest' | 'season'

// ============================================================================
// Helper Components
// ============================================================================

interface KpiCardProps {
  readonly title: string
  readonly value: string | number
  readonly subtitle?: string
  readonly trend?: { value: number; label: string; isPositiveGood?: boolean }
  readonly highlight?: boolean
}

function KpiCard({ title, value, subtitle, trend, highlight }: KpiCardProps) {
  const isPositive = trend && trend.value >= 0
  const trendColor = trend
    ? trend.isPositiveGood !== false
      ? isPositive
        ? 'text-primary'
        : 'text-destructive'
      : isPositive
        ? 'text-destructive'
        : 'text-primary'
    : ''

  return (
    <Card className={highlight ? 'border-primary/50' : ''}>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            {isPositive ? (
              <TrendingUp className={`h-3 w-3 ${trendColor}`} />
            ) : (
              <TrendingDown className={`h-3 w-3 ${trendColor}`} />
            )}
            <span className={`text-xs ${trendColor}`}>
              {isPositive ? '+' : ''}
              {trend.value.toFixed(1)}
              {trend.label}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Tab 1: Overview
// ============================================================================

interface OverviewTabProps {
  readonly viewMode: ViewMode
  readonly data: AllianceAnalyticsResponse
}

function OverviewTab({ viewMode, data }: OverviewTabProps) {
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

// ============================================================================
// Tab 2: Group Comparison
// ============================================================================

interface GroupComparisonTabProps {
  readonly data: AllianceAnalyticsResponse
}

function GroupComparisonTab({ data }: GroupComparisonTabProps) {
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

// ============================================================================
// Tab 3: Member Distribution
// ============================================================================

type SortField = 'rank' | 'name' | 'group' | 'daily_contribution' | 'daily_merit' | 'merit_change' | 'daily_assist' | 'assist_change' | 'rank_change'
type SortDirection = 'asc' | 'desc'

// Column definitions for sortable table header
const SORT_COLUMNS: Array<{
  field: SortField
  label: string
  align: 'left' | 'right'
  showOnlyLatest?: boolean
}> = [
  { field: 'rank', label: '排名', align: 'left' },
  { field: 'name', label: '成員', align: 'left' },
  { field: 'group', label: '組別', align: 'left' },
  { field: 'daily_contribution', label: '人日均貢獻', align: 'right' },
  { field: 'daily_merit', label: '人日均戰功', align: 'right' },
  { field: 'merit_change', label: '戰功變化', align: 'right', showOnlyLatest: true },
  { field: 'daily_assist', label: '人日均助攻', align: 'right' },
  { field: 'assist_change', label: '助攻變化', align: 'right', showOnlyLatest: true },
  { field: 'rank_change', label: '排名變化', align: 'right', showOnlyLatest: true },
]

interface MemberDistributionTabProps {
  readonly viewMode: ViewMode
  readonly data: AllianceAnalyticsResponse
}

function MemberDistributionTab({ viewMode, data }: MemberDistributionTabProps) {
  const [showTop, setShowTop] = useState(true)
  const [displayCount, setDisplayCount] = useState<string>('10')
  const [sortField, setSortField] = useState<SortField>('rank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')

  const { summary, distributions, top_performers, bottom_performers, needs_attention } = data

  // Handle column header click for sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      // Default: descending for numeric values, ascending for rank/name/group
      setSortDirection(['rank', 'name', 'group'].includes(field) ? 'asc' : 'desc')
    }
  }

  // Render sort icon based on current state
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />
  }

  // Filter and sort performers
  const displayedPerformers = useMemo(() => {
    const source = showTop ? top_performers : bottom_performers
    const count = displayCount === 'all' ? source.length : parseInt(displayCount, 10)

    return [...source.slice(0, count)].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]

      // Null values go to end
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      // String vs numeric comparison
      const isString = sortField === 'name' || sortField === 'group'
      const diff = isString
        ? String(aVal).localeCompare(String(bVal), 'zh-TW')
        : Number(aVal) - Number(bVal)

      return sortDirection === 'asc' ? diff : -diff
    })
  }, [showTop, displayCount, top_performers, bottom_performers, sortField, sortDirection])

  // Render change value cell (for merit_change, assist_change)
  const renderChangeCell = (value: number | null) => {
    if (value == null) return <span className="text-muted-foreground">-</span>
    return (
      <span className={value >= 0 ? 'text-primary' : 'text-destructive'}>
        {value >= 0 ? '+' : ''}{formatNumberCompact(value)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Distribution Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contribution Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">貢獻分佈</CardTitle>
            <CardDescription>人日均貢獻區間分佈</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={allianceChartConfigs.distribution} className="h-[240px] w-full">
              <BarChart data={[...distributions.contribution]} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="range" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} className="text-xs" />
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
            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
              平均: {formatNumber(summary.avg_daily_contribution)} / 中位數: {formatNumber(summary.median_daily_contribution)}
            </div>
          </CardContent>
        </Card>

        {/* Merit Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">戰功分佈</CardTitle>
            <CardDescription>人日均戰功區間分佈</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={allianceChartConfigs.distribution} className="h-[240px] w-full">
              <BarChart data={[...distributions.merit]} margin={{ left: 12, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="range" tickLine={false} axisLine={false} className="text-xs" />
                <YAxis tickLine={false} axisLine={false} className="text-xs" />
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
            <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
              平均: {formatNumber(summary.avg_daily_merit)} / 中位數: {formatNumber(summary.median_daily_merit)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top/Bottom Performers */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">成員排行</CardTitle>
              <CardDescription>{viewMode === 'latest' ? '本期表現' : '賽季平均'}排名</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Tabs value={showTop ? 'top' : 'bottom'} onValueChange={(v) => setShowTop(v === 'top')}>
                <TabsList className="h-8">
                  <TabsTrigger value="top" className="text-xs px-3">Top</TabsTrigger>
                  <TabsTrigger value="bottom" className="text-xs px-3">Bottom</TabsTrigger>
                </TabsList>
              </Tabs>
              <Select value={displayCount} onValueChange={setDisplayCount}>
                <SelectTrigger className="w-24 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 人</SelectItem>
                  <SelectItem value="10">10 人</SelectItem>
                  <SelectItem value="20">20 人</SelectItem>
                  <SelectItem value="50">50 人</SelectItem>
                  <SelectItem value="all">全部</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {SORT_COLUMNS.filter(col => !col.showOnlyLatest || viewMode === 'latest').map(col => (
                    <th key={col.field} className="py-2 px-2">
                      <button
                        type="button"
                        onClick={() => handleSort(col.field)}
                        className={`flex items-center font-medium hover:text-primary transition-colors ${
                          col.align === 'right' ? 'justify-end w-full' : ''
                        }`}
                      >
                        {col.label}
                        {renderSortIcon(col.field)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayedPerformers.map((m: PerformerItem) => (
                  <tr key={m.member_id} className="border-b last:border-0">
                    <td className="py-2 px-2 tabular-nums font-medium">#{m.rank}</td>
                    <td className="py-2 px-2 font-medium">{m.name}</td>
                    <td className="py-2 px-2 text-muted-foreground">{m.group || '-'}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(m.daily_contribution)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(m.daily_merit)}</td>
                    {viewMode === 'latest' && (
                      <td className="py-2 px-2 text-right tabular-nums">{renderChangeCell(m.merit_change)}</td>
                    )}
                    <td className="py-2 px-2 text-right tabular-nums">{formatNumber(m.daily_assist)}</td>
                    {viewMode === 'latest' && (
                      <td className="py-2 px-2 text-right tabular-nums">{renderChangeCell(m.assist_change)}</td>
                    )}
                    {viewMode === 'latest' && (
                      <td className="py-2 px-2 text-right">
                        <RankChangeIndicator change={m.rank_change} showNewLabel={false} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Needs Attention */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            需關注成員
          </CardTitle>
          <CardDescription>排名大幅下滑或貢獻顯著低於中位數</CardDescription>
        </CardHeader>
        <CardContent>
          {needs_attention.length === 0 ? (
            <p className="text-sm text-muted-foreground">目前沒有需要特別關注的成員</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium">成員</th>
                    <th className="text-left py-2 px-2 font-medium">組別</th>
                    <th className="text-right py-2 px-2 font-medium">當前排名</th>
                    {viewMode === 'latest' && <th className="text-right py-2 px-2 font-medium">排名變化</th>}
                    <th className="text-left py-2 px-2 font-medium">原因</th>
                  </tr>
                </thead>
                <tbody>
                  {needs_attention.map((m: AttentionItem) => (
                    <tr key={m.member_id} className="border-b last:border-0 bg-destructive/5">
                      <td className="py-2 px-2 font-medium">{m.name}</td>
                      <td className="py-2 px-2 text-muted-foreground">{m.group || '-'}</td>
                      <td className="py-2 px-2 text-right tabular-nums">#{m.rank}</td>
                      {viewMode === 'latest' && (
                        <td className="py-2 px-2 text-right">
                          <RankChangeIndicator change={m.rank_change} showNewLabel={false} />
                        </td>
                      )}
                      <td className="py-2 px-2 text-destructive">{m.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards Skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-20 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
      {/* Chart Skeleton */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-[200px] w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

function AllianceAnalytics() {
  const [activeTab, setActiveTab] = useState('overview')
  const [viewMode, setViewMode] = useState<ViewMode>('latest')

  // Get active season
  const { data: seasons, isLoading: seasonsLoading } = useSeasons()
  const activeSeason = seasons?.find((s) => s.is_active)

  // Get alliance analytics data
  const { data: analyticsData, isLoading: analyticsLoading } = useAllianceAnalytics(
    activeSeason?.id,
    viewMode
  )

  const isLoading = seasonsLoading || analyticsLoading
  const hasData = activeSeason && analyticsData

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">同盟分析</h2>
            <p className="text-muted-foreground mt-1">
              同盟整體表現分析與趨勢洞察
            </p>
          </div>

          {/* View Mode Toggle */}
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
            <TabsList className="h-8">
              <TabsTrigger value="latest" className="text-xs px-3">最新一期</TabsTrigger>
              <TabsTrigger value="season" className="text-xs px-3">賽季以來</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Loading State */}
        {isLoading && <LoadingSkeleton />}

        {/* No Data State */}
        {!isLoading && !hasData && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>尚無數據。請先創建賽季並上傳數據。</p>
            </CardContent>
          </Card>
        )}

        {/* Tab Navigation */}
        {!isLoading && hasData && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span>總覽</span>
              </TabsTrigger>
              <TabsTrigger value="groups" className="flex items-center gap-2">
                <GitCompare className="h-4 w-4" />
                <span>組別對比</span>
              </TabsTrigger>
              <TabsTrigger value="distribution" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>成員分佈</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <OverviewTab viewMode={viewMode} data={analyticsData} />
            </TabsContent>

            <TabsContent value="groups">
              <GroupComparisonTab data={analyticsData} />
            </TabsContent>

            <TabsContent value="distribution">
              <MemberDistributionTab viewMode={viewMode} data={analyticsData} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AllianceGuard>
  )
}

export default AllianceAnalytics
