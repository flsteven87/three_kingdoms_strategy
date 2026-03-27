# Harden Payment Webhook & Quota System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three verified vulnerabilities in the payment webhook pipeline: missing idempotency gate, non-atomic season consumption, and bare exception in audit logging.

**Architecture:** All changes follow the existing 4-Layer pattern (API → Service → Repository → DB). The idempotency fix is in PaymentService, the atomic operation requires a new PostgreSQL RPC function + repository method, and audit logging gets explicit exception typing. Each task is independent and can be committed atomically.

**Tech Stack:** Python 3.13, FastAPI, Supabase (PostgreSQL), Pydantic V2, pytest + unittest.mock

**Rules to follow:**
- `~/.claude/CLAUDE.md` — 4-Layer architecture, exception chaining (`raise ... from e`), Repository pattern
- `~/.claude/rules/backend.md` — Pydantic V2, async discipline, Supabase RPC conventions
- Project `CLAUDE.md` — Port 8087, no Supabase migrations (use MCP direct SQL), `uv run ruff check .`

---

## Task 1: Reject webhooks with missing event_id (idempotency gate)

**Problem:** `payment_service.py:89` — when `event_id` is None, the entire idempotency protection is bypassed. A retried webhook without an ID would grant duplicate seasons.

**Files:**
- Modify: `backend/src/services/payment_service.py:88-92`
- Modify: `backend/tests/unit/services/test_payment_service.py`
- Modify: `backend/tests/unit/services/test_webhook_idempotency.py`

### Step 1: Update existing test expectation

The test `test_missing_event_id_still_processes` in `test_webhook_idempotency.py` currently asserts that a missing event_id processes normally. Change it to assert a ValueError is raised.

```python
# In class TestWebhookIdempotency:

@pytest.mark.asyncio
async def test_missing_event_id_raises_error(self, payment_service, sample_event_data):
    """If event_id is None, reject the webhook to prevent unguarded processing."""
    event_data, user_id = sample_event_data

    with pytest.raises(ValueError, match="Missing event_id"):
        await payment_service.handle_payment_success(event_data, event_id=None)

    payment_service._quota_service.add_purchased_seasons.assert_not_called()
```

### Step 2: Add test for empty string event_id

```python
# In class TestWebhookIdempotency:

@pytest.mark.asyncio
async def test_empty_event_id_raises_error(self, payment_service, sample_event_data):
    """Empty string event_id should also be rejected."""
    event_data, user_id = sample_event_data

    with pytest.raises(ValueError, match="Missing event_id"):
        await payment_service.handle_payment_success(event_data, event_id="")

    payment_service._quota_service.add_purchased_seasons.assert_not_called()
```

### Step 3: Run tests to verify they fail

```bash
cd backend && uv run pytest tests/unit/services/test_webhook_idempotency.py -v -x
```

Expected: 2 FAIL (test_missing_event_id_raises_error, test_empty_event_id_raises_error)

### Step 4: Implement the fix

In `backend/src/services/payment_service.py`, replace lines 88-92:

**Before:**
```python
if event_id:
    if not await self._webhook_repo.try_claim_event(event_id, event_type):
        logger.info("Duplicate webhook event skipped - event_id=%s", event_id)
        return {"success": True, "duplicate": True, "event_id": event_id}
```

**After:**
```python
if not event_id:
    raise ValueError("Missing event_id — cannot process webhook without idempotency guard")

if not await self._webhook_repo.try_claim_event(event_id, event_type):
    logger.info("Duplicate webhook event skipped - event_id=%s", event_id)
    return {"success": True, "duplicate": True, "event_id": event_id}
```

Also update the `event_id` parameter type from `str | None` to `str | None` (keep the type but enforce at runtime) and remove the second `if event_id:` guard at line 117 since event_id is now guaranteed non-empty:

**Before (line 117):**
```python
if event_id:
    try:
        await self._webhook_repo.update_event_details(...)
```

**After:**
```python
try:
    await self._webhook_repo.update_event_details(...)
```

### Step 5: Run tests to verify they pass

```bash
cd backend && uv run pytest tests/unit/services/test_webhook_idempotency.py tests/unit/services/test_payment_service.py -v
```

Expected: ALL PASS

### Step 6: Run linter

```bash
cd backend && uv run ruff check .
```

### Step 7: Commit

```bash
git add backend/src/services/payment_service.py backend/tests/unit/services/test_webhook_idempotency.py
git commit -m "fix: reject webhooks without event_id to enforce idempotency gate"
```

---

## Task 2: Make consume_season atomic via PostgreSQL RPC

**Problem:** `season_quota_service.py:273-274` uses read-modify-write (`alliance.used_seasons + 1` then `update()`), while the counterpart `add_purchased_seasons` correctly uses an atomic RPC. Under concurrent activation, this could skip incrementing.

**Files:**
- Create: PostgreSQL RPC function `increment_used_seasons` (via Supabase MCP)
- Modify: `backend/src/repositories/alliance_repository.py` — add `increment_used_seasons` method
- Modify: `backend/src/services/season_quota_service.py:271-279` — use atomic increment
- Modify: `backend/tests/unit/services/test_season_quota_service.py`

### Step 1: Create PostgreSQL RPC function

Execute via Supabase MCP `execute_sql`:

```sql
CREATE OR REPLACE FUNCTION increment_used_seasons(
  p_alliance_id UUID,
  p_seasons INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_new_used INT;
  v_purchased INT;
BEGIN
  UPDATE alliances
  SET used_seasons = used_seasons + p_seasons,
      updated_at = NOW()
  WHERE id = p_alliance_id
  RETURNING used_seasons, purchased_seasons
  INTO v_new_used, v_purchased;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alliance not found: %', p_alliance_id;
  END IF;

  RETURN jsonb_build_object(
    'new_used', v_new_used,
    'purchased_seasons', v_purchased
  );
END;
$$;
```

### Step 2: Add repository method

In `backend/src/repositories/alliance_repository.py`, add after `increment_purchased_seasons`:

```python
async def increment_used_seasons(self, alliance_id: UUID, seasons: int = 1) -> tuple[int, int]:
    """
    Atomically increment used_seasons and return (new_used, purchased_seasons).

    Uses PostgreSQL RPC to avoid read-modify-write race conditions.
    Symmetric with increment_purchased_seasons.
    """
    result = await self._execute_async(
        lambda: self.client.rpc(
            "increment_used_seasons",
            {"p_alliance_id": str(alliance_id), "p_seasons": seasons},
        ).execute()
    )
    # RPC returns JSONB: {"new_used": N, "purchased_seasons": M}
    data = result.data
    return data["new_used"], data["purchased_seasons"]
```

### Step 3: Update test for consume_season

In `backend/tests/unit/services/test_season_quota_service.py`, find `TestConsumeSeason::test_consumes_purchased_season_first` and update:

The test currently mocks `self._alliance_repo.update`. Change it to mock `self._alliance_repo.increment_used_seasons`.

```python
@pytest.mark.asyncio
async def test_consumes_purchased_season_first(
    self, service, mock_alliance_repo, mock_season_repo, alliance_id
):
    """Should consume purchased season (not trial) when available."""
    alliance = create_mock_alliance(alliance_id, purchased=3, used=1)
    mock_alliance_repo.get_by_id = AsyncMock(return_value=alliance)
    mock_season_repo.get_activated_seasons_count = AsyncMock(return_value=1)
    # Atomic increment returns (new_used=2, purchased=3)
    mock_alliance_repo.increment_used_seasons = AsyncMock(return_value=(2, 3))

    remaining, used_trial, trial_ends = await service.consume_season(alliance_id)

    assert remaining == 1  # 3 purchased - 2 used
    assert used_trial is False
    assert trial_ends is None
    mock_alliance_repo.increment_used_seasons.assert_called_once_with(alliance_id)
```

### Step 4: Run tests to verify they fail

```bash
cd backend && uv run pytest tests/unit/services/test_season_quota_service.py::TestConsumeSeason -v -x
```

Expected: FAIL (increment_used_seasons not called)

### Step 5: Implement the fix

In `backend/src/services/season_quota_service.py`, replace lines 271-279:

**Before:**
```python
# Priority: use purchased seasons first, then trial
if available > 0:
    new_used = alliance.used_seasons + 1
    await self._alliance_repo.update(alliance_id, {"used_seasons": new_used})
    remaining = alliance.purchased_seasons - new_used
    logger.info(
        f"Season consumed (paid) - alliance_id={alliance_id}, remaining={remaining}"
    )
    return (remaining, False, None)
```

**After:**
```python
# Priority: use purchased seasons first, then trial
if available > 0:
    new_used, purchased = await self._alliance_repo.increment_used_seasons(alliance_id)
    remaining = purchased - new_used
    logger.info(
        "Season consumed (paid) - alliance_id=%s, remaining=%s",
        alliance_id, remaining,
    )
    return (remaining, False, None)
```

### Step 6: Run all quota tests

```bash
cd backend && uv run pytest tests/unit/services/test_season_quota_service.py -v
```

Expected: ALL PASS

### Step 7: Run linter

```bash
cd backend && uv run ruff check .
```

### Step 8: Commit

```bash
git add backend/src/repositories/alliance_repository.py backend/src/services/season_quota_service.py backend/tests/unit/services/test_season_quota_service.py
git commit -m "fix: use atomic RPC for consume_season to prevent race conditions"
```

---

## Task 3: Fix bare except in audit logging

**Problem:** `payment_service.py:126` uses bare `except Exception:` which catches overly broadly. Per CLAUDE.md, exception types should be specific. The Supabase client raises `postgrest.exceptions.APIError` for DB failures.

**Files:**
- Modify: `backend/src/services/payment_service.py:126`
- Test: existing tests already cover this path — verify with `uv run ruff check .`

### Step 1: Fix the exception type

In `backend/src/services/payment_service.py`, replace:

**Before:**
```python
        try:
            await self._webhook_repo.update_event_details(
                event_id=event_id,
                alliance_id=str(alliance.id),
                user_id=str(user_id),
                seasons_added=quantity,
                payload=event_data,
            )
        except Exception:
            logger.critical(
```

**After:**
```python
        try:
            await self._webhook_repo.update_event_details(
                event_id=event_id,
                alliance_id=str(alliance.id),
                user_id=str(user_id),
                seasons_added=quantity,
                payload=event_data,
            )
        except (APIError, OSError) as exc:
            logger.critical(
                "AUDIT RECORD FAILED - payment processed but not recorded. "
                "event_id=%s, user_id=%s, alliance_id=%s, quantity=%s "
                "— MANUAL RECONCILIATION NEEDED",
                event_id, user_id, alliance.id, quantity,
                exc_info=True,
            )
```

Add import at the top of the file:

```python
from postgrest.exceptions import APIError
```

Note: `APIError` covers Supabase/PostgREST failures, `OSError` covers network-level failures. These are the two realistic failure modes for a DB write.

### Step 2: Run linter + tests

```bash
cd backend && uv run ruff check . && uv run pytest tests/unit/services/test_payment_service.py tests/unit/services/test_webhook_idempotency.py -v
```

Expected: ALL PASS, 0 lint errors

### Step 3: Commit

```bash
git add backend/src/services/payment_service.py
git commit -m "fix: use specific exception types for audit logging failure"
```

---

## Task 4: Final verification

### Step 1: Run full test suite

```bash
cd backend && uv run pytest tests/unit/ -x --tb=short -q
```

Expected: ALL PASS (333+ tests)

### Step 2: Run linter

```bash
cd backend && uv run ruff check .
```

Expected: 0 errors

### Step 3: Verify no unintended changes

```bash
git diff --stat HEAD~3
```

Expected: Only the files listed in Tasks 1-3.

---

## Summary of Changes

| Task | File | Change | Risk |
|------|------|--------|------|
| 1 | `payment_service.py` | Reject empty event_id | Low — Recur always sends event_id |
| 1 | `test_webhook_idempotency.py` | Update test expectations | None |
| 2 | PostgreSQL (Supabase) | New `increment_used_seasons` RPC | Low — symmetric with existing RPC |
| 2 | `alliance_repository.py` | New `increment_used_seasons` method | Low — follows existing pattern |
| 2 | `season_quota_service.py` | Use atomic increment in consume_season | Low — same behavior, safer |
| 2 | `test_season_quota_service.py` | Update mock expectations | None |
| 3 | `payment_service.py` | Specific exception types | Low — narrower catch is safer |
