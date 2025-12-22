/**
 * EventAnalytics - Battle Event Performance Analytics
 *
 * Track and analyze member performance during specific battles/events.
 * Unlike daily periods, events track short-duration activities (hours)
 * with focus on participation rate and total contribution.
 *
 * Features:
 * - Event list with summary cards
 * - Create new events with before/after snapshots
 * - Event detail view with member rankings and participation analysis
 */

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { useSeasons } from '@/hooks/use-seasons'
import {
  Plus,
  Swords,
  Shield,
  Zap,
  Map,
  Skull,
  Flag,
  Clock,
  ChevronRight,
} from 'lucide-react'
import type {
  BattleEvent,
  EventType,
  EventListItem,
  EventSummary,
  EventMemberMetric,
} from '@/types/event'
import { EVENT_TYPE_CONFIG } from '@/types/event'
import { formatNumber } from '@/lib/chart-utils'
import { CreateEventDialog } from '@/components/events/CreateEventDialog'
import { EventDetailSheet } from '@/components/events/EventDetailSheet'

// ============================================================================
// Mock Data (to be replaced with real API calls)
// ============================================================================

const MOCK_EVENTS: EventListItem[] = [
  {
    id: '1',
    name: '徐州爭奪戰',
    event_type: 'siege',
    status: 'completed',
    event_start: '2025-12-20T14:00:00',
    event_end: '2025-12-20T18:00:00',
    participation_rate: 85,
    total_merit: 1234567,
    mvp_name: '趙雲',
    created_at: '2025-12-20T12:00:00',
  },
  {
    id: '2',
    name: '洛陽攻城戰',
    event_type: 'siege',
    status: 'completed',
    event_start: '2025-12-18T20:00:00',
    event_end: '2025-12-18T23:30:00',
    participation_rate: 92,
    total_merit: 987654,
    mvp_name: '關羽',
    created_at: '2025-12-18T18:00:00',
  },
  {
    id: '3',
    name: '世界BOSS討伐',
    event_type: 'boss',
    status: 'completed',
    event_start: '2025-12-15T21:00:00',
    event_end: '2025-12-15T21:30:00',
    participation_rate: 78,
    total_merit: 456789,
    mvp_name: '張飛',
    created_at: '2025-12-15T20:00:00',
  },
  {
    id: '4',
    name: '益州防守戰',
    event_type: 'defense',
    status: 'completed',
    event_start: '2025-12-12T19:00:00',
    event_end: '2025-12-12T22:00:00',
    participation_rate: 88,
    total_merit: 765432,
    mvp_name: '諸葛亮',
    created_at: '2025-12-12T18:00:00',
  },
]

const MOCK_EVENT_DETAIL = {
  event: {
    id: '1',
    alliance_id: 'alliance-1',
    season_id: 'season-1',
    name: '徐州爭奪戰',
    event_type: 'siege' as EventType,
    description: '與 XXX 盟爭奪徐州城控制權',
    expected_participants: 165,
    before_upload_id: 'upload-1',
    after_upload_id: 'upload-2',
    event_start: '2025-12-20T14:00:00',
    event_end: '2025-12-20T18:00:00',
    status: 'completed' as const,
    created_at: '2025-12-20T12:00:00',
  } satisfies BattleEvent,
  summary: {
    total_members: 168,
    participated_count: 140,
    absent_count: 25,
    new_member_count: 3,
    participation_rate: 85,
    expected_participants: 165,
    total_merit: 1234567,
    total_assist: 45678,
    total_contribution: 2345678,
    avg_merit: 8818,
    avg_assist: 326,
    mvp_member_id: 'member-1',
    mvp_member_name: '趙雲',
    mvp_merit: 15234,
  } satisfies EventSummary,
  metrics: [
    { id: '1', member_id: 'm1', member_name: '趙雲', group: '一組', contribution_diff: 25000, merit_diff: 15234, assist_diff: 523, donation_diff: 1000, power_diff: 500, participated: true, is_new_member: false, is_absent: false },
    { id: '2', member_id: 'm2', member_name: '關羽', group: '一組', contribution_diff: 22000, merit_diff: 14567, assist_diff: 489, donation_diff: 800, power_diff: 450, participated: true, is_new_member: false, is_absent: false },
    { id: '3', member_id: 'm3', member_name: '張飛', group: '一組', contribution_diff: 20000, merit_diff: 13890, assist_diff: 456, donation_diff: 900, power_diff: 400, participated: true, is_new_member: false, is_absent: false },
    { id: '4', member_id: 'm4', member_name: '諸葛亮', group: '二組', contribution_diff: 18000, merit_diff: 12345, assist_diff: 678, donation_diff: 1200, power_diff: 350, participated: true, is_new_member: false, is_absent: false },
    { id: '5', member_id: 'm5', member_name: '黃忠', group: '二組', contribution_diff: 16000, merit_diff: 11234, assist_diff: 345, donation_diff: 700, power_diff: 300, participated: true, is_new_member: false, is_absent: false },
    { id: '6', member_id: 'm6', member_name: '馬超', group: '二組', contribution_diff: 15000, merit_diff: 10567, assist_diff: 234, donation_diff: 600, power_diff: 280, participated: true, is_new_member: false, is_absent: false },
    { id: '7', member_id: 'm7', member_name: '魏延', group: '三組', contribution_diff: 14000, merit_diff: 9876, assist_diff: 345, donation_diff: 500, power_diff: 260, participated: true, is_new_member: false, is_absent: false },
    { id: '8', member_id: 'm8', member_name: '姜維', group: '三組', contribution_diff: 12000, merit_diff: 8765, assist_diff: 234, donation_diff: 400, power_diff: 240, participated: true, is_new_member: false, is_absent: false },
    { id: '9', member_id: 'm9', member_name: '新成員A', group: null, contribution_diff: 5000, merit_diff: 3456, assist_diff: 123, donation_diff: 200, power_diff: 100, participated: true, is_new_member: true, is_absent: false },
    { id: '10', member_id: 'm10', member_name: '缺席者A', group: '三組', contribution_diff: 0, merit_diff: 0, assist_diff: 0, donation_diff: 0, power_diff: 0, participated: false, is_new_member: false, is_absent: true },
  ] satisfies EventMemberMetric[],
  merit_distribution: [
    { range: '0', min_value: 0, max_value: 0, count: 25 },
    { range: '1-2k', min_value: 1, max_value: 2000, count: 15 },
    { range: '2k-4k', min_value: 2000, max_value: 4000, count: 25 },
    { range: '4k-6k', min_value: 4000, max_value: 6000, count: 35 },
    { range: '6k-8k', min_value: 6000, max_value: 8000, count: 30 },
    { range: '8k-10k', min_value: 8000, max_value: 10000, count: 25 },
    { range: '10k+', min_value: 10000, max_value: 999999, count: 13 },
  ],
}

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

  // Calculate duration
  const durationMs = endDate.getTime() - startDate.getTime()
  const hours = Math.floor(durationMs / (1000 * 60 * 60))
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60))
  const durationStr = hours > 0 ? `${hours}h${minutes > 0 ? minutes + 'm' : ''}` : `${minutes}m`

  return `${dateStr} ${startTime}-${endTime} (${durationStr})`
}

function getEventTypeBadgeVariant(
  eventType: EventType
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (EVENT_TYPE_CONFIG[eventType].color) {
    case 'primary':
      return 'default'
    case 'blue':
    case 'green':
    case 'purple':
      return 'secondary'
    case 'yellow':
      return 'outline'
    default:
      return 'secondary'
  }
}

// ============================================================================
// Event Card Component
// ============================================================================

interface EventCardProps {
  readonly event: EventListItem
  readonly onViewDetail: (eventId: string) => void
}

function EventCard({ event, onViewDetail }: EventCardProps) {
  const Icon = getEventIcon(event.event_type)
  const config = EVENT_TYPE_CONFIG[event.event_type]

  return (
    <Card
      className="group cursor-pointer transition-all hover:shadow-md hover:border-primary/30"
      onClick={() => onViewDetail(event.id)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">{event.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={getEventTypeBadgeVariant(event.event_type)} className="text-xs">
                <Icon className="h-3 w-3 mr-1" />
                {config.label}
              </Badge>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Time */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>{formatEventTime(event.event_start, event.event_end)}</span>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 pt-2 border-t">
          <div className="text-center">
            <div className="text-xs text-muted-foreground">參與率</div>
            <div className="text-sm font-semibold tabular-nums">
              {event.participation_rate != null ? `${event.participation_rate}%` : '-'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">總戰功</div>
            <div className="text-sm font-semibold tabular-nums">
              {event.total_merit != null ? formatNumber(event.total_merit) : '-'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground">MVP</div>
            <div className="text-sm font-semibold truncate">{event.mvp_name || '-'}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Empty State Component
// ============================================================================

interface EmptyStateProps {
  readonly onCreateEvent: () => void
}

function EmptyState({ onCreateEvent }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="py-16 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <Swords className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">尚無事件記錄</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          建立戰役事件來追蹤成員在特定戰鬥中的表現，分析出席率和戰功貢獻。
        </p>
        <Button onClick={onCreateEvent}>
          <Plus className="h-4 w-4 mr-2" />
          新增事件
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-20 mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-40" />
            <div className="grid grid-cols-3 gap-2 pt-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

function EventAnalytics() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Get active season
  const { data: seasons, isLoading: seasonsLoading } = useSeasons()
  const activeSeason = seasons?.find((s) => s.is_active)

  // TODO: Replace with real API hook
  const isLoading = seasonsLoading
  const events = MOCK_EVENTS

  // Filter events by type
  const filteredEvents = useMemo(() => {
    if (typeFilter === 'all') return events
    return events.filter((e) => e.event_type === typeFilter)
  }, [events, typeFilter])

  // Get selected event detail
  const selectedEventDetail = selectedEventId ? MOCK_EVENT_DETAIL : null

  const handleViewDetail = (eventId: string) => {
    setSelectedEventId(eventId)
  }

  const handleCloseDetail = () => {
    setSelectedEventId(null)
  }

  const handleCreateEvent = () => {
    setShowCreateDialog(true)
  }

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">事件分析</h2>
            <p className="text-muted-foreground mt-1">追蹤特定戰役或事件的成員表現</p>
          </div>
          <Button onClick={handleCreateEvent}>
            <Plus className="h-4 w-4 mr-2" />
            新增事件
          </Button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">類型:</span>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue placeholder="全部" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="siege">攻城戰</SelectItem>
                <SelectItem value="defense">守城戰</SelectItem>
                <SelectItem value="raid">突襲</SelectItem>
                <SelectItem value="territory">領土爭奪</SelectItem>
                <SelectItem value="boss">世界BOSS</SelectItem>
                <SelectItem value="custom">自訂</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {activeSeason && (
            <div className="text-sm text-muted-foreground">
              賽季: <span className="font-medium text-foreground">{activeSeason.name}</span>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && <LoadingSkeleton />}

        {/* Empty State */}
        {!isLoading && filteredEvents.length === 0 && (
          <EmptyState onCreateEvent={handleCreateEvent} />
        )}

        {/* Event Grid */}
        {!isLoading && filteredEvents.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredEvents.map((event) => (
              <EventCard key={event.id} event={event} onViewDetail={handleViewDetail} />
            ))}
          </div>
        )}

        {/* Create Event Dialog */}
        <CreateEventDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          seasonId={activeSeason?.id}
        />

        {/* Event Detail Sheet */}
        <EventDetailSheet
          open={selectedEventId !== null}
          onOpenChange={(open) => !open && handleCloseDetail()}
          eventDetail={selectedEventDetail}
        />
      </div>
    </AllianceGuard>
  )
}

export default EventAnalytics
