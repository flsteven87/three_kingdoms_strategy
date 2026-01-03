/**
 * EventDetail - Full-page Event Analytics View
 *
 * Displays comprehensive analytics for a battle event in a single scrollable page.
 * Replaces the Sheet-based approach for better content density and UX.
 *
 * Sections:
 * 1. Header - Event name, type, time range
 * 2. KPI Grid - Key performance metrics
 * 3. Merit Distribution - Bar chart showing member distribution
 * 4. Member Ranking - Sortable table with all members
 * 5. Participation Summary - Visual breakdown of participation status
 */

import { useState, useMemo, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { useEventAnalytics } from '@/hooks/use-events'
import {
  ArrowLeft,
  Users,
  Trophy,
  Swords,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  UserPlus,
  Medal,
  TrendingUp,
} from 'lucide-react'
import { Bar, BarChart, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { ChartContainer, ChartConfig, ChartTooltip } from '@/components/ui/chart'
import { formatNumber, formatNumberCompact } from '@/lib/chart-utils'
import { getEventIcon, formatEventTime, getEventTypeLabel } from '@/lib/event-utils'
import type { EventMemberMetric } from '@/types/event'
import type { DistributionBin } from '@/types/analytics'

// ============================================================================
// Types
// ============================================================================

type SortField = 'member_name' | 'group_name' | 'merit_diff' | 'assist_diff' | 'contribution_diff'
type SortDirection = 'asc' | 'desc'

// ============================================================================
// Chart Config
// ============================================================================

const distributionConfig = {
  count: { label: '人數', color: 'var(--primary)' },
} satisfies ChartConfig

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-96" />
    </div>
  )
}

// ============================================================================
// Not Found State
// ============================================================================

interface NotFoundStateProps {
  readonly onBack: () => void
}

function NotFoundState({ onBack }: NotFoundStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Swords className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">找不到事件</h2>
      <p className="text-muted-foreground mb-6">該事件不存在或已被刪除</p>
      <Button onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        返回事件列表
      </Button>
    </div>
  )
}

// ============================================================================
// KPI Card Component
// ============================================================================

interface KpiCardProps {
  readonly title: string
  readonly value: string | number
  readonly subtitle?: string
  readonly icon: ReactNode
  readonly highlight?: boolean
}

function KpiCard({ title, value, subtitle, icon, highlight }: KpiCardProps) {
  return (
    <Card className={highlight ? 'border-primary/50' : ''}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Merit Distribution Section
// ============================================================================

interface MeritDistributionProps {
  readonly distribution: readonly DistributionBin[]
}

function MeritDistribution({ distribution }: MeritDistributionProps) {
  if (distribution.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          戰功分佈
        </CardTitle>
        <CardDescription>各區間成員數量分佈</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={distributionConfig} className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...distribution]} margin={{ left: 0, right: 0, top: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
              <XAxis
                dataKey="range"
                tickLine={false}
                axisLine={false}
                className="text-xs"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                className="text-xs"
                width={35}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as DistributionBin
                  return (
                    <div className="rounded-lg border bg-background p-2.5 shadow-sm">
                      <div className="font-medium">戰功 {d.range}</div>
                      <div className="text-sm text-muted-foreground">{d.count} 人</div>
                    </div>
                  )
                }}
              />
              <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Member Ranking Section
// ============================================================================

interface MemberRankingProps {
  readonly metrics: readonly EventMemberMetric[]
}

function MemberRanking({ metrics }: MemberRankingProps) {
  const [sortField, setSortField] = useState<SortField>('merit_diff')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedMetrics = useMemo(() => {
    return [...metrics].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      const isString = sortField === 'member_name' || sortField === 'group_name'
      const diff = isString
        ? String(aVal).localeCompare(String(bVal), 'zh-TW')
        : Number(aVal) - Number(bVal)

      return sortDirection === 'asc' ? diff : -diff
    })
  }, [metrics, sortField, sortDirection])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection(field === 'member_name' ? 'asc' : 'desc')
    }
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 ml-1.5 opacity-50" />
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5 ml-1.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 ml-1.5" />
    )
  }

  const getStatusBadge = (metric: EventMemberMetric) => {
    if (metric.is_new_member) {
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
          新成員
        </Badge>
      )
    }
    if (metric.is_absent) {
      return <Badge variant="destructive">缺席</Badge>
    }
    if (metric.participated) {
      return <Badge variant="default">參與</Badge>
    }
    return null
  }

  const getMedalIcon = (index: number, participated: boolean) => {
    if (!participated || index >= 3) return null
    const colors = ['text-yellow-500', 'text-gray-400', 'text-amber-600']
    return <Medal className={`h-4 w-4 ${colors[index]}`} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Medal className="h-5 w-5" />
          成員排行
        </CardTitle>
        <CardDescription>點擊欄位標題排序</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 px-3 text-left w-12">#</th>
                <th className="py-3 px-3 text-left">
                  <button
                    type="button"
                    onClick={() => handleSort('member_name')}
                    className="flex items-center font-medium hover:text-primary transition-colors"
                  >
                    成員
                    {renderSortIcon('member_name')}
                  </button>
                </th>
                <th className="py-3 px-3 text-left">
                  <button
                    type="button"
                    onClick={() => handleSort('group_name')}
                    className="flex items-center font-medium hover:text-primary transition-colors"
                  >
                    組別
                    {renderSortIcon('group_name')}
                  </button>
                </th>
                <th className="py-3 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('merit_diff')}
                    className="flex items-center justify-end w-full font-medium hover:text-primary transition-colors"
                  >
                    戰功
                    {renderSortIcon('merit_diff')}
                  </button>
                </th>
                <th className="py-3 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => handleSort('assist_diff')}
                    className="flex items-center justify-end w-full font-medium hover:text-primary transition-colors"
                  >
                    助攻
                    {renderSortIcon('assist_diff')}
                  </button>
                </th>
                <th className="py-3 px-3 text-center">狀態</th>
              </tr>
            </thead>
            <tbody>
              {sortedMetrics.map((m, index) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-3 tabular-nums text-muted-foreground">{index + 1}</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      {getMedalIcon(index, m.participated)}
                      <span className="font-medium">{m.member_name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">{m.group_name || '-'}</td>
                  <td className="py-3 px-3 text-right tabular-nums font-medium">
                    {formatNumber(m.merit_diff)}
                  </td>
                  <td className="py-3 px-3 text-right tabular-nums">{formatNumber(m.assist_diff)}</td>
                  <td className="py-3 px-3 text-center">{getStatusBadge(m)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Participation Summary Section
// ============================================================================

interface ParticipationSummaryProps {
  readonly metrics: readonly EventMemberMetric[]
}

function ParticipationSummary({ metrics }: ParticipationSummaryProps) {
  const participated = metrics.filter((m) => m.participated)
  const absent = metrics.filter((m) => m.is_absent)
  const newMembers = metrics.filter((m) => m.is_new_member)

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Participated */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">參與成員 ({participated.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {participated.map((m) => (
              <Badge key={m.id} variant="secondary" className="text-xs">
                {m.member_name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Absent */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-base">缺席成員 ({absent.length})</CardTitle>
          </div>
          <CardDescription className="text-xs">戰前存在但戰功為 0</CardDescription>
        </CardHeader>
        <CardContent>
          {absent.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {absent.map((m) => (
                <Badge key={m.id} variant="destructive" className="text-xs">
                  {m.member_name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">無缺席成員</p>
          )}
        </CardContent>
      </Card>

      {/* New Members */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-base">新成員 ({newMembers.length})</CardTitle>
          </div>
          <CardDescription className="text-xs">僅在戰後快照出現</CardDescription>
        </CardHeader>
        <CardContent>
          {newMembers.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {newMembers.map((m) => (
                <Badge key={m.id} variant="outline" className="border-yellow-300 text-yellow-600 text-xs">
                  {m.member_name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">無新成員</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const navigate = useNavigate()
  const { data: eventDetail, isLoading, isError } = useEventAnalytics(eventId)

  const handleBack = () => {
    navigate('/events')
  }

  if (isLoading) {
    return (
      <AllianceGuard>
        <div className="space-y-6">
          <LoadingSkeleton />
        </div>
      </AllianceGuard>
    )
  }

  if (isError || !eventDetail) {
    return (
      <AllianceGuard>
        <NotFoundState onBack={handleBack} />
      </AllianceGuard>
    )
  }

  const { event, summary, metrics, merit_distribution } = eventDetail
  const Icon = getEventIcon()
  const eventTypeLabel = getEventTypeLabel(event.event_type)

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4 -ml-2">
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回事件列表
          </Button>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">{event.name}</h1>
                {eventTypeLabel && (
                  <Badge variant="secondary">
                    <Icon className="h-3 w-3 mr-1" />
                    {eventTypeLabel}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  {formatEventTime(event.event_start, event.event_end, {
                    includeDuration: true,
                    includeYear: true,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="參與率"
            value={`${summary.participation_rate}%`}
            subtitle={`${summary.participated_count}/${summary.total_members - summary.new_member_count} 人`}
            icon={<Users className="h-5 w-5" />}
            highlight
          />
          <KpiCard
            title="總戰功"
            value={formatNumberCompact(summary.total_merit)}
            icon={<Swords className="h-5 w-5" />}
            highlight
          />
          <KpiCard
            title="MVP"
            value={summary.mvp_member_name ?? '-'}
            subtitle={summary.mvp_merit != null ? `${formatNumber(summary.mvp_merit)} 戰功` : undefined}
            icon={<Trophy className="h-5 w-5" />}
          />
          <KpiCard
            title="平均戰功"
            value={formatNumber(summary.avg_merit)}
            subtitle={`${summary.participated_count} 位參與者`}
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>

        {/* Merit Distribution */}
        <MeritDistribution distribution={merit_distribution} />

        {/* Member Ranking */}
        <MemberRanking metrics={metrics} />

        {/* Participation Summary */}
        <ParticipationSummary metrics={metrics} />
      </div>
    </AllianceGuard>
  )
}

export { EventDetail }
