/**
 * LineReportPreview - Category-aware LINE Flex Message Preview
 *
 * Renders a preview of the LINE Bot battle report with category-specific content:
 *
 * BATTLE:
 * - Overall participation rate
 * - Group attendance with progress bars
 * - Group merit distribution
 * - Top 5 merit ranking
 *
 * SIEGE:
 * - Overall participation rate
 * - Group attendance with progress bars
 * - Group contribution distribution
 * - Top 5 contribution+assist ranking
 *
 * FORBIDDEN:
 * - Violator summary (total violators, total power increase)
 * - Group violator distribution
 * - Violator list with power increase
 *
 * Design follows LINE Flex Message conventions:
 * - Gray header background (#f5f5f5)
 * - LINE Green (#06C755) for progress bars and highlights
 * - Compact, information-dense layout
 */

import { Skeleton } from '@/components/ui/skeleton'
import { formatNumberCompact } from '@/lib/chart-utils'
import { formatDuration, getEventTypeLabel } from '@/lib/event-utils'
import type {
  EventCategory,
  EventGroupAnalytics,
  GroupEventStats,
  TopMemberItem,
  ViolatorItem,
} from '@/types/event'

// ============================================================================
// Constants
// ============================================================================

const LINE_GREEN = '#06C755'
const LINE_RED = '#FF5555'
const MEDAL_EMOJIS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']

// ============================================================================
// Types
// ============================================================================

interface LineReportPreviewProps {
  readonly analytics: EventGroupAnalytics | undefined
  readonly isLoading?: boolean
}

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
  readonly eventType: EventCategory | null
  readonly eventStart: string | null
  readonly eventEnd: string | null
}

function HeaderSection({ eventName, eventType, eventStart, eventEnd }: HeaderSectionProps) {
  const duration = formatDuration(eventStart, eventEnd)
  const typeLabel = eventType ? getEventTypeLabel(eventType) : null

  return (
    <div className="bg-[#f5f5f5] rounded-lg p-4">
      <div className="flex items-center gap-2">
        <h3 className="font-bold text-lg text-gray-900 line-clamp-2">{eventName}</h3>
        {typeLabel && (
          <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
            {typeLabel}
          </span>
        )}
      </div>
      {duration && <p className="text-sm text-gray-500 mt-1">持續時間：{duration}</p>}
    </div>
  )
}

// ============================================================================
// Overall Participation Section (BATTLE / SIEGE)
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
// Violator Summary Section (FORBIDDEN only)
// ============================================================================

interface ViolatorSummaryProps {
  readonly violatorCount: number
  readonly totalMembers: number
}

function ViolatorSummary({ violatorCount, totalMembers }: ViolatorSummaryProps) {
  const complianceRate = totalMembers > 0 ? ((totalMembers - violatorCount) / totalMembers) * 100 : 100

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
      <p className="text-sm text-gray-500 mb-1">禁地守規率</p>
      <p
        className="text-4xl font-bold"
        style={{ color: violatorCount > 0 ? LINE_RED : LINE_GREEN }}
      >
        {complianceRate.toFixed(1)}%
      </p>
      <p className="text-sm text-gray-500 mt-1">
        {violatorCount > 0 ? (
          <span className="text-red-600 font-medium">{violatorCount} 人違規</span>
        ) : (
          <span className="text-green-600 font-medium">全員遵守規定 ✓</span>
        )}
      </p>
    </div>
  )
}

// ============================================================================
// Group Attendance Section (BATTLE / SIEGE)
// ============================================================================

interface GroupAttendanceProps {
  readonly groups: readonly GroupEventStats[]
}

function GroupAttendance({ groups }: GroupAttendanceProps) {
  if (groups.length === 0) return null

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
// Group Violator Distribution Section (FORBIDDEN only)
// ============================================================================

interface GroupViolatorDistributionProps {
  readonly groups: readonly GroupEventStats[]
}

function GroupViolatorDistribution({ groups }: GroupViolatorDistributionProps) {
  // Only show groups with violators
  const groupsWithViolators = [...groups]
    .filter((g) => g.violator_count > 0)
    .sort((a, b) => b.violator_count - a.violator_count)

  if (groupsWithViolators.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-sm text-gray-700 mb-3">📊 分組違規統計</h4>
        <p className="text-sm text-gray-500 text-center py-2">無違規記錄 ✓</p>
      </div>
    )
  }

  const maxViolators = Math.max(...groupsWithViolators.map((g) => g.violator_count), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-sm text-gray-700 mb-3">⚠️ 分組違規統計</h4>
      <div className="space-y-3">
        {groupsWithViolators.map((group) => {
          const barWidth = (group.violator_count / maxViolators) * 100

          return (
            <div key={group.group_name}>
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-gray-700 font-medium truncate max-w-[50%]">
                  {group.group_name}
                </span>
                <span className="text-red-600 tabular-nums font-semibold">
                  {group.violator_count} 人違規
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: LINE_RED,
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
// Group Metric Distribution Section (BATTLE / SIEGE)
// ============================================================================

interface GroupMetricDistributionProps {
  readonly groups: readonly GroupEventStats[]
  readonly eventType: EventCategory
}

function GroupMetricDistribution({ groups, eventType }: GroupMetricDistributionProps) {
  if (groups.length === 0) return null

  const isSiege = eventType === 'siege'
  const title = isSiege ? '🏰 分組平均貢獻' : '⚔️ 分組平均戰功'

  // Calculate avg value based on event type
  const getAvgValue = (group: GroupEventStats): number => {
    if (isSiege) {
      return group.avg_contribution + group.avg_assist
    }
    return group.avg_merit
  }

  const sortedGroups = [...groups].sort((a, b) => getAvgValue(b) - getAvgValue(a))
  const maxAvg = Math.max(...sortedGroups.map(getAvgValue), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-sm text-gray-700 mb-3">{title}</h4>
      <div className="space-y-3">
        {sortedGroups.map((group) => {
          const avgValue = getAvgValue(group)
          const barWidth = (avgValue / maxAvg) * 100

          return (
            <div key={group.group_name}>
              <div className="flex justify-between items-center text-sm mb-1">
                <span className="text-gray-700 font-medium truncate max-w-[50%]">
                  {group.group_name}
                </span>
                <span className="text-gray-600 tabular-nums font-semibold">
                  {formatNumberCompact(Math.round(avgValue))}
                </span>
              </div>
              <div className="h-3 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-300"
                  style={{
                    width: `${barWidth}%`,
                    backgroundColor: isSiege ? '#E67E22' : '#4A90D9',
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
// Top Ranking Section (BATTLE / SIEGE)
// ============================================================================

interface TopRankingProps {
  readonly topMembers: readonly TopMemberItem[]
  readonly eventType: EventCategory
}

function TopRanking({ topMembers, eventType }: TopRankingProps) {
  if (topMembers.length === 0) return null

  const isSiege = eventType === 'siege'
  const title = isSiege ? '🏰 貢獻排行' : '🏆 戰功排行'

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-sm text-gray-700 mb-3">{title}</h4>
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
              {formatNumberCompact(member.score)}
              {isSiege && member.contribution_diff != null && member.assist_diff != null && (
                <span className="text-xs text-gray-400 ml-1">
                  ({formatNumberCompact(member.contribution_diff)}+{formatNumberCompact(member.assist_diff)})
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Violator List Section (FORBIDDEN only)
// ============================================================================

interface ViolatorListProps {
  readonly violators: readonly ViolatorItem[]
}

function ViolatorList({ violators }: ViolatorListProps) {
  if (violators.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="font-semibold text-sm text-gray-700 mb-3">📋 違規名單</h4>
        <p className="text-sm text-green-600 text-center py-2">本次禁地期間無人違規 🎉</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="font-semibold text-sm text-gray-700 mb-3">⚠️ 違規名單</h4>
      <div className="space-y-2">
        {violators.map((violator, index) => (
          <div
            key={`${violator.rank}-${violator.member_name}`}
            className="flex items-center gap-2 py-1"
          >
            <span className="text-sm w-6 text-center text-red-500 font-bold">{index + 1}.</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{violator.member_name}</p>
              {violator.group_name && (
                <p className="text-xs text-gray-500 truncate">{violator.group_name}</p>
              )}
            </div>
            <span className="text-sm font-semibold text-red-600 tabular-nums">
              +{formatNumberCompact(violator.power_diff)} 勢力
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

  const {
    event_name,
    event_type,
    event_start,
    event_end,
    summary,
    group_stats,
    top_members,
    violators,
  } = analytics

  const isForbidden = event_type === 'forbidden'

  return (
    <div className="space-y-3 max-w-sm mx-auto">
      {/* Simulated LINE message container */}
      <div className="bg-[#f0f0f0] rounded-2xl p-3 shadow-sm">
        <div className="space-y-2">
          {/* Header */}
          <HeaderSection
            eventName={event_name}
            eventType={event_type}
            eventStart={event_start}
            eventEnd={event_end}
          />

          {/* Category-specific content */}
          {isForbidden ? (
            <>
              {/* FORBIDDEN: Violator-focused content */}
              <ViolatorSummary
                violatorCount={summary.violator_count}
                totalMembers={summary.total_members}
              />
              <GroupViolatorDistribution groups={group_stats} />
              <ViolatorList violators={violators} />
            </>
          ) : (
            <>
              {/* BATTLE / SIEGE: Participation-focused content */}
              <OverallParticipation
                participationRate={summary.participation_rate}
                participatedCount={summary.participated_count}
                totalMembers={summary.total_members}
                newMemberCount={summary.new_member_count}
              />
              <GroupAttendance groups={group_stats} />
              <GroupMetricDistribution groups={group_stats} eventType={event_type || 'battle'} />
              <TopRanking topMembers={top_members} eventType={event_type || 'battle'} />
            </>
          )}
        </div>
      </div>

      {/* Info text */}
      <p className="text-xs text-center text-muted-foreground">
        此為 LINE Bot 報告預覽，實際發送格式可能略有不同
      </p>
    </div>
  )
}
