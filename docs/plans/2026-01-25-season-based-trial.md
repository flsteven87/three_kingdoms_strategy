# Season-Based Trial System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move trial system from Alliance-level to Season-level, so trial starts when user activates their first season (not when they create an alliance).

**Architecture:**
- Trial info moves from `alliances` table to `seasons` table (`is_trial`, `activated_at`)
- New logic: can activate if `available_quota > 0` OR `no activated/completed seasons exist`
- Write permission: `purchased_seasons > 0` OR (`season.is_trial` AND within 14 days)

**Tech Stack:** FastAPI, Supabase/PostgreSQL, React, TypeScript, TanStack Query

---

## Task 1: Database Schema Changes

**Files:**
- Execute SQL via Supabase MCP

**Step 1: Add new columns to seasons table**

```sql
-- Add trial tracking columns to seasons
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT false;
ALTER TABLE seasons ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Add index for efficient trial queries
CREATE INDEX IF NOT EXISTS idx_seasons_is_trial ON seasons(alliance_id, is_trial) WHERE is_trial = true;
```

**Step 2: Remove old trigger**

```sql
-- Remove the trigger that auto-sets trial on alliance creation
DROP TRIGGER IF EXISTS alliances_set_trial_period ON alliances;
DROP FUNCTION IF EXISTS set_trial_period();
```

**Step 3: Migrate existing data**

```sql
-- For existing activated seasons that were created before this change:
-- - If alliance has purchased_seasons > 0, mark seasons as NOT trial
-- - If alliance has subscription_status = 'trial' and season is activated,
--   it was activated during trial but we'll treat it as paid going forward
UPDATE seasons s
SET
    activated_at = s.updated_at,
    is_trial = false
WHERE s.activation_status IN ('activated', 'completed')
AND s.activated_at IS NULL;
```

**Step 4: Verify migration**

Run query to confirm:
```sql
SELECT
    s.id, s.name, s.activation_status, s.is_trial, s.activated_at,
    a.name as alliance_name, a.purchased_seasons
FROM seasons s
JOIN alliances a ON s.alliance_id = a.id
ORDER BY s.created_at DESC;
```

---

## Task 2: Backend Model Updates

**Files:**
- Modify: `backend/src/models/season.py`
- Modify: `backend/src/models/alliance.py`

**Step 1: Update Season model**

In `backend/src/models/season.py`, add new fields to `SeasonBase` and `Season`:

```python
# In SeasonBase class, add after description field:
    is_trial: bool = Field(False, description="Whether this season was activated using trial")
    activated_at: datetime | None = Field(None, description="When the season was activated")
```

Update `Season` class to include these fields (they inherit from SeasonBase).

**Step 2: Update SeasonActivateResponse**

```python
class SeasonActivateResponse(BaseModel):
    """Response model for season activation"""

    success: bool
    season: "Season"
    remaining_seasons: int = Field(description="Remaining available seasons after activation")
    used_trial: bool = Field(description="Whether trial was used for this activation")
    trial_ends_at: str | None = Field(None, description="Trial end date if trial was used")
```

**Step 3: Update SeasonQuotaStatus in alliance.py**

Replace the existing `SeasonQuotaStatus` class:

```python
class SeasonQuotaStatus(BaseModel):
    """Response model for season quota status API - Season Purchase System"""

    # Purchase information
    purchased_seasons: int = Field(description="Total number of purchased seasons")
    used_seasons: int = Field(description="Number of seasons already activated (excluding trial)")
    available_seasons: int = Field(description="Remaining seasons available for activation")

    # Trial information (from current season if applicable)
    has_trial_available: bool = Field(description="Whether user can use trial (never activated any season)")
    current_season_is_trial: bool = Field(description="Whether current season is a trial season")
    trial_days_remaining: int | None = Field(None, description="Days remaining in trial (if current season is trial)")
    trial_ends_at: str | None = Field(None, description="Trial end date (if current season is trial)")

    # Capabilities
    can_activate_season: bool = Field(description="Whether user can activate a new season")
    can_write: bool = Field(description="Whether user can upload CSV to current season")
```

**Step 4: Run ruff check**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/backend && uv run ruff check src/models/
```

---

## Task 3: Backend Repository Updates

**Files:**
- Modify: `backend/src/repositories/season_repository.py`

**Step 1: Add helper methods**

Add these methods to `SeasonRepository` class:

```python
async def get_activated_seasons_count(self, alliance_id: UUID) -> int:
    """
    Get count of activated or completed seasons for an alliance.
    Used to determine if trial is available.
    """
    result = await self._execute_async(
        lambda: self.client.from_(self.table_name)
        .select("id", count="exact")
        .eq("alliance_id", str(alliance_id))
        .in_("activation_status", ["activated", "completed"])
        .execute()
    )
    return result.count or 0

async def get_trial_season(self, alliance_id: UUID) -> Season | None:
    """
    Get the trial season for an alliance (if exists).
    There should be at most one trial season per alliance.
    """
    result = await self._execute_async(
        lambda: self.client.from_(self.table_name)
        .select("*")
        .eq("alliance_id", str(alliance_id))
        .eq("is_trial", True)
        .limit(1)
        .execute()
    )
    data = self._handle_supabase_result(result, allow_empty=True)
    return self._build_model(data[0]) if data else None
```

**Step 2: Run ruff check**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/backend && uv run ruff check src/repositories/season_repository.py
```

---

## Task 4: Backend SeasonQuotaService Rewrite

**Files:**
- Modify: `backend/src/services/season_quota_service.py`

**Step 1: Update imports and init**

```python
"""
Season Quota Service - Season Purchase System

Manages trial period and season quota for alliances.
Trial is now based on Season activation, not Alliance creation.

Key Logic:
- Trial available: No activated/completed seasons exist
- Can activate: has_trial_available OR available_seasons > 0
- Can write: purchased_seasons > 0 OR (current_season.is_trial AND within 14 days)
"""

import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from src.core.exceptions import SeasonQuotaExhaustedError
from src.models.alliance import Alliance, SeasonQuotaStatus
from src.models.season import Season
from src.repositories.alliance_repository import AllianceRepository
from src.repositories.season_repository import SeasonRepository

logger = logging.getLogger(__name__)

TRIAL_DURATION_DAYS = 14
```

**Step 2: Rewrite the service class**

```python
class SeasonQuotaService:
    """
    Season quota service for managing trial/season purchase status.

    Trial system is now Season-based:
    - Trial starts when user activates their FIRST season
    - Trial lasts 14 days from activation
    - Only ONE trial season allowed per alliance
    - After trial: season becomes read-only unless user purchases quota
    """

    def __init__(self):
        """Initialize season quota service with repositories."""
        self._alliance_repo = AllianceRepository()
        self._season_repo = SeasonRepository()

    # =========================================================================
    # Alliance Retrieval
    # =========================================================================

    async def get_alliance_by_user(self, user_id: UUID) -> Alliance | None:
        """Get alliance for a user."""
        return await self._alliance_repo.get_by_collaborator(user_id)

    async def get_alliance_by_id(self, alliance_id: UUID) -> Alliance | None:
        """Get alliance by ID."""
        return await self._alliance_repo.get_by_id(alliance_id)

    # =========================================================================
    # Trial Calculation (Season-based)
    # =========================================================================

    def _calculate_trial_end(self, season: Season) -> datetime | None:
        """Calculate when trial ends for a trial season."""
        if not season.is_trial or not season.activated_at:
            return None

        activated_at = season.activated_at
        if activated_at.tzinfo is None:
            activated_at = activated_at.replace(tzinfo=UTC)

        return activated_at + timedelta(days=TRIAL_DURATION_DAYS)

    def _is_trial_active(self, season: Season) -> bool:
        """Check if a trial season is still within trial period."""
        if not season.is_trial:
            return False

        trial_end = self._calculate_trial_end(season)
        if not trial_end:
            return False

        return datetime.now(UTC) < trial_end

    def _calculate_trial_days_remaining(self, season: Season) -> int | None:
        """Calculate days remaining in trial period."""
        if not season.is_trial:
            return None

        trial_end = self._calculate_trial_end(season)
        if not trial_end:
            return None

        now = datetime.now(UTC)
        if now >= trial_end:
            return 0

        delta = trial_end - now
        return delta.days

    # =========================================================================
    # Quota Calculation
    # =========================================================================

    def _calculate_available_seasons(self, alliance: Alliance) -> int:
        """Calculate available seasons (purchased - used)."""
        return max(0, alliance.purchased_seasons - alliance.used_seasons)

    async def _has_trial_available(self, alliance_id: UUID) -> bool:
        """Check if alliance can use trial (no activated/completed seasons yet)."""
        count = await self._season_repo.get_activated_seasons_count(alliance_id)
        return count == 0

    async def _can_activate_season(self, alliance: Alliance) -> bool:
        """
        Check if alliance can activate a new season.

        Can activate if:
        1. Has available purchased seasons, OR
        2. Never activated any season (trial available)
        """
        if self._calculate_available_seasons(alliance) > 0:
            return True

        return await self._has_trial_available(alliance.id)

    async def _can_write_to_season(
        self, alliance: Alliance, current_season: Season | None
    ) -> bool:
        """
        Check if user can write (upload CSV) to current season.

        Can write if:
        1. Has purchased seasons (purchased_seasons > 0), OR
        2. Current season is trial AND trial is active
        """
        if alliance.purchased_seasons > 0:
            return True

        if current_season and current_season.is_trial:
            return self._is_trial_active(current_season)

        return False

    # =========================================================================
    # Quota Status
    # =========================================================================

    async def _calculate_quota_status(
        self, alliance: Alliance, current_season: Season | None
    ) -> SeasonQuotaStatus:
        """Calculate detailed quota status for an alliance."""
        available_seasons = self._calculate_available_seasons(alliance)
        has_trial_available = await self._has_trial_available(alliance.id)
        can_activate = await self._can_activate_season(alliance)
        can_write = await self._can_write_to_season(alliance, current_season)

        # Trial info from current season
        current_is_trial = current_season.is_trial if current_season else False
        trial_days_remaining = None
        trial_ends_at = None

        if current_season and current_season.is_trial:
            trial_days_remaining = self._calculate_trial_days_remaining(current_season)
            trial_end = self._calculate_trial_end(current_season)
            trial_ends_at = trial_end.isoformat() if trial_end else None

        return SeasonQuotaStatus(
            purchased_seasons=alliance.purchased_seasons,
            used_seasons=alliance.used_seasons,
            available_seasons=available_seasons,
            has_trial_available=has_trial_available,
            current_season_is_trial=current_is_trial,
            trial_days_remaining=trial_days_remaining,
            trial_ends_at=trial_ends_at,
            can_activate_season=can_activate,
            can_write=can_write,
        )

    async def get_quota_status(self, user_id: UUID) -> SeasonQuotaStatus:
        """Get season quota status for a user's alliance."""
        alliance = await self.get_alliance_by_user(user_id)
        if not alliance:
            raise ValueError("No alliance found for user")

        current_season = await self._season_repo.get_current_season(alliance.id)
        return await self._calculate_quota_status(alliance, current_season)

    async def get_quota_status_by_alliance(self, alliance_id: UUID) -> SeasonQuotaStatus:
        """Get season quota status for a specific alliance."""
        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        current_season = await self._season_repo.get_current_season(alliance_id)
        return await self._calculate_quota_status(alliance, current_season)

    # =========================================================================
    # Access Control
    # =========================================================================

    async def check_write_access(self, alliance_id: UUID) -> bool:
        """Check if alliance has write access."""
        try:
            status = await self.get_quota_status_by_alliance(alliance_id)
            return status.can_write
        except ValueError:
            return False

    async def can_activate_season(self, alliance_id: UUID) -> bool:
        """Check if alliance can activate a new season."""
        try:
            status = await self.get_quota_status_by_alliance(alliance_id)
            return status.can_activate_season
        except ValueError:
            return False

    async def require_write_access(
        self, alliance_id: UUID, action: str = "perform this action"
    ) -> None:
        """Require alliance to have write access."""
        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        current_season = await self._season_repo.get_current_season(alliance_id)
        can_write = await self._can_write_to_season(alliance, current_season)

        if not can_write:
            logger.warning(
                f"Write access denied - alliance_id={alliance_id}, action={action}"
            )

            if current_season and current_season.is_trial:
                message = f"您的 14 天試用期已結束，請購買季數以繼續{action}。"
            else:
                message = f"您的可用季數已用完，請購買季數以繼續{action}。"

            raise SeasonQuotaExhaustedError(message)

    async def require_season_activation(self, alliance_id: UUID) -> None:
        """Require alliance to be able to activate a season."""
        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        can_activate = await self._can_activate_season(alliance)
        if not can_activate:
            logger.warning(
                f"Season activation denied - alliance_id={alliance_id}"
            )
            message = "您的可用季數已用完，請購買季數以啟用新賽季。"
            raise SeasonQuotaExhaustedError(message)

    # =========================================================================
    # Season Consumption
    # =========================================================================

    async def consume_season(self, alliance_id: UUID) -> tuple[int, bool, str | None]:
        """
        Consume one season from alliance's quota or use trial.

        Returns:
            Tuple of (remaining_seasons, used_trial, trial_ends_at)
        """
        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        available = self._calculate_available_seasons(alliance)
        has_trial = await self._has_trial_available(alliance_id)

        # Priority: use purchased seasons first, then trial
        if available > 0:
            new_used = alliance.used_seasons + 1
            await self._alliance_repo.update(alliance_id, {"used_seasons": new_used})
            remaining = alliance.purchased_seasons - new_used
            logger.info(
                f"Season consumed (paid) - alliance_id={alliance_id}, remaining={remaining}"
            )
            return (remaining, False, None)

        if has_trial:
            trial_end = datetime.now(UTC) + timedelta(days=TRIAL_DURATION_DAYS)
            logger.info(
                f"Season activated using trial - alliance_id={alliance_id}, "
                f"trial_ends={trial_end.isoformat()}"
            )
            return (0, True, trial_end.isoformat())

        raise ValueError("No available seasons or trial to consume")

    async def add_purchased_seasons(self, alliance_id: UUID, seasons: int) -> int:
        """Add purchased seasons to alliance."""
        if seasons <= 0:
            raise ValueError("Seasons must be positive")

        alliance = await self.get_alliance_by_id(alliance_id)
        if not alliance:
            raise ValueError(f"Alliance not found: {alliance_id}")

        new_purchased = alliance.purchased_seasons + seasons
        await self._alliance_repo.update(alliance_id, {"purchased_seasons": new_purchased})

        new_available = new_purchased - alliance.used_seasons
        logger.info(
            f"Seasons purchased - alliance_id={alliance_id}, "
            f"added={seasons}, available={new_available}"
        )

        return new_available
```

**Step 3: Run ruff check**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/backend && uv run ruff check src/services/season_quota_service.py
```

---

## Task 5: Backend SeasonService Updates

**Files:**
- Modify: `backend/src/services/season_service.py`

**Step 1: Update activate_season method**

Find the `activate_season` method and update it:

```python
async def activate_season(self, user_id: UUID, season_id: UUID) -> SeasonActivateResponse:
    """
    Activate a draft season (consume season credit or use trial).

    If this is the first season ever activated for the alliance,
    it becomes a trial season with 14-day access.
    """
    # Verify ownership
    season = await self.get_season(user_id, season_id)

    if season.activation_status != "draft":
        raise ValueError(f"Season is already {season.activation_status}, cannot activate")

    # Validate season duration if end_date is set
    if season.end_date is not None:
        self._validate_season_duration(season.start_date, season.end_date)

    # Validate no date overlap
    await self._validate_no_date_overlap(
        season.alliance_id, season.start_date, season.end_date, exclude_season_id=season_id
    )

    # Verify can activate (has trial or seasons)
    await self._season_quota_service.require_season_activation(season.alliance_id)

    # Consume season (handles trial vs paid logic)
    remaining, used_trial, trial_ends_at = await self._season_quota_service.consume_season(
        season.alliance_id
    )

    # Update season status
    from datetime import UTC, datetime

    update_data = {
        "activation_status": "activated",
        "activated_at": datetime.now(UTC).isoformat(),
        "is_trial": used_trial,
    }
    updated_season = await self._repo.update(season_id, update_data)

    logger.info(
        f"Season activated - season_id={season_id}, "
        f"used_trial={used_trial}, remaining_seasons={remaining}"
    )

    return SeasonActivateResponse(
        success=True,
        season=updated_season,
        remaining_seasons=remaining,
        used_trial=used_trial,
        trial_ends_at=trial_ends_at,
    )
```

**Step 2: Add datetime import at top of file if not present**

```python
from datetime import UTC, datetime, date
```

**Step 3: Run ruff check**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/backend && uv run ruff check src/services/season_service.py
```

---

## Task 6: Frontend Type Updates

**Files:**
- Modify: `frontend/src/types/season.ts`
- Modify: `frontend/src/types/season-quota.ts`
- Modify: `frontend/src/types/alliance.ts`

**Step 1: Update Season type**

In `frontend/src/types/season.ts`, add to `Season` interface:

```typescript
export interface Season {
  readonly id: string
  readonly alliance_id: string
  readonly name: string
  readonly start_date: string
  readonly end_date: string | null
  readonly is_current: boolean
  readonly activation_status: ActivationStatus
  readonly description: string | null
  readonly created_at: string
  readonly updated_at: string
  // New trial fields
  readonly is_trial: boolean
  readonly activated_at: string | null
}
```

Update `SeasonActivateResponse`:

```typescript
export interface SeasonActivateResponse {
  readonly success: boolean
  readonly season: Season
  readonly remaining_seasons: number
  readonly used_trial: boolean
  readonly trial_ends_at: string | null
}
```

**Step 2: Update SeasonQuotaStatus type**

Replace content in `frontend/src/types/season-quota.ts`:

```typescript
/**
 * Season Quota API Types - Season-Based Trial System
 */

export interface SeasonQuotaStatus {
  // Purchase information
  readonly purchased_seasons: number
  readonly used_seasons: number
  readonly available_seasons: number

  // Trial information (from current season)
  readonly has_trial_available: boolean
  readonly current_season_is_trial: boolean
  readonly trial_days_remaining: number | null
  readonly trial_ends_at: string | null

  // Capabilities
  readonly can_activate_season: boolean
  readonly can_write: boolean
}

export type QuotaWarningLevel = 'none' | 'warning' | 'critical' | 'expired'

export function getQuotaWarningLevel(
  status: SeasonQuotaStatus | null | undefined
): QuotaWarningLevel {
  if (!status) return 'none'

  // Can't write = expired
  if (!status.can_write && !status.can_activate_season) return 'expired'

  // Check trial warnings for current season
  if (status.current_season_is_trial && status.trial_days_remaining !== null) {
    if (status.trial_days_remaining <= 0) return 'expired'
    if (status.trial_days_remaining <= 3) return 'critical'
    if (status.trial_days_remaining <= 7) return 'warning'
  }

  return 'none'
}

export function getQuotaWarningMessage(
  status: SeasonQuotaStatus | null | undefined
): string | null {
  if (!status) return null

  const level = getQuotaWarningLevel(status)

  switch (level) {
    case 'expired':
      if (status.current_season_is_trial) {
        return '試用期已結束，歡迎購買賽季繼續使用'
      }
      return '目前沒有可用賽季，歡迎購買以繼續使用'

    case 'critical':
    case 'warning':
      return `試用期剩餘 ${status.trial_days_remaining} 天`

    default:
      return null
  }
}
```

**Step 3: Simplify Alliance type**

In `frontend/src/types/alliance.ts`, remove trial fields (keep for backward compat but mark optional):

```typescript
export interface Alliance {
  readonly id: string
  readonly name: string
  readonly server_name: string | null
  readonly created_at: string
  readonly updated_at: string
  // Legacy fields (may be removed in future)
  readonly subscription_status?: string
  readonly trial_started_at?: string | null
  readonly trial_ends_at?: string | null
}
```

**Step 4: Run lint**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/frontend && npm run lint
```

---

## Task 7: Frontend Hook Updates

**Files:**
- Modify: `frontend/src/hooks/use-season-quota.ts`

**Step 1: Update useSeasonQuotaDisplay hook**

```typescript
export function useSeasonQuotaDisplay(): {
  status: string
  statusColor: 'green' | 'yellow' | 'red' | 'gray'
  trialDaysRemaining: number | null
  availableSeasons: number
  canActivate: boolean
  canWrite: boolean
  hasTrialAvailable: boolean
} {
  const { data } = useSeasonQuota()

  if (!data) {
    return {
      status: '載入中...',
      statusColor: 'gray',
      trialDaysRemaining: null,
      availableSeasons: 0,
      canActivate: false,
      canWrite: false,
      hasTrialAvailable: false,
    }
  }

  let status: string
  let statusColor: 'green' | 'yellow' | 'red' | 'gray'

  if (data.can_activate_season || data.can_write) {
    if (data.has_trial_available) {
      status = '可免費試用'
      statusColor = 'green'
    } else if (data.current_season_is_trial && data.trial_days_remaining !== null) {
      status = `試用中 (${data.trial_days_remaining} 天)`
      statusColor = data.trial_days_remaining <= 3 ? 'yellow' : 'green'
    } else if (data.available_seasons > 0) {
      status = `剩餘 ${data.available_seasons} 季`
      statusColor = 'green'
    } else {
      status = '可使用'
      statusColor = 'green'
    }
  } else {
    status = data.current_season_is_trial ? '試用已過期' : '需購買賽季'
    statusColor = 'red'
  }

  return {
    status,
    statusColor,
    trialDaysRemaining: data.trial_days_remaining,
    availableSeasons: data.available_seasons,
    canActivate: data.can_activate_season,
    canWrite: data.can_write,
    hasTrialAvailable: data.has_trial_available,
  }
}
```

**Step 2: Update other hooks as needed**

Update `useQuotaWarning` to match new API:

```typescript
export function useQuotaWarning(): {
  level: QuotaWarningLevel
  message: string | null
  isExpired: boolean
  trialDaysRemaining: number | null
  availableSeasons: number
} {
  const { data } = useSeasonQuota()

  if (!data) {
    return {
      level: 'none',
      message: null,
      isExpired: false,
      trialDaysRemaining: null,
      availableSeasons: 0,
    }
  }

  const level = getQuotaWarningLevel(data)
  const message = getQuotaWarningMessage(data)
  const isExpired = !data.can_write && !data.can_activate_season

  return {
    level,
    message,
    isExpired,
    trialDaysRemaining: data.trial_days_remaining,
    availableSeasons: data.available_seasons,
  }
}
```

**Step 3: Run lint**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/frontend && npm run lint
```

---

## Task 8: Frontend Component Updates

**Files:**
- Modify: `frontend/src/pages/Seasons.tsx`
- Modify: `frontend/src/pages/PurchaseSeason.tsx`
- Modify: `frontend/src/components/seasons/SeasonCard.tsx`

**Step 1: Update Seasons.tsx Badge**

The Badge logic needs to handle the new `hasTrialAvailable` state:

```tsx
<Badge
  variant={quotaDisplay.statusColor === 'red' ? 'destructive' : 'secondary'}
  className="text-xs"
>
  {quotaDisplay.hasTrialAvailable
    ? '可免費試用'
    : quotaDisplay.trialDaysRemaining !== null && quotaDisplay.trialDaysRemaining > 0
      ? `試用 ${quotaDisplay.trialDaysRemaining} 天`
      : quotaDisplay.availableSeasons > 0
        ? `剩餘 ${quotaDisplay.availableSeasons} 季`
        : '需購買'}
</Badge>
```

**Step 2: Update PurchaseSeason.tsx**

Update `getQuotaStatusText`:

```typescript
const getQuotaStatusText = () => {
  if (isQuotaLoading || !quotaStatus) {
    return '載入中...'
  }

  const { available_seasons, has_trial_available, current_season_is_trial, trial_days_remaining } = quotaStatus

  if (has_trial_available) {
    return '尚未使用試用，啟用第一個賽季即可開始 14 天試用'
  }

  if (current_season_is_trial && trial_days_remaining !== null && trial_days_remaining > 0) {
    return `試用期剩餘 ${trial_days_remaining} 天`
  }

  if (available_seasons > 0) {
    return `剩餘 ${available_seasons} 季`
  }

  return '已用完，購買後可開新賽季'
}
```

**Step 3: Update SeasonCard.tsx to show trial badge**

Add a trial badge when the season is a trial:

```tsx
const badge = (
  <div className="flex items-center gap-2">
    {season.is_current && (
      <Badge variant="outline" className="text-xs">
        目前賽季
      </Badge>
    )}
    {season.is_trial && (
      <Badge variant="secondary" className="text-xs">
        試用
      </Badge>
    )}
    <Badge variant={statusVariant} className="text-xs">
      {getActivationStatusLabel(season.activation_status)}
    </Badge>
  </div>
)
```

**Step 4: Run lint and type check**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/frontend && npm run lint && npx tsc --noEmit
```

---

## Task 9: Update Backend Tests

**Files:**
- Modify: `backend/tests/unit/services/test_season_quota_service.py`

**Step 1: Update test fixtures and mocks**

The tests need to be rewritten to test the new Season-based trial logic. Key changes:

1. Mock `_season_repo` in addition to `_alliance_repo`
2. Update `create_mock_alliance` to not include trial fields
3. Add `create_mock_season` factory with `is_trial`, `activated_at`
4. Update all test cases to reflect new logic

**Step 2: Run tests**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/backend && uv run pytest tests/unit/services/test_season_quota_service.py -v
```

---

## Task 10: Final Verification

**Step 1: Run all backend tests**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/backend && uv run pytest tests/ -v
```

**Step 2: Run all lints**

```bash
cd /Users/po-chi/Desktop/three_kingdoms_strategy/backend && uv run ruff check .
cd /Users/po-chi/Desktop/three_kingdoms_strategy/frontend && npm run lint && npx tsc --noEmit
```

**Step 3: Manual testing checklist**

- [ ] New alliance can create draft season without consuming quota
- [ ] First season activation becomes trial with 14-day access
- [ ] Trial badge shows on trial season in UI
- [ ] Can upload CSV during trial period
- [ ] After 14 days, trial season becomes read-only
- [ ] Purchased quota allows activating additional seasons
- [ ] Purchased quota allows writing to trial season after expiry

---

## Summary of Changes

| Layer | Files Changed | Description |
|-------|---------------|-------------|
| Database | SQL | Add `is_trial`, `activated_at` to seasons; remove trigger |
| Backend Models | `season.py`, `alliance.py` | New fields, new QuotaStatus structure |
| Backend Repos | `season_repository.py` | Add helper queries |
| Backend Services | `season_quota_service.py`, `season_service.py` | Complete rewrite of trial logic |
| Frontend Types | `season.ts`, `season-quota.ts`, `alliance.ts` | Match new API |
| Frontend Hooks | `use-season-quota.ts` | Update display logic |
| Frontend Components | `Seasons.tsx`, `PurchaseSeason.tsx`, `SeasonCard.tsx` | UI updates |
| Tests | `test_season_quota_service.py` | Rewrite for new logic |
