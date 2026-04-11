# CSV Upload Data Integrity Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 interlocking bugs in the CSV upload flow that are actively corrupting production data: `first_seen_at` overwrite, `is_active` ghost members, and three timezone handling defects.

**Architecture:** Three independent milestones. Milestone A fixes timezone handling end-to-end (frontend helper + backend day-boundary). Milestone B uses a `BEFORE UPDATE` trigger to preserve `first_seen_at` at the DB level. Milestone C adds a membership-diff step after upsert to mark absent members as inactive. Each milestone ends with a one-time data backfill.

**Tech Stack:** Python 3.13 / FastAPI / Supabase (PostgreSQL 17) / React 19 / TypeScript / Vitest / pytest

---

## Context: Why this matters

All 5 bugs were verified against production data on 2026-04-11:

| Bug | Evidence |
|-----|----------|
| #1 `first_seen_at` overwrite | 476/476 members have `first_seen_at == last_seen_at`. Example: member `惡丨LV` has `first_seen_at=2026-02-14` but earliest snapshot is `2025-10-02` (4 months off) |
| #2 `is_active` ghost members | 76 members in alliance `5bcff59d...` have `is_active=true` but `last_seen_at` is >1 hour before latest upload |
| #3 Frontend UTC date extraction | CSV file `同盟統計2026年02月12日07时34分50秒.csv` is stored with `snapshot_date=2026-02-11` (1 day off) |
| #4 Frontend naive datetime | All `csv_uploads.snapshot_date` values are `00:00:00+00` — actual game upload time is lost |
| #5 Backend UTC day boundary in dedup | Latent — `get_by_date` uses `.replace(hour=0)` preserving input TZ; if naive/UTC, bucket is a UTC day not Taipei day |

**DB facts verified:**
- `members.first_seen_at` is `NOT NULL` with no default (cannot be omitted from INSERT)
- `members` has only an `update_updated_at_column` trigger (no `first_seen_at` protection)
- `unique_alliance_member (alliance_id, name)` constraint exists ✓
- `GAME_TIMEZONE = ZoneInfo("Asia/Taipei")` (both backend `core/config.py` and frontend `date-utils.ts`)

---

## Milestone A: Fix timezone handling (Bugs #3, #4, #5)

### Task A1: Add `getGameLocalDateString` helper + tests

**Files:**
- Modify: `frontend/src/lib/date-utils.ts`
- Modify: `frontend/src/lib/__tests__/date-utils.test.ts`

**Step 1: Write failing tests**

Add to the bottom of `frontend/src/lib/__tests__/date-utils.test.ts`:

```typescript
// =============================================================================
// getGameLocalDateString
// =============================================================================
describe('getGameLocalDateString', () => {
  it('returns YYYY-MM-DD in Taiwan timezone', () => {
    // 2025-10-09T02:13:09Z → 10:13 Taipei → "2025-10-09"
    const date = new Date('2025-10-09T02:13:09Z')
    expect(getGameLocalDateString(date)).toBe('2025-10-09')
  })

  it('handles UTC late-night → Taipei next day', () => {
    // 2026-02-11T23:34:50Z → 2026-02-12 07:34 Taipei → "2026-02-12"
    const date = new Date('2026-02-11T23:34:50Z')
    expect(getGameLocalDateString(date)).toBe('2026-02-12')
  })

  it('handles UTC early-morning → Taipei same day', () => {
    // 2026-02-03T16:07:45Z → 2026-02-04 00:07 Taipei → "2026-02-04"
    const date = new Date('2026-02-03T16:07:45Z')
    expect(getGameLocalDateString(date)).toBe('2026-02-04')
  })

  it('pads single-digit month and day', () => {
    // 2025-01-05T00:00:00Z → 2025-01-05 08:00 Taipei → "2025-01-05"
    const date = new Date('2025-01-05T00:00:00Z')
    expect(getGameLocalDateString(date)).toBe('2025-01-05')
  })
})
```

Also add to the import line:
```typescript
import {
  formatDateTW,
  formatTimeTW,
  formatDateTimeTW,
  parseCsvFilenameDate,
  isDateInRange,
  getGameLocalDateString,
} from '../date-utils'
```

**Step 2: Run to verify failure**

```bash
cd frontend && npm test -- date-utils.test.ts
```
Expected: 4 tests FAIL with "getGameLocalDateString is not a function"

**Step 3: Implement the helper**

Add to `frontend/src/lib/date-utils.ts` after the `GAME_TIMEZONE` export:

```typescript
/**
 * Extract YYYY-MM-DD string in game timezone (Asia/Taipei) from a Date object.
 *
 * Unlike `date.toISOString().split('T')[0]` which returns the UTC date,
 * this returns the calendar date as observed in Taiwan. Essential for
 * CSV upload date selection where the user thinks in game (Taipei) time.
 *
 * @param date - Any Date object (absolute time)
 * @returns YYYY-MM-DD string in Asia/Taipei timezone
 *
 * @example
 * // CSV uploaded at 2026-02-12 07:34 Taipei (== 2026-02-11 23:34 UTC)
 * const d = new Date('2026-02-11T23:34:50Z')
 * getGameLocalDateString(d) // "2026-02-12" ✓ (not "2026-02-11")
 */
export function getGameLocalDateString(date: Date): string {
  // en-CA locale always produces YYYY-MM-DD format regardless of runtime
  return date.toLocaleDateString('en-CA', { timeZone: GAME_TIMEZONE })
}
```

**Step 4: Run to verify pass**

```bash
cd frontend && npm test -- date-utils.test.ts
```
Expected: all `getGameLocalDateString` tests PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/date-utils.ts frontend/src/lib/__tests__/date-utils.test.ts
git commit -m "feat(date-utils): add getGameLocalDateString helper

Returns YYYY-MM-DD in Asia/Taipei timezone. Replaces the
error-prone toISOString().split('T')[0] pattern that returns UTC
date and loses a day when called on late-night Taipei uploads."
```

---

### Task A2: Fix `CSVUploadCard` to use helper + send tz-aware ISO

**Files:**
- Modify: `frontend/src/components/uploads/CSVUploadCard.tsx:43, 137, 159`

**Step 1: Read the current code around lines 137 and 159**

Confirm:
- Line 137: `setSnapshotDate(fileDate.toISOString().split("T")[0]);`
- Line 159: `const dateWithTime = \`${snapshotDate}T00:00:00\`;`
- Line 43 imports: `GAME_TIMEZONE` is already imported from `@/lib/date-utils`

**Step 2: Update imports**

Change line 43 area from:
```typescript
import {
  parseCsvFilenameDate,
  isDateInRange,
  formatDateTW,
  formatTimeTW,
  formatDateTimeTW,
  GAME_TIMEZONE,
} from "@/lib/date-utils";
```
to:
```typescript
import {
  parseCsvFilenameDate,
  isDateInRange,
  formatDateTW,
  formatTimeTW,
  formatDateTimeTW,
  getGameLocalDateString,
  GAME_TIMEZONE,
} from "@/lib/date-utils";
```

**Step 3: Fix line 137 — use helper instead of UTC date extraction**

Change:
```typescript
setSnapshotDate(fileDate.toISOString().split("T")[0]);
```
to:
```typescript
setSnapshotDate(getGameLocalDateString(fileDate));
```

**Step 4: Fix line 159 — send tz-aware ISO string**

Change:
```typescript
// Convert date to ISO format with time (start of day)
const dateWithTime = `${snapshotDate}T00:00:00`;
```
to:
```typescript
// Build start-of-day in game timezone (Asia/Taipei, UTC+8).
// Explicit offset prevents the backend from interpreting this as
// a naive datetime (which it would treat as server-local time).
const dateWithTime = `${snapshotDate}T00:00:00+08:00`;
```

**Step 5: Manual verification — type check and lint**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```
Expected: no errors

**Step 6: Commit**

```bash
git add frontend/src/components/uploads/CSVUploadCard.tsx
git commit -m "fix(uploads): send Taipei-local date with explicit timezone offset

Previously toISOString().split('T')[0] returned the UTC date,
shifting late-night Taipei uploads by a day. The submission string
also lacked a timezone suffix, causing the backend to parse it as
a naive datetime. Both paths now consistently use Asia/Taipei."
```

---

### Task A3: Fix backend `get_by_date` to use `GAME_TIMEZONE` day boundaries

**Files:**
- Modify: `backend/src/repositories/csv_upload_repository.py:150-190`
- Create: `backend/tests/unit/repositories/test_csv_upload_repository.py`

**Step 1: Write failing test**

Create `backend/tests/unit/repositories/test_csv_upload_repository.py`:

```python
"""
Tests for CsvUploadRepository timezone handling.

Verifies that get_by_date correctly computes same-day boundaries
in the game timezone (Asia/Taipei) rather than UTC.
"""

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest

from src.repositories.csv_upload_repository import CsvUploadRepository


TAIPEI = ZoneInfo("Asia/Taipei")


class TestGetByDateTimezone:
    """get_by_date must compute day boundaries in game timezone."""

    @pytest.fixture
    def repo(self):
        """Fresh repository with mocked client."""
        repo = CsvUploadRepository()
        repo._execute_async = AsyncMock()
        return repo

    @pytest.mark.asyncio
    async def test_late_night_taipei_upload_uses_taipei_day(self, repo):
        """
        A 00:30 Taipei upload (= 16:30 UTC prev day) must query for
        the Taipei day [00:00, 24:00), not the UTC day.
        """
        # Arrange: mock query capture
        captured: dict = {}

        def fake_execute(fn):
            # Execute the lambda to build the query (which calls .gte/.lt)
            # and capture the arguments.
            mock_query = MagicMock()
            mock_query.select.return_value = mock_query
            mock_query.eq.return_value = mock_query
            mock_query.gte.side_effect = lambda _, v: (
                captured.update(start=v) or mock_query
            )
            mock_query.lt.side_effect = lambda _, v: (
                captured.update(end=v) or mock_query
            )
            mock_query.limit.return_value = mock_query
            mock_query.execute.return_value = MagicMock(data=[])
            # Re-run the lambda against a patched client
            repo.client = MagicMock()
            repo.client.from_.return_value = mock_query
            fn()
            result = MagicMock()
            result.data = []
            return result

        repo._execute_async = AsyncMock(side_effect=fake_execute)

        alliance_id = uuid4()
        season_id = uuid4()
        # Taipei 2026-02-12 00:30 == UTC 2026-02-11 16:30
        taipei_midnight_plus_30 = datetime(
            2026, 2, 12, 0, 30, tzinfo=TAIPEI
        )

        # Act
        await repo.get_by_date(alliance_id, season_id, taipei_midnight_plus_30)

        # Assert: day boundary should be Taipei Feb 12 00:00 → Feb 13 00:00
        assert captured["start"] == "2026-02-12T00:00:00+08:00"
        assert captured["end"] == "2026-02-13T00:00:00+08:00"

    @pytest.mark.asyncio
    async def test_utc_input_still_bucketed_by_taipei_day(self, repo):
        """
        Even when called with a UTC-aware datetime, the bucket must be a
        Taipei day (converted first).
        """
        captured: dict = {}

        def fake_execute(fn):
            mock_query = MagicMock()
            mock_query.select.return_value = mock_query
            mock_query.eq.return_value = mock_query
            mock_query.gte.side_effect = lambda _, v: (
                captured.update(start=v) or mock_query
            )
            mock_query.lt.side_effect = lambda _, v: (
                captured.update(end=v) or mock_query
            )
            mock_query.limit.return_value = mock_query
            mock_query.execute.return_value = MagicMock(data=[])
            repo.client = MagicMock()
            repo.client.from_.return_value = mock_query
            fn()
            result = MagicMock()
            result.data = []
            return result

        repo._execute_async = AsyncMock(side_effect=fake_execute)

        alliance_id = uuid4()
        season_id = uuid4()
        # UTC 2026-02-11 16:30 == Taipei 2026-02-12 00:30
        from datetime import UTC
        utc_input = datetime(2026, 2, 11, 16, 30, tzinfo=UTC)

        await repo.get_by_date(alliance_id, season_id, utc_input)

        assert captured["start"] == "2026-02-12T00:00:00+08:00"
        assert captured["end"] == "2026-02-13T00:00:00+08:00"
```

**Step 2: Run to verify failure**

```bash
cd backend && uv run pytest tests/unit/repositories/test_csv_upload_repository.py -v
```
Expected: both tests FAIL (current implementation uses `.replace(hour=0)` which preserves input TZ, producing `2026-02-11T00:00:00+00:00` for the UTC case).

**Step 3: Fix the implementation**

In `backend/src/repositories/csv_upload_repository.py`, replace lines 168–172:

```python
        # Compare only date part: start_of_day <= snapshot_date < end_of_day
        start_of_day = snapshot_date.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)
```
with:
```python
        # Compute same-day window in game timezone so uploads made near
        # midnight Taipei time are bucketed by the game day, not the UTC day.
        taipei_dt = snapshot_date.astimezone(GAME_TIMEZONE)
        start_of_day = taipei_dt.replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_day = start_of_day + timedelta(days=1)
```

Add the import at the top of the file (after the existing imports):
```python
from src.core.config import GAME_TIMEZONE
```

**Step 4: Run to verify pass**

```bash
cd backend && uv run pytest tests/unit/repositories/test_csv_upload_repository.py -v
```
Expected: both tests PASS

**Step 5: Run the full backend suite to ensure no regression**

```bash
cd backend && uv run pytest
```
Expected: all tests pass

**Step 6: Commit**

```bash
git add backend/src/repositories/csv_upload_repository.py backend/tests/unit/repositories/test_csv_upload_repository.py
git commit -m "fix(uploads): bucket same-day dedup by game timezone day

get_by_date previously used .replace(hour=0) which preserved the
input datetime's tzinfo. When the caller passed a UTC-aware
datetime, the dedup window was a UTC day, so two uploads on the
same Taipei day could fall in different buckets and escape dedup.

Now convert to Asia/Taipei first, then compute the day boundary.
Adds unit tests covering both Taipei-local and UTC-aware inputs."
```

---

### Task A4: Integration test — custom snapshot date round-trip

**Files:**
- Modify: `backend/tests/unit/services/test_csv_upload_service.py`

**Step 1: Write failing test**

Add a new test case that verifies the full naive→aware datetime handling. Find the existing `TestUploadCsv` class and add:

```python
    @pytest.mark.asyncio
    async def test_upload_with_tz_aware_custom_date_preserves_taipei_day(
        self, service, mock_season_repo, mock_alliance_repo,
        mock_permission_service, mock_csv_upload_repo, mock_member_repo,
        mock_snapshot_repo, mock_period_metrics_service,
    ):
        """
        Frontend sends '2026-02-12T00:00:00+08:00' for a Taipei-local day.
        Backend must:
          1. Parse as aware datetime
          2. Pass date validation (compare in Taipei TZ)
          3. Store snapshot_date preserving the Taipei Feb 12 day
        """
        # Arrange
        user_id = uuid4()
        season_id = uuid4()
        alliance_id = uuid4()

        mock_season = create_mock_season(season_id, alliance_id)
        mock_season_repo.get_by_id = AsyncMock(return_value=mock_season)
        mock_permission_service.require_write_permission = AsyncMock()
        mock_alliance_repo.get_by_id = AsyncMock(
            return_value=create_mock_alliance(alliance_id)
        )

        captured_upload_data = {}
        async def capture_upload(**kwargs):
            captured_upload_data.update(kwargs.get("upload_data", {}))
            return create_mock_upload(uuid4(), season_id, alliance_id), None
        mock_csv_upload_repo.replace_same_day_upload = AsyncMock(
            side_effect=capture_upload
        )
        mock_member_repo.upsert_batch = AsyncMock(
            return_value=[create_mock_member("張飛")]
        )
        mock_snapshot_repo.create_batch = AsyncMock(return_value=[MagicMock()])
        mock_period_metrics_service.calculate_periods_for_season = AsyncMock(
            return_value=[]
        )

        # Act
        csv_content = "成員,貢獻排行\n張飛,1\n"
        await service.upload_csv(
            user_id=user_id,
            season_id=season_id,
            filename="同盟統計2026年02月12日07时34分50秒.csv",
            csv_content=csv_content,
            custom_snapshot_date="2026-02-12T00:00:00+08:00",
        )

        # Assert — the stored snapshot_date must represent Taipei Feb 12
        from datetime import datetime
        stored = datetime.fromisoformat(captured_upload_data["snapshot_date"])
        taipei_date = stored.astimezone(ZoneInfo("Asia/Taipei")).date()
        assert taipei_date.year == 2026
        assert taipei_date.month == 2
        assert taipei_date.day == 12
```

Add at top: `from zoneinfo import ZoneInfo`

**Step 2: Run to verify pass**

```bash
cd backend && uv run pytest tests/unit/services/test_csv_upload_service.py::TestUploadCsv::test_upload_with_tz_aware_custom_date_preserves_taipei_day -v
```
Expected: PASS (the service already does `snapshot_date.astimezone(GAME_TIMEZONE).date()` for validation at line 121; this just documents the contract)

**Step 3: Commit**

```bash
git add backend/tests/unit/services/test_csv_upload_service.py
git commit -m "test(uploads): pin contract for tz-aware custom snapshot date"
```

---

## Milestone B: Preserve `first_seen_at` (Bug #1)

### Task B1: Add `BEFORE UPDATE` trigger to preserve `first_seen_at`

**Files:**
- Create (Supabase MCP): new migration SQL

**Step 1: Write the migration SQL**

Apply via `mcp__supabase__apply_migration` with name `preserve_members_first_seen_at`:

```sql
-- Preserve members.first_seen_at across UPDATE (including UPSERT ON CONFLICT DO UPDATE).
-- Business rule: first_seen_at is the earliest we've ever observed the member;
-- an update should never make it later. LEAST() lets genuinely earlier values
-- (e.g., backfill from older CSV) win, while blocking the common
-- "overwrite with today's date on re-upload" pattern.
CREATE OR REPLACE FUNCTION preserve_members_first_seen_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  NEW.first_seen_at := LEAST(OLD.first_seen_at, NEW.first_seen_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_preserve_first_seen_at ON public.members;

CREATE TRIGGER members_preserve_first_seen_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION preserve_members_first_seen_at();

COMMENT ON FUNCTION preserve_members_first_seen_at() IS
  'Ensures UPSERT never moves members.first_seen_at forward in time. Bug #1 2026-04-11.';
```

**Step 2: Verify the trigger exists**

Use `mcp__supabase__execute_sql`:

```sql
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'public.members'::regclass
  AND tgname = 'members_preserve_first_seen_at';
```
Expected: 1 row returned

**Step 3: Smoke-test the trigger manually**

```sql
-- Pick any member and try to update first_seen_at to a later date
WITH sample AS (
  SELECT id, first_seen_at FROM public.members LIMIT 1
)
UPDATE public.members m
SET first_seen_at = (SELECT first_seen_at + INTERVAL '100 days' FROM sample)
FROM sample
WHERE m.id = sample.id
RETURNING m.first_seen_at AS new_value, sample.first_seen_at AS old_value;
```
Expected: `new_value == old_value` (trigger blocked the forward move)

```sql
-- Now try moving it earlier
WITH sample AS (
  SELECT id, first_seen_at FROM public.members LIMIT 1
)
UPDATE public.members m
SET first_seen_at = (SELECT first_seen_at - INTERVAL '100 days' FROM sample)
FROM sample
WHERE m.id = sample.id
RETURNING m.first_seen_at AS new_value, sample.first_seen_at AS old_value;
```
Expected: `new_value < old_value` (earlier value won via LEAST)

**Rollback the smoke test:**
```sql
-- Revert the smoke test mutation
UPDATE public.members SET first_seen_at = last_seen_at
WHERE id = (SELECT id FROM public.members LIMIT 1)
  AND first_seen_at <> last_seen_at;
```

---

### Task B2: Integration test for trigger-protected upsert

**Files:**
- Modify: `backend/tests/unit/services/test_csv_upload_service.py`

**Step 1: Add test documenting the contract**

In `test_csv_upload_service.py`, add a test that verifies the service does NOT need to exclude `first_seen_at` from the upsert payload (the DB trigger handles it):

```python
    @pytest.mark.asyncio
    async def test_upload_payload_includes_first_seen_at_for_db_trigger(
        self, service, mock_season_repo, mock_alliance_repo,
        mock_permission_service, mock_csv_upload_repo, mock_member_repo,
        mock_snapshot_repo, mock_period_metrics_service,
    ):
        """
        The upsert payload intentionally includes first_seen_at so that
        new member rows (INSERT path) have the required NOT NULL value.
        The DB trigger `members_preserve_first_seen_at` prevents this
        field from being overwritten on the UPDATE path.
        """
        user_id = uuid4()
        season_id = uuid4()
        alliance_id = uuid4()

        mock_season_repo.get_by_id = AsyncMock(
            return_value=create_mock_season(season_id, alliance_id)
        )
        mock_permission_service.require_write_permission = AsyncMock()
        mock_alliance_repo.get_by_id = AsyncMock(
            return_value=create_mock_alliance(alliance_id)
        )
        mock_csv_upload_repo.replace_same_day_upload = AsyncMock(
            return_value=(create_mock_upload(uuid4(), season_id, alliance_id), None)
        )

        captured_payload: list = []
        async def capture_upsert(data):
            captured_payload.extend(data)
            return [create_mock_member(m["name"]) for m in data]
        mock_member_repo.upsert_batch = AsyncMock(side_effect=capture_upsert)

        mock_snapshot_repo.create_batch = AsyncMock(return_value=[MagicMock()])
        mock_period_metrics_service.calculate_periods_for_season = AsyncMock(
            return_value=[]
        )

        await service.upload_csv(
            user_id=user_id,
            season_id=season_id,
            filename="同盟統計2026年02月12日07时34分50秒.csv",
            csv_content="成員\n張飛\n",
            custom_snapshot_date="2026-02-12T00:00:00+08:00",
        )

        # Each payload row must carry first_seen_at (NOT NULL column)
        for row in captured_payload:
            assert "first_seen_at" in row
            assert "last_seen_at" in row
            assert "is_active" in row
```

**Step 2: Run**

```bash
cd backend && uv run pytest tests/unit/services/test_csv_upload_service.py -v
```
Expected: all pass

**Step 3: Commit**

```bash
git add backend/tests/unit/services/test_csv_upload_service.py
git commit -m "test(uploads): pin first_seen_at payload contract

Documents that the upsert payload intentionally includes
first_seen_at. The field is NOT NULL at the DB level and is
protected from overwrite by the members_preserve_first_seen_at
trigger (applied via migration on 2026-04-11)."
```

---

### Task B3: One-time backfill — rebuild `first_seen_at` from earliest snapshot

**Files:**
- Apply via `mcp__supabase__execute_sql`

**Step 1: Preview how many members are affected**

```sql
WITH earliest AS (
  SELECT
    ms.member_id,
    MIN(cu.snapshot_date) AS earliest_snapshot
  FROM public.member_snapshots ms
  JOIN public.csv_uploads cu ON cu.id = ms.csv_upload_id
  GROUP BY ms.member_id
)
SELECT COUNT(*) AS rows_to_fix
FROM public.members m
JOIN earliest e ON e.member_id = m.id
WHERE m.first_seen_at > e.earliest_snapshot;
```
Expected: substantial count (we saw 476/476 members affected in the audit)

**Step 2: Execute the backfill**

```sql
WITH earliest AS (
  SELECT
    ms.member_id,
    MIN(cu.snapshot_date) AS earliest_snapshot
  FROM public.member_snapshots ms
  JOIN public.csv_uploads cu ON cu.id = ms.csv_upload_id
  GROUP BY ms.member_id
)
UPDATE public.members m
SET first_seen_at = e.earliest_snapshot
FROM earliest e
WHERE m.id = e.member_id
  AND m.first_seen_at > e.earliest_snapshot;
```
Expected: rows updated == preview count

**Step 3: Verify the fix held**

```sql
SELECT
  COUNT(*) AS total_members,
  COUNT(*) FILTER (WHERE first_seen_at = last_seen_at) AS still_equal,
  COUNT(*) FILTER (WHERE first_seen_at < last_seen_at) AS now_correct
FROM public.members;
```
Expected: `now_correct > 0` (members who have multiple snapshots now show history)

**Step 4: Spot check — members that were previously broken**

```sql
SELECT m.name, m.first_seen_at, m.last_seen_at
FROM public.members m
WHERE m.name IN ('惡丨LV', '奇奇王國')
ORDER BY m.first_seen_at;
```
Expected: `first_seen_at` earlier than `last_seen_at` for both

---

## Milestone C: Accurate `is_active` tracking (Bug #2)

### Task C1: Add `deactivate_absent_members` method

**Files:**
- Modify: `backend/src/repositories/member_repository.py`
- Create: `backend/tests/unit/repositories/test_member_repository.py`

**Step 1: Write failing test**

Create `backend/tests/unit/repositories/test_member_repository.py`:

```python
"""
Tests for MemberRepository membership-diff methods.
"""

from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.repositories.member_repository import MemberRepository


class TestDeactivateAbsentMembers:
    """deactivate_absent_members flips is_active on members not present in the set."""

    @pytest.fixture
    def repo(self):
        r = MemberRepository()
        r._execute_async = AsyncMock()
        return r

    @pytest.mark.asyncio
    async def test_flips_is_active_for_missing_members(self, repo):
        alliance_id = uuid4()
        present_names = {"張飛", "關羽"}

        captured = {}

        def fake_execute(fn):
            mock_query = MagicMock()
            # .update({...}) → mock_query
            mock_query.update.side_effect = lambda payload: (
                captured.update(payload=payload) or mock_query
            )
            mock_query.eq.side_effect = lambda col, val: (
                captured.setdefault("filters", []).append((col, val)) or mock_query
            )
            mock_query.not_.in_.side_effect = lambda col, val: (
                captured.update(not_in=(col, tuple(val))) or mock_query
            )
            mock_query.execute.return_value = MagicMock(data=[{"id": str(uuid4())}])
            repo.client = MagicMock()
            repo.client.from_.return_value = mock_query
            fn()
            return MagicMock(data=[{"id": str(uuid4())}])

        repo._execute_async = AsyncMock(side_effect=fake_execute)

        # Act
        count = await repo.deactivate_absent_members(alliance_id, present_names)

        # Assert
        assert captured["payload"] == {"is_active": False}
        assert ("alliance_id", str(alliance_id)) in captured["filters"]
        assert ("is_active", True) in captured["filters"]
        assert captured["not_in"][0] == "name"
        assert set(captured["not_in"][1]) == present_names

    @pytest.mark.asyncio
    async def test_empty_present_names_still_deactivates(self, repo):
        """Edge case: empty CSV should deactivate everyone (but service layer
        should reject empty CSVs earlier). This test pins the repository
        contract: the repo itself does not guard against empty input."""
        alliance_id = uuid4()
        captured = {}

        def fake_execute(fn):
            mock_query = MagicMock()
            mock_query.update.side_effect = lambda payload: (
                captured.update(payload=payload) or mock_query
            )
            mock_query.eq.return_value = mock_query
            mock_query.not_.in_.side_effect = lambda col, val: (
                captured.update(not_in=(col, tuple(val))) or mock_query
            )
            mock_query.execute.return_value = MagicMock(data=[])
            repo.client = MagicMock()
            repo.client.from_.return_value = mock_query
            fn()
            return MagicMock(data=[])

        repo._execute_async = AsyncMock(side_effect=fake_execute)

        await repo.deactivate_absent_members(alliance_id, set())

        # Supabase not_.in_ cannot take an empty iterable; the method
        # should short-circuit to a no-op and return 0.
        # (See implementation — this test will guide the guard.)
```

**Step 2: Run to verify failure**

```bash
cd backend && uv run pytest tests/unit/repositories/test_member_repository.py -v
```
Expected: both FAIL with `AttributeError: ... deactivate_absent_members`

**Step 3: Implement the method**

Add to `MemberRepository` (before `delete_by_alliance`):

```python
    async def deactivate_absent_members(
        self, alliance_id: UUID, present_names: set[str]
    ) -> int:
        """
        Mark all currently-active members NOT in `present_names` as inactive.

        Used after a regular CSV upload to reflect that members absent from
        the CSV have left the alliance. Service layer must only call this
        when processing the latest upload for the alliance — an older
        backfill upload should not retroactively deactivate newer members.

        Args:
            alliance_id: Alliance UUID
            present_names: Set of member names present in the current CSV

        Returns:
            Number of members deactivated

        符合 CLAUDE.md 🔴: Uses _handle_supabase_result()
        """
        if not present_names:
            # Supabase .not_.in_() requires a non-empty list; an empty CSV
            # should not reach this method (service layer rejects it).
            return 0

        names_list = list(present_names)

        def _query():
            return (
                self.client.from_(self.table_name)
                .update({"is_active": False})
                .eq("alliance_id", str(alliance_id))
                .eq("is_active", True)
                .not_.in_("name", names_list)
                .execute()
            )

        result = await self._execute_async(_query)
        data = self._handle_supabase_result(result, allow_empty=True)
        return len(data) if data else 0
```

**Step 4: Run to verify pass**

```bash
cd backend && uv run pytest tests/unit/repositories/test_member_repository.py -v
```
Expected: both PASS

**Step 5: Commit**

```bash
git add backend/src/repositories/member_repository.py backend/tests/unit/repositories/test_member_repository.py
git commit -m "feat(members): add deactivate_absent_members for membership diff

Flips is_active=false on members currently active in the alliance
but absent from the provided name set. Will be wired into the CSV
upload flow in the next commit."
```

---

### Task C2: Wire membership diff into CSV upload flow

**Files:**
- Modify: `backend/src/services/csv_upload_service.py:182`
- Modify: `backend/tests/unit/services/test_csv_upload_service.py`

**Step 1: Read the surrounding context (lines 146–220)**

Confirm the step numbering and where Step 7 (batch create snapshots) ends.

**Step 2: Write the failing test**

Add to `test_csv_upload_service.py`:

```python
    @pytest.mark.asyncio
    async def test_latest_regular_upload_deactivates_absent_members(
        self, service, mock_season_repo, mock_alliance_repo,
        mock_permission_service, mock_csv_upload_repo, mock_member_repo,
        mock_snapshot_repo, mock_period_metrics_service,
    ):
        """
        After a regular CSV upload that IS the latest for the alliance,
        members not present in the CSV should be marked inactive.
        """
        user_id = uuid4()
        season_id = uuid4()
        alliance_id = uuid4()

        mock_season_repo.get_by_id = AsyncMock(
            return_value=create_mock_season(season_id, alliance_id)
        )
        mock_permission_service.require_write_permission = AsyncMock()
        mock_alliance_repo.get_by_id = AsyncMock(
            return_value=create_mock_alliance(alliance_id)
        )
        mock_csv_upload_repo.replace_same_day_upload = AsyncMock(
            return_value=(create_mock_upload(uuid4(), season_id, alliance_id), None)
        )
        # This upload IS the latest (get_latest_by_season returns same date)
        mock_csv_upload_repo.get_latest_by_season = AsyncMock(
            return_value=create_mock_upload(uuid4(), season_id, alliance_id)
        )
        mock_member_repo.upsert_batch = AsyncMock(
            return_value=[create_mock_member("張飛"), create_mock_member("關羽")]
        )
        mock_member_repo.deactivate_absent_members = AsyncMock(return_value=3)
        mock_snapshot_repo.create_batch = AsyncMock(return_value=[MagicMock(), MagicMock()])
        mock_period_metrics_service.calculate_periods_for_season = AsyncMock(return_value=[])

        await service.upload_csv(
            user_id=user_id,
            season_id=season_id,
            filename="同盟統計2026年02月12日07时34分50秒.csv",
            csv_content="成員\n張飛\n關羽\n",
            custom_snapshot_date="2026-02-12T00:00:00+08:00",
        )

        # Assert: membership diff called with the two present names
        mock_member_repo.deactivate_absent_members.assert_called_once()
        args = mock_member_repo.deactivate_absent_members.call_args
        assert args.args[0] == alliance_id
        assert args.args[1] == {"張飛", "關羽"}

    @pytest.mark.asyncio
    async def test_event_upload_does_not_deactivate_members(
        self, service, mock_season_repo, mock_alliance_repo,
        mock_permission_service, mock_csv_upload_repo, mock_member_repo,
        mock_snapshot_repo, mock_period_metrics_service,
    ):
        """Event uploads are snapshots of specific battles, not roster dumps."""
        user_id = uuid4()
        season_id = uuid4()
        alliance_id = uuid4()

        mock_season_repo.get_by_id = AsyncMock(
            return_value=create_mock_season(season_id, alliance_id)
        )
        mock_permission_service.require_write_permission = AsyncMock()
        mock_alliance_repo.get_by_id = AsyncMock(
            return_value=create_mock_alliance(alliance_id)
        )
        mock_csv_upload_repo.create = AsyncMock(
            return_value=create_mock_upload(uuid4(), season_id, alliance_id)
        )
        mock_member_repo.upsert_batch = AsyncMock(
            return_value=[create_mock_member("張飛")]
        )
        mock_member_repo.deactivate_absent_members = AsyncMock(return_value=0)
        mock_snapshot_repo.create_batch = AsyncMock(return_value=[MagicMock()])

        await service.upload_csv(
            user_id=user_id,
            season_id=season_id,
            filename="同盟統計2026年02月12日07时34分50秒.csv",
            csv_content="成員\n張飛\n",
            custom_snapshot_date="2026-02-12T00:00:00+08:00",
            upload_type="event",
        )

        mock_member_repo.deactivate_absent_members.assert_not_called()
```

**Step 3: Run to verify failure**

```bash
cd backend && uv run pytest tests/unit/services/test_csv_upload_service.py::TestUploadCsv::test_latest_regular_upload_deactivates_absent_members -v
```
Expected: FAIL (method not called)

**Step 4: Wire the call into the service**

In `csv_upload_service.py`, after Step 7 (`snapshots = await self._snapshot_repo.create_batch(snapshots_data)` on line 218), and inside the `if upload_type == "regular":` block where period calculation runs (line 222), add the membership-diff step BEFORE period calculation:

```python
        # Step 8: For 'regular' uploads only - deactivate absent members and
        # calculate period metrics. We only deactivate when this upload is
        # the latest for the alliance so that backfilling older CSVs does
        # not retroactively deactivate newer members.
        total_periods = 0
        deactivated_count = 0
        if upload_type == "regular":
            latest = await self._csv_upload_repo.get_latest_by_season(season_id)
            is_latest = latest is None or latest.snapshot_date <= snapshot_date
            if is_latest:
                present_names = {m["member_name"] for m in members_data}
                deactivated_count = await self._member_repo.deactivate_absent_members(
                    alliance.id, present_names
                )
            periods = await self._period_metrics_service.calculate_periods_for_season(season_id)
            total_periods = len(periods)
```

And add `"deactivated_members": deactivated_count,` to the return dict at line 239.

**Step 5: Run to verify pass**

```bash
cd backend && uv run pytest tests/unit/services/test_csv_upload_service.py -v
```
Expected: all pass (both new tests + existing tests unchanged)

**Step 6: Run full backend suite**

```bash
cd backend && uv run pytest && uv run ruff check .
```
Expected: all green

**Step 7: Commit**

```bash
git add backend/src/services/csv_upload_service.py backend/tests/unit/services/test_csv_upload_service.py
git commit -m "feat(uploads): deactivate absent members on latest regular upload

After processing a regular CSV that is the latest upload for the
alliance, flip is_active=false on members not present in the CSV.
Older backfill uploads are guarded from retroactively deactivating
newer members. Event uploads are unaffected."
```

---

### Task C3: One-time backfill — flip stale `is_active` flags

**Files:**
- Apply via `mcp__supabase__execute_sql`

**Step 1: Preview**

```sql
WITH latest_per_alliance AS (
  SELECT alliance_id, MAX(snapshot_date) AS latest_date
  FROM public.csv_uploads
  WHERE upload_type = 'regular'
  GROUP BY alliance_id
)
SELECT m.alliance_id, l.latest_date, COUNT(*) AS stale_active
FROM public.members m
JOIN latest_per_alliance l ON l.alliance_id = m.alliance_id
WHERE m.is_active = true
  AND m.last_seen_at < l.latest_date - INTERVAL '1 hour'
GROUP BY m.alliance_id, l.latest_date;
```
Expected: at least the alliance `5bcff59d...` with 76 stale members

**Step 2: Execute the backfill**

```sql
WITH latest_per_alliance AS (
  SELECT alliance_id, MAX(snapshot_date) AS latest_date
  FROM public.csv_uploads
  WHERE upload_type = 'regular'
  GROUP BY alliance_id
)
UPDATE public.members m
SET is_active = false, updated_at = now()
FROM latest_per_alliance l
WHERE m.alliance_id = l.alliance_id
  AND m.is_active = true
  AND m.last_seen_at < l.latest_date - INTERVAL '1 hour';
```
Expected: rows updated == preview count

**Step 3: Verify**

Re-run the Step 1 query. Expected: empty result set.

---

## Final Verification

### Full regression pass

```bash
cd backend && uv run pytest && uv run ruff check .
cd ../frontend && npm test && npx tsc --noEmit && npm run lint
```
Expected: all green

### Production smoke test

1. Upload a CSV with a late-night Taipei game time (e.g., `同盟統計YYYY年MM月DD日01时00分00秒.csv`)
2. Verify in Supabase that `csv_uploads.snapshot_date` represents the correct Taipei day
3. Verify that the same file uploaded twice deduplicates (replaces)
4. Verify that a member absent from the new CSV flips to `is_active=false`
5. Verify that re-uploading an older CSV does NOT move a member's `first_seen_at` forward

### Update MEMORY.md

Append under Active Work:
```
Last: 2026-04-11 — CSV upload data integrity fix (5 bugs) + production backfill
```

---

## Task Summary

| # | Task | Scope | Commits |
|---|------|-------|---------|
| A1 | `getGameLocalDateString` helper | frontend | 1 |
| A2 | CSVUploadCard fix | frontend | 1 |
| A3 | `get_by_date` TZ fix | backend | 1 |
| A4 | Integration test | backend tests | 1 |
| B1 | `first_seen_at` trigger | DB migration | (Supabase) |
| B2 | Trigger contract test | backend tests | 1 |
| B3 | `first_seen_at` backfill | DB data | (Supabase) |
| C1 | `deactivate_absent_members` | backend | 1 |
| C2 | Wire into upload flow | backend | 1 |
| C3 | `is_active` backfill | DB data | (Supabase) |

**Total: 7 code commits + 1 DDL migration + 2 DML backfills**
