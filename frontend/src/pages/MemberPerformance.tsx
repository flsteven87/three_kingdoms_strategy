/**
 * MemberPerformance - Member Performance Analytics Page
 *
 * Individual member performance analysis with:
 * - Member selector dropdown with group filtering
 * - Tab-based navigation:
 *   1. Overview: Daily contribution/merit summary + 5-dimension radar chart
 *   2. Contribution: Contribution rank, daily contribution trend
 *   3. Combat: Merit & Assist performance with alliance comparison
 *   4. Power & Donation: Power value and donation records
 */

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AllianceGuard } from "@/components/alliance/AllianceGuard";
import { EmptyState } from "@/components/ui/empty-state";
import { type ViewMode } from "@/components/analytics/ViewModeToggle";
import { MemberCombobox } from "@/components/analytics/member-combobox";
import { MemberOverviewTab } from "@/components/analytics/MemberOverviewTab";
import { MemberContributionTab } from "@/components/analytics/MemberContributionTab";
import { MemberCombatTab } from "@/components/analytics/MemberCombatTab";
import { MemberPowerDonationTab } from "@/components/analytics/MemberPowerDonationTab";
import {
  LayoutDashboard,
  Swords,
  Coins,
  Trophy,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useCurrentSeason } from "@/hooks/use-seasons";
import {
  useAnalyticsMembers,
  useMemberTrend,
  useMemberSeasonSummary,
  useSeasonAverages,
} from "@/hooks/use-analytics";
import type { AllianceAverage, AllianceMedian } from "@/types/member-performance";
import { createDailyChartData } from "@/components/analytics/member-performance-helpers";
import { getPeriodBoundaryTicks } from "@/lib/chart-utils";

function MemberPerformance() {
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(
    undefined,
  );
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("overview");
  const [viewMode, setViewMode] = useState<ViewMode>("latest");

  // Fetch current (selected) season
  const { data: currentSeason, isLoading: isLoadingSeason } =
    useCurrentSeason();
  const seasonId = currentSeason?.id;

  // Fetch members list
  const {
    data: members,
    isLoading: isLoadingMembers,
    error: membersError,
  } = useAnalyticsMembers(seasonId);

  // Extract unique groups from members
  const availableGroups = (() => {
    if (!members) return [];
    const groups = new Set<string>();
    for (const member of members) {
      if (member.group) {
        groups.add(member.group);
      }
    }
    return Array.from(groups).sort();
  })();

  // Filter and sort members: filter by group, sort by contribution_rank (ascending)
  const filteredAndSortedMembers = (() => {
    if (!members) return [];

    let filtered = members;
    if (selectedGroup !== "all") {
      filtered = members.filter((m) => m.group === selectedGroup);
    }

    // Sort by contribution_rank (lowest first), null values go to the end
    return [...filtered].sort((a, b) => {
      if (a.contribution_rank === null && b.contribution_rank === null)
        return 0;
      if (a.contribution_rank === null) return 1;
      if (b.contribution_rank === null) return -1;
      return a.contribution_rank - b.contribution_rank;
    });
  })();

  // Auto-select first member when filtered members change
  useEffect(() => {
    if (filteredAndSortedMembers.length > 0) {
      // If current selection is not in filtered list, select first one
      const currentInList = filteredAndSortedMembers.some(
        (m) => m.id === selectedMemberId,
      );
      if (!currentInList) {
        setSelectedMemberId(filteredAndSortedMembers[0].id);
      }
    } else if (selectedMemberId && filteredAndSortedMembers.length === 0) {
      setSelectedMemberId(undefined);
    }
  }, [filteredAndSortedMembers, selectedMemberId]);

  // Fetch member trend data
  const {
    data: trendData,
    isLoading: isLoadingTrend,
    error: trendError,
  } = useMemberTrend(selectedMemberId, seasonId);

  // Fetch member season summary
  const {
    data: seasonSummary,
    isLoading: isLoadingSummary,
    error: summaryError,
  } = useMemberSeasonSummary(selectedMemberId, seasonId);

  // Fetch season alliance averages (for "賽季以來" view comparison)
  const { data: seasonAllianceAverages, isLoading: isLoadingSeasonAvg } =
    useSeasonAverages(seasonId);

  // Find selected member info
  const selectedMember = members?.find((m) => m.id === selectedMemberId);

  // Calculate alliance averages based on viewMode:
  // - 'latest': use latest period's alliance averages (from trend data)
  // - 'season': use season-to-date alliance averages (from dedicated API)
  const allianceAvg: AllianceAverage = (() => {
    // For season view, use season averages if available
    if (viewMode === "season" && seasonAllianceAverages) {
      return {
        daily_contribution: seasonAllianceAverages.avg_daily_contribution,
        daily_merit: seasonAllianceAverages.avg_daily_merit,
        daily_assist: seasonAllianceAverages.avg_daily_assist,
        daily_donation: seasonAllianceAverages.avg_daily_donation,
        power: seasonAllianceAverages.avg_power,
      };
    }

    // For latest view or fallback, use latest period from trend data
    if (!trendData || trendData.length === 0) {
      return {
        daily_contribution: 0,
        daily_merit: 0,
        daily_assist: 0,
        daily_donation: 0,
        power: 0,
      };
    }
    const latest = trendData[trendData.length - 1];
    return {
      daily_contribution: latest.alliance_avg_contribution,
      daily_merit: latest.alliance_avg_merit,
      daily_assist: latest.alliance_avg_assist,
      daily_donation: latest.alliance_avg_donation,
      power: latest.alliance_avg_power,
    };
  })();

  // Calculate alliance medians based on viewMode:
  // - 'latest': use latest period's alliance medians (from trend data)
  // - 'season': use season-to-date alliance medians (from dedicated API)
  const allianceMedian: AllianceMedian = (() => {
    // For season view, use season medians if available
    if (viewMode === "season" && seasonAllianceAverages) {
      return {
        daily_contribution: seasonAllianceAverages.median_daily_contribution,
        daily_merit: seasonAllianceAverages.median_daily_merit,
        daily_assist: seasonAllianceAverages.median_daily_assist,
        daily_donation: seasonAllianceAverages.median_daily_donation,
        power: seasonAllianceAverages.median_power,
      };
    }

    // For latest view or fallback, use latest period from trend data
    if (!trendData || trendData.length === 0) {
      return {
        daily_contribution: 0,
        daily_merit: 0,
        daily_assist: 0,
        daily_donation: 0,
        power: 0,
      };
    }
    const latest = trendData[trendData.length - 1];
    return {
      daily_contribution: latest.alliance_median_contribution,
      daily_merit: latest.alliance_median_merit,
      daily_assist: latest.alliance_median_assist,
      daily_donation: latest.alliance_median_donation,
      power: latest.alliance_median_power,
    };
  })();

  // Get total members from latest trend data
  const totalMembers =
    trendData && trendData.length > 0
      ? trendData[trendData.length - 1].alliance_member_count
      : 0;

  // Pre-compute chart data once for all tabs (avoids redundant expandPeriodsToDaily calls)
  const dailyChartData = trendData ? createDailyChartData(trendData) : [];
  const xAxisTicks = trendData ? getPeriodBoundaryTicks(trendData) : [];
  const totalDonation = trendData
    ? trendData.reduce((sum, d) => sum + d.donation_diff, 0)
    : 0;

  // Loading state (include season averages only when in season view)
  const isLoading =
    isLoadingSeason ||
    isLoadingMembers ||
    isLoadingTrend ||
    isLoadingSummary ||
    (viewMode === "season" && isLoadingSeasonAvg);

  // Error state
  const hasError = membersError || trendError || summaryError;

  // Check if we have the required data
  const hasData = trendData && trendData.length > 0 && seasonSummary;

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">成員表現分析</h2>
          <p className="text-muted-foreground mt-1">
            查看個別成員的詳細表現數據與趨勢
          </p>
        </div>

        {/* Member Selector with Group Filter */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Group Filter */}
          {availableGroups.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground">組別:</span>
              <Select value={selectedGroup} onValueChange={setSelectedGroup}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {availableGroups.map((group) => (
                    <SelectItem key={group} value={group}>
                      {group}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          {/* Member Selector with Search */}
          <span className="text-sm text-muted-foreground">成員:</span>
          <MemberCombobox
            members={filteredAndSortedMembers}
            value={selectedMemberId}
            onValueChange={setSelectedMemberId}
            disabled={!filteredAndSortedMembers.length}
            isLoading={isLoadingMembers}
            placeholder="選擇成員"
          />
          {selectedMember && seasonSummary && (
            <span className="text-sm text-muted-foreground">
              排名 #{seasonSummary.current_rank} / {totalMembers}人
            </span>
          )}
        </div>

        {/* Loading State */}
        {isLoading && selectedMemberId && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">載入數據中...</span>
          </div>
        )}

        {/* Error State */}
        {hasError && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-6">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <div>
                <p className="font-medium text-destructive">載入失敗</p>
                <p className="text-sm text-muted-foreground">
                  無法取得成員表現數據，請稍後再試
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No Season State */}
        {!isLoadingSeason && !currentSeason && (
          <EmptyState
            icon={Trophy}
            title="尚無賽季"
            description="請先設定當前賽季才能查看成員表現。"
          />
        )}

        {/* No Data State */}
        {!isLoading &&
          !hasError &&
          currentSeason &&
          selectedMemberId &&
          !hasData && (
            <EmptyState
              variant="compact"
              title="此成員尚無表現數據"
              description="此成員在當前賽季尚無數據記錄。"
            />
          )}

        {/* Tabs - Only show when we have data */}
        {hasData && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="space-y-6"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">總覽</span>
              </TabsTrigger>
              <TabsTrigger
                value="contribution"
                className="flex items-center gap-2"
              >
                <Trophy className="h-4 w-4" />
                <span className="hidden sm:inline">貢獻</span>
              </TabsTrigger>
              <TabsTrigger value="combat" className="flex items-center gap-2">
                <Swords className="h-4 w-4" />
                <span className="hidden sm:inline">戰功與助攻</span>
              </TabsTrigger>
              <TabsTrigger value="power" className="flex items-center gap-2">
                <Coins className="h-4 w-4" />
                <span className="hidden sm:inline">勢力值與捐獻</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <MemberOverviewTab
                periodData={trendData}
                dailyChartData={dailyChartData}
                xAxisTicks={xAxisTicks}
                totalDonation={totalDonation}
                seasonSummary={seasonSummary}
                allianceAvg={allianceAvg}
                allianceMedian={allianceMedian}
                memberName={selectedMember?.name ?? "成員"}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />
            </TabsContent>

            <TabsContent value="contribution">
              <MemberContributionTab
                periodData={trendData}
                dailyChartData={dailyChartData}
                xAxisTicks={xAxisTicks}
                seasonSummary={seasonSummary}
                allianceAvg={allianceAvg}
                totalMembers={totalMembers}
              />
            </TabsContent>

            <TabsContent value="combat">
              <MemberCombatTab
                periodData={trendData}
                dailyChartData={dailyChartData}
                xAxisTicks={xAxisTicks}
                seasonSummary={seasonSummary}
                allianceAvg={allianceAvg}
                viewMode={viewMode}
              />
            </TabsContent>

            <TabsContent value="power">
              <MemberPowerDonationTab
                dailyChartData={dailyChartData}
                xAxisTicks={xAxisTicks}
                totalDonation={totalDonation}
                periodData={trendData}
                seasonSummary={seasonSummary}
                allianceAvg={allianceAvg}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AllianceGuard>
  );
}

export { MemberPerformance };
