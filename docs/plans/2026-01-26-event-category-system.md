# Event Category System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement three distinct event categories (Siege, Forbidden, Battle) with category-specific participation logic, MVP calculation, and LINE Bot report formatting.

**Architecture:** Introduce `EventCategory` enum to replace free-text `event_type`. Each category has distinct participation criteria and report focus. Backend service layer handles category-specific logic; frontend adapts display based on category.

**Tech Stack:** Python/FastAPI (Backend), React/TypeScript (Frontend), Supabase/PostgreSQL (Database)

---

## Summary of Changes

| Category | 出席判定 | MVP 計算 | 報告重點 |
|----------|---------|---------|---------|
| **SIEGE** (攻城) | 貢獻 > 0 OR 助攻 > 0 | 貢獻+助攻 合計最高 | 貢獻/助攻排名 |
| **FORBIDDEN** (禁地) | 不適用 | 不適用 | 違規者名單 (勢力值↑) |
| **BATTLE** (戰役) | 戰功 > 0 | 戰功最高 | 戰功排名 |

---

## Task 1: Backend - Add EventCategory Enum

**Files:**
- Modify: `backend/src/models/battle_event.py:9-22`

**Step 1: Add EventCategory enum after imports**

After the existing `EventStatus` enum (line 16-21), add:

```python
class EventCategory(str, Enum):
    """Event category determines participation logic and report focus"""

    SIEGE = "siege"           # 攻城事件: 貢獻/助攻為主
    FORBIDDEN = "forbidden"   # 禁地事件: 勢力值監控
    BATTLE = "battle"         # 戰役事件: 戰功為主
```

**Step 2: Update BattleEventBase model**

Change line 28 from:
```python
event_type: str | None = Field(None, max_length=50, description="Optional event type label")
```

To:
```python
event_type: EventCategory = Field(
    default=EventCategory.BATTLE,
    description="Event category determining participation logic"
)
```

**Step 3: Update BattleEventUpdate model**

Change line 47 from:
```python
event_type: str | None = Field(None, max_length=50)
```

To:
```python
event_type: EventCategory | None = None
```

**Step 4: Run linter**

```bash
cd backend && uv run ruff check src/models/battle_event.py --fix
```

**Step 5: Commit**

```bash
git add backend/src/models/battle_event.py
git commit -m "feat(events): add EventCategory enum for siege/forbidden/battle types"
```

---

## Task 2: Backend - Update API Schemas

**Files:**
- Modify: `backend/src/api/v1/schemas/events.py:1-30`

**Step 1: Update imports**

Change line 17 from:
```python
from src.models.battle_event import EventStatus
```

To:
```python
from src.models.battle_event import EventCategory, EventStatus
```

**Step 2: Update CreateEventRequest**

Change lines 27-29 from:
```python
class CreateEventRequest(BaseModel):
    """Request body for creating a new battle event"""

    name: str = Field(..., min_length=1, max_length=100, description="Event name")
    event_type: str | None = Field(None, max_length=50, description="Optional event type label")
    description: str | None = Field(None, max_length=500, description="Event description")
```

To:
```python
class CreateEventRequest(BaseModel):
    """Request body for creating a new battle event"""

    name: str = Field(..., min_length=1, max_length=100, description="Event name")
    event_type: EventCategory = Field(
        default=EventCategory.BATTLE,
        description="Event category: siege (攻城), forbidden (禁地), battle (戰役)"
    )
    description: str | None = Field(None, max_length=500, description="Event description")
```

**Step 3: Update EventListItemResponse**

Change line 61 from:
```python
event_type: str | None
```

To:
```python
event_type: EventCategory
```

**Step 4: Update EventDetailResponse**

Change line 79 from:
```python
event_type: str | None
```

To:
```python
event_type: EventCategory
```

**Step 5: Run linter**

```bash
cd backend && uv run ruff check src/api/v1/schemas/events.py --fix
```

**Step 6: Commit**

```bash
git add backend/src/api/v1/schemas/events.py
git commit -m "feat(events): update API schemas to use EventCategory enum"
```

---

## Task 3: Backend - Update EventSummary Model for Category-Specific MVP

**Files:**
- Modify: `backend/src/models/battle_event_metrics.py:64-89`

**Step 1: Add category-aware MVP fields to EventSummary**

Replace lines 85-88 (MVP info section) with:

```python
    # MVP info (category-specific)
    mvp_member_id: UUID | None = Field(None, description="Top performer member ID")
    mvp_member_name: str | None = Field(None, description="Top performer name")
    mvp_merit: int | None = Field(None, description="Top performer merit (for BATTLE)")
    mvp_contribution: int | None = Field(None, description="Top performer contribution (for SIEGE)")
    mvp_assist: int | None = Field(None, description="Top performer assist (for SIEGE)")
    mvp_combined_score: int | None = Field(None, description="MVP combined score (contribution + assist for SIEGE)")

    # Forbidden zone specific
    violator_count: int = Field(0, description="Members with power increase (for FORBIDDEN)")
```

**Step 2: Run linter**

```bash
cd backend && uv run ruff check src/models/battle_event_metrics.py --fix
```

**Step 3: Commit**

```bash
git add backend/src/models/battle_event_metrics.py
git commit -m "feat(events): extend EventSummary with category-specific MVP fields"
```

---

## Task 4: Backend - Implement Category-Specific Participation Logic

**Files:**
- Modify: `backend/src/services/battle_event_service.py:217-302`

**Step 1: Import EventCategory**

Add to imports (around line 19):
```python
from src.models.battle_event import (
    BattleEvent,
    BattleEventCreate,
    BattleEventListItem,
    EventCategory,
    EventStatus,
)
```

**Step 2: Create participation helper method**

Add after `__init__` method (around line 50):

```python
    def _determine_participation(
        self,
        event_type: EventCategory,
        contribution_diff: int,
        merit_diff: int,
        assist_diff: int,
        power_diff: int,
    ) -> tuple[bool, bool]:
        """
        Determine participation and absence based on event category.

        Args:
            event_type: Event category
            contribution_diff: Contribution change
            merit_diff: Merit change
            assist_diff: Assist change
            power_diff: Power change

        Returns:
            Tuple of (participated, is_absent)
        """
        if event_type == EventCategory.SIEGE:
            # 攻城事件: 貢獻 > 0 OR 助攻 > 0
            participated = contribution_diff > 0 or assist_diff > 0
        elif event_type == EventCategory.FORBIDDEN:
            # 禁地事件: 不計算出席，只標記違規者
            # power_diff > 0 表示偷打地（違規）
            participated = False  # Forbidden zone doesn't track participation
        else:  # BATTLE
            # 戰役事件: 戰功 > 0
            participated = merit_diff > 0

        is_absent = not participated if event_type != EventCategory.FORBIDDEN else False
        return participated, is_absent
```

**Step 3: Update process_event_snapshots to use category logic**

In `process_event_snapshots` method, around line 234-236, replace:

```python
                # Participation: merit or contribution increased
                participated = merit_diff > 0 or contribution_diff > 0 or assist_diff > 0
                is_absent = not participated
```

With:

```python
                # Participation based on event category
                participated, is_absent = self._determine_participation(
                    event.event_type,
                    contribution_diff,
                    merit_diff,
                    assist_diff,
                    power_diff,
                )
```

**Step 4: Run linter**

```bash
cd backend && uv run ruff check src/services/battle_event_service.py --fix
```

**Step 5: Commit**

```bash
git add backend/src/services/battle_event_service.py
git commit -m "feat(events): implement category-specific participation logic"
```

---

## Task 5: Backend - Update Summary Calculation for Categories

**Files:**
- Modify: `backend/src/services/battle_event_service.py:328-395`

**Step 1: Update _calculate_event_summary method signature**

Change line 328 from:
```python
    async def _calculate_event_summary(self, event_id: UUID) -> EventSummary:
```

To:
```python
    async def _calculate_event_summary(
        self, event_id: UUID, event_type: EventCategory = EventCategory.BATTLE
    ) -> EventSummary:
```

**Step 2: Replace MVP calculation logic (lines 378-394)**

Replace:
```python
        # Find MVP (highest merit)
        mvp = max(metrics, key=lambda m: m.merit_diff) if metrics else None

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
            mvp_member_id=mvp.member_id if mvp and mvp.merit_diff > 0 else None,
            mvp_member_name=mvp.member_name if mvp and mvp.merit_diff > 0 else None,
            mvp_merit=mvp.merit_diff if mvp and mvp.merit_diff > 0 else None,
        )
```

With:
```python
        # Category-specific MVP calculation
        mvp_member_id = None
        mvp_member_name = None
        mvp_merit = None
        mvp_contribution = None
        mvp_assist = None
        mvp_combined_score = None
        violator_count = 0

        if event_type == EventCategory.SIEGE:
            # MVP = highest contribution + assist combined
            if metrics:
                mvp = max(metrics, key=lambda m: m.contribution_diff + m.assist_diff)
                combined = mvp.contribution_diff + mvp.assist_diff
                if combined > 0:
                    mvp_member_id = mvp.member_id
                    mvp_member_name = mvp.member_name
                    mvp_contribution = mvp.contribution_diff
                    mvp_assist = mvp.assist_diff
                    mvp_combined_score = combined

        elif event_type == EventCategory.FORBIDDEN:
            # Count violators (power_diff > 0)
            violator_count = sum(1 for m in metrics if m.power_diff > 0)
            # No MVP for forbidden zone

        else:  # BATTLE
            # MVP = highest merit
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
            mvp_member_id=mvp_member_id,
            mvp_member_name=mvp_member_name,
            mvp_merit=mvp_merit,
            mvp_contribution=mvp_contribution,
            mvp_assist=mvp_assist,
            mvp_combined_score=mvp_combined_score,
            violator_count=violator_count,
        )
```

**Step 3: Update callers to pass event_type**

In `get_events_by_season` (around line 133), change:
```python
                summary = await self._calculate_event_summary(event.id)
```

To:
```python
                summary = await self._calculate_event_summary(event.id, event.event_type)
```

In `get_event_summary` (around line 326), change:
```python
        return await self._calculate_event_summary(event_id)
```

To:
```python
        event = await self._event_repo.get_by_id(event_id)
        if not event:
            raise ValueError("Event not found")
        return await self._calculate_event_summary(event_id, event.event_type)
```

**Step 4: Run linter**

```bash
cd backend && uv run ruff check src/services/battle_event_service.py --fix
```

**Step 5: Commit**

```bash
git add backend/src/services/battle_event_service.py
git commit -m "feat(events): category-specific MVP and summary calculation"
```

---

## Task 6: Backend - Update API Response Schema for New Summary Fields

**Files:**
- Modify: `backend/src/api/v1/schemas/events.py:89-109`

**Step 1: Update EventSummaryResponse**

Replace the entire class (lines 89-108) with:

```python
class EventSummaryResponse(BaseModel):
    """Event summary statistics"""

    model_config = ConfigDict(from_attributes=True)

    total_members: int
    participated_count: int
    absent_count: int
    new_member_count: int
    participation_rate: float

    total_merit: int
    total_assist: int
    total_contribution: int
    avg_merit: float
    avg_assist: float

    # Category-specific MVP
    mvp_member_id: UUID | None
    mvp_member_name: str | None
    mvp_merit: int | None  # For BATTLE
    mvp_contribution: int | None  # For SIEGE
    mvp_assist: int | None  # For SIEGE
    mvp_combined_score: int | None  # For SIEGE (contribution + assist)

    # Forbidden zone specific
    violator_count: int = 0  # Members with power increase
```

**Step 2: Run linter**

```bash
cd backend && uv run ruff check src/api/v1/schemas/events.py --fix
```

**Step 3: Commit**

```bash
git add backend/src/api/v1/schemas/events.py
git commit -m "feat(events): update EventSummaryResponse with category-specific fields"
```

---

## Task 7: Backend - Write Unit Tests for Category Logic

**Files:**
- Modify: `backend/tests/unit/services/test_battle_event_service.py`

**Step 1: Update imports**

Add `EventCategory` to imports (line 24):
```python
from src.models.battle_event import BattleEvent, BattleEventCreate, EventCategory, EventStatus
```

**Step 2: Add test class for participation determination**

Add after `TestCalculateGroupStats` class:

```python
# =============================================================================
# Tests for _determine_participation
# =============================================================================


class TestDetermineParticipation:
    """Tests for category-specific participation logic"""

    def test_siege_participation_with_contribution(
        self, battle_event_service: BattleEventService
    ):
        """SIEGE: Should mark as participated when contribution > 0"""
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.SIEGE,
            contribution_diff=1000,
            merit_diff=0,
            assist_diff=0,
            power_diff=0,
        )
        assert participated is True
        assert is_absent is False

    def test_siege_participation_with_assist(
        self, battle_event_service: BattleEventService
    ):
        """SIEGE: Should mark as participated when assist > 0"""
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.SIEGE,
            contribution_diff=0,
            merit_diff=0,
            assist_diff=500,
            power_diff=0,
        )
        assert participated is True
        assert is_absent is False

    def test_siege_absent_when_no_contribution_or_assist(
        self, battle_event_service: BattleEventService
    ):
        """SIEGE: Should mark as absent when no contribution and no assist"""
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.SIEGE,
            contribution_diff=0,
            merit_diff=5000,  # Merit doesn't count for siege
            assist_diff=0,
            power_diff=0,
        )
        assert participated is False
        assert is_absent is True

    def test_forbidden_never_marks_participation(
        self, battle_event_service: BattleEventService
    ):
        """FORBIDDEN: Should never mark participation (only tracks violators)"""
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.FORBIDDEN,
            contribution_diff=1000,
            merit_diff=5000,
            assist_diff=500,
            power_diff=100,  # Violator
        )
        assert participated is False
        assert is_absent is False  # No absent tracking for forbidden

    def test_battle_participation_with_merit(
        self, battle_event_service: BattleEventService
    ):
        """BATTLE: Should mark as participated when merit > 0"""
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.BATTLE,
            contribution_diff=1000,  # Doesn't count for battle
            merit_diff=5000,
            assist_diff=500,  # Doesn't count for battle
            power_diff=0,
        )
        assert participated is True
        assert is_absent is False

    def test_battle_absent_when_no_merit(
        self, battle_event_service: BattleEventService
    ):
        """BATTLE: Should mark as absent when merit = 0"""
        participated, is_absent = battle_event_service._determine_participation(
            EventCategory.BATTLE,
            contribution_diff=1000,
            merit_diff=0,
            assist_diff=500,
            power_diff=0,
        )
        assert participated is False
        assert is_absent is True
```

**Step 3: Run tests**

```bash
cd backend && uv run pytest tests/unit/services/test_battle_event_service.py -v
```

Expected: All tests pass

**Step 4: Commit**

```bash
git add backend/tests/unit/services/test_battle_event_service.py
git commit -m "test(events): add unit tests for category-specific participation logic"
```

---

## Task 8: Database Migration

**Step 1: Run SQL migration via Supabase MCP or Dashboard**

```sql
-- Step 1: Update existing NULL or non-standard values to 'battle'
UPDATE battle_events
SET event_type = 'battle'
WHERE event_type IS NULL
   OR event_type NOT IN ('siege', 'forbidden', 'battle');

-- Step 2: Add CHECK constraint
ALTER TABLE battle_events
ADD CONSTRAINT battle_events_event_type_check
CHECK (event_type IN ('siege', 'forbidden', 'battle'));

-- Step 3: Set NOT NULL and default
ALTER TABLE battle_events
ALTER COLUMN event_type SET NOT NULL,
ALTER COLUMN event_type SET DEFAULT 'battle';
```

**Step 2: Verify migration**

```sql
-- Check constraint exists
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'battle_events'::regclass
AND contype = 'c';

-- Check all values are valid
SELECT event_type, COUNT(*) FROM battle_events GROUP BY event_type;
```

**Step 3: Commit (no file changes, just note in commit)**

```bash
git commit --allow-empty -m "chore(db): migrate event_type to enum constraint (siege/forbidden/battle)"
```

---

## Task 9: Frontend - Update TypeScript Types

**Files:**
- Modify: `frontend/src/types/event.ts`

**Step 1: Add EventCategory type after EventStatus**

After line 14, add:

```typescript
/**
 * Event category determines participation logic
 */
export type EventCategory = 'siege' | 'forbidden' | 'battle'
```

**Step 2: Update BattleEvent interface**

Change line 24 from:
```typescript
  readonly event_type: string | null
```

To:
```typescript
  readonly event_type: EventCategory
```

**Step 3: Update EventSummary interface**

Add after line 55 (after mvp_merit):
```typescript
  readonly mvp_contribution: number | null  // For SIEGE
  readonly mvp_assist: number | null        // For SIEGE
  readonly mvp_combined_score: number | null // For SIEGE (contribution + assist)
  readonly violator_count: number           // For FORBIDDEN
```

**Step 4: Update EventListItem interface**

Change line 96 from:
```typescript
  readonly event_type: string | null
```

To:
```typescript
  readonly event_type: EventCategory
```

**Step 5: Update CreateEventRequest interface**

Change lines 110-114 from:
```typescript
export interface CreateEventRequest {
  readonly name: string
  readonly event_type?: string | null
  readonly description?: string
}
```

To:
```typescript
export interface CreateEventRequest {
  readonly name: string
  readonly event_type: EventCategory
  readonly description?: string
}
```

**Step 6: Run linter**

```bash
cd frontend && npm run lint
```

**Step 7: Commit**

```bash
git add frontend/src/types/event.ts
git commit -m "feat(events): update TypeScript types for EventCategory enum"
```

---

## Task 10: Frontend - Update Event Utils

**Files:**
- Modify: `frontend/src/lib/event-utils.ts`

**Step 1: Replace legacy labels with category labels**

Replace lines 11-22 with:

```typescript
import type { EventCategory } from '@/types/event'
import { Castle, ShieldAlert, Swords, type LucideIcon } from 'lucide-react'

/**
 * Event category display labels (Chinese)
 */
const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  siege: '攻城事件',
  forbidden: '禁地事件',
  battle: '戰役事件',
}

/**
 * Event category icons
 */
const EVENT_CATEGORY_ICONS: Record<EventCategory, LucideIcon> = {
  siege: Castle,
  forbidden: ShieldAlert,
  battle: Swords,
}
```

**Step 2: Update getEventTypeLabel function**

Replace lines 28-31 with:

```typescript
/**
 * Get display label for event category
 */
export function getEventTypeLabel(eventType: EventCategory): string {
  return EVENT_CATEGORY_LABELS[eventType]
}
```

**Step 3: Update getEventIcon function**

Replace lines 33-39 with:

```typescript
/**
 * Get the icon component for an event category
 */
export function getEventIcon(eventType: EventCategory): LucideIcon {
  return EVENT_CATEGORY_ICONS[eventType]
}
```

**Step 4: Add category-specific helper functions**

Add at end of file:

```typescript
/**
 * Check if event category tracks participation rate
 */
export function hasParticipationTracking(eventType: EventCategory): boolean {
  return eventType !== 'forbidden'
}

/**
 * Check if event category has MVP
 */
export function hasMvp(eventType: EventCategory): boolean {
  return eventType !== 'forbidden'
}

/**
 * Get the primary metric label for an event category
 */
export function getPrimaryMetricLabel(eventType: EventCategory): string {
  switch (eventType) {
    case 'siege':
      return '貢獻+助攻'
    case 'forbidden':
      return '違規人數'
    case 'battle':
      return '戰功'
  }
}

/**
 * Get badge variant for event category
 */
export function getEventCategoryBadgeVariant(
  eventType: EventCategory
): 'default' | 'secondary' | 'destructive' {
  switch (eventType) {
    case 'siege':
      return 'default'
    case 'forbidden':
      return 'destructive'
    case 'battle':
      return 'secondary'
  }
}
```

**Step 5: Run linter**

```bash
cd frontend && npm run lint
```

**Step 6: Commit**

```bash
git add frontend/src/lib/event-utils.ts
git commit -m "feat(events): update event-utils for category-specific logic"
```

---

## Task 11: Frontend - Update EventCard Component

**Files:**
- Modify: `frontend/src/components/events/EventCard.tsx`

**Step 1: Update imports**

Replace lines 21-28 with:

```typescript
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
} from '@/lib/event-utils'
```

**Step 2: Update InlineStats to be category-aware**

Replace `InlineStats` function (lines 53-94) with:

```typescript
function InlineStats({ event }: InlineStatsProps) {
  const duration = formatDuration(event.event_start, event.event_end)
  const timeDisplay = formatEventTime(event.event_start, event.event_end)
  const showParticipation = hasParticipationTracking(event.event_type)

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
      {event.event_type === 'battle' && event.total_merit != null && (
        <span className="flex items-center gap-1">
          <Swords className="h-3.5 w-3.5" />
          {formatNumberCompact(event.total_merit)}
        </span>
      )}

      {/* Absent count - only for siege/battle */}
      {showParticipation && event.absent_count != null && event.absent_count > 0 && (
        <span className="flex items-center gap-1 text-destructive font-medium">
          <XCircle className="h-3.5 w-3.5" />
          {event.absent_count} 人缺席
        </span>
      )}
    </div>
  )
}
```

**Step 3: Update ExpandedContent for category-specific display**

Replace `ExpandedContent` function (lines 109-198) with:

```typescript
function ExpandedContent({ event, eventDetail }: ExpandedContentProps) {
  const navigate = useNavigate()
  const { summary, metrics } = eventDetail
  const duration = formatDuration(event.event_start, event.event_end)
  const timeRange = formatTimeRange(event.event_start, event.event_end)
  const showParticipation = hasParticipationTracking(event.event_type)
  const showMvp = hasMvp(event.event_type)
  const isForbidden = event.event_type === 'forbidden'

  // Calculate box plot stats based on event type
  const distributionStats = useMemo(() => {
    if (isForbidden) {
      // For forbidden: show power_diff distribution of violators
      const violatorValues = metrics
        .filter((m) => m.power_diff > 0)
        .map((m) => m.power_diff)
      return calculateBoxPlotStats(violatorValues)
    }
    // For siege/battle: show merit distribution
    const participatedValues = metrics
      .filter((m) => m.participated)
      .map((m) => event.event_type === 'siege'
        ? m.contribution_diff + m.assist_diff
        : m.merit_diff)
    return calculateBoxPlotStats(participatedValues)
  }, [metrics, event.event_type, isForbidden])

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
            subtitle={summary.violator_count > 0 ? '有人偷打地' : '全員遵守'}
            icon={<ShieldAlert className="h-4 w-4" />}
          />
        )}

        {event.event_type === 'battle' && (
          <MiniMetricCard
            title="總戰功"
            value={formatNumberCompact(summary.total_merit)}
            icon={<Swords className="h-4 w-4" />}
          />
        )}

        {event.event_type === 'siege' && (
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
          value={duration ?? '-'}
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
            {event.event_type === 'battle' && summary.mvp_merit != null && (
              <span className="text-muted-foreground">({formatNumber(summary.mvp_merit)})</span>
            )}
            {event.event_type === 'siege' && summary.mvp_combined_score != null && (
              <span className="text-muted-foreground">({formatNumber(summary.mvp_combined_score)})</span>
            )}
          </div>
        )}
      </div>

      {/* Distribution Box Plot */}
      {distributionStats && (
        <div className="pt-2">
          <p className="text-xs text-muted-foreground mb-2">
            {isForbidden ? '違規者勢力增加分佈' : `${getPrimaryMetricLabel(event.event_type)}分佈`}
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
            e.stopPropagation()
            navigate(`/events/${event.id}`)
          }}
        >
          查看完整分析
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  )
}
```

**Step 4: Add missing imports**

Add to imports (line 18):
```typescript
import { ChevronRight, CheckCircle, XCircle, UserPlus, Users, Swords, Clock, Trophy, Castle, ShieldAlert } from 'lucide-react'
```

**Step 5: Update main component icon and badge**

In the main `EventCard` component (around line 206), replace:
```typescript
  const Icon = getEventIcon()
```

With:
```typescript
  const Icon = getEventIcon(event.event_type)
```

And replace the badge section (around line 216-220):
```typescript
  const badge = eventTypeLabel ? (
    <Badge variant={getEventTypeBadgeVariant()} className="text-xs">
      {eventTypeLabel}
    </Badge>
  ) : null
```

With:
```typescript
  const badge = (
    <Badge variant={getEventCategoryBadgeVariant(event.event_type)} className="text-xs">
      {eventTypeLabel}
    </Badge>
  )
```

**Step 6: Run linter**

```bash
cd frontend && npm run lint
```

**Step 7: Commit**

```bash
git add frontend/src/components/events/EventCard.tsx
git commit -m "feat(events): update EventCard for category-specific display"
```

---

## Task 12: Frontend - Update Event Create Form

**Files:**
- Modify: `frontend/src/pages/EventAnalytics.tsx` (find the create form section)

**Step 1: Read current implementation**

Read the file to understand the current form structure.

**Step 2: Add event category selector to create form**

Add a Select component for event_type with options:
- siege (攻城事件)
- forbidden (禁地事件)
- battle (戰役事件) - default

**Step 3: Update form state and submission**

Ensure the form includes `event_type: EventCategory` in the request.

**Step 4: Run linter and type check**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

**Step 5: Commit**

```bash
git add frontend/src/pages/EventAnalytics.tsx
git commit -m "feat(events): add event category selector to create form"
```

---

## Task 13: Run Full Test Suite

**Step 1: Backend tests**

```bash
cd backend && uv run pytest tests/ -v
```

**Step 2: Backend linting**

```bash
cd backend && uv run ruff check .
```

**Step 3: Frontend linting and type check**

```bash
cd frontend && npm run lint && npx tsc --noEmit
```

**Step 4: Manual testing checklist**

1. [ ] Create SIEGE event - verify participation uses contribution/assist
2. [ ] Create FORBIDDEN event - verify no participation rate, shows violators
3. [ ] Create BATTLE event - verify participation uses merit only
4. [ ] Check existing events migrated to 'battle' category
5. [ ] Verify LINE Bot report would show correct metrics per category

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(events): complete event category system implementation"
```

---

## Summary of Files Changed

### Backend
| File | Changes |
|------|---------|
| `src/models/battle_event.py` | Add EventCategory enum, update event_type field |
| `src/models/battle_event_metrics.py` | Add category-specific MVP fields to EventSummary |
| `src/api/v1/schemas/events.py` | Update schemas for EventCategory |
| `src/services/battle_event_service.py` | Add `_determine_participation()`, update summary calculation |
| `tests/unit/services/test_battle_event_service.py` | Add tests for category logic |

### Frontend
| File | Changes |
|------|---------|
| `src/types/event.ts` | Add EventCategory type, update interfaces |
| `src/lib/event-utils.ts` | Category-specific labels, icons, helpers |
| `src/components/events/EventCard.tsx` | Category-aware display |
| `src/pages/EventAnalytics.tsx` | Add category selector to form |

### Database
| Change | Description |
|--------|-------------|
| Migration | Convert event_type to enum with CHECK constraint |
