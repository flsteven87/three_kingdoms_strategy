/**
 * LIFF Event Report Page
 *
 * Mobile-optimized battle event report display for LIFF.
 * Shows: event summary, group statistics, top performers or violators.
 */

import { Card, CardContent } from '@/components/ui/card'
import { useLiffEventReport } from '../hooks/use-liff-event'
import type { LiffSession } from '../hooks/use-liff-session'
import type { EventCategory, GroupEventStats, TopMemberItem, ViolatorItem } from '../lib/liff-api-client'

interface Props {
  readonly session: LiffSession
  readonly eventId: string
}

const EVENT_TYPE_CONFIG: Record<EventCategory, { icon: string; label: string; color: string }> = {
  BATTLE: { icon: '⚔️', label: '戰役', color: '#4A90D9' },
  SIEGE: { icon: '🏰', label: '攻城', color: '#E67E22' },
  FORBIDDEN: { icon: '🚫', label: '禁地', color: '#FF5555' },
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.floor(n / 1_000)}K`
  return n.toLocaleString()
}

function formatEventTime(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function formatDuration(startStr: string | null, endStr: string | null): string {
  if (!startStr || !endStr) return ''
  const start = new Date(startStr)
  const end = new Date(endStr)
  const totalMinutes = Math.floor((end.getTime() - start.getTime()) / 60000)
  if (totalMinutes < 60) return `${totalMinutes}分鐘`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}小時` : `${hours}小時${minutes}分`
}

interface GroupStatRowProps {
  readonly group: GroupEventStats
  readonly eventType: EventCategory | null
  readonly maxRate: number
}

function GroupStatRow({ group, eventType, maxRate }: GroupStatRowProps) {
  const isForbidden = eventType === 'FORBIDDEN'
  const barWidth = isForbidden
    ? Math.max(5, (group.violator_count / Math.max(1, maxRate)) * 100)
    : Math.max(2, group.participation_rate)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="truncate">{group.group_name}</span>
        {isForbidden ? (
          <span className="text-red-500 font-medium">{group.violator_count} 人違規</span>
        ) : (
          <span className="text-muted-foreground">
            {group.participated_count}/{group.member_count}
            <span className="text-green-600 font-medium ml-2">{group.participation_rate.toFixed(0)}%</span>
          </span>
        )}
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isForbidden ? 'bg-red-500' : 'bg-green-500'}`}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  )
}

interface TopMemberRowProps {
  readonly member: TopMemberItem
  readonly eventType: EventCategory | null
}

function TopMemberRow({ member, eventType }: TopMemberRowProps) {
  const rankIcons: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
  const rankDisplay = rankIcons[member.rank] || `${member.rank}.`
  const isSiege = eventType === 'SIEGE'

  const displayName = member.line_display_name
    ? `${member.member_name} (${member.line_display_name})`
    : member.member_name

  const scoreDisplay = isSiege && member.contribution_diff != null && member.assist_diff != null
    ? `${formatNumber(member.score)} (${formatNumber(member.contribution_diff)}+${formatNumber(member.assist_diff)})`
    : formatNumber(member.score)

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-6 text-center">{rankDisplay}</span>
      <span className="flex-1 truncate text-sm">{displayName}</span>
      <span className="text-sm text-muted-foreground">{scoreDisplay}</span>
    </div>
  )
}

interface ViolatorRowProps {
  readonly violator: ViolatorItem
  readonly index: number
}

function ViolatorRow({ violator, index }: ViolatorRowProps) {
  const displayName = violator.line_display_name
    ? `${violator.member_name} (${violator.line_display_name})`
    : violator.member_name

  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-6 text-center text-red-500 font-medium">{index + 1}.</span>
      <span className="flex-1 truncate text-sm">{displayName}</span>
      <span className="text-sm text-red-500 font-medium">+{formatNumber(violator.power_diff)}</span>
    </div>
  )
}

export function LiffEventReport({ session, eventId }: Props) {
  const context = { lineGroupId: session.lineGroupId! }
  const { data: report, isLoading, error } = useLiffEventReport(context, eventId)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="text-center">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : '無法載入報告'}
          </p>
        </div>
      </div>
    )
  }

  const eventType = report.event_type
  const config = eventType ? EVENT_TYPE_CONFIG[eventType] : EVENT_TYPE_CONFIG.BATTLE
  const isForbidden = eventType === 'FORBIDDEN'
  const { summary, group_stats, top_members, violators } = report

  // Calculate compliance rate for forbidden events
  const complianceRate = isForbidden && summary.total_members > 0
    ? ((summary.total_members - summary.violator_count) / summary.total_members * 100)
    : 0

  const mainRate = isForbidden ? complianceRate : summary.participation_rate
  const mainRateLabel = isForbidden ? '守規率' : '出席率'
  const mainRateColor = isForbidden
    ? (summary.violator_count > 0 ? '#FF5555' : '#06C755')
    : '#06C755'

  // For group stats, get max violator count for bar scaling
  const maxViolatorCount = isForbidden
    ? Math.max(...group_stats.map(g => g.violator_count), 1)
    : 0

  // Time display
  const timeStr = formatEventTime(report.event_start)
  const durationStr = formatDuration(report.event_start, report.event_end)
  const timeLine = timeStr + (durationStr ? ` · ${durationStr}` : '')

  return (
    <div className="p-3 space-y-4 pb-6">
      {/* Header */}
      <div>
        <div className="flex items-start gap-2">
          <h1 className="text-lg font-bold flex-1">
            {config.icon} {report.event_name}
          </h1>
          <span
            className="px-2 py-0.5 text-xs text-white rounded shrink-0"
            style={{ backgroundColor: config.color }}
          >
            {config.label}
          </span>
        </div>
        {timeLine && (
          <p className="text-sm text-muted-foreground mt-1">{timeLine}</p>
        )}
      </div>

      {/* Main Rate Card */}
      <Card className="bg-muted/30">
        <CardContent className="py-4 text-center">
          <div className="text-xs text-muted-foreground mb-1">
            {isForbidden ? '🚫 禁地' : '📊 整體'}{mainRateLabel}
          </div>
          <div
            className="text-4xl font-bold"
            style={{ color: mainRateColor }}
          >
            {mainRate.toFixed(0)}%
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {isForbidden
              ? (summary.violator_count > 0 ? `${summary.violator_count} 人違規` : '全員遵守規定 ✓')
              : `${summary.participated_count}/${summary.participated_count + summary.absent_count}人 參戰`
            }
          </div>
        </CardContent>
      </Card>

      {/* Group Statistics */}
      {group_stats.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <div className="text-sm font-medium mb-3">
              {isForbidden ? '⚠️ 分組違規統計' : '🏘️ 組別出席率'}
            </div>
            <div className="space-y-3">
              {/* Show ALL groups, not just 5 */}
              {group_stats.map((group) => (
                <GroupStatRow
                  key={group.group_name}
                  group={group}
                  eventType={eventType}
                  maxRate={maxViolatorCount}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Members or Violators */}
      {isForbidden ? (
        violators.length > 0 && (
          <Card>
            <CardContent className="py-3">
              <div className="text-sm font-medium mb-2">⚠️ 違規名單</div>
              <div className="divide-y">
                {violators.slice(0, 5).map((v, i) => (
                  <ViolatorRow key={v.member_name} violator={v} index={i} />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      ) : (
        top_members.length > 0 && (
          <Card>
            <CardContent className="py-3">
              <div className="text-sm font-medium mb-2">
                {eventType === 'SIEGE' ? '🏰 貢獻排行' : '🏆 戰功 Top 5'}
              </div>
              <div className="divide-y">
                {top_members.slice(0, 5).map((m) => (
                  <TopMemberRow key={m.member_name} member={m} eventType={eventType} />
                ))}
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  )
}
