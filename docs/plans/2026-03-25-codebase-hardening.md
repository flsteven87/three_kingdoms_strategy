# Codebase Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Resolve all known technical debt and security issues to bring the codebase to production-ready state before Recur subscription launch.

**Architecture:** Six independent tasks ordered by risk. Task 1 (webhook idempotency) adds a Supabase table + service-layer dedup + atomic DB increment. Tasks 2-6 are surgical cleanups: dead code removal, exception handling fixes, utility extraction, and import path normalization.

**Tech Stack:** Python 3.13, FastAPI, Supabase (PostgreSQL), Pydantic V2, React 19, TypeScript

---

## Task 1: Webhook Idempotency (DB-level dedup + atomic increment)

**Files:**
- Create: `backend/src/repositories/webhook_event_repository.py`
- Modify: `backend/src/services/payment_service.py`
- Modify: `backend/src/services/season_quota_service.py:295-313`
- Modify: `backend/src/api/v1/endpoints/webhooks.py:108-139`
- Create: `backend/tests/unit/services/test_webhook_idempotency.py`

**Context:** Recur retries webhooks on timeout. Current flow does read-modify-write on `purchased_seasons` with no event dedup. Same event retried = double credit.

### Step 1: Create webhook_events table via Supabase MCP

Execute this SQL in Supabase (not a migration file, per project rules):

```sql
CREATE TABLE public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    alliance_id UUID REFERENCES public.alliances(id) ON DELETE SET NULL,
    user_id UUID,
    seasons_added INTEGER NOT NULL DEFAULT 0,
    payload JSONB,
    processed_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(event_id)
);

-- RLS: only service role can access (webhooks use service key)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Index for lookup performance
CREATE INDEX idx_webhook_events_event_id ON public.webhook_events(event_id);

COMMENT ON TABLE public.webhook_events IS 'Webhook event dedup log. UNIQUE(event_id) prevents duplicate processing on retries.';
```

### Step 2: Write the failing test for webhook dedup

```python
# backend/tests/unit/services/test_webhook_idempotency.py
"""
Tests for webhook idempotency (event dedup).

Covers:
- First event processes normally
- Duplicate event_id returns cached result without re-processing
- Missing event_id still processes (graceful degradation)
- Atomic increment prevents read-modify-write race
"""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from src.services.payment_service import PaymentService


@pytest.fixture
def payment_service():
    service = PaymentService()
    service._quota_service = AsyncMock()
    service._webhook_repo = AsyncMock()
    return service


@pytest.fixture
def sample_event_data():
    user_id = uuid4()
    return {
        "externalCustomerId": f"{user_id}:3",
        "amount": 1000,
        "productId": "prod_season",
    }, user_id


class TestWebhookIdempotency:
    """Webhook event dedup prevents duplicate season credits."""

    @pytest.mark.asyncio
    async def test_first_event_processes_normally(self, payment_service, sample_event_data):
        """First time seeing an event_id should process and record."""
        event_data, user_id = sample_event_data
        alliance = MagicMock(id=uuid4())

        payment_service._webhook_repo.exists_by_event_id = AsyncMock(return_value=False)
        payment_service._webhook_repo.create = AsyncMock()
        payment_service._quota_service.get_alliance_by_user = AsyncMock(return_value=alliance)
        payment_service._quota_service.add_purchased_seasons = AsyncMock(return_value=3)

        result = await payment_service.handle_checkout_completed(
            event_data, event_id="evt_abc123"
        )

        assert result["success"] is True
        assert result["seasons_added"] == 3
        payment_service._quota_service.add_purchased_seasons.assert_called_once()
        payment_service._webhook_repo.create.assert_called_once()

    @pytest.mark.asyncio
    async def test_duplicate_event_returns_cached_without_processing(
        self, payment_service, sample_event_data
    ):
        """Duplicate event_id should return success without adding seasons again."""
        event_data, user_id = sample_event_data

        payment_service._webhook_repo.exists_by_event_id = AsyncMock(return_value=True)

        result = await payment_service.handle_checkout_completed(
            event_data, event_id="evt_abc123"
        )

        assert result["success"] is True
        assert result["duplicate"] is True
        payment_service._quota_service.add_purchased_seasons.assert_not_called()

    @pytest.mark.asyncio
    async def test_missing_event_id_still_processes(self, payment_service, sample_event_data):
        """If event_id is None (shouldn't happen but graceful), process without dedup."""
        event_data, user_id = sample_event_data
        alliance = MagicMock(id=uuid4())

        payment_service._quota_service.get_alliance_by_user = AsyncMock(return_value=alliance)
        payment_service._quota_service.add_purchased_seasons = AsyncMock(return_value=3)

        result = await payment_service.handle_checkout_completed(
            event_data, event_id=None
        )

        assert result["success"] is True
        payment_service._webhook_repo.exists_by_event_id.assert_not_called()


class TestAtomicIncrement:
    """Atomic DB increment prevents race conditions."""

    @pytest.mark.asyncio
    async def test_add_purchased_seasons_uses_atomic_increment(self):
        """add_purchased_seasons should use SQL increment, not read-modify-write."""
        from src.services.season_quota_service import SeasonQuotaService

        service = SeasonQuotaService()
        service._alliance_repo = AsyncMock()

        mock_alliance = MagicMock()
        mock_alliance.id = uuid4()
        mock_alliance.purchased_seasons = 5
        mock_alliance.used_seasons = 2
        service._alliance_repo.increment_purchased_seasons = AsyncMock(return_value=8)

        result = await service.add_purchased_seasons(mock_alliance.id, 3)

        assert result == 6  # 8 purchased - 2 used
        service._alliance_repo.increment_purchased_seasons.assert_called_once_with(
            mock_alliance.id, 3
        )
```

### Step 3: Run test to verify it fails

Run: `cd backend && uv run pytest tests/unit/services/test_webhook_idempotency.py -v`
Expected: FAIL — `PaymentService.handle_checkout_completed()` doesn't accept `event_id` yet

### Step 4: Create WebhookEventRepository

```python
# backend/src/repositories/webhook_event_repository.py
"""
Webhook Event Repository

Stores processed webhook events for idempotency dedup.
符合 CLAUDE.md 🔴: Inherits SupabaseRepository, uses _handle_supabase_result()
"""

from pydantic import BaseModel, ConfigDict

from src.repositories.base import SupabaseRepository


class WebhookEvent(BaseModel):
    """Webhook event record for dedup."""

    model_config = ConfigDict(from_attributes=True)

    id: str | None = None
    event_id: str
    event_type: str
    alliance_id: str | None = None
    user_id: str | None = None
    seasons_added: int = 0
    payload: dict | None = None


class WebhookEventRepository(SupabaseRepository[WebhookEvent]):
    """Repository for webhook event dedup records."""

    def __init__(self):
        super().__init__(table_name="webhook_events", model_class=WebhookEvent)

    async def exists_by_event_id(self, event_id: str) -> bool:
        """Check if an event has already been processed."""
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name)
            .select("id")
            .eq("event_id", event_id)
            .limit(1)
            .execute()
        )
        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) > 0

    async def create(self, event_data: dict) -> WebhookEvent:
        """Record a processed webhook event."""
        result = await self._execute_async(
            lambda: self.client.from_(self.table_name).insert(event_data).execute()
        )
        data = self._handle_supabase_result(result, expect_single=True)
        return self._build_model(data)
```

### Step 5: Add atomic increment to AllianceRepository

Add to `backend/src/repositories/alliance_repository.py`:

```python
    async def increment_purchased_seasons(self, alliance_id: UUID, seasons: int) -> int:
        """
        Atomically increment purchased_seasons and return new value.

        Uses PostgreSQL RPC to avoid read-modify-write race conditions.
        """
        result = await self._execute_async(
            lambda: self.client.rpc(
                "increment_purchased_seasons",
                {"p_alliance_id": str(alliance_id), "p_seasons": seasons},
            ).execute()
        )
        # RPC scalar return: result.data is the direct value
        return result.data
```

Also create the PostgreSQL function via Supabase MCP:

```sql
CREATE OR REPLACE FUNCTION public.increment_purchased_seasons(
    p_alliance_id UUID,
    p_seasons INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    new_purchased INTEGER;
BEGIN
    UPDATE alliances
    SET purchased_seasons = purchased_seasons + p_seasons,
        updated_at = now()
    WHERE id = p_alliance_id
    RETURNING purchased_seasons INTO new_purchased;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Alliance not found: %', p_alliance_id;
    END IF;

    RETURN new_purchased;
END;
$$;
```

### Step 6: Update PaymentService to accept event_id and dedup

Replace the full `handle_checkout_completed` method in `backend/src/services/payment_service.py`:

```python
    def __init__(self):
        """Initialize payment service with dependencies."""
        self._quota_service = SeasonQuotaService()
        self._webhook_repo = WebhookEventRepository()

    async def handle_checkout_completed(
        self, event_data: dict, *, event_id: str | None = None
    ) -> dict:
        """
        Handle checkout.completed webhook event with idempotency.

        Args:
            event_data: Webhook event data containing externalCustomerId, amount, productId
            event_id: Recur event ID for dedup. If provided, duplicate events are skipped.

        Returns:
            Dict with processing result

        Raises:
            ValueError: If required data is missing or invalid
        """
        # --- Dedup check ---
        if event_id:
            if await self._webhook_repo.exists_by_event_id(event_id):
                logger.info(f"Duplicate webhook event skipped - event_id={event_id}")
                return {"success": True, "duplicate": True, "event_id": event_id}

        external_customer_id = event_data.get("externalCustomerId")
        if not external_customer_id:
            external_customer_id = event_data.get("external_customer_id")

        if not external_customer_id:
            raise ValueError("Missing externalCustomerId in checkout.completed event")

        user_id, quantity = self._parse_external_customer_id(external_customer_id)

        logger.info(
            f"Processing checkout.completed - user_id={user_id}, quantity={quantity}, "
            f"amount={event_data.get('amount')}, event_id={event_id}"
        )

        alliance = await self._quota_service.get_alliance_by_user(user_id)
        if not alliance:
            raise ValueError(f"No alliance found for user: {user_id}")

        new_available = await self._quota_service.add_purchased_seasons(
            alliance_id=alliance.id,
            seasons=quantity,
        )

        # --- Record event for dedup ---
        if event_id:
            try:
                await self._webhook_repo.create({
                    "event_id": event_id,
                    "event_type": "checkout.completed",
                    "alliance_id": str(alliance.id),
                    "user_id": str(user_id),
                    "seasons_added": quantity,
                    "payload": event_data,
                })
            except Exception as e:
                # Log but don't fail — the seasons were already added
                logger.warning(f"Failed to record webhook event for dedup: {e}")

        logger.info(
            f"Seasons added successfully - alliance_id={alliance.id}, "
            f"quantity={quantity}, new_available={new_available}"
        )

        return {
            "success": True,
            "alliance_id": str(alliance.id),
            "user_id": str(user_id),
            "seasons_added": quantity,
            "available_seasons": new_available,
        }
```

Add import at top of file:
```python
from src.repositories.webhook_event_repository import WebhookEventRepository
```

### Step 7: Update SeasonQuotaService.add_purchased_seasons to use atomic increment

Replace `add_purchased_seasons` in `backend/src/services/season_quota_service.py:295-313`:

```python
    async def add_purchased_seasons(self, alliance_id: UUID, seasons: int) -> int:
        """Add purchased seasons to alliance using atomic DB increment."""
        if seasons <= 0:
            raise ValueError("Seasons must be positive")

        # Atomic increment — no read-modify-write race
        new_purchased = await self._alliance_repo.increment_purchased_seasons(
            alliance_id, seasons
        )

        # Fetch used_seasons for available calculation
        alliance = await self.get_alliance_by_id(alliance_id)
        used = alliance.used_seasons if alliance else 0
        new_available = new_purchased - used

        logger.info(
            f"Seasons purchased - alliance_id={alliance_id}, "
            f"added={seasons}, available={new_available}"
        )

        return new_available
```

### Step 8: Update webhook endpoint to pass event_id

In `backend/src/api/v1/endpoints/webhooks.py`, change line 119:

```python
        if event_type == "checkout.completed":
            result = await payment_service.handle_checkout_completed(
                event_data, event_id=event_id
            )
```

### Step 9: Run tests to verify they pass

Run: `cd backend && uv run pytest tests/unit/services/test_webhook_idempotency.py -v`
Expected: ALL PASS

### Step 10: Run existing payment tests to verify no regressions

Run: `cd backend && uv run pytest tests/unit/services/test_payment_service.py tests/unit/services/test_season_quota_service.py -v`
Expected: Some tests may need updating due to new `event_id` parameter and atomic increment. Fix any failures.

### Step 11: Lint check

Run: `cd backend && uv run ruff check .`
Expected: PASS (zero errors)

### Step 12: Commit

```bash
cd backend
git add src/repositories/webhook_event_repository.py src/services/payment_service.py src/services/season_quota_service.py src/api/v1/endpoints/webhooks.py src/repositories/alliance_repository.py tests/unit/services/test_webhook_idempotency.py
git commit -m "fix: add webhook idempotency with DB-level event dedup and atomic increment

Prevents duplicate purchased_seasons on Recur webhook retries.
Two-layer defense: UNIQUE(event_id) dedup + PostgreSQL atomic increment."
```

---

## Task 2: Delete dead code (recur_customer_id + SeasonQuotaGuard)

**Files:**
- Modify: `backend/src/models/alliance.py:54` — remove `recur_customer_id`
- Modify: `frontend/src/types/alliance.ts:17` — remove `recur_customer_id`
- Delete: `frontend/src/components/season-quota/SeasonQuotaGuard.tsx`
- Delete: `frontend/src/components/season-quota/__tests__/SeasonQuotaGuard.test.tsx`
- Modify: `frontend/src/components/season-quota/index.ts` — remove SeasonQuotaGuard export

**Context:** `recur_customer_id` has zero reads and zero writes across entire codebase. SeasonQuotaGuard is imported nowhere — no page uses it. Both are dead code.

### Step 1: Remove recur_customer_id from backend model

In `backend/src/models/alliance.py`, delete line 54:
```python
    recur_customer_id: str | None = None
```

### Step 2: Remove recur_customer_id from frontend type

In `frontend/src/types/alliance.ts`, delete line 17:
```python
  readonly recur_customer_id: string | null
```

### Step 3: Delete SeasonQuotaGuard component and test

```bash
rm frontend/src/components/season-quota/SeasonQuotaGuard.tsx
rm frontend/src/components/season-quota/__tests__/SeasonQuotaGuard.test.tsx
```

### Step 4: Update index.ts to remove SeasonQuotaGuard export

Replace `frontend/src/components/season-quota/index.ts` with:
```typescript
/**
 * Season Quota Components
 *
 * Components for managing season quota status display and access control.
 */

export { QuotaWarningBanner } from './QuotaWarningBanner'
```

### Step 5: Update AllianceGuard test mock

Search for `recur_customer_id` in test files and remove the field from mock objects:

In `frontend/src/components/alliance/__tests__/AllianceGuard.test.tsx`, remove:
```typescript
  recur_customer_id: null,
```

### Step 6: Verify no remaining references

Run: `grep -r "recur_customer_id" backend/src/ frontend/src/ --include="*.py" --include="*.ts" --include="*.tsx"`
Expected: Zero results

Run: `grep -r "SeasonQuotaGuard" frontend/src/ --include="*.ts" --include="*.tsx"`
Expected: Zero results

### Step 7: Run frontend type check

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS

### Step 8: Lint check

Run: `cd backend && uv run ruff check .`
Expected: PASS

### Step 9: Commit

```bash
git add -A
git commit -m "refactor: remove dead code (recur_customer_id field, SeasonQuotaGuard component)

recur_customer_id: zero reads, zero writes — replaced by externalCustomerId pattern.
SeasonQuotaGuard: unused component — QuotaWarningBanner + QuotaExhaustedModal cover the funnel."
```

---

## Task 3: Fix auth_service exception handling

**Files:**
- Modify: `backend/src/services/auth_service.py:219` — add catch-all
- Modify: `backend/tests/unit/services/test_auth_service.py` — add test

### Step 1: Write the failing test

Add to `backend/tests/unit/services/test_auth_service.py`:

```python
class TestAuthenticateUserSession:
    """Tests for authenticate_user_session exception handling."""

    def test_unexpected_exception_returns_401(self, auth_service):
        """Unexpected errors should return 401, not 500."""
        with patch.object(auth_service, "_extract_token", side_effect=RuntimeError("unexpected")):
            with pytest.raises(HTTPException) as exc_info:
                auth_service.authenticate_user_session("Bearer token")

            assert exc_info.value.status_code == 401
            assert exc_info.value.detail == "Could not validate credentials"
```

### Step 2: Run test to verify it fails

Run: `cd backend && uv run pytest tests/unit/services/test_auth_service.py::TestAuthenticateUserSession::test_unexpected_exception_returns_401 -v`
Expected: FAIL — RuntimeError is not caught, propagates as 500

### Step 3: Add generic Exception handler

In `backend/src/services/auth_service.py`, after line 219 (after the `except TokenInvalidError` block), add:

```python
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Could not validate credentials",
                headers={"WWW-Authenticate": "Bearer"},
            ) from e
```

### Step 4: Run test to verify it passes

Run: `cd backend && uv run pytest tests/unit/services/test_auth_service.py -v`
Expected: ALL PASS

### Step 5: Lint check

Run: `cd backend && uv run ruff check .`
Expected: PASS

### Step 6: Commit

```bash
cd backend
git add src/services/auth_service.py tests/unit/services/test_auth_service.py
git commit -m "fix: add missing catch-all exception handler to authenticate_user_session

Aligns with authenticate_user — unexpected errors now return 401 instead of 500."
```

---

## Task 4: Unify numeric utilities (db_decimal + fix import paths)

**Files:**
- Modify: `backend/src/utils/numeric.py` — add `db_decimal()`
- Modify: `backend/src/services/hegemony_weight_service.py:450-456` — use `db_decimal()`
- Modify: `backend/src/services/analytics/_helpers.py:12,23` — remove `db_float` re-export
- Modify: `backend/src/services/analytics/group_analytics_service.py:11-17` — import from `src.utils.numeric`
- Modify: `backend/src/services/analytics/alliance_analytics_service.py:15-21` — import from `src.utils.numeric`
- Modify: `backend/tests/unit/utils/test_numeric.py` — add `db_decimal` tests

### Step 1: Write failing tests for db_decimal

Add to `backend/tests/unit/utils/test_numeric.py`:

```python
from src.utils.numeric import db_decimal


class TestDbDecimal:
    """Tests for db_decimal() Decimal conversion utility."""

    def test_converts_float_to_decimal(self):
        result = db_decimal(3.14)
        assert result == Decimal("3.14")
        assert isinstance(result, Decimal)

    def test_converts_string_to_decimal(self):
        result = db_decimal("12345.678")
        assert result == Decimal("12345.678")

    def test_converts_decimal_passthrough(self):
        result = db_decimal(Decimal("99.99"))
        assert result == Decimal("99.99")

    def test_none_returns_zero(self):
        result = db_decimal(None)
        assert result == Decimal("0")

    def test_zero_int(self):
        result = db_decimal(0)
        assert result == Decimal("0")

    def test_negative_value(self):
        result = db_decimal(-42.5)
        assert result == Decimal("-42.5")
```

### Step 2: Run test to verify it fails

Run: `cd backend && uv run pytest tests/unit/utils/test_numeric.py::TestDbDecimal -v`
Expected: FAIL — `db_decimal` not defined

### Step 3: Add db_decimal to numeric.py

Replace `backend/src/utils/numeric.py`:

```python
"""Shared numeric conversion utilities."""

from decimal import Decimal


def db_float(value: Decimal | float | str) -> float:
    """Convert a DB NUMERIC value (str, Decimal, or float) to float safely."""
    return float(Decimal(str(value)))


def db_decimal(value: Decimal | float | str | None) -> Decimal:
    """Convert a DB NUMERIC value to Decimal safely. None returns Decimal('0')."""
    if value is None:
        return Decimal("0")
    return Decimal(str(value))
```

### Step 4: Run tests

Run: `cd backend && uv run pytest tests/unit/utils/test_numeric.py -v`
Expected: ALL PASS

### Step 5: Update hegemony_weight_service.py to use db_decimal

In `backend/src/services/hegemony_weight_service.py`, add import:
```python
from src.utils.numeric import db_decimal
```

Replace lines 450-456 (the inline `Decimal(str(...))` calls):
```python
                    snapshot_score = (
                        db_decimal(snapshot.total_contribution) * weight_config.weight_contribution
                        + db_decimal(snapshot.total_merit) * weight_config.weight_merit
                        + db_decimal(snapshot.total_assist) * weight_config.weight_assist
                        + db_decimal(snapshot.total_donation) * weight_config.weight_donation
                    )
```

### Step 6: Fix analytics import paths

In `backend/src/services/analytics/group_analytics_service.py`, change:
```python
from ._helpers import (
    UNGROUPED_LABEL,
    ViewMode,
    build_period_label,
    compute_box_plot_stats,
    db_float,
)
```
to:
```python
from src.utils.numeric import db_float

from ._helpers import (
    UNGROUPED_LABEL,
    ViewMode,
    build_period_label,
    compute_box_plot_stats,
)
```

In `backend/src/services/analytics/alliance_analytics_service.py`, same change:
```python
from src.utils.numeric import db_float

from ._helpers import (
    UNGROUPED_LABEL,
    ViewMode,
    build_period_label,
    compute_box_plot_stats,
)
```

### Step 7: Remove db_float re-export from _helpers.py

In `backend/src/services/analytics/_helpers.py`:
- Remove line 12: `from src.utils.numeric import db_float`
- Remove `"db_float",` from `__all__` list (line 23)

### Step 8: Run all analytics tests

Run: `cd backend && uv run pytest tests/unit/services/analytics/ tests/unit/services/test_hegemony_weight_service.py tests/unit/utils/test_numeric.py -v`
Expected: ALL PASS

### Step 9: Lint check

Run: `cd backend && uv run ruff check .`
Expected: PASS

### Step 10: Commit

```bash
cd backend
git add src/utils/numeric.py src/services/hegemony_weight_service.py src/services/analytics/_helpers.py src/services/analytics/group_analytics_service.py src/services/analytics/alliance_analytics_service.py tests/unit/utils/test_numeric.py
git commit -m "refactor: unify numeric utilities — add db_decimal, fix import paths

- Add db_decimal() for Decimal-safe conversion (used by hegemony scores)
- Analytics services now import db_float from canonical src.utils.numeric
- Remove re-export from analytics._helpers"
```

---

## Task 5: Extract _sanitize_search_query to utils/postgrest.py

**Files:**
- Create: `backend/src/utils/postgrest.py`
- Modify: `backend/src/repositories/line_binding_repository.py:333-347,351`
- Create: `backend/tests/unit/utils/test_postgrest.py`

### Step 1: Write failing tests

```python
# backend/tests/unit/utils/test_postgrest.py
"""
Tests for PostgREST filter sanitization utility.

Covers:
- Strips commas (filter separator)
- Strips operator patterns (.eq., .neq., .like., etc.)
- Preserves normal search text
- Handles empty string
"""

import pytest

from src.utils.postgrest import sanitize_postgrest_filter_input


class TestSanitizePostgrestFilterInput:
    """Tests for PostgREST filter input sanitization."""

    def test_strips_commas(self):
        assert sanitize_postgrest_filter_input("foo,bar") == "foobar"

    def test_strips_eq_operator(self):
        assert sanitize_postgrest_filter_input("name.eq.admin") == "nameadmin"

    def test_strips_ilike_operator(self):
        assert sanitize_postgrest_filter_input("name.ilike.%test%") == "name%test%"

    def test_strips_multiple_operators(self):
        result = sanitize_postgrest_filter_input("a.eq.1,b.neq.2")
        assert result == "a1b2"

    def test_preserves_normal_text(self):
        assert sanitize_postgrest_filter_input("hello world") == "hello world"

    def test_preserves_chinese_text(self):
        assert sanitize_postgrest_filter_input("三國志") == "三國志"

    def test_empty_string(self):
        assert sanitize_postgrest_filter_input("") == ""
```

### Step 2: Run test to verify it fails

Run: `cd backend && uv run pytest tests/unit/utils/test_postgrest.py -v`
Expected: FAIL — module not found

### Step 3: Create utils/postgrest.py

```python
# backend/src/utils/postgrest.py
"""PostgREST query sanitization utilities."""

import re


def sanitize_postgrest_filter_input(query: str) -> str:
    """Sanitize user input for use in PostgREST filter expressions.

    Strips characters and patterns that could inject additional filters:
    - Commas (filter separator in PostgREST)
    - Operator patterns like .eq., .neq., .ilike., etc.
    """
    sanitized = query.replace(",", "")
    sanitized = re.sub(
        r"\.(eq|neq|gt|lt|gte|lte|like|ilike|is|in|cs|cd|sl|sr|nxl|nxr|adj|ov|fts|plfts|phfts|wfts|not|or|and)\.",
        "",
        sanitized,
    )
    return sanitized
```

### Step 4: Run tests

Run: `cd backend && uv run pytest tests/unit/utils/test_postgrest.py -v`
Expected: ALL PASS

### Step 5: Update line_binding_repository.py

In `backend/src/repositories/line_binding_repository.py`:

Add import (near top):
```python
from src.utils.postgrest import sanitize_postgrest_filter_input
```

Remove the `_sanitize_search_query` static method (lines 333-347).

Update `search_id_bindings` (line 351):
```python
        safe_query = sanitize_postgrest_filter_input(query)
```

Also remove `import re` from line 17 if no other code in the file uses `re`.

### Step 6: Run existing line_binding tests

Run: `cd backend && uv run pytest tests/unit/services/test_line_binding_service.py -v`
Expected: ALL PASS

### Step 7: Lint check

Run: `cd backend && uv run ruff check .`
Expected: PASS

### Step 8: Commit

```bash
cd backend
git add src/utils/postgrest.py src/repositories/line_binding_repository.py tests/unit/utils/test_postgrest.py
git commit -m "refactor: extract sanitize_postgrest_filter_input to src/utils/postgrest.py

Security utility moved from repository private method to shared utils.
Enables reuse across any repository doing PostgREST text search."
```

---

## Task 6: Fix get_season_alliance_averages duplicate period fetch

**Files:**
- Modify: `backend/src/services/analytics/_shared.py:96-105` — add optional `periods` param
- Modify: `backend/src/services/analytics/group_analytics_service.py:92-94` — pass `periods`

### Step 1: Write failing test

Add to `backend/tests/unit/services/analytics/` (find existing _shared test file, or create):

```python
# In the appropriate test file for SharedAnalyticsMixin
@pytest.mark.asyncio
async def test_get_season_alliance_averages_uses_passed_periods(self):
    """When periods are passed, should NOT re-fetch from DB."""
    service = GroupAnalyticsService(
        metrics_repo=mock_metrics_repo,
        period_repo=mock_period_repo,
        season_repo=mock_season_repo,
    )

    mock_period_repo.get_by_season = AsyncMock(return_value=[mock_period])
    mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
    mock_metrics_repo.get_metrics_with_snapshot_totals = AsyncMock(return_value=[])

    await service.get_season_alliance_averages(season_id, periods=[mock_period])

    # Should NOT have called get_by_season since periods were passed
    mock_period_repo.get_by_season.assert_not_called()
```

### Step 2: Update _shared.py to accept optional periods

In `backend/src/services/analytics/_shared.py`, replace the method signature and first few lines (96-105):

```python
    async def get_season_alliance_averages(
        self, season_id: UUID, *, periods: list | None = None
    ) -> dict:
        """
        Calculate alliance average and median metrics for season-to-date.

        Uses snapshot totals / season_days for accurate season daily averages.
        Pass `periods` to avoid re-fetching if caller already has them.
        """
        if periods is None:
            season, periods = await asyncio.gather(
                self._season_repo.get_by_id(season_id),
                self._period_repo.get_by_season(season_id),
            )
        else:
            season = await self._season_repo.get_by_id(season_id)

        if not season or not periods:
            return self._empty_alliance_averages()
```

### Step 3: Update group_analytics_service.py caller

In `backend/src/services/analytics/group_analytics_service.py`, change line 92-94:

```python
        if view == "season":
            season = await self._season_repo.get_by_id(season_id)
            alliance_averages = await self.get_season_alliance_averages(
                season_id, periods=periods
            )
```

### Step 4: Run tests

Run: `cd backend && uv run pytest tests/unit/services/analytics/ -v`
Expected: ALL PASS

### Step 5: Lint check

Run: `cd backend && uv run ruff check .`
Expected: PASS

### Step 6: Commit

```bash
cd backend
git add src/services/analytics/_shared.py src/services/analytics/group_analytics_service.py
git commit -m "perf: avoid duplicate period fetch in get_season_alliance_averages

Caller passes already-fetched periods via keyword arg, saving 1 DB query per group analytics request."
```

---

## Post-Implementation Checklist

After all tasks are complete:

1. Run full backend test suite: `cd backend && uv run pytest -v`
2. Run full frontend type check: `cd frontend && npx tsc --noEmit`
3. Run full frontend lint: `cd frontend && npm run lint`
4. Run backend lint: `cd backend && uv run ruff check .`
5. Verify webhook_events table and increment_purchased_seasons function exist in Supabase
6. Update MEMORY.md — mark resolved issues as done, update Current Phase
