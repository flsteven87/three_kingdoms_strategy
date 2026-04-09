/**
 * Battle Tab
 *
 * Mobile-optimized battle event list for LIFF.
 * Features:
 * - Account selector (consistent with PerformanceTab)
 * - Event list with participation status and type badge
 * - Inline expandable event reports with progress bars
 * - Visual alignment with LINE Bot Flex Messages
 */

import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EventBadge } from "@/components/ui/event-badge";
import { RankBadge } from "@/components/ui/rank-badge";
import { GroupProgress } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { getStatusType } from "@/constants/event-types";
import {
  RankMetric,
  RateMetric,
  ComplianceMetric,
} from "@/components/ui/metric-card";
import { AccountSelector } from "../components/AccountSelector";
import { useLiffMemberInfo } from "../hooks/use-liff-member";
import {
  useLiffEventList,
  useLiffEventReportInline,
  liffBattleKeys,
} from "../hooks/use-liff-battle";
import { type EventType } from "@/constants/event-types";
import { formatScore, formatEventTime } from "@/lib/format-utils";
import { liffTypography } from "@/lib/typography";
import type { LiffSessionWithGroup } from "../hooks/use-liff-session";
import { getEventReport, type EventListItem } from "../lib/liff-api-client";

interface Props {
  readonly session: LiffSessionWithGroup;
}

interface EventCardProps {
  readonly event: EventListItem;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
  readonly lineGroupId: string;
}

function EventCard({
  event,
  isExpanded,
  onToggle,
  lineGroupId,
}: EventCardProps) {
  const {
    user_participation: up,
    event_type,
    total_members,
    participation_rate,
  } = event;
  const timeStr = formatEventTime(event.event_start);
  const isForbidden = event_type === "forbidden";

  // Derive status for badge
  const statusType = getStatusType(event_type, up.participated, up.violated);

  // Rate display: participation_rate is already calculated by backend
  // For forbidden events, it represents compliance rate (守規率)
  const rateLabel = isForbidden ? "守規率" : "出席率";
  const rateVariant =
    isForbidden && participation_rate < 100 ? "danger" : "success";

  return (
    <Card className={isExpanded ? "ring-1 ring-primary/20" : ""}>
      <button type="button" onClick={onToggle} className="w-full text-left">
        <CardContent className="py-3 px-3 space-y-2">
          {/* Row 1: Header - Type badge + Name + Status badge + Chevron */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <EventBadge
                type={event_type as EventType}
                size="sm"
                showLabel={false}
              />
              <span className={`${liffTypography.cardTitle} truncate`}>
                {event.event_name}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <StatusBadge status={statusType} />
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* Row 2: Subtitle - Date/Time */}
          <div className={liffTypography.caption}>{timeStr || "時間未定"}</div>

          {/* Row 3: Metrics - Two side-by-side cards */}
          <div className="flex gap-2">
            {isForbidden ? (
              <ComplianceMetric violated={up.violated === true} />
            ) : (
              <RankMetric
                rank={up.rank}
                total={total_members}
                score={up.score}
                scoreLabel={up.score_label || "戰功"}
              />
            )}
            <RateMetric
              rate={participation_rate}
              label={rateLabel}
              variant={rateVariant}
            />
          </div>
        </CardContent>
      </button>

      {isExpanded && (
        <ExpandedEventReport
          eventId={event.event_id}
          eventType={event.event_type}
          lineGroupId={lineGroupId}
        />
      )}
    </Card>
  );
}

interface ExpandedEventReportProps {
  readonly eventId: string;
  readonly eventType: string;
  readonly lineGroupId: string;
}

function ExpandedEventReport({
  eventId,
  eventType,
  lineGroupId,
}: ExpandedEventReportProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["groups"]), // Default expand groups section
  );

  const context = { lineGroupId };
  const { data: report, isLoading } = useLiffEventReportInline(
    context,
    eventId,
  );

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="px-3 pb-3 pt-2 border-t">
        <div className="flex justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="px-3 pb-3 pt-2 border-t">
        <p className={`${liffTypography.caption} text-center py-2`}>
          無法載入報告
        </p>
      </div>
    );
  }

  const {
    group_stats,
    top_members,
    top_contributors,
    top_assisters,
    violators,
  } = report;
  const isForbidden = eventType === "forbidden";
  const isSiege = eventType === "siege";

  return (
    <div className="px-3 pb-3 pt-2 border-t space-y-3">
      {/* Group Stats with Progress Bars */}
      {group_stats.length > 0 && (
        <CollapsibleSection
          title={isForbidden ? "⚠️ 分組違規統計" : "🏘️ 組別出席率"}
          isOpen={expandedSections.has("groups")}
          onToggle={() => toggleSection("groups")}
        >
          <div className="space-y-2 pt-2">
            {(isForbidden
              ? group_stats.filter((g) => g.violator_count > 0)
              : group_stats
            ).map((group) => (
              <GroupProgress
                key={group.group_name}
                name={group.group_name}
                participated={group.participated_count}
                total={group.member_count}
                violations={group.violator_count}
                isViolation={isForbidden}
              />
            ))}
            {isForbidden &&
              group_stats.filter((g) => g.violator_count > 0).length === 0 && (
                <p
                  className={`${liffTypography.caption} text-green-600 dark:text-green-400 text-center`}
                >
                  無違規記錄 ✓
                </p>
              )}
          </div>
        </CollapsibleSection>
      )}

      {/* Rankings - aligned with LINE Bot report */}
      {isForbidden ? (
        violators.length > 0 && (
          <CollapsibleSection
            title="⚠️ 違規名單"
            isOpen={expandedSections.has("violators")}
            onToggle={() => toggleSection("violators")}
          >
            <div className="space-y-1.5 pt-2">
              {violators.slice(0, 5).map((v, i) => (
                <div
                  key={v.member_name}
                  className="flex justify-between items-center text-xs"
                >
                  <span className="flex items-center gap-1.5">
                    <RankBadge rank={i + 1} size="sm" />
                    <span className="font-medium">{v.member_name}</span>
                    {v.line_display_name && (
                      <span className="text-muted-foreground">
                        ({v.line_display_name})
                      </span>
                    )}
                  </span>
                  <span className="text-red-500 dark:text-red-400 tabular-nums">
                    +{formatScore(v.power_diff)}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )
      ) : isSiege ? (
        <>
          {top_contributors.length > 0 && (
            <CollapsibleSection
              title="🏰 貢獻 Top 5"
              isOpen={expandedSections.has("contributors")}
              onToggle={() => toggleSection("contributors")}
            >
              <RankingList members={top_contributors.slice(0, 5)} />
            </CollapsibleSection>
          )}
          {top_assisters.length > 0 && (
            <CollapsibleSection
              title="⚔️ 助攻 Top 5"
              isOpen={expandedSections.has("assisters")}
              onToggle={() => toggleSection("assisters")}
            >
              <RankingList members={top_assisters.slice(0, 5)} />
            </CollapsibleSection>
          )}
        </>
      ) : (
        top_members.length > 0 && (
          <CollapsibleSection
            title="🏆 戰功 Top 5"
            isOpen={expandedSections.has("top")}
            onToggle={() => toggleSection("top")}
          >
            <RankingList members={top_members.slice(0, 5)} />
          </CollapsibleSection>
        )
      )}
    </div>
  );
}

interface CollapsibleSectionProps {
  readonly title: string;
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full text-left py-1"
      >
        <span className={liffTypography.badge}>{title}</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && children}
    </div>
  );
}

interface RankingListProps {
  readonly members: ReadonlyArray<{
    rank: number;
    member_name: string;
    line_display_name: string | null;
    score: number;
  }>;
}

function RankingList({ members }: RankingListProps) {
  return (
    <div className="space-y-1.5 pt-2">
      {members.map((m) => (
        <div
          key={m.member_name}
          className="flex justify-between items-center text-xs"
        >
          <span className="flex items-center gap-1.5">
            <RankBadge rank={m.rank} size="sm" />
            <span className="font-medium">{m.member_name}</span>
            {m.line_display_name && (
              <span className="text-muted-foreground">
                ({m.line_display_name})
              </span>
            )}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {formatScore(m.score)}
          </span>
        </div>
      ))}
    </div>
  );
}

const PAGE_SIZE = 10;

export function BattleTab({ session }: Props) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [allEvents, setAllEvents] = useState<EventListItem[]>([]);
  const [offset, setOffset] = useState(0);
  const loadedOffsetsRef = useRef(new Set<number>());
  const hasPrefetchedRef = useRef(false);
  const queryClient = useQueryClient();

  const context = {
    lineUserId: session.lineUserId,
    lineGroupId: session.lineGroupId,
    lineDisplayName: session.lineDisplayName,
  };

  // Get registered accounts
  const { data: memberInfo, isLoading: isLoadingMember } =
    useLiffMemberInfo(context);

  // Auto-select first account
  const accounts = memberInfo?.registered_ids || [];
  const effectiveGameId = selectedGameId || accounts[0]?.game_id || null;

  // Reset pagination when account changes
  useEffect(() => {
    setOffset(0);
    setAllEvents([]);
    loadedOffsetsRef.current = new Set<number>();
    hasPrefetchedRef.current = false;
  }, [effectiveGameId]);

  // Get event list
  const eventContext = { lineGroupId: session.lineGroupId };
  const { data: eventList, isLoading: isLoadingEvents, isFetching } = useLiffEventList(
    eventContext,
    effectiveGameId,
    offset,
  );

  // Derive hasMore from query result (no separate state needed)
  const hasMore = eventList?.has_more ?? false;

  // Accumulate pages — use offset ref to prevent re-appending on background refetch
  useEffect(() => {
    if (!eventList) return;
    if (offset === 0) {
      setAllEvents(eventList.events);
      loadedOffsetsRef.current = new Set([0]);
    } else if (!loadedOffsetsRef.current.has(offset)) {
      loadedOffsetsRef.current.add(offset);
      setAllEvents((prev) => [...prev, ...eventList.events]);
    }
  }, [eventList, offset]);

  // Prefetch first 5 event reports (only on initial page load)
  useEffect(() => {
    if (hasPrefetchedRef.current || !allEvents.length) return;
    hasPrefetchedRef.current = true;
    allEvents.slice(0, 5).forEach((event) => {
      queryClient.prefetchQuery({
        queryKey: liffBattleKeys.report(session.lineGroupId, event.event_id),
        queryFn: () =>
          getEventReport({
            lineGroupId: session.lineGroupId,
            eventId: event.event_id,
          }),
        staleTime: 60_000,
      });
    });
  }, [allEvents, session.lineGroupId, queryClient]);

  const handleToggleEvent = (eventId: string) => {
    setExpandedEventId((prev) => (prev === eventId ? null : eventId));
  };

  // Loading state
  if (isLoadingMember) {
    return (
      <div className="py-8 text-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
      </div>
    );
  }

  // No registered accounts
  if (accounts.length === 0) {
    return (
      <div className="p-3 text-center">
        <p className={liffTypography.body}>請先至「ID 管理」綁定遊戲帳號</p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 pb-6">
      {/* Header: Account selector + Season */}
      <div className="flex items-center justify-between gap-2">
        {accounts.length > 1 ? (
          <AccountSelector
            accounts={accounts}
            value={effectiveGameId}
            onValueChange={setSelectedGameId}
            className="h-9 flex-1"
          />
        ) : (
          <span className={liffTypography.cardTitle}>{effectiveGameId}</span>
        )}
        {eventList?.season_name && (
          <span className={`${liffTypography.caption} shrink-0`}>
            {eventList.season_name}
          </span>
        )}
      </div>

      {/* Loading events */}
      {isLoadingEvents && (
        <div className="py-8 text-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
        </div>
      )}

      {/* Empty state — only show after loading completes with no results */}
      {!isLoadingEvents && !isFetching && allEvents.length === 0 && (
        <div className="py-8 text-center">
          <p className={liffTypography.body}>暫無戰役記錄</p>
        </div>
      )}

      {/* Event list */}
      {allEvents.length > 0 && (
        <div className="space-y-2">
          {allEvents.map((event) => (
            <EventCard
              key={event.event_id}
              event={event}
              isExpanded={expandedEventId === event.event_id}
              onToggle={() => handleToggleEvent(event.event_id)}
              lineGroupId={session.lineGroupId}
            />
          ))}
          {hasMore && (
            <button
              type="button"
              onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              disabled={isFetching}
              className="w-full py-2 text-sm text-primary hover:text-primary/80 disabled:opacity-50"
            >
              {isFetching ? "載入中..." : "載入更多"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
