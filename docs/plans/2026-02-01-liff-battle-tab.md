# LIFF Battle Tab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "戰役" tab to LIFF home page that shows completed battle events with user participation status and inline expandable reports.

**Architecture:**
- Backend: New API endpoint `/linebot/events/list` returns completed events with user-specific participation metrics
- Frontend: New `BattleTab.tsx` component with inline expandable event cards, progressive disclosure for report sections

**Tech Stack:** FastAPI, Pydantic, React, TanStack Query, Tailwind CSS, shadcn/ui

---

## Task 1: Backend - Add Pydantic Models

**Files:**
- Modify: `backend/src/models/line_binding.py`

**Step 1: Add EventListItem and EventListResponse models**

Add to the end of the file (before the last line):

```python
# =============================================================================
# Event List Models (for LIFF Battle Tab)
# =============================================================================


class UserEventParticipation(BaseModel):
    """User's participation status in a battle event"""

    participated: bool = Field(..., description="Whether user participated")
    rank: int | None = Field(None, description="User's rank (if participated)")
    score: int | None = Field(None, description="Primary metric value")
    score_label: str | None = Field(None, description="Metric label: 戰功/貢獻/None")
    violated: bool | None = Field(None, description="For FORBIDDEN: whether user violated")


class EventListItem(BaseModel):
    """Single event item for LIFF battle list"""

    event_id: str = Field(..., description="Event UUID as string")
    event_name: str = Field(..., description="Event name")
    event_type: str = Field(..., description="battle/siege/forbidden")
    event_start: datetime | None = Field(None, description="Event start time")

    # Overall stats
    total_members: int = Field(..., ge=0, description="Total members tracked")
    participated_count: int = Field(..., ge=0, description="Members who participated")
    participation_rate: float = Field(..., ge=0, le=100, description="Participation rate")

    # User-specific participation
    user_participation: UserEventParticipation = Field(
        ..., description="Current user's participation in this event"
    )


class EventListResponse(BaseModel):
    """Response for LIFF event list endpoint"""

    season_name: str | None = Field(None, description="Current season name")
    events: list[EventListItem] = Field(default_factory=list, description="List of events")
```

**Step 2: Run linter to verify**

Run: `cd backend && uv run ruff check src/models/line_binding.py`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/models/line_binding.py
git commit -m "feat(models): add EventListItem and EventListResponse for LIFF battle tab"
```

---

## Task 2: Backend - Add Repository Method

**Files:**
- Modify: `backend/src/repositories/battle_event_metrics_repository.py`

**Step 1: Add get_user_metrics_for_events method**

Add this method to `BattleEventMetricsRepository` class:

```python
    async def get_user_metrics_for_events(
        self, event_ids: list[UUID], member_id: UUID
    ) -> dict[UUID, BattleEventMetrics | None]:
        """
        Get user's metrics for multiple events in a single query.

        Args:
            event_ids: List of event UUIDs
            member_id: Member UUID to lookup

        Returns:
            Dict mapping event_id -> BattleEventMetrics (or None if not found)

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not event_ids:
            return {}

        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("*")
            .in_("event_id", [str(eid) for eid in event_ids])
            .eq("member_id", str(member_id))
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        metrics_list = self._build_models(data)

        return {m.event_id: m for m in metrics_list}
```

**Step 2: Run linter to verify**

Run: `cd backend && uv run ruff check src/repositories/battle_event_metrics_repository.py`
Expected: No errors

**Step 3: Commit**

```bash
git add backend/src/repositories/battle_event_metrics_repository.py
git commit -m "feat(repo): add get_user_metrics_for_events for batch lookup"
```

---

## Task 3: Backend - Add Service Method

**Files:**
- Modify: `backend/src/services/line_binding_service.py`

**Step 1: Add imports at top of file**

Add these imports (merge with existing imports):

```python
from src.models.battle_event import EventCategory
from src.models.line_binding import (
    # ... existing imports ...
    EventListItem,
    EventListResponse,
    UserEventParticipation,
)
from src.repositories.battle_event_metrics_repository import BattleEventMetricsRepository
from src.repositories.battle_event_repository import BattleEventRepository
from src.repositories.season_repository import SeasonRepository
```

**Step 2: Add repositories to __init__**

Add to `__init__` method:

```python
    def __init__(self, repository: LineBindingRepository | None = None):
        self.repository = repository or LineBindingRepository()
        self._event_repo = BattleEventRepository()
        self._metrics_repo = BattleEventMetricsRepository()
        self._season_repo = SeasonRepository()
```

**Step 3: Add get_event_list_for_liff method**

Add this method to `LineBindingService` class (in the Performance Analytics Operations section):

```python
    async def get_event_list_for_liff(
        self, line_group_id: str, game_id: str
    ) -> EventListResponse:
        """
        Get list of completed events with user participation status for LIFF.

        Args:
            line_group_id: LINE group ID
            game_id: User's game ID to check participation

        Returns:
            EventListResponse with events and user participation status

        Raises:
            HTTPException 404: If group not bound
        """
        # 1. Get alliance from group binding
        group_binding = await self.repository.get_group_binding_by_line_group_id(line_group_id)
        if not group_binding:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="此群組尚未綁定同盟",
            )

        alliance_id = group_binding.alliance_id

        # 2. Get current season
        current_season = await self._season_repo.get_current_season(alliance_id)
        season_name = current_season.name if current_season else None
        season_id = current_season.id if current_season else None

        if not season_id:
            return EventListResponse(season_name=None, events=[])

        # 3. Get completed events for this season (limit 10 most recent)
        from src.models.battle_event import EventStatus

        events = await self._event_repo.get_by_season(season_id)
        completed_events = [e for e in events if e.status == EventStatus.COMPLETED][:10]

        if not completed_events:
            return EventListResponse(season_name=season_name, events=[])

        # 4. Get member_id from game_id
        member = await self.repository.get_member_by_game_id(alliance_id, game_id)
        member_id = member.id if member else None

        # 5. Batch fetch user's metrics for all events
        event_ids = [e.id for e in completed_events]
        user_metrics_map: dict = {}
        if member_id:
            user_metrics_map = await self._metrics_repo.get_user_metrics_for_events(
                event_ids, member_id
            )

        # 6. Batch fetch event summaries (avoid N+1)
        all_metrics_map = await self._metrics_repo.get_by_events_with_member_and_group(event_ids)

        # 7. Build response items
        items: list[EventListItem] = []
        for event in completed_events:
            event_metrics = all_metrics_map.get(event.id, [])

            # Calculate overall stats
            total_members = len(event_metrics)
            participated_count = sum(1 for m in event_metrics if m.participated)
            participation_rate = (
                (participated_count / total_members * 100) if total_members > 0 else 0.0
            )

            # User participation
            user_metric = user_metrics_map.get(event.id) if member_id else None
            user_participation = self._build_user_participation(
                user_metric, event.event_type, event_metrics
            )

            items.append(
                EventListItem(
                    event_id=str(event.id),
                    event_name=event.name,
                    event_type=event.event_type.value if event.event_type else "battle",
                    event_start=event.event_start,
                    total_members=total_members,
                    participated_count=participated_count,
                    participation_rate=round(participation_rate, 1),
                    user_participation=user_participation,
                )
            )

        return EventListResponse(season_name=season_name, events=items)

    def _build_user_participation(
        self,
        user_metric,
        event_type: EventCategory | None,
        all_metrics: list,
    ) -> UserEventParticipation:
        """Build user participation object based on event type."""
        if not user_metric:
            return UserEventParticipation(
                participated=False,
                rank=None,
                score=None,
                score_label=None,
                violated=None,
            )

        # Determine participation and score based on event type
        event_type = event_type or EventCategory.BATTLE

        if event_type == EventCategory.FORBIDDEN:
            # For forbidden: check if user violated (power_diff > 0)
            violated = user_metric.power_diff > 0
            return UserEventParticipation(
                participated=not violated,  # "participated" means compliance
                rank=None,
                score=None,
                score_label=None,
                violated=violated,
            )

        elif event_type == EventCategory.SIEGE:
            # For siege: use contribution as primary metric
            participated = user_metric.participated
            score = user_metric.contribution_diff + user_metric.assist_diff
            rank = self._calculate_rank(
                user_metric.contribution_diff + user_metric.assist_diff,
                all_metrics,
                lambda m: m.contribution_diff + m.assist_diff,
            ) if participated else None

            return UserEventParticipation(
                participated=participated,
                rank=rank,
                score=score if participated else None,
                score_label="貢獻" if participated else None,
                violated=None,
            )

        else:  # BATTLE
            # For battle: use merit as primary metric
            participated = user_metric.participated
            score = user_metric.merit_diff
            rank = self._calculate_rank(
                user_metric.merit_diff,
                all_metrics,
                lambda m: m.merit_diff,
            ) if participated else None

            return UserEventParticipation(
                participated=participated,
                rank=rank,
                score=score if participated else None,
                score_label="戰功" if participated else None,
                violated=None,
            )

    def _calculate_rank(self, user_score: int, all_metrics: list, score_fn) -> int:
        """Calculate user's rank based on score."""
        scores = sorted([score_fn(m) for m in all_metrics if m.participated], reverse=True)
        try:
            return scores.index(user_score) + 1
        except ValueError:
            return len(scores) + 1
```

**Step 4: Run linter**

Run: `cd backend && uv run ruff check src/services/line_binding_service.py`
Expected: No errors (fix any issues)

**Step 5: Commit**

```bash
git add backend/src/services/line_binding_service.py
git commit -m "feat(service): add get_event_list_for_liff for battle tab"
```

---

## Task 4: Backend - Add API Endpoint

**Files:**
- Modify: `backend/src/api/v1/endpoints/linebot.py`

**Step 1: Add import**

Add to existing imports from `src/models/line_binding`:

```python
from src.models.line_binding import (
    # ... existing imports ...
    EventListResponse,
)
```

**Step 2: Add endpoint**

Add this endpoint after the `/member/performance` endpoint (around line 330):

```python
@router.get(
    "/events/list",
    response_model=EventListResponse,
    summary="Get event list for LIFF",
    description="Get completed battle events with user participation status",
)
async def get_event_list_for_liff(
    service: LineBindingServiceDep,
    g: Annotated[str, Query(description="LINE group ID")],
    game_id: Annotated[str, Query(description="Game ID to check participation")],
) -> EventListResponse:
    """Get event list for LIFF battle tab"""
    return await service.get_event_list_for_liff(line_group_id=g, game_id=game_id)
```

**Step 3: Run linter**

Run: `cd backend && uv run ruff check src/api/v1/endpoints/linebot.py`
Expected: No errors

**Step 4: Commit**

```bash
git add backend/src/api/v1/endpoints/linebot.py
git commit -m "feat(api): add /linebot/events/list endpoint for LIFF battle tab"
```

---

## Task 5: Frontend - Add API Types and Client

**Files:**
- Modify: `frontend/src/liff/lib/liff-api-client.ts`

**Step 1: Add types after EventReportResponse**

Add after the `getEventReport` function:

```typescript
// Event List API (for Battle Tab)

export interface UserEventParticipation {
  participated: boolean;
  rank: number | null;
  score: number | null;
  score_label: string | null; // "戰功" | "貢獻" | null
  violated: boolean | null; // For FORBIDDEN events
}

export interface EventListItem {
  event_id: string;
  event_name: string;
  event_type: "battle" | "siege" | "forbidden";
  event_start: string | null;
  total_members: number;
  participated_count: number;
  participation_rate: number;
  user_participation: UserEventParticipation;
}

export interface EventListResponse {
  season_name: string | null;
  events: EventListItem[];
}

export async function getEventList(
  options: Pick<LiffApiOptions, "lineGroupId"> & { gameId: string },
): Promise<EventListResponse> {
  const url = new URL(`${API_BASE_URL}/api/v1/linebot/events/list`);
  url.searchParams.set("g", options.lineGroupId);
  url.searchParams.set("game_id", options.gameId);

  const response = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Request failed");
  }

  return response.json();
}
```

**Step 2: Run linter**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/liff/lib/liff-api-client.ts
git commit -m "feat(liff): add event list API types and client function"
```

---

## Task 6: Frontend - Add Hook

**Files:**
- Create: `frontend/src/liff/hooks/use-liff-battle.ts`

**Step 1: Create the hook file**

```typescript
/**
 * LIFF Battle Tab Hooks
 *
 * TanStack Query hooks for battle event list in LIFF.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getEventList,
  getEventReport,
  type EventListResponse,
  type EventReportResponse,
} from "../lib/liff-api-client";

interface LiffContext {
  lineGroupId: string;
}

// Query key factory
export const liffBattleKeys = {
  all: ["liff-battle"] as const,
  list: (groupId: string, gameId: string) =>
    [...liffBattleKeys.all, "list", groupId, gameId] as const,
  report: (groupId: string, eventId: string) =>
    [...liffBattleKeys.all, "report", groupId, eventId] as const,
};

export function useLiffEventList(
  context: LiffContext | null,
  gameId: string | null,
) {
  return useQuery<EventListResponse>({
    queryKey: liffBattleKeys.list(
      context?.lineGroupId ?? "",
      gameId ?? "",
    ),
    queryFn: () =>
      getEventList({
        lineGroupId: context!.lineGroupId,
        gameId: gameId!,
      }),
    enabled: !!context?.lineGroupId && !!gameId,
  });
}

export function useLiffEventReportInline(
  context: LiffContext | null,
  eventId: string | null,
) {
  return useQuery<EventReportResponse>({
    queryKey: liffBattleKeys.report(
      context?.lineGroupId ?? "",
      eventId ?? "",
    ),
    queryFn: () =>
      getEventReport({
        lineGroupId: context!.lineGroupId,
        eventId: eventId!,
      }),
    enabled: !!context?.lineGroupId && !!eventId,
  });
}
```

**Step 2: Run linter**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/liff/hooks/use-liff-battle.ts
git commit -m "feat(liff): add useLiffEventList and useLiffEventReportInline hooks"
```

---

## Task 7: Frontend - Create BattleTab Component

**Files:**
- Create: `frontend/src/liff/pages/BattleTab.tsx`

**Step 1: Create the component file**

```typescript
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useLiffMemberInfo } from "../hooks/use-liff-member";
import { useLiffEventList, useLiffEventReportInline } from "../hooks/use-liff-battle";
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

interface AccountSelectorProps {
  readonly accounts: ReadonlyArray<{ game_id: string }>;
  readonly value: string | null;
  readonly onValueChange: (value: string) => void;
  readonly className?: string;
}

function AccountSelector({
  accounts,
  value,
  onValueChange,
  className,
}: AccountSelectorProps) {
  if (accounts.length <= 1) return null;

  return (
    <Select value={value || ""} onValueChange={onValueChange}>
      <SelectTrigger className={className ?? "h-9"}>
        <SelectValue placeholder="選擇帳號" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((acc) => (
          <SelectItem key={acc.game_id} value={acc.game_id}>
            {acc.game_id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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

function EventCard({ event, isExpanded, onToggle, lineGroupId }: EventCardProps) {
  const config = EVENT_TYPE_CONFIG[event.event_type] || EVENT_TYPE_CONFIG.battle;
  const timeStr = formatEventTime(event.event_start);

  return (
    <Card className={isExpanded ? "ring-1 ring-primary/20" : ""}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left"
      >
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const context = { lineGroupId };
  const { data: report, isLoading } = useLiffEventReportInline(context, eventId);

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

  const { summary, group_stats, top_members, top_contributors, top_assisters, violators } = report;
  const isForbidden = eventType === "forbidden";
  const isSiege = eventType === "siege";

  const mainRate = isForbidden
    ? ((summary.total_members - summary.violator_count) / summary.total_members) * 100
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
              <div key={group.group_name} className="flex justify-between text-xs">
                <span className="truncate">{group.group_name}</span>
                {isForbidden ? (
                  <span className="text-red-500">{group.violator_count} 人違規</span>
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
            {isForbidden && group_stats.filter((g) => g.violator_count > 0).length === 0 && (
              <p className="text-xs text-green-600 text-center">無違規記錄 ✓</p>
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
                <div key={v.member_name} className="flex justify-between text-xs">
                  <span>
                    {i + 1}. {v.member_name}
                    {v.line_display_name && (
                      <span className="text-muted-foreground"> ({v.line_display_name})</span>
                    )}
                  </span>
                  <span className="text-red-500">+{formatScore(v.power_diff)}</span>
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
              <span className="text-muted-foreground"> ({m.line_display_name})</span>
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
              <p className="text-sm text-muted-foreground">
                暫無戰役記錄
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
```

**Step 2: Run linter**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/liff/pages/BattleTab.tsx
git commit -m "feat(liff): add BattleTab component with inline expandable reports"
```

---

## Task 8: Frontend - Integrate BattleTab into LiffHome

**Files:**
- Modify: `frontend/src/liff/pages/LiffHome.tsx`

**Step 1: Add import**

Add import for BattleTab:

```typescript
import { BattleTab } from "./BattleTab";
```

**Step 2: Update TabsList to include 3 tabs**

Change:

```typescript
<TabsList className="grid w-full grid-cols-2 h-9">
```

To:

```typescript
<TabsList className="grid w-full grid-cols-3 h-9">
```

**Step 3: Add the battle tab trigger**

After the performance TabsTrigger, add:

```typescript
<TabsTrigger value="battle" className="text-sm">
  戰役
</TabsTrigger>
```

**Step 4: Add the battle tab content**

After the performance TabsContent, add:

```typescript
<TabsContent value="battle" className="m-0">
  <BattleTab session={session} />
</TabsContent>
```

**Step 5: Run linter**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 6: Commit**

```bash
git add frontend/src/liff/pages/LiffHome.tsx
git commit -m "feat(liff): integrate BattleTab into LiffHome as third tab"
```

---

## Task 9: Backend - Add Missing Repository Method

**Files:**
- Modify: `backend/src/repositories/line_binding_repository.py`

**Step 1: Check if get_member_by_game_id exists**

Search the file for `get_member_by_game_id`. If it doesn't exist, add this method to `LineBindingRepository`:

```python
    async def get_member_by_game_id(self, alliance_id: UUID, game_id: str):
        """
        Get member by game ID within an alliance.

        Args:
            alliance_id: Alliance UUID
            game_id: Game ID (member name)

        Returns:
            Member record or None
        """
        result = await self._execute_async(
            lambda: self.client.from_("members")
            .select("*")
            .eq("alliance_id", str(alliance_id))
            .eq("name", game_id)
            .limit(1)
            .execute()
        )

        data = self._handle_supabase_result(result, allow_empty=True)
        if not data:
            return None

        from src.models.member import Member
        return Member(**data[0])
```

**Step 2: Run linter**

Run: `cd backend && uv run ruff check src/repositories/line_binding_repository.py`
Expected: No errors

**Step 3: Commit (if method was added)**

```bash
git add backend/src/repositories/line_binding_repository.py
git commit -m "feat(repo): add get_member_by_game_id to LineBindingRepository"
```

---

## Task 10: Verification and Final Commit

**Step 1: Run backend linter**

Run: `cd backend && uv run ruff check .`
Expected: No errors

**Step 2: Run frontend linter**

Run: `cd frontend && npm run lint`
Expected: No errors

**Step 3: Run TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Final commit (if any fixes were needed)**

```bash
git add -A
git commit -m "chore: fix linter issues for battle tab feature"
```

---

## Summary

This plan implements:

1. **Backend API** (`/linebot/events/list`) - Returns completed events with user participation metrics
2. **Frontend BattleTab** - Account selector, event list, inline expandable reports
3. **Progressive Disclosure** - Main stats visible immediately, sections expandable

Key design decisions:
- Reuses existing `getEventReport` API for detailed reports (no new endpoint needed)
- Follows existing patterns from PerformanceTab and CopperTab
- Type-aware participation display (battle/siege/forbidden)
- Mobile-optimized with collapsible sections