/**
 * EventDetail - Full-page Event Analytics View
 *
 * Displays comprehensive analytics for a battle event in a single scrollable page.
 * Replaces the Sheet-based approach for better content density and UX.
 *
 * Sections:
 * 1. Header - Event name, type, time range
 * 2. KPI Grid - Key performance metrics
 * 3. Merit Distribution - Bar chart showing member distribution
 * 4. Member Ranking - Sortable table with all members
 * 5. Participation Summary - Visual breakdown of participation status
 */

import { useState, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AllianceGuard } from "@/components/alliance/AllianceGuard";
import { LineReportPreview } from "@/components/events/LineReportPreview";
import { useEventAnalytics, useEventGroupAnalytics } from "@/hooks/use-events";
import {
  ArrowLeft,
  Users,
  Swords,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle,
  XCircle,
  UserPlus,
  Medal,
  TrendingUp,
  MessageSquare,
  Castle,
  ShieldAlert,
} from "lucide-react";
import {
  Bar,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  ChartContainer,
  ChartConfig,
  ChartTooltip,
} from "@/components/ui/chart";
import {
  formatNumber,
  formatNumberCompact,
  calculateBoxPlotStats,
} from "@/lib/chart-utils";
import { BoxPlot } from "@/components/analytics/BoxPlot";
import {
  getEventIcon,
  formatEventTime,
  getEventTypeLabel,
  formatDuration,
  formatTimeRange,
  hasParticipationTracking,
  getPrimaryMetricLabel,
} from "@/lib/event-utils";
import type { EventCategory, EventMemberMetric } from "@/types/event";
import type { DistributionBin } from "@/types/analytics";

// ============================================================================
// Types
// ============================================================================

type SortField =
  | "member_name"
  | "group_name"
  | "merit_diff"
  | "assist_diff"
  | "contribution_diff"
  | "power_diff";
type SortDirection = "asc" | "desc";

// ============================================================================
// Chart Config
// ============================================================================

const distributionConfig = {
  count: { label: "人數", color: "var(--primary)" },
} satisfies ChartConfig;

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-96" />
    </div>
  );
}

// ============================================================================
// Not Found State
// ============================================================================

interface NotFoundStateProps {
  readonly onBack: () => void;
}

function NotFoundState({ onBack }: NotFoundStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Swords className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-xl font-semibold mb-2">找不到事件</h2>
      <p className="text-muted-foreground mb-6">該事件不存在或已被刪除</p>
      <Button onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        返回事件列表
      </Button>
    </div>
  );
}

// ============================================================================
// KPI Card Component
// ============================================================================

interface KpiCardProps {
  readonly title: string;
  readonly value: string | number;
  readonly subtitle?: string;
  readonly icon: ReactNode;
  readonly highlight?: boolean;
}

function KpiCard({ title, value, subtitle, icon, highlight }: KpiCardProps) {
  return (
    <Card className={highlight ? "border-primary/50" : ""}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Metric Distribution Section (Category-aware)
// ============================================================================

interface MetricDistributionProps {
  readonly distribution: readonly DistributionBin[];
  readonly eventType: EventCategory;
}

function MetricDistribution({
  distribution,
  eventType,
}: MetricDistributionProps) {
  if (distribution.length === 0) return null;

  const metricLabel = getPrimaryMetricLabel(eventType);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          {metricLabel}分佈
        </CardTitle>
        <CardDescription>各區間成員數量分佈</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={distributionConfig}
          className="h-[240px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[...distribution]}
              margin={{ left: 0, right: 0, top: 10, bottom: 10 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                className="stroke-muted"
                vertical={false}
              />
              <XAxis
                dataKey="range"
                tickLine={false}
                axisLine={false}
                className="text-xs"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                className="text-xs"
                width={35}
                tick={{ fontSize: 11 }}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as DistributionBin;
                  return (
                    <div className="rounded-lg border bg-background p-2.5 shadow-sm">
                      <div className="font-medium">
                        {metricLabel} {d.range}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {d.count} 人
                      </div>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="count"
                fill="var(--primary)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Member Ranking Section (Category-aware)
// ============================================================================

interface MemberRankingProps {
  readonly metrics: readonly EventMemberMetric[];
  readonly eventType: EventCategory;
  readonly medianValue?: number;
  readonly medianField?: SortField;
}

function MemberRanking({ metrics, eventType, medianValue, medianField }: MemberRankingProps) {
  const isBattle = eventType === "battle";
  const isSiege = eventType === "siege";
  const isForbidden = eventType === "forbidden";

  // Default sort field based on event type
  const defaultSortField: SortField = isForbidden
    ? "power_diff"
    : isSiege
      ? "contribution_diff"
      : "merit_diff";
  const [sortField, setSortField] = useState<SortField>(defaultSortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  // Find median member ID - member closest to median value
  const medianMemberId = (() => {
    if (medianValue === undefined || !medianField) return null;
    let closestMember: EventMemberMetric | null = null;
    let closestDiff = Infinity;
    for (const m of metrics) {
      const val = m[medianField];
      if (typeof val !== "number") continue;
      const diff = Math.abs(val - medianValue);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestMember = m;
      }
    }
    return closestMember?.id ?? null;
  })();

  const sortedMetrics = [...metrics].sort((a, b) => {
    // For FORBIDDEN, show violators (power_diff > 0) first
    if (isForbidden && sortField === "power_diff") {
      const aIsViolator = a.power_diff > 0;
      const bIsViolator = b.power_diff > 0;
      if (aIsViolator !== bIsViolator) {
        return sortDirection === "desc"
          ? aIsViolator
            ? -1
            : 1
          : aIsViolator
            ? 1
            : -1;
      }
    }

    const aVal = a[sortField];
    const bVal = b[sortField];

    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;

    const isString = sortField === "member_name" || sortField === "group_name";
    const diff = isString
      ? String(aVal).localeCompare(String(bVal), "zh-TW")
      : Number(aVal) - Number(bVal);

    return sortDirection === "asc" ? diff : -diff;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "member_name" ? "asc" : "desc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3.5 w-3.5 ml-1.5 opacity-50" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 ml-1.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 ml-1.5" />
    );
  };

  const getStatusBadge = (metric: EventMemberMetric) => {
    // For FORBIDDEN, show violator status
    if (isForbidden) {
      if (metric.power_diff > 0) {
        return <Badge variant="destructive">違規</Badge>;
      }
      return <Badge variant="default">遵守</Badge>;
    }

    // For BATTLE/SIEGE
    if (metric.is_new_member) {
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
          新成員
        </Badge>
      );
    }
    if (metric.is_absent) {
      return <Badge variant="destructive">缺席</Badge>;
    }
    if (metric.participated) {
      return <Badge variant="default">參與</Badge>;
    }
    return null;
  };

  const getMedalIcon = (index: number, metric: EventMemberMetric) => {
    // For FORBIDDEN, no medals (it's about compliance, not competition)
    if (isForbidden) return null;

    if (!metric.participated || index >= 3) return null;
    const colors = ["text-yellow-500", "text-gray-400", "text-amber-600"];
    return <Medal className={`h-4 w-4 ${colors[index]}`} />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Medal className="h-5 w-5" />
          {isForbidden ? "成員名單" : "成員排行"}
        </CardTitle>
        <CardDescription>點擊欄位標題排序</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-3 px-3 text-left w-12">#</th>
                <th className="py-3 px-3 text-left">
                  <button
                    type="button"
                    onClick={() => handleSort("member_name")}
                    className="flex items-center font-medium hover:text-primary transition-colors"
                  >
                    成員
                    {renderSortIcon("member_name")}
                  </button>
                </th>
                <th className="py-3 px-3 text-left">
                  <button
                    type="button"
                    onClick={() => handleSort("group_name")}
                    className="flex items-center font-medium hover:text-primary transition-colors"
                  >
                    組別
                    {renderSortIcon("group_name")}
                  </button>
                </th>
                {/* BATTLE: 戰功 */}
                {isBattle && (
                  <th className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("merit_diff")}
                      className="flex items-center justify-end w-full font-medium hover:text-primary transition-colors"
                    >
                      戰功
                      {renderSortIcon("merit_diff")}
                    </button>
                  </th>
                )}
                {/* SIEGE: 貢獻 + 助攻 */}
                {isSiege && (
                  <>
                    <th className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleSort("contribution_diff")}
                        className="flex items-center justify-end w-full font-medium hover:text-primary transition-colors"
                      >
                        貢獻
                        {renderSortIcon("contribution_diff")}
                      </button>
                    </th>
                    <th className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleSort("assist_diff")}
                        className="flex items-center justify-end w-full font-medium hover:text-primary transition-colors"
                      >
                        助攻
                        {renderSortIcon("assist_diff")}
                      </button>
                    </th>
                  </>
                )}
                {/* FORBIDDEN: 勢力增加 */}
                {isForbidden && (
                  <th className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleSort("power_diff")}
                      className="flex items-center justify-end w-full font-medium hover:text-primary transition-colors"
                    >
                      勢力增加
                      {renderSortIcon("power_diff")}
                    </button>
                  </th>
                )}
                <th className="py-3 px-3 text-center">狀態</th>
              </tr>
            </thead>
            <tbody>
              {sortedMetrics.map((m, index) => {
                const isMedianMember = m.id === medianMemberId;
                return (
                  <tr
                    key={m.id}
                    className={`border-b last:border-0 hover:bg-muted/50 transition-colors ${isMedianMember ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}
                  >
                    <td className="py-3 px-3 tabular-nums text-muted-foreground">
                      {index + 1}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {getMedalIcon(index, m)}
                        <span className="font-medium">{m.member_name}</span>
                        {isMedianMember && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                            Median
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-muted-foreground">
                      {m.group_name || "-"}
                    </td>
                    {/* BATTLE: 戰功 */}
                    {isBattle && (
                      <td className="py-3 px-3 text-right tabular-nums font-medium">
                        {formatNumber(m.merit_diff)}
                      </td>
                    )}
                    {/* SIEGE: 貢獻 + 助攻 */}
                    {isSiege && (
                      <>
                        <td className="py-3 px-3 text-right tabular-nums font-medium">
                          {formatNumber(m.contribution_diff)}
                        </td>
                        <td className="py-3 px-3 text-right tabular-nums">
                          {formatNumber(m.assist_diff)}
                        </td>
                      </>
                    )}
                    {/* FORBIDDEN: 勢力增加 */}
                    {isForbidden && (
                      <td
                        className={`py-3 px-3 text-right tabular-nums ${m.power_diff > 0 ? "text-destructive font-medium" : ""}`}
                      >
                        {m.power_diff > 0
                          ? `+${formatNumber(m.power_diff)}`
                          : formatNumber(m.power_diff)}
                      </td>
                    )}
                    <td className="py-3 px-3 text-center">{getStatusBadge(m)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Participation Summary Section
// ============================================================================

interface ParticipationSummaryProps {
  readonly metrics: readonly EventMemberMetric[];
}

function ParticipationSummary({ metrics }: ParticipationSummaryProps) {
  const participated = metrics.filter((m) => m.participated);
  const absent = metrics.filter((m) => m.is_absent);
  const newMembers = metrics.filter((m) => m.is_new_member);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Participated */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">
              參與成員 ({participated.length})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {participated.map((m) => (
              <Badge key={m.id} variant="secondary" className="text-xs">
                {m.member_name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Absent */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-destructive" />
            <CardTitle className="text-base">
              缺席成員 ({absent.length})
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            戰前存在但戰功為 0
          </CardDescription>
        </CardHeader>
        <CardContent>
          {absent.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {absent.map((m) => (
                <Badge key={m.id} variant="destructive" className="text-xs">
                  {m.member_name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">無缺席成員</p>
          )}
        </CardContent>
      </Card>

      {/* New Members */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-base">
              新成員 ({newMembers.length})
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            僅在戰後快照出現
          </CardDescription>
        </CardHeader>
        <CardContent>
          {newMembers.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {newMembers.map((m) => (
                <Badge
                  key={m.id}
                  variant="outline"
                  className="border-yellow-300 text-yellow-600 text-xs"
                >
                  {m.member_name}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">無新成員</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: eventDetail, isLoading, isError } = useEventAnalytics(eventId);

  // Fetch group analytics only when preview sheet is open
  const { data: groupAnalytics, isLoading: isGroupAnalyticsLoading } =
    useEventGroupAnalytics(eventId, { enabled: previewOpen });

  function handleBack() {
    navigate("/events");
  }

  if (isLoading) {
    return (
      <AllianceGuard>
        <div className="space-y-6">
          <LoadingSkeleton />
        </div>
      </AllianceGuard>
    );
  }

  if (isError || !eventDetail) {
    return (
      <AllianceGuard>
        <NotFoundState onBack={handleBack} />
      </AllianceGuard>
    );
  }

  const { event, summary, metrics, merit_distribution } = eventDetail;
  const Icon = getEventIcon(event.event_type);
  const eventTypeLabel = getEventTypeLabel(event.event_type);

  return (
    <AllianceGuard>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="mb-4 -ml-2"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            返回事件列表
          </Button>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight">
                  {event.name}
                </h1>
                {eventTypeLabel && (
                  <Badge variant="secondary">
                    <Icon className="h-3 w-3 mr-1" />
                    {eventTypeLabel}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>
                  {formatEventTime(event.event_start, event.event_end, {
                    includeDuration: true,
                    includeYear: true,
                  })}
                </span>
              </div>
            </div>

            {/* LINE Report Preview Button */}
            <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  LINE 報告預覽
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-full sm:max-w-md overflow-y-auto"
              >
                <SheetHeader>
                  <SheetTitle>LINE 報告預覽</SheetTitle>
                  <SheetDescription>
                    預覽 LINE Bot 將發送的戰役報告格式
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  <LineReportPreview
                    analytics={groupAnalytics}
                    isLoading={isGroupAnalyticsLoading}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* KPI Grid - Category-aware */}
        <div
          className={`grid gap-4 ${event.event_type === "siege" ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-3"}`}
        >
          {/* First KPI: Participation Rate (BATTLE/SIEGE) or Compliance Rate (FORBIDDEN) */}
          {hasParticipationTracking(event.event_type) ? (
            <KpiCard
              title="參與率"
              value={`${summary.participation_rate}%`}
              subtitle={`${summary.participated_count}/${summary.total_members - summary.new_member_count} 人`}
              icon={<Users className="h-5 w-5" />}
              highlight
            />
          ) : (
            <KpiCard
              title="守規率"
              value={`${summary.total_members > 0 ? (((summary.total_members - summary.violator_count) / summary.total_members) * 100).toFixed(1) : 100}%`}
              subtitle={
                summary.violator_count > 0
                  ? `${summary.violator_count} 人違規`
                  : "全員遵守"
              }
              icon={<Users className="h-5 w-5" />}
              highlight
            />
          )}

          {/* Second KPI: Category-specific metric */}
          {event.event_type === "battle" && (
            <KpiCard
              title="總戰功"
              value={formatNumberCompact(summary.total_merit)}
              icon={<Swords className="h-5 w-5" />}
              highlight
            />
          )}
          {/* SIEGE: Dual MVP KPIs */}
          {event.event_type === "siege" && (
            <>
              <KpiCard
                title="貢獻 MVP"
                value={summary.contribution_mvp_name ?? "-"}
                subtitle={
                  summary.contribution_mvp_score
                    ? formatNumberCompact(summary.contribution_mvp_score)
                    : undefined
                }
                icon={<Castle className="h-5 w-5" />}
                highlight
              />
              <KpiCard
                title="助攻 MVP"
                value={summary.assist_mvp_name ?? "-"}
                subtitle={
                  summary.assist_mvp_score
                    ? formatNumberCompact(summary.assist_mvp_score)
                    : undefined
                }
                icon={<Swords className="h-5 w-5" />}
                highlight
              />
            </>
          )}
          {event.event_type === "forbidden" && (
            <KpiCard
              title="違規人數"
              value={summary.violator_count}
              subtitle={`共 ${summary.total_members} 人`}
              icon={<ShieldAlert className="h-5 w-5" />}
              highlight={summary.violator_count > 0}
            />
          )}

          {/* Third/Fourth KPI: Duration */}
          <KpiCard
            title="持續時間"
            value={formatDuration(event.event_start, event.event_end) ?? "-"}
            subtitle={
              formatTimeRange(event.event_start, event.event_end) ?? undefined
            }
            icon={<Clock className="h-5 w-5" />}
          />
        </div>

        {/* Box Plot - Category-aware Distribution Overview */}
        {/* SIEGE: Dual Box Plots (Contribution + Assist) */}
        {event.event_type === "siege" &&
          (() => {
            const contributionValues = metrics
              .filter((m) => m.participated)
              .map((m) => m.contribution_diff);
            const assistValues = metrics
              .filter((m) => m.participated)
              .map((m) => m.assist_diff);
            const contributionStats = calculateBoxPlotStats(contributionValues);
            const assistStats = calculateBoxPlotStats(assistValues);

            if (!contributionStats && !assistStats) return null;

            return (
              <div className="grid gap-4 lg:grid-cols-2">
                {contributionStats && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Castle className="h-5 w-5" />
                        貢獻分佈
                      </CardTitle>
                      <CardDescription>
                        參與成員的貢獻統計 (Min / Q1 / Median / Q3 / Max)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BoxPlot stats={contributionStats} showLabels={true} />
                    </CardContent>
                  </Card>
                )}
                {assistStats && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Swords className="h-5 w-5" />
                        助攻分佈
                      </CardTitle>
                      <CardDescription>
                        參與成員的助攻統計 (Min / Q1 / Median / Q3 / Max)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <BoxPlot stats={assistStats} showLabels={true} />
                    </CardContent>
                  </Card>
                )}
              </div>
            );
          })()}

        {/* BATTLE / FORBIDDEN: Single Box Plot */}
        {event.event_type !== "siege" &&
          (() => {
            const isForbidden = event.event_type === "forbidden";
            const metricLabel = getPrimaryMetricLabel(event.event_type);

            // Calculate values based on event type
            let values: number[];
            if (isForbidden) {
              values = metrics
                .filter((m) => m.power_diff > 0)
                .map((m) => m.power_diff);
            } else {
              values = metrics
                .filter((m) => m.participated)
                .map((m) => m.merit_diff);
            }

            const stats = calculateBoxPlotStats(values);
            if (!stats) return null;

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    {isForbidden
                      ? "違規者勢力增加分佈"
                      : `${metricLabel}分佈概覽`}
                  </CardTitle>
                  <CardDescription>
                    {isForbidden
                      ? "違規成員的勢力增加統計 (Min / Q1 / Median / Q3 / Max)"
                      : `參與成員的${metricLabel}統計 (Min / Q1 / Median / Q3 / Max)`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BoxPlot stats={stats} showLabels={true} />
                </CardContent>
              </Card>
            );
          })()}

        {/* Metric Distribution (Category-aware) */}
        <MetricDistribution
          distribution={merit_distribution}
          eventType={event.event_type}
        />

        {/* Member Ranking (Category-aware) */}
        {(() => {
          // Calculate median for the primary metric based on event type
          let medianValue: number | undefined;
          let medianField: SortField | undefined;

          if (event.event_type === "siege") {
            const contributionValues = metrics
              .filter((m) => m.participated)
              .map((m) => m.contribution_diff);
            const stats = calculateBoxPlotStats(contributionValues);
            if (stats) {
              medianValue = stats.median;
              medianField = "contribution_diff";
            }
          } else if (event.event_type === "battle") {
            const meritValues = metrics
              .filter((m) => m.participated)
              .map((m) => m.merit_diff);
            const stats = calculateBoxPlotStats(meritValues);
            if (stats) {
              medianValue = stats.median;
              medianField = "merit_diff";
            }
          } else if (event.event_type === "forbidden") {
            const powerValues = metrics
              .filter((m) => m.power_diff > 0)
              .map((m) => m.power_diff);
            const stats = calculateBoxPlotStats(powerValues);
            if (stats) {
              medianValue = stats.median;
              medianField = "power_diff";
            }
          }

          return (
            <MemberRanking
              metrics={metrics}
              eventType={event.event_type}
              medianValue={medianValue}
              medianField={medianField}
            />
          );
        })()}

        {/* Participation Summary (only for BATTLE/SIEGE) */}
        {hasParticipationTracking(event.event_type) && (
          <ParticipationSummary metrics={metrics} />
        )}
      </div>
    </AllianceGuard>
  );
}

export { EventDetail };
