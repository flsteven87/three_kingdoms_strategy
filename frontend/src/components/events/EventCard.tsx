/**
 * EventCard - Collapsible Event Card with Inline Stats
 *
 * Single-row event display with expandable quick preview.
 * Follows the same pattern as SeasonCard for UI consistency.
 *
 * Design rationale:
 * - Collapsed: Show key metrics for quick scanning (duration, participation, absent count)
 * - Expanded: 3 KPI cards + stats row with MVP + compact box plot for merit distribution
 */

import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MiniMetricCard } from "@/components/ui/MiniMetricCard.tsx";
import {
  ChevronRight,
  CheckCircle,
  XCircle,
  UserPlus,
  Users,
  Swords,
  Clock,
  Trophy,
  Castle,
  ShieldAlert,
  Pencil,
} from "lucide-react";
import {
  formatNumberCompact,
  formatNumber,
  calculateBoxPlotStats,
} from "@/lib/chart-utils";
import { BoxPlot } from "@/components/analytics/BoxPlot";
import {
  getEventIcon,
  formatEventTime,
  getEventCategoryBadgeVariant,
  getEventTypeLabel,
  formatDuration,
  formatTimeRange,
  hasParticipationTracking,
  hasMvp,
  getPrimaryMetricLabel,
} from "@/lib/event-utils";
import type {
  EventListItem,
  EventSummary,
  EventMemberMetric,
} from "@/types/event";
import type { DistributionBin } from "@/types/analytics";
import { RoleGuard } from "@/components/alliance/RoleGuard";

// ============================================================================
// Types
// ============================================================================

interface EventCardProps {
  readonly event: EventListItem;
  readonly eventDetail?: {
    summary: EventSummary;
    metrics: readonly EventMemberMetric[];
    merit_distribution: readonly DistributionBin[];
  } | null;
  readonly onEdit?: (event: EventListItem) => void;
}

// ============================================================================
// Inline Stats (for collapsed state)
// ============================================================================

interface InlineStatsProps {
  readonly event: EventListItem;
}

function InlineStats({ event }: InlineStatsProps) {
  const duration = formatDuration(event.event_start, event.event_end);
  const timeDisplay = formatEventTime(event.event_start, event.event_end);
  const showParticipation = hasParticipationTracking(event.event_type);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      {/* Time range */}
      <span>{timeDisplay}</span>

      {/* Duration */}
      {duration && (
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {duration}
        </span>
      )}

      {/* Participation rate - only for siege/battle */}
      {showParticipation && event.participation_rate != null && (
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {event.participation_rate}%
        </span>
      )}

      {/* Total merit - only for battle */}
      {event.event_type === "battle" && event.total_merit != null && (
        <span className="flex items-center gap-1">
          <Swords className="h-3.5 w-3.5" />
          {formatNumberCompact(event.total_merit)}
        </span>
      )}

      {/* Absent count - only for siege/battle */}
      {showParticipation &&
        event.absent_count != null &&
        event.absent_count > 0 && (
          <span className="flex items-center gap-1 text-destructive font-medium">
            <XCircle className="h-3.5 w-3.5" />
            {event.absent_count} 人缺席
          </span>
        )}
    </div>
  );
}

// ============================================================================
// Expanded Content
// ============================================================================

interface ExpandedContentProps {
  readonly event: EventListItem;
  readonly eventDetail: {
    summary: EventSummary;
    metrics: readonly EventMemberMetric[];
  };
}

function ExpandedContent({ event, eventDetail }: ExpandedContentProps) {
  const navigate = useNavigate();
  const { summary, metrics } = eventDetail;
  const duration = formatDuration(event.event_start, event.event_end);
  const timeRange = formatTimeRange(event.event_start, event.event_end);
  const showParticipation = hasParticipationTracking(event.event_type);
  const showMvp = hasMvp(event.event_type);
  const isForbidden = event.event_type === "forbidden";

  // Calculate box plot stats based on event type
  const distributionStats = useMemo(() => {
    if (isForbidden) {
      // For forbidden: show power_diff distribution of violators
      const violatorValues = metrics
        .filter((m) => m.power_diff > 0)
        .map((m) => m.power_diff);
      return calculateBoxPlotStats(violatorValues);
    }
    // For siege/battle: show relevant metric distribution
    const participatedValues = metrics
      .filter((m) => m.participated)
      .map((m) =>
        event.event_type === "siege"
          ? m.contribution_diff + m.assist_diff
          : m.merit_diff,
      );
    return calculateBoxPlotStats(participatedValues);
  }, [metrics, event.event_type, isForbidden]);

  return (
    <div className="space-y-4">
      {/* KPI Grid - varies by category */}
      <div className="grid gap-3 grid-cols-3">
        {showParticipation ? (
          <MiniMetricCard
            title="參與率"
            value={`${summary.participation_rate}%`}
            subtitle={`${summary.participated_count}/${summary.total_members - summary.new_member_count} 人`}
            icon={<Users className="h-4 w-4" />}
          />
        ) : (
          <MiniMetricCard
            title="違規人數"
            value={String(summary.violator_count)}
            subtitle={summary.violator_count > 0 ? "有人偷打地" : "全員遵守"}
            icon={<ShieldAlert className="h-4 w-4" />}
          />
        )}

        {event.event_type === "battle" && (
          <MiniMetricCard
            title="總戰功"
            value={formatNumberCompact(summary.total_merit)}
            icon={<Swords className="h-4 w-4" />}
          />
        )}

        {event.event_type === "siege" && (
          <MiniMetricCard
            title="總貢獻"
            value={formatNumberCompact(summary.total_contribution)}
            subtitle={`助攻 ${formatNumberCompact(summary.total_assist)}`}
            icon={<Castle className="h-4 w-4" />}
          />
        )}

        {isForbidden && (
          <MiniMetricCard
            title="總成員"
            value={String(summary.total_members)}
            icon={<Users className="h-4 w-4" />}
          />
        )}

        <MiniMetricCard
          title="持續時間"
          value={duration ?? "-"}
          subtitle={timeRange ?? undefined}
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Stats Row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {showParticipation && (
          <>
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span>參與 {summary.participated_count} 人</span>
            </div>
            <div className="flex items-center gap-1.5">
              <XCircle className="h-4 w-4 text-destructive" />
              <span>缺席 {summary.absent_count} 人</span>
            </div>
          </>
        )}

        {summary.new_member_count > 0 && (
          <div className="flex items-center gap-1.5">
            <UserPlus className="h-4 w-4 text-yellow-500" />
            <span>新成員 {summary.new_member_count} 人</span>
          </div>
        )}

        {/* MVP - category specific */}
        {showMvp && summary.mvp_member_name && (
          <div className="flex items-center gap-1.5 ml-auto">
            <Trophy className="h-4 w-4 text-yellow-500" />
            <span className="font-medium">{summary.mvp_member_name}</span>
            {event.event_type === "battle" && summary.mvp_merit != null && (
              <span className="text-muted-foreground">
                ({formatNumber(summary.mvp_merit)})
              </span>
            )}
            {event.event_type === "siege" &&
              summary.mvp_combined_score != null && (
                <span className="text-muted-foreground">
                  ({formatNumber(summary.mvp_combined_score)})
                </span>
              )}
          </div>
        )}
      </div>

      {/* Distribution Box Plot */}
      {distributionStats && (
        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-2">
            {isForbidden
              ? "違規者勢力增加分佈"
              : `${getPrimaryMetricLabel(event.event_type)}分佈`}
          </p>
          <BoxPlot stats={distributionStats} showLabels={true} />
        </div>
      )}

      {/* View Detail Button */}
      <div className="flex justify-end pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/events/${event.id}`);
          }}
        >
          查看完整分析
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function EventCard({ event, eventDetail, onEdit }: EventCardProps) {
  const navigate = useNavigate();
  const Icon = getEventIcon(event.event_type);
  const eventTypeLabel = getEventTypeLabel(event.event_type);

  const handleViewDetail = useCallback(() => {
    navigate(`/events/${event.id}`);
  }, [event.id, navigate]);

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onEdit?.(event);
    },
    [event, onEdit],
  );

  const icon = <Icon className="h-4 w-4" />;

  const badge = (
    <Badge
      variant={getEventCategoryBadgeVariant(event.event_type)}
      className="text-xs"
    >
      {eventTypeLabel}
    </Badge>
  );

  const actions = (
    <div className="flex items-center gap-1">
      <RoleGuard requiredRoles={["owner", "collaborator"]}>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={handleEdit}
        >
          <Pencil className="h-4 w-4" />
          <span className="sr-only">編輯事件</span>
        </Button>
      </RoleGuard>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={(e) => {
          e.stopPropagation();
          handleViewDetail();
        }}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );

  // Use InlineStats component for collapsed description
  const description = <InlineStats event={event} />;

  return (
    <CollapsibleCard
      icon={icon}
      title={event.name}
      badge={badge}
      description={description}
      actions={actions}
      collapsible={true}
      defaultExpanded={false}
    >
      {eventDetail ? (
        <ExpandedContent
          event={event}
          eventDetail={{
            summary: eventDetail.summary,
            metrics: eventDetail.metrics,
          }}
        />
      ) : (
        <div className="py-8 text-center text-muted-foreground">
          <p className="text-sm">載入中...</p>
        </div>
      )}
    </CollapsibleCard>
  );
}
