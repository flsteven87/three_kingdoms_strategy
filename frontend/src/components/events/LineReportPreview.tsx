/**
 * LineReportPreview - Simulates LINE Flex Message visual style
 *
 * Renders a preview of the LINE Bot battle report with:
 * 1. Header - Event name + time/duration
 * 2. Overall Participation - Large percentage + participant count
 * 3. Group Attendance - Per-group participation rates with progress bars
 * 4. Group Merit Distribution - Per-group average merit with bar charts
 * 5. Top 5 Ranking - Medal emojis + member names + merit
 *
 * Design follows LINE Flex Message conventions:
 * - Gray header background (#f5f5f5)
 * - LINE Green (#06C755) for progress bars and highlights
 * - Compact, information-dense layout
 */

import { Skeleton } from '@/components/ui/skeleton'
import { formatNumberCompact } from '@/lib/chart-utils'
import { formatDuration } from '@/lib/event-utils'
import type { EventGroupAnalytics, GroupEventStats, TopMemberItem } from '@/types/event'

// ============================================================================
// Types
// ============================================================================

interface LineReportPreviewProps {
  readonly analytics: EventGroupAnalytics | undefined
  readonly isLoading?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const LINE_GREEN = '#06C755'
const MEDAL_EMOJIS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  )
}

// ============================================================================
// Header Section
// ============================================================================

interface HeaderSectionProps {
  readonly eventName: string
  readonly eventStart: string | null
  readonly eventEnd: string | null
}

function HeaderSection({ eventName, eventStart, eventEnd }: HeaderSectionProps) {
  const duration = formatDuration(eventStart, eventEnd)

  return (
    <div className="bg-[#f5f5f5] rounded-lg p-4">
      <h3 className="font-bold text-lg text-gray-900 line-clamp-2">{eventName}</h3>
      {duration && (
        <p className="text-sm text-gray-500 mt-1">持續時間：{duration}</p>
      )}
    </div>
  )
}

// ============================================================================
// Overall Participation Section
// ============================================================================

interface OverallParticipationProps {
  readonly participationRate: number
  readonly participatedCount: number
  readonly totalMembers: number
  readonly newMemberCount: number
}

function OverallParticipation({
  participationRate,
  participatedCount,
  totalMembers,
  newMemberCount,
}: OverallParticipationProps) {
  const eligibleCount = totalMembers - newMemberCount

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
      <p className="text-sm text-gray-500 mb-1">整體出席率</p>
      <p className="text-4xl font-bold" style={{ color: LINE_GREEN }}>
        {participationRate.toFixed(1)}%
      </p>
      <p className="text-sm text-gray-500 mt-1">
        {participatedCount} / {eligibleCount} 人參與
      </p>
    </div>
  )
}

// ============================================================================
// Group Attendance Section
// ============================================================================

interface GroupAttendanceProps {
  readonly groups: readonly GroupEventStats[]
}

function GroupAttendance({ groups }: GroupAttendanceProps) {
  if (groups.length === 0) return null

  // Sort by participation rate descending for display
  const sortedGroups = [...groups].sort((a, b) => b.participation_rate - a.participation_rate)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-sm text-gray-700 mb-3">📊 分組出席率</h4>
      <div className="space-y-3">
        {sortedGroups.map((group) => (
          <div key={group.group_name}>
            <div className="flex justify-between items-center text-sm mb-1">
              <span className="text-gray-700 font-medium truncate max-w-[60%]">
                {group.group_name}
              </span>
              <span className="text-gray-500 tabular-nums">
                {group.participated_count}/{group.member_count}人
                <span className="ml-1 font-semibold" style={{ color: LINE_GREEN }}>
                  {group.participation_rate.toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(group.participation_rate, 100)}%`,
                  backgroundColor: LINE_GREEN,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Group Merit Distribution Section
// ============================================================================

interface GroupMeritDistributionProps {
  readonly groups: readonly GroupEventStats[]
}

function GroupMeritDistribution({ groups }: GroupMeritDistributionProps) {
  if (groups.length === 0) return null

  // Sort by avg_merit descending for display
  const sortedGroups = [...groups].sort((a, b) => b.avg_merit - a.avg_merit)
  const maxAvgMerit = Math.max(...sortedGroups.map((g) => g.avg_merit), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-sm text-gray-700 mb-3">⚔️ 分組平均戰功</h4>
      <div className="space-y-3">
        {sortedGroups.map((group) => {
          const barWidth = (group.avg_merit / maxAvgMerit) * 100

          return (
            <div key={group.group_name}>
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-gray-700 font-medium truncate max-w-[50%]">
                  {group.group_name}
                </span>
                <span className="text-gray-600 tabular-nums font-semibold">
                  {formatNumberCompact(Math.round(group.avg_merit))}
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: '#4A90D9',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
// Top Ranking Section
// ============================================================================

interface TopRankingProps {
  readonly topMembers: readonly TopMemberItem[]
}

function TopRanking({ topMembers }: TopRankingProps) {
  if (topMembers.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-sm text-gray-700 mb-3">🏆 戰功排行</h4>
      <div className="space-y-2">
        {topMembers.map((member, index) => (
          <div
            key={`${member.rank}-${member.member_name}`}
            className="flex items-center gap-2 py-1"
          >
            <span className="text-lg w-6 text-center">
              {MEDAL_EMOJIS[index] || `${member.rank}.`}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{member.member_name}</p>
              {member.group_name && (
                <p className="text-xs text-gray-500 truncate">{member.group_name}</p>
              )}
            </div>
            <span className="text-sm font-semibold text-gray-700 tabular-nums">
              {formatNumberCompact(member.merit_diff)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function LineReportPreview({ analytics, isLoading }: LineReportPreviewProps) {
  if (isLoading || !analytics) {
    return <LoadingSkeleton />
  }

  const { event_name, event_start, event_end, summary, group_stats, top_members } = analytics

  return (
    <div className="space-y-3 max-w-sm mx-auto">
      {/* Simulated LINE message container */}
      <div className="bg-[#f0f0f0] rounded-2xl p-3 shadow-sm">
        <div className="space-y-2">
          {/* Header */}
          <HeaderSection
            eventName={event_name}
            eventStart={event_start}
            eventEnd={event_end}
          />

          {/* Overall Participation */}
          <OverallParticipation
            participationRate={summary.participation_rate}
            participatedCount={summary.participated_count}
            totalMembers={summary.total_members}
            newMemberCount={summary.new_member_count}
          />

          {/* Group Attendance */}
          <GroupAttendance groups={group_stats} />

          {/* Group Merit Distribution */}
          <GroupMeritDistribution groups={group_stats} />

          {/* Top 5 Ranking */}
          <TopRanking topMembers={top_members} />
        </div>
      </div>

      {/* Info text */}
      <p className="text-xs text-center text-muted-foreground">
        此為 LINE Bot 報告預覽，實際發送格式可能略有不同
      </p>
    </div>
  )
}
