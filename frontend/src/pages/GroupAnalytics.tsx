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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AllianceGuard } from '@/components/alliance/AllianceGuard'
import { EmptyState } from '@/components/ui/empty-state'
import { ViewModeToggle, type ViewMode } from '@/components/analytics/ViewModeToggle'
import { GroupOverviewTab } from '@/components/analytics/GroupOverviewTab'
import { GroupMeritDistributionTab } from '@/components/analytics/GroupMeritDistributionTab'
import { GroupContributionDistributionTab } from '@/components/analytics/GroupContributionDistributionTab'
import { GroupMembersTab } from '@/components/analytics/GroupMembersTab'
import { LayoutDashboard, BarChart3, Trophy, Users, Loader2, AlertCircle } from 'lucide-react'
import { useCurrentSeason } from '@/hooks/use-seasons'
import {
  useGroups,
  useGroupAnalytics,
  useGroupsComparison,
} from '@/hooks/use-analytics'
import { useEvents } from '@/hooks/use-events'
import type { EventListItem } from '@/types/event'

// ============================================================================
// Main Component
// ============================================================================

function GroupAnalytics() {
  const [selectedGroupName, setSelectedGroupName] = useState<string>('')
  const [activeTab, setActiveTab] = useState('overview')
  const [viewMode, setViewMode] = useState<ViewMode>('latest')

  // Get current (selected) season
  const { data: currentSeason, isLoading: isSeasonLoading } = useCurrentSeason()
  const seasonId = currentSeason?.id

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

  // Fetch events for participation calculation
  const { data: events } = useEvents(seasonId)

  // Calculate participation rates for a group
  const calculateGroupParticipation = (
    memberNames: readonly string[],
    eventsList: readonly EventListItem[] | undefined
  ): { overall: number; siege: number; battle: number } => {
    if (!eventsList || eventsList.length === 0 || memberNames.length === 0) {
      return { overall: 0, siege: 0, battle: 0 }
    }

    const allEvents = eventsList.filter(e => e.event_type !== 'forbidden')
    const siegeEvents = eventsList.filter(e => e.event_type === 'siege')
    const battleEvents = eventsList.filter(e => e.event_type === 'battle')

    const calculateRate = (eventSubset: readonly EventListItem[]) => {
      if (eventSubset.length === 0) return 0

      const totalRate = eventSubset.reduce((sum, event) => {
        const participants = (event.participant_names || []).filter(name => memberNames.includes(name))
        const absents = (event.absent_names || []).filter(name => memberNames.includes(name))

        const totalTracked = participants.length + absents.length
        if (totalTracked === 0) {
          return sum + 0 // Skip events with no tracked members
        }

        const participationRate = (participants.length / totalTracked) * 100
        return sum + participationRate
      }, 0)

      return totalRate / eventSubset.length
    }

    return {
      overall: calculateRate(allEvents),
      siege: calculateRate(siegeEvents),
      battle: calculateRate(battleEvents),
    }
  }



  // Derived data
  const groupStats = groupData?.stats
  const groupMembers = groupData?.members ?? []
  const periodTrends = groupData?.trends ?? []
  const allianceAverages = groupData?.alliance_averages

  // Calculate participation for all groups in one loop
  const allGroupsParticipation = useMemo(() => {
    const participationMap = new Map<string, { overall: number; siege: number; battle: number }>()

    if (!groupsComparison || !events) {
      return participationMap
    }

    groupsComparison.forEach(group => {
      // Calculate even if member_names is empty - will return 0s
      const rates = calculateGroupParticipation(group.member_names || [], events)
      participationMap.set(group.name, rates)
    })

    return participationMap
  }, [groupsComparison, events])

  // Extract current group's participation from the map
  const groupParticipationRates = groupStats
    ? allGroupsParticipation.get(groupStats.group_name) ?? { overall: 0, siege: 0, battle: 0 }
    : { overall: 0, siege: 0, battle: 0 }

  // Calculate member-level participation rates
  const memberParticipationMap = useMemo(() => {
    const participationMap = new Map<string, number>()

    if (!events || events.length === 0) {
      return participationMap
    }

    const allEvents = events.filter(e => e.event_type !== 'forbidden')

    // Step 2: Create participated and absent maps
    const participatedMap = new Map<string, number>()
    const absentMap = new Map<string, number>()

    // Step 1 & 3-4: For each event, find participants and absents, increment counts
    allEvents.forEach(event => {
      const participants = event.participant_names || []
      const absents = event.absent_names || []

      // Step 3: Increment participated map for each participant
      participants.forEach(name => {
        participatedMap.set(name, (participatedMap.get(name) || 0) + 1)
      })

      // Step 4: Increment absent map for each absent member
      absents.forEach(name => {
        absentMap.set(name, (absentMap.get(name) || 0) + 1)
      })
    })

    // Step 5: Calculate participation % for each member
    const allMemberNames = new Set([...participatedMap.keys(), ...absentMap.keys()])
    allMemberNames.forEach(memberName => {
      const participatedCount = participatedMap.get(memberName) || 0
      const absentCount = absentMap.get(memberName) || 0
      const totalTracked = participatedCount + absentCount

      if (totalTracked > 0) {
        const participationRate = (participatedCount / totalTracked) * 100
        participationMap.set(memberName, participationRate)
      }
    })

    return participationMap
  }, [events])

  // Loading state
  const isLoading = isSeasonLoading || isGroupsLoading || isGroupLoading

  // No season state
  if (!isSeasonLoading && !currentSeason) {
    return (
      <AllianceGuard>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">尚未設定當前賽季</h3>
          <p className="text-sm text-muted-foreground mt-1">請先在設定頁面選擇或建立一個賽季</p>
        </div>
      </AllianceGuard>
    )
  }

  // No groups state
  if (!isGroupsLoading && groups && groups.length === 0) {
    return (
      <AllianceGuard>
        <EmptyState
          icon={Users}
          title="尚無組別資料"
          description="請先上傳 CSV 資料並確保成員有設定組別。"
        />
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
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
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
              <TabsTrigger value="contribution" className="flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">貢獻分佈</span>
              </TabsTrigger>
              <TabsTrigger value="distribution" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">戰功分佈</span>
              </TabsTrigger>
              <TabsTrigger value="members" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">組內成員</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <GroupOverviewTab
                groupStats={groupStats}
                allianceAverages={allianceAverages}
                allGroupsData={groupsComparison ?? []}
                groupParticipationRates={groupParticipationRates}
                allGroupsParticipation={allGroupsParticipation}
                events={events ?? []}
              />
            </TabsContent>

            <TabsContent value="contribution">
              <GroupContributionDistributionTab
                groupStats={groupStats}
                members={groupMembers}
                periodTrends={periodTrends}
              />
            </TabsContent>

            <TabsContent value="distribution">
              <GroupMeritDistributionTab
                groupStats={groupStats}
                members={groupMembers}
                periodTrends={periodTrends}
              />
            </TabsContent>

            <TabsContent value="members">
              <GroupMembersTab
                members={groupMembers}
                viewMode={viewMode}
                memberParticipation={memberParticipationMap}
              />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </AllianceGuard>
  )
}

export { GroupAnalytics }