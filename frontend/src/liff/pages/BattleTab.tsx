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

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EventBadge } from "@/components/ui/event-badge";
import { RankBadge } from "@/components/ui/rank-badge";
import { GroupProgress, ProgressBar } from "@/components/ui/progress-bar";
import { AccountSelector } from "../components/AccountSelector";
import { useLiffMemberInfo } from "../hooks/use-liff-member";
import {
  useLiffEventList,
  useLiffEventReportInline,
} from "../hooks/use-liff-battle";
import { type EventType } from "@/constants/event-types";
import { formatScore, formatEventTime } from "@/lib/format-utils";
import { liffTypography } from "@/lib/typography";
import type { LiffSessionWithGroup } from "../hooks/use-liff-session";
import type { EventListItem } from "../lib/liff-api-client";

interface Props {
  readonly session: LiffSessionWithGroup;
}

interface ParticipationBadgeProps {
  readonly event: EventListItem;
}

function ParticipationBadge({ event }: ParticipationBadgeProps) {
  const { user_participation: up, event_type, total_members } = event;

  if (event_type === "forbidden") {
    if (up.violated === true) {
      return (
        <span
          className={`${liffTypography.caption} text-red-500 dark:text-red-400`}
        >
          \u26A0 \u9055\u898F \u00B7 \u5171 {total_members}\u4EBA
        </span>
      );
    }
    return (
      <span
        className={`${liffTypography.caption} text-green-600 dark:text-green-400`}
      >
        \u2713 \u5B88\u898F \u00B7 \u5171 {total_members}\u4EBA
      </span>
    );
  }

  if (!up.participated) {
    return (
      <span className={liffTypography.caption}>
        \u2717 \u672A\u53C3\u8207 \u00B7 \u5171 {total_members}\u4EBA
      </span>
    );
  }

  const scoreText = up.score ? formatScore(up.score) : "";
  const label = up.score_label || "\u6230\u529F";

  return (
    <span
      className={`${liffTypography.caption} text-green-600 dark:text-green-400`}
    >
      \u2713 \u5DF2\u53C3\u8207 \u00B7 {label} {scoreText} #{up.rank}/
      {total_members}
    </span>
  );
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
  const timeStr = formatEventTime(event.event_start);

  return (
    <Card className={isExpanded ? "ring-1 ring-primary/20" : ""}>
      <button type="button" onClick={onToggle} className="w-full text-left">
        <CardContent className="py-3 px-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <EventBadge
                  type={event.event_type as EventType}
                  size="sm"
                  showLabel={false}
                />
                <span className={`${liffTypography.cardTitle} truncate`}>
                  {event.event_name}
                </span>
                {timeStr && (
                  <span className={`${liffTypography.caption} shrink-0`}>
                    {timeStr}
                  </span>
                )}
              </div>
              <div className="mt-1">
                <ParticipationBadge event={event} />
              </div>
            </div>
            <div className="shrink-0 pt-0.5">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
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
          \u7121\u6CD5\u8F09\u5165\u5831\u544A
        </p>
      </div>
    );
  }

  const {
    summary,
    group_stats,
    top_members,
    top_contributors,
    top_assisters,
    violators,
  } = report;
  const isForbidden = eventType === "forbidden";
  const isSiege = eventType === "siege";

  const mainRate = isForbidden
    ? summary.total_members > 0
      ? ((summary.total_members - summary.violator_count) /
          summary.total_members) *
        100
      : 0
    : summary.participation_rate;
  const mainRateLabel = isForbidden
    ? "\u5B88\u898F\u7387"
    : "\u51FA\u5E2D\u7387";
  const mainRateVariant = isForbidden
    ? summary.violator_count > 0
      ? "danger"
      : "success"
    : "success";

  return (
    <div className="px-3 pb-3 pt-2 border-t space-y-3">
      {/* Main stat - aligned with LINE Bot report */}
      <div className="bg-muted/30 rounded-lg p-3">
        <div className={`${liffTypography.metricLabel} text-center`}>
          \uD83D\uDCCA {mainRateLabel}
        </div>
        <div className="flex items-center justify-center gap-3 mt-1">
          <span
            className={`${liffTypography.metric} ${
              mainRateVariant === "danger"
                ? "text-red-500 dark:text-red-400"
                : "text-green-600 dark:text-green-400"
            }`}
          >
            {mainRate.toFixed(0)}%
          </span>
          <ProgressBar
            value={mainRate}
            variant={mainRateVariant === "danger" ? "danger" : "success"}
            size="md"
            className="w-24"
          />
        </div>
        <div className={`${liffTypography.caption} text-center mt-1`}>
          {isForbidden
            ? summary.violator_count > 0
              ? `${summary.violator_count} \u4EBA\u9055\u898F`
              : "\u5168\u54E1\u9075\u5B88\u898F\u5B9A \u2713"
            : `${summary.participated_count}/${summary.total_members}\u4EBA \u53C3\u6230`}
        </div>
      </div>

      {/* Group Stats with Progress Bars */}
      {group_stats.length > 0 && (
        <CollapsibleSection
          title={
            isForbidden
              ? "\u26A0\uFE0F \u5206\u7D44\u9055\u898F\u7D71\u8A08"
              : "\uD83C\uDFD8\uFE0F \u7D44\u5225\u51FA\u5E2D\u7387"
          }
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
                  \u7121\u9055\u898F\u8A18\u9304 \u2713
                </p>
              )}
          </div>
        </CollapsibleSection>
      )}

      {/* Rankings - aligned with LINE Bot report */}
      {isForbidden ? (
        violators.length > 0 && (
          <CollapsibleSection
            title="\u26A0\uFE0F \u9055\u898F\u540D\u55AE"
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
              title="\uD83C\uDFF0 \u8CA2\u7372 Top 5"
              isOpen={expandedSections.has("contributors")}
              onToggle={() => toggleSection("contributors")}
            >
              <RankingList members={top_contributors.slice(0, 5)} />
            </CollapsibleSection>
          )}
          {top_assisters.length > 0 && (
            <CollapsibleSection
              title="\u2694\uFE0F \u52A9\u653B Top 5"
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
            title="\uD83C\uDFC6 \u6230\u529F Top 5"
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

export function BattleTab({ session }: Props) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

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

  // Get event list
  const eventContext = { lineGroupId: session.lineGroupId };
  const { data: eventList, isLoading: isLoadingEvents } = useLiffEventList(
    eventContext,
    effectiveGameId,
  );

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
        <p className={liffTypography.body}>
          \u8ACB\u5148\u81F3\u300CID
          \u7BA1\u7406\u300D\u7D81\u5B9A\u904A\u6232\u5E33\u865F
        </p>
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

      {/* Event list */}
      {!isLoadingEvents && eventList && (
        <>
          {eventList.events.length === 0 ? (
            <div className="py-8 text-center">
              <p className={liffTypography.body}>
                \u66AB\u7121\u6230\u5F79\u8A18\u9304
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {eventList.events.map((event) => (
                <EventCard
                  key={event.event_id}
                  event={event}
                  isExpanded={expandedEventId === event.event_id}
                  onToggle={() => handleToggleEvent(event.event_id)}
                  lineGroupId={session.lineGroupId}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
