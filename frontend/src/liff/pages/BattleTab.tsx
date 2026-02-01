/**
 * Battle Tab
 *
 * Mobile-optimized battle event list for LIFF.
 * Features:
 * - Account selector (consistent with PerformanceTab)
 * - Event list with participation status
 * - Inline expandable event reports
 * - Progressive disclosure for report sections
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { AccountSelector } from "../components/AccountSelector";
import { useLiffMemberInfo } from "../hooks/use-liff-member";
import {
  useLiffEventList,
  useLiffEventReportInline,
} from "../hooks/use-liff-battle";
import type { LiffSessionWithGroup } from "../hooks/use-liff-session";
import type { EventListItem } from "../lib/liff-api-client";

interface Props {
  readonly session: LiffSessionWithGroup;
}

const EVENT_TYPE_CONFIG: Record<string, { icon: string; label: string }> = {
  battle: { icon: "⚔️", label: "戰役" },
  siege: { icon: "🏰", label: "攻城" },
  forbidden: { icon: "🚫", label: "禁地" },
};

function formatEventTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const utcStr =
    dateStr.endsWith("Z") || dateStr.includes("+") ? dateStr : `${dateStr}Z`;
  const date = new Date(utcStr);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatScore(score: number): string {
  if (score >= 10000) return `${(score / 10000).toFixed(1)}萬`;
  return score.toLocaleString();
}

interface ParticipationBadgeProps {
  readonly event: EventListItem;
}

function ParticipationBadge({ event }: ParticipationBadgeProps) {
  const { user_participation: up, event_type, total_members } = event;

  if (event_type === "forbidden") {
    // Forbidden: show compliance status
    if (up.violated === true) {
      return (
        <span className="text-xs text-red-500">
          ⚠ 違規 · 共 {total_members}人
        </span>
      );
    }
    return (
      <span className="text-xs text-green-600">
        ✓ 守規 · 共 {total_members}人
      </span>
    );
  }

  if (!up.participated) {
    return (
      <span className="text-xs text-muted-foreground">
        ✗ 未參與 · 共 {total_members}人
      </span>
    );
  }

  // Participated: show score and rank
  const scoreText = up.score ? formatScore(up.score) : "";
  const label = up.score_label || "戰功";

  return (
    <span className="text-xs text-green-600">
      ✓ 已參與 · {label} {scoreText} #{up.rank}/{total_members}
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
  const config =
    EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.battle;
  const timeStr = formatEventTime(event.event_start);

  return (
    <Card className={isExpanded ? "ring-1 ring-primary/20" : ""}>
      <button type="button" onClick={onToggle} className="w-full text-left">
        <CardContent className="py-3 px-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span>{config.icon}</span>
                <span className="font-medium text-sm truncate">
                  {event.event_name}
                </span>
                {timeStr && (
                  <span className="text-xs text-muted-foreground shrink-0">
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
    new Set(),
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
      <div className="px-4 pb-4 pt-2 border-t">
        <div className="flex justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="px-4 pb-4 pt-2 border-t">
        <p className="text-xs text-muted-foreground text-center py-2">
          無法載入報告
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
  const mainRateLabel = isForbidden ? "守規率" : "出席率";
  const mainRateColor = isForbidden
    ? summary.violator_count > 0
      ? "text-red-500"
      : "text-green-600"
    : "text-green-600";

  return (
    <div className="px-4 pb-4 pt-2 border-t space-y-3">
      {/* Main stat */}
      <div className="bg-muted/30 rounded-lg p-3 text-center">
        <div className="text-xs text-muted-foreground">{mainRateLabel}</div>
        <div className={`text-2xl font-bold ${mainRateColor}`}>
          {mainRate.toFixed(0)}%
        </div>
        <div className="text-xs text-muted-foreground">
          {isForbidden
            ? summary.violator_count > 0
              ? `${summary.violator_count} 人違規`
              : "全員遵守規定 ✓"
            : `${summary.participated_count}/${summary.total_members}人 參戰`}
        </div>
      </div>

      {/* Expandable: Group Stats */}
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
              <div
                key={group.group_name}
                className="flex justify-between text-xs"
              >
                <span className="truncate">{group.group_name}</span>
                {isForbidden ? (
                  <span className="text-red-500">
                    {group.violator_count} 人違規
                  </span>
                ) : (
                  <span>
                    {group.participated_count}/{group.member_count}
                    <span className="text-green-600 ml-1">
                      {group.participation_rate.toFixed(0)}%
                    </span>
                  </span>
                )}
              </div>
            ))}
            {isForbidden &&
              group_stats.filter((g) => g.violator_count > 0).length === 0 && (
                <p className="text-xs text-green-600 text-center">
                  無違規記錄 ✓
                </p>
              )}
          </div>
        </CollapsibleSection>
      )}

      {/* Expandable: Rankings */}
      {isForbidden ? (
        violators.length > 0 && (
          <CollapsibleSection
            title="⚠️ 違規名單"
            isOpen={expandedSections.has("violators")}
            onToggle={() => toggleSection("violators")}
          >
            <div className="space-y-1 pt-2">
              {violators.slice(0, 5).map((v, i) => (
                <div
                  key={v.member_name}
                  className="flex justify-between text-xs"
                >
                  <span>
                    {i + 1}. {v.member_name}
                    {v.line_display_name && (
                      <span className="text-muted-foreground">
                        {" "}
                        ({v.line_display_name})
                      </span>
                    )}
                  </span>
                  <span className="text-red-500">
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
        <span className="text-xs font-medium">{title}</span>
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
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
  const rankIcons: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

  return (
    <div className="space-y-1 pt-2">
      {members.map((m) => (
        <div key={m.member_name} className="flex justify-between text-xs">
          <span>
            <span className="w-5 inline-block">
              {rankIcons[m.rank] || `${m.rank}.`}
            </span>
            {m.member_name}
            {m.line_display_name && (
              <span className="text-muted-foreground">
                {" "}
                ({m.line_display_name})
              </span>
            )}
          </span>
          <span className="text-muted-foreground">{formatScore(m.score)}</span>
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
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
      </div>
    );
  }

  // No registered accounts
  if (accounts.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-muted-foreground">
          請先至「ID 管理」綁定遊戲帳號
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
          <span className="text-sm font-medium">{effectiveGameId}</span>
        )}
        {eventList?.season_name && (
          <span className="text-xs text-muted-foreground shrink-0">
            {eventList.season_name}
          </span>
        )}
      </div>

      {/* Loading events */}
      {isLoadingEvents && (
        <div className="py-8 text-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
        </div>
      )}

      {/* Event list */}
      {!isLoadingEvents && eventList && (
        <>
          {eventList.events.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">暫無戰役記錄</p>
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
