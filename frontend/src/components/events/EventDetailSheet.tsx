/**
 * EventDetailSheet - Event analytics detail view
 *
 * Displays comprehensive analytics for a battle event:
 * - Overview: KPI cards, merit distribution
 * - Member Ranking: Sortable member table
 * - Participation: Participated/absent member lists
 */

import { useState, useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  LayoutDashboard,
  Medal,
  Users,
  Trophy,
  Swords,
  Shield,
  Zap,
  Map,
  Skull,
  Flag,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  UserPlus,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import { ChartContainer, ChartConfig, ChartTooltip } from '@/components/ui/chart'
import { formatNumber, formatNumberCompact } from '@/lib/chart-utils'
import type {
  BattleEvent,
  EventSummary,
  EventMemberMetric,
  EventType,
} from '@/types/event'
import { EVENT_TYPE_CONFIG } from '@/types/event'
import type { DistributionBin } from '@/types/analytics'

// ============================================================================
// Types
// ============================================================================

interface EventDetailSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly eventDetail: {
    event: BattleEvent
    summary: EventSummary
    metrics: readonly EventMemberMetric[]
    merit_distribution: readonly DistributionBin[]
  } | null
}

type SortField = 'member_name' | 'group' | 'merit_diff' | 'assist_diff' | 'contribution_diff'
type SortDirection = 'asc' | 'desc'

// ============================================================================
// Chart Config
// ============================================================================

const distributionConfig = {
  count: { label: '人數', color: 'var(--primary)' },
} satisfies ChartConfig

// ============================================================================
// Helper Functions
// ============================================================================

function getEventIcon(eventType: EventType) {
  switch (eventType) {
    case 'siege':
      return Swords
    case 'defense':
      return Shield
    case 'raid':
      return Zap
    case 'territory':
      return Map
    case 'boss':
      return Skull
    case 'custom':
      return Flag
  }
}

function formatEventTime(start: string | null, end: string | null): string {
  if (!start) return '未設定時間'

  const startDate = new Date(start)
  const dateStr = startDate.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  const startTime = startDate.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  if (!end) return `${dateStr} ${startTime}`

  const endDate = new Date(end)
  const endTime = endDate.toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const durationMs = endDate.getTime() - startDate.getTime()
  const hours = Math.floor(durationMs / (1000 * 60 * 60))
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))
  const durationStr = hours > 0 ? `${hours}小時${minutes > 0 ? minutes + '分鐘' : ''}` : `${minutes}分鐘`

  return `${dateStr} ${startTime} - ${endTime} (${durationStr})`
}

// ============================================================================
// KPI Card Component
// ============================================================================

interface KpiCardProps {
  readonly title: string
  readonly value: string | number
  readonly subtitle?: string
  readonly icon?: React.ReactNode
  readonly highlight?: boolean
}

function KpiCard({ title, value, subtitle, icon, highlight }: KpiCardProps) {
  return (
    <Card className={highlight ? 'border-primary/50' : ''}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-xl font-bold tabular-nums mt-1">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Overview Tab
// ============================================================================

interface OverviewTabProps {
  readonly summary: EventSummary
  readonly distribution: readonly DistributionBin[]
}

function OverviewTab({ summary, distribution }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2">
        <KpiCard
          title="參與率"
          value={`${summary.participation_rate}%`}
          subtitle={`${summary.participated_count}/${summary.expected_participants || summary.total_members} 人`}
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
          value={summary.mvp_member_name}
          subtitle={`${formatNumber(summary.mvp_merit)} 戰功`}
          icon={<Trophy className="h-5 w-5" />}
        />
        <KpiCard
          title="平均戰功"
          value={formatNumber(summary.avg_merit)}
          subtitle={`${summary.participated_count} 位參與者`}
        />
      </div>

      {/* Participation Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">參與統計</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between text-sm py-2 border-b">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span>參與成員</span>
            </div>
            <span className="font-medium tabular-nums">{summary.participated_count} 人</span>
          </div>
          <div className="flex items-center justify-between text-sm py-2 border-b">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <span>缺席成員</span>
            </div>
            <span className="font-medium tabular-nums">{summary.absent_count} 人</span>
          </div>
          <div className="flex items-center justify-between text-sm py-2">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-yellow-500" />
              <span>新成員</span>
            </div>
            <span className="font-medium tabular-nums">{summary.new_member_count} 人</span>
          </div>
        </CardContent>
      </Card>

      {/* Merit Distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">戰功分佈</CardTitle>
          <CardDescription>各區間成員數量</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={distributionConfig} className="h-[200px] w-full">
            <BarChart data={[...distribution]} margin={{ left: 0, right: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="range" tickLine={false} axisLine={false} className="text-xs" />
              <YAxis tickLine={false} axisLine={false} className="text-xs" width={30} />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const d = payload[0].payload as DistributionBin
                  return (
                    <div className="rounded-lg border bg-background p-2 shadow-sm">
                      <div className="font-medium">戰功 {d.range}</div>
                      <div className="text-sm">{d.count} 人</div>
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
  )
}

// ============================================================================
// Member Ranking Tab
// ============================================================================

interface MemberRankingTabProps {
  readonly metrics: readonly EventMemberMetric[]
}

function MemberRankingTab({ metrics }: MemberRankingTabProps) {
  const [sortField, setSortField] = useState<SortField>('merit_diff')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedMetrics = useMemo(() => {
    return [...metrics].sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      const isString = sortField === 'member_name' || sortField === 'group'
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
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />
    return sortDirection === 'asc' ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    )
  }

  const getStatusBadge = (metric: EventMemberMetric) => {
    if (metric.is_new_member) {
      return <Badge variant="outline" className="text-yellow-600 border-yellow-300">新成員</Badge>
    }
    if (metric.is_absent) {
      return <Badge variant="destructive">缺席</Badge>
    }
    if (metric.participated) {
      return <Badge variant="default">參與</Badge>
    }
    return null
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2 px-2 text-left">
                <button
                  type="button"
                  onClick={() => handleSort('member_name')}
                  className="flex items-center font-medium hover:text-primary"
                >
                  成員
                  {renderSortIcon('member_name')}
                </button>
              </th>
              <th className="py-2 px-2 text-left">
                <button
                  type="button"
                  onClick={() => handleSort('group')}
                  className="flex items-center font-medium hover:text-primary"
                >
                  組別
                  {renderSortIcon('group')}
                </button>
              </th>
              <th className="py-2 px-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('merit_diff')}
                  className="flex items-center justify-end w-full font-medium hover:text-primary"
                >
                  戰功
                  {renderSortIcon('merit_diff')}
                </button>
              </th>
              <th className="py-2 px-2 text-right">
                <button
                  type="button"
                  onClick={() => handleSort('assist_diff')}
                  className="flex items-center justify-end w-full font-medium hover:text-primary"
                >
                  助攻
                  {renderSortIcon('assist_diff')}
                </button>
              </th>
              <th className="py-2 px-2 text-center">狀態</th>
            </tr>
          </thead>
          <tbody>
            {sortedMetrics.map((m, index) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-2 px-2">
                  <div className="flex items-center gap-2">
                    {index < 3 && m.participated && (
                      <Medal
                        className={`h-4 w-4 ${
                          index === 0
                            ? 'text-yellow-500'
                            : index === 1
                              ? 'text-gray-400'
                              : 'text-amber-600'
                        }`}
                      />
                    )}
                    <span className="font-medium">{m.member_name}</span>
                  </div>
                </td>
                <td className="py-2 px-2 text-muted-foreground">{m.group || '-'}</td>
                <td className="py-2 px-2 text-right tabular-nums font-medium">
                  {formatNumber(m.merit_diff)}
                </td>
                <td className="py-2 px-2 text-right tabular-nums">{formatNumber(m.assist_diff)}</td>
                <td className="py-2 px-2 text-center">{getStatusBadge(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ============================================================================
// Participation Tab
// ============================================================================

interface ParticipationTabProps {
  readonly metrics: readonly EventMemberMetric[]
}

function ParticipationTab({ metrics }: ParticipationTabProps) {
  const participated = metrics.filter((m) => m.participated)
  const absent = metrics.filter((m) => m.is_absent)
  const newMembers = metrics.filter((m) => m.is_new_member)

  return (
    <div className="space-y-6">
      {/* Participated Members */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">參與成員 ({participated.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {participated.map((m) => (
              <Badge key={m.id} variant="secondary">
                {m.member_name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Absent Members */}
      {absent.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-destructive" />
              <CardTitle className="text-base">缺席成員 ({absent.length})</CardTitle>
            </div>
            <CardDescription>在戰前快照中但戰功為 0</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {absent.map((m) => (
                <Badge key={m.id} variant="destructive">
                  {m.member_name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* New Members */}
      {newMembers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-yellow-500" />
              <CardTitle className="text-base">新成員 ({newMembers.length})</CardTitle>
            </div>
            <CardDescription>僅在戰後快照中出現</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {newMembers.map((m) => (
                <Badge key={m.id} variant="outline" className="border-yellow-300 text-yellow-600">
                  {m.member_name}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function EventDetailSheet({ open, onOpenChange, eventDetail }: EventDetailSheetProps) {
  const [activeTab, setActiveTab] = useState('overview')

  if (!eventDetail) return null

  const { event, summary, metrics, merit_distribution } = eventDetail
  const Icon = getEventIcon(event.event_type)
  const config = EVENT_TYPE_CONFIG[event.event_type]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-xl">{event.name}</SheetTitle>
              <SheetDescription className="mt-2 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    <Icon className="h-3 w-3 mr-1" />
                    {config.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>{formatEventTime(event.event_start, event.event_end)}</span>
                </div>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" className="text-xs">
              <LayoutDashboard className="h-4 w-4 mr-1" />
              總覽
            </TabsTrigger>
            <TabsTrigger value="ranking" className="text-xs">
              <Medal className="h-4 w-4 mr-1" />
              排行
            </TabsTrigger>
            <TabsTrigger value="participation" className="text-xs">
              <Users className="h-4 w-4 mr-1" />
              出席
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab summary={summary} distribution={merit_distribution} />
          </TabsContent>

          <TabsContent value="ranking" className="mt-4">
            <MemberRankingTab metrics={metrics} />
          </TabsContent>

          <TabsContent value="participation" className="mt-4">
            <ParticipationTab metrics={metrics} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
