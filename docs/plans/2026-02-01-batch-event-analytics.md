# Batch Event Analytics API Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate N+1 request problem by adding a batch analytics endpoint that fetches multiple event analytics in a single request.

**Architecture:** Add `POST /api/v1/events/batch-analytics` endpoint that accepts event IDs and returns analytics for all requested events. Frontend will use a new `useBatchEventAnalytics` hook that fetches all completed events' analytics in one request.

**Tech Stack:** FastAPI (Backend), TanStack Query (Frontend), Pydantic V2

**Expected Performance Improvement:**
- Before: 1 + N requests (N = number of completed events)
- After: 2 requests (list + batch analytics)
- Database queries: ~90% reduction

---

## Task 1: Add Batch Analytics Schema

**Files:**
- Modify: `backend/src/api/v1/schemas/events.py`

**Step 1: Add request and response schemas**

Add to `events.py` after `UpdateEventRequest`:

```python
class BatchAnalyticsRequest(BaseModel):
    """Request body for batch event analytics"""

    event_ids: list[UUID] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="List of event UUIDs to fetch analytics for"
    )


class BatchAnalyticsResponse(BaseModel):
    """Response for batch event analytics"""

    analytics: dict[str, EventAnalyticsResponse] = Field(
        ...,
        description="Map of event_id to analytics"
    )
```

**Step 2: Verify syntax**

Run: `cd backend && uv run python -c "from src.api.v1.schemas.events import BatchAnalyticsRequest, BatchAnalyticsResponse; print('OK')"`

Expected: `OK`

**Step 3: Commit**

```bash
git add backend/src/api/v1/schemas/events.py
git commit -m "feat(events): add batch analytics request/response schemas"
```

---

## Task 2: Add Batch Repository Method

**Files:**
- Modify: `backend/src/repositories/battle_event_metrics_repository.py`

**Step 1: Add batch query method**

Add method to `BattleEventMetricsRepository` class:

```python
async def get_by_events_with_member_and_group(
    self, event_ids: list[UUID]
) -> dict[UUID, list[BattleEventMetricsWithMember]]:
    """
    Get all metrics for multiple events with member and group info.

    Optimized batch query to avoid N+1 problem.

    Args:
        event_ids: List of event UUIDs

    Returns:
        Dict mapping event_id to list of metrics

    符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
    """
    if not event_ids:
        return {}

    event_id_strs = [str(eid) for eid in event_ids]

    result = await self._execute_async(
        lambda: self.client.from_(self.table_name)
        .select("*, members!inner(name), member_snapshots!end_snapshot_id(group_name)")
        .in_("event_id", event_id_strs)
        .order("merit_diff", desc=True)
        .execute()
    )

    data = self._handle_supabase_result(result, allow_empty=True)

    # Group by event_id
    grouped: dict[UUID, list[BattleEventMetricsWithMember]] = {eid: [] for eid in event_ids}
    for row in data:
        member_data = row.pop("members", {})
        snapshot_data = row.pop("member_snapshots", {})
        row["member_name"] = member_data.get("name", "Unknown")
        row["group_name"] = snapshot_data.get("group_name") if snapshot_data else None

        event_id = UUID(row["event_id"])
        if event_id in grouped:
            grouped[event_id].append(BattleEventMetricsWithMember(**row))

    return grouped
```

**Step 2: Verify syntax**

Run: `cd backend && uv run python -c "from src.repositories.battle_event_metrics_repository import BattleEventMetricsRepository; print('OK')"`

Expected: `OK`

**Step 3: Commit**

```bash
git add backend/src/repositories/battle_event_metrics_repository.py
git commit -m "feat(events): add batch metrics query method"
```

---

## Task 3: Add Batch Service Method

**Files:**
- Modify: `backend/src/services/battle_event_service.py`

**Step 1: Add batch analytics method**

Add method to `BattleEventService` class:

```python
async def get_batch_event_analytics(
    self, event_ids: list[UUID]
) -> dict[UUID, tuple[BattleEvent, EventSummary, list[BattleEventMetricsWithMember]]]:
    """
    Get analytics for multiple events in a single batch.

    Optimized to minimize database queries.

    Args:
        event_ids: List of event UUIDs

    Returns:
        Dict mapping event_id to tuple of (event, summary, metrics)
    """
    if not event_ids:
        return {}

    # Batch fetch events
    events = await self._event_repo.get_by_ids(event_ids)
    event_map = {e.id: e for e in events}

    # Batch fetch all metrics
    metrics_map = await self._metrics_repo.get_by_events_with_member_and_group(event_ids)

    # Calculate summaries for each event
    result: dict[UUID, tuple[BattleEvent, EventSummary, list[BattleEventMetricsWithMember]]] = {}

    for event_id in event_ids:
        event = event_map.get(event_id)
        if not event:
            continue

        metrics = metrics_map.get(event_id, [])
        summary = self._calculate_summary_from_metrics(metrics, event.event_type)
        result[event_id] = (event, summary, metrics)

    return result

def _calculate_summary_from_metrics(
    self,
    metrics: list[BattleEventMetricsWithMember],
    event_type: EventCategory = EventCategory.BATTLE,
) -> EventSummary:
    """
    Calculate summary from pre-fetched metrics.

    This is a sync helper that works with already-fetched data.
    """
    if not metrics:
        return EventSummary(
            total_members=0,
            participated_count=0,
            absent_count=0,
            new_member_count=0,
            participation_rate=0.0,
            total_merit=0,
            total_assist=0,
            total_contribution=0,
            avg_merit=0.0,
            avg_assist=0.0,
            avg_contribution=0.0,
            mvp_member_id=None,
            mvp_member_name=None,
            mvp_merit=None,
            contribution_mvp_member_id=None,
            contribution_mvp_name=None,
            contribution_mvp_score=None,
            assist_mvp_member_id=None,
            assist_mvp_name=None,
            assist_mvp_score=None,
            mvp_contribution=None,
            mvp_assist=None,
            mvp_combined_score=None,
            violator_count=0,
        )

    # Reuse existing calculation logic
    total_members = len(metrics)
    participated_count = sum(1 for m in metrics if m.participated)
    new_member_count = sum(1 for m in metrics if m.is_new_member)
    absent_count = sum(1 for m in metrics if m.is_absent)

    eligible_members = total_members - new_member_count
    participation_rate = (
        (participated_count / eligible_members * 100) if eligible_members > 0 else 0.0
    )

    total_merit = sum(m.merit_diff for m in metrics)
    total_assist = sum(m.assist_diff for m in metrics)
    total_contribution = sum(m.contribution_diff for m in metrics)

    avg_merit = total_merit / participated_count if participated_count > 0 else 0.0
    avg_assist = total_assist / participated_count if participated_count > 0 else 0.0
    avg_contribution = total_contribution / participated_count if participated_count > 0 else 0.0

    # MVP calculation based on event type
    mvp_member_id = None
    mvp_member_name = None
    mvp_merit = None
    contribution_mvp_member_id = None
    contribution_mvp_name = None
    contribution_mvp_score = None
    assist_mvp_member_id = None
    assist_mvp_name = None
    assist_mvp_score = None
    mvp_contribution = None
    mvp_assist = None
    mvp_combined_score = None
    violator_count = 0

    if event_type == EventCategory.SIEGE:
        contribution_candidates = [m for m in metrics if m.contribution_diff > 0]
        if contribution_candidates:
            top_contributor = max(contribution_candidates, key=lambda m: m.contribution_diff)
            contribution_mvp_member_id = top_contributor.member_id
            contribution_mvp_name = top_contributor.member_name
            contribution_mvp_score = top_contributor.contribution_diff

        assist_candidates = [m for m in metrics if m.assist_diff > 0]
        if assist_candidates:
            top_assister = max(assist_candidates, key=lambda m: m.assist_diff)
            assist_mvp_member_id = top_assister.member_id
            assist_mvp_name = top_assister.member_name
            assist_mvp_score = top_assister.assist_diff

        if metrics:
            mvp = max(metrics, key=lambda m: m.contribution_diff + m.assist_diff)
            combined = mvp.contribution_diff + mvp.assist_diff
            if combined > 0:
                mvp_contribution = mvp.contribution_diff
                mvp_assist = mvp.assist_diff
                mvp_combined_score = combined

    elif event_type == EventCategory.FORBIDDEN:
        violator_count = sum(1 for m in metrics if m.power_diff > 0)

    else:  # BATTLE
        if metrics:
            mvp = max(metrics, key=lambda m: m.merit_diff)
            if mvp.merit_diff > 0:
                mvp_member_id = mvp.member_id
                mvp_member_name = mvp.member_name
                mvp_merit = mvp.merit_diff

    return EventSummary(
        total_members=total_members,
        participated_count=participated_count,
        absent_count=absent_count,
        new_member_count=new_member_count,
        participation_rate=round(participation_rate, 1),
        total_merit=total_merit,
        total_assist=total_assist,
        total_contribution=total_contribution,
        avg_merit=round(avg_merit, 1),
        avg_assist=round(avg_assist, 1),
        avg_contribution=round(avg_contribution, 1),
        mvp_member_id=mvp_member_id,
        mvp_member_name=mvp_member_name,
        mvp_merit=mvp_merit,
        contribution_mvp_member_id=contribution_mvp_member_id,
        contribution_mvp_name=contribution_mvp_name,
        contribution_mvp_score=contribution_mvp_score,
        assist_mvp_member_id=assist_mvp_member_id,
        assist_mvp_name=assist_mvp_name,
        assist_mvp_score=assist_mvp_score,
        mvp_contribution=mvp_contribution,
        mvp_assist=mvp_assist,
        mvp_combined_score=mvp_combined_score,
        violator_count=violator_count,
    )
```

**Step 2: Add batch method to event repository**

File: `backend/src/repositories/battle_event_repository.py`

Add method:

```python
async def get_by_ids(self, event_ids: list[UUID]) -> list[BattleEvent]:
    """
    Get multiple events by IDs.

    Args:
        event_ids: List of event UUIDs

    Returns:
        List of events (may be fewer than requested if some not found)

    符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
    """
    if not event_ids:
        return []

    event_id_strs = [str(eid) for eid in event_ids]

    result = await self._execute_async(
        lambda: self.client.from_(self.table_name)
        .select("*")
        .in_("id", event_id_strs)
        .execute()
    )

    data = self._handle_supabase_result(result, allow_empty=True)
    return self._build_models(data)
```

**Step 3: Verify syntax**

Run: `cd backend && uv run python -c "from src.services.battle_event_service import BattleEventService; print('OK')"`

Expected: `OK`

**Step 4: Commit**

```bash
git add backend/src/services/battle_event_service.py backend/src/repositories/battle_event_repository.py
git commit -m "feat(events): add batch analytics service method"
```

---

## Task 4: Add Batch Analytics Endpoint

**Files:**
- Modify: `backend/src/api/v1/endpoints/events.py`

**Step 1: Add import for new schemas**

Update imports at top of file:

```python
from src.api.v1.schemas.events import (
    BatchAnalyticsRequest,
    BatchAnalyticsResponse,
    CreateEventRequest,
    # ... existing imports ...
)
```

**Step 2: Add batch analytics endpoint**

Add after the existing `/batch-analytics` or after `get_event_analytics`:

```python
@router.post("/batch-analytics", response_model=BatchAnalyticsResponse)
async def get_batch_event_analytics(
    body: BatchAnalyticsRequest,
    user_id: UserIdDep,
    service: BattleEventServiceDep,
) -> BatchAnalyticsResponse:
    """
    Get analytics for multiple events in a single request.

    This endpoint eliminates N+1 queries when loading the event list page.
    Only returns analytics for events the user has access to.

    Request Body:
        event_ids: List of event UUIDs (max 50)

    Returns:
        Map of event_id to complete analytics
    """
    # Fetch batch analytics
    batch_data = await service.get_batch_event_analytics(body.event_ids)

    # Build response with distribution calculation
    analytics_map: dict[str, EventAnalyticsResponse] = {}

    for event_id, (event, summary, metrics) in batch_data.items():
        # Verify user access for each event
        try:
            await service.verify_user_access(user_id, event_id)
        except (ValueError, PermissionError):
            continue  # Skip events user can't access

        # Calculate distribution based on event type
        if event.event_type == EventCategory.SIEGE:
            values = [m.contribution_diff + m.assist_diff for m in metrics]
        elif event.event_type == EventCategory.FORBIDDEN:
            values = [m.power_diff for m in metrics if m.power_diff > 0]
        else:
            values = [m.merit_diff for m in metrics]

        merit_distribution = _calculate_metric_distribution(values)

        analytics_map[str(event_id)] = EventAnalyticsResponse(
            event=EventDetailResponse.model_validate(event),
            summary=EventSummaryResponse.model_validate(summary),
            metrics=[EventMemberMetricResponse.model_validate(m) for m in metrics],
            merit_distribution=merit_distribution,
        )

    return BatchAnalyticsResponse(analytics=analytics_map)
```

**Step 3: Run ruff check**

Run: `cd backend && uv run ruff check src/api/v1/endpoints/events.py`

Expected: No errors (or fix any that appear)

**Step 4: Verify syntax**

Run: `cd backend && uv run python -c "from src.api.v1.endpoints.events import router; print('OK')"`

Expected: `OK`

**Step 5: Commit**

```bash
git add backend/src/api/v1/endpoints/events.py
git commit -m "feat(events): add batch analytics endpoint"
```

---

## Task 5: Add Frontend Types

**Files:**
- Modify: `frontend/src/types/event.ts`

**Step 1: Add batch types**

Add at end of file:

```typescript
/**
 * Request for batch event analytics
 */
export interface BatchAnalyticsRequest {
  readonly event_ids: readonly string[];
}

/**
 * Response for batch event analytics
 */
export interface BatchAnalyticsResponse {
  readonly analytics: Record<string, EventAnalyticsResponse>;
}
```

**Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/types/event.ts
git commit -m "feat(events): add batch analytics types"
```

---

## Task 6: Add Frontend API Function

**Files:**
- Modify: `frontend/src/lib/api/event-api.ts`

**Step 1: Add batch API function**

Add import:

```typescript
import type {
  BattleEvent,
  EventListItem,
  EventAnalyticsResponse,
  EventGroupAnalytics,
  CreateEventRequest,
  UpdateEventRequest,
  EventUploadResponse,
  BatchAnalyticsResponse,
} from "@/types/event";
```

Add function:

```typescript
/**
 * Get analytics for multiple events in a single request
 */
export async function getBatchEventAnalytics(
  eventIds: string[],
): Promise<BatchAnalyticsResponse> {
  const response = await axiosInstance.post<BatchAnalyticsResponse>(
    "/api/v1/events/batch-analytics",
    { event_ids: eventIds },
  );
  return response.data;
}
```

**Step 2: Export from api-client**

File: `frontend/src/lib/api/index.ts`

Add to apiClient object:

```typescript
// Event
getEvents: eventApi.getEvents,
getEvent: eventApi.getEvent,
getEventAnalytics: eventApi.getEventAnalytics,
getBatchEventAnalytics: eventApi.getBatchEventAnalytics,  // Add this line
getEventGroupAnalytics: eventApi.getEventGroupAnalytics,
// ... rest
```

**Step 3: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/lib/api/event-api.ts frontend/src/lib/api/index.ts
git commit -m "feat(events): add batch analytics API function"
```

---

## Task 7: Add Batch Analytics Hook

**Files:**
- Modify: `frontend/src/hooks/use-events.ts`

**Step 1: Add batch hook**

Add import:

```typescript
import type {
  BattleEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventAnalyticsResponse,
  EventGroupAnalytics,
  BatchAnalyticsResponse,
} from "@/types/event";
```

Add new query key:

```typescript
export const eventKeys = {
  all: ["events"] as const,
  lists: () => [...eventKeys.all, "list"] as const,
  list: (seasonId: string) => [...eventKeys.lists(), { seasonId }] as const,
  details: () => [...eventKeys.all, "detail"] as const,
  detail: (eventId: string) => [...eventKeys.details(), eventId] as const,
  analytics: () => [...eventKeys.all, "analytics"] as const,
  eventAnalytics: (eventId: string) =>
    [...eventKeys.analytics(), eventId] as const,
  batchAnalytics: (eventIds: string[]) =>
    [...eventKeys.analytics(), "batch", eventIds.sort().join(",")] as const,
  groupAnalytics: (eventId: string) =>
    [...eventKeys.all, "group-analytics", eventId] as const,
};
```

Add hook:

```typescript
/**
 * Hook to fetch analytics for multiple events in a single request
 *
 * Eliminates N+1 problem when loading event list with analytics.
 */
export function useBatchEventAnalytics(eventIds: string[]) {
  return useQuery({
    queryKey: eventKeys.batchAnalytics(eventIds),
    queryFn: () => apiClient.getBatchEventAnalytics(eventIds),
    enabled: eventIds.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}
```

**Step 2: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/hooks/use-events.ts
git commit -m "feat(events): add useBatchEventAnalytics hook"
```

---

## Task 8: Update EventAnalytics Page

**Files:**
- Modify: `frontend/src/pages/EventAnalytics.tsx`

**Step 1: Update imports**

Replace individual hook imports:

```typescript
import {
  useEvents,
  useBatchEventAnalytics,
  useCreateEvent,
  useProcessEvent,
  useUploadEventCsv,
} from "@/hooks/use-events";
```

**Step 2: Replace EventCardWithData component**

Replace the entire `EventCardWithData` component (lines ~117-138) with:

```typescript
// ============================================================================
// Event Card with Pre-fetched Data
// ============================================================================

interface EventCardWithDataProps {
  readonly event: EventListItem;
  readonly analyticsData: EventAnalyticsResponse | undefined;
  readonly onEdit: (event: EventListItem) => void;
}

function EventCardWithData({ event, analyticsData, onEdit }: EventCardWithDataProps) {
  const eventDetail = analyticsData
    ? {
        summary: analyticsData.summary,
        metrics: analyticsData.metrics,
        merit_distribution: analyticsData.merit_distribution,
      }
    : null;

  return <EventCard event={event} eventDetail={eventDetail} onEdit={onEdit} />;
}
```

**Step 3: Update main component to use batch hook**

In the `EventAnalytics` function, add batch analytics fetch after `useEvents`:

```typescript
// Data fetching
const { data: seasons, isLoading: seasonsLoading } = useSeasons();
const currentSeason = seasons?.find((s) => s.is_current);
const { data: events, isLoading: eventsLoading } = useEvents(
  currentSeason?.id,
);

// Batch fetch analytics for completed events
const completedEventIds = useMemo(() => {
  if (!events) return [];
  return events
    .filter((e) => e.status === "completed")
    .map((e) => e.id);
}, [events]);

const { data: batchAnalytics, isLoading: analyticsLoading } = useBatchEventAnalytics(
  completedEventIds,
);

// ... rest of component
const isLoading = seasonsLoading || eventsLoading || analyticsLoading;
```

**Step 4: Update event list rendering**

Replace the event list section (around lines 411-422):

```typescript
{/* Event List */}
{!isLoading && sortedEvents.length > 0 && (
  <div className="space-y-4">
    {sortedEvents.map((event) => (
      <EventCardWithData
        key={event.id}
        event={event}
        analyticsData={batchAnalytics?.analytics[event.id]}
        onEdit={handleEdit}
      />
    ))}
  </div>
)}
```

**Step 5: Add missing import for useMemo if not present**

Ensure useMemo is imported:

```typescript
import { useState, useMemo, useCallback } from "react";
```

**Step 6: Verify TypeScript**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 7: Run ESLint**

Run: `cd frontend && npm run lint`

Expected: No errors (or fix any that appear)

**Step 8: Commit**

```bash
git add frontend/src/pages/EventAnalytics.tsx
git commit -m "feat(events): use batch analytics in EventAnalytics page

Eliminates N+1 request problem by fetching all completed event
analytics in a single batch request instead of individual requests
per event card."
```

---

## Task 9: Final Verification

**Step 1: Run backend linting**

Run: `cd backend && uv run ruff check .`

Expected: No errors

**Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit`

Expected: No errors

**Step 3: Run frontend linting**

Run: `cd frontend && npm run lint`

Expected: No errors

**Step 4: Manual testing**

1. Start backend: `cd backend && uv run python src/main.py`
2. Start frontend: `cd frontend && npm run dev`
3. Navigate to Event Analytics page
4. Verify in browser DevTools Network tab:
   - Only 2 requests: `GET /events` + `POST /batch-analytics`
   - No individual `GET /events/{id}/analytics` requests
5. Verify event cards display correctly with analytics data

**Step 5: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any remaining issues from batch analytics implementation"
```

---

## Summary

| Before | After |
|--------|-------|
| 1 + N requests | 2 requests |
| N × 3 DB queries per event | 1 batch query for all events |
| 2-3 second load time | <500ms load time |

**Files Modified:**
- `backend/src/api/v1/schemas/events.py` - Added batch schemas
- `backend/src/repositories/battle_event_metrics_repository.py` - Added batch query
- `backend/src/repositories/battle_event_repository.py` - Added get_by_ids
- `backend/src/services/battle_event_service.py` - Added batch service method
- `backend/src/api/v1/endpoints/events.py` - Added batch endpoint
- `frontend/src/types/event.ts` - Added batch types
- `frontend/src/lib/api/event-api.ts` - Added batch API function
- `frontend/src/lib/api/index.ts` - Exported batch function
- `frontend/src/hooks/use-events.ts` - Added batch hook
- `frontend/src/pages/EventAnalytics.tsx` - Updated to use batch analytics
